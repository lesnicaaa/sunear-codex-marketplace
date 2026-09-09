#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { chmod, unlink, writeFile, readFile, mkdir, rename } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RECEIVER_VERSION } from "./lib/sunear-codex-receiver-core.mjs";
import { readOrCreateReceiverIdentity } from "./lib/sunear-codex-receiver-identity.mjs";
import { SunearCodexReceiver } from "./lib/sunear-codex-receiver.mjs";
import { startSunearLocalAssetServer, SunearLocalAssetStore } from "./lib/sunear-codex-local-assets.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const RECEIVER_INSTANCE_ID = "sunear-designer";
const RESTART_DELAY_MS = 5_000;
const MAX_RESTART_DELAY_MS = 60_000;
const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PLUGIN_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;

function receiverInstanceDigest(instanceId, userIdentity) {
  return createHash("sha256").update(`${userIdentity}\n${instanceId}`).digest("hex").slice(0, 16);
}

export function isCompiledReceiverExecutable(executablePath = process.execPath, modulePath = scriptPath) {
  return resolve(executablePath) === resolve(modulePath) || modulePath.includes("/$bunfs/");
}

export function readPluginRuntimeIdentity(pluginRoot = process.env.PLUGIN_ROOT) {
  if (typeof pluginRoot !== "string" || !pluginRoot) throw new Error("SUNEAR_PLUGIN_ROOT_REQUIRED");
  const root = resolve(pluginRoot);
  const manifest = JSON.parse(readFileSync(resolve(root, ".codex-plugin/plugin.json"), "utf8"));
  if (!PLUGIN_ID_PATTERN.test(manifest?.name ?? "") || !PLUGIN_VERSION_PATTERN.test(manifest?.version ?? "")) {
    throw new Error("SUNEAR_PLUGIN_MANIFEST_INVALID");
  }
  const normalizedRoot = root.replaceAll("\\", "/");
  const cacheIdentity = normalizedRoot.match(/\/plugins\/cache\/(sunear|personal)\/([^/]+)(?:\/|$)/);
  if (!cacheIdentity || cacheIdentity[2] !== manifest.name) throw new Error("SUNEAR_PLUGIN_SOURCE_UNVERIFIED");
  const marketplace = cacheIdentity[1];
  return Object.freeze({
    pluginId: `${manifest.name}@${marketplace}`,
    pluginSource: marketplace === "sunear" ? "public_marketplace" : "personal_local",
    pluginVersion: manifest.version,
  });
}

export function receiverRuntimeMatches(status, pluginIdentity) {
  return status?.version === RECEIVER_VERSION
    && status.pluginId === pluginIdentity.pluginId
    && status.pluginSource === pluginIdentity.pluginSource
    && status.pluginVersion === pluginIdentity.pluginVersion;
}

function flag(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function stableControlDirectory(platform, temporaryDirectory) {
  if (temporaryDirectory) return temporaryDirectory;
  return platform === "win32" ? os.tmpdir() : "/tmp";
}

export function receiverSocketPath(instanceId = RECEIVER_INSTANCE_ID, platform = process.platform, temporaryDirectory, userIdentity = os.userInfo().username) {
  const digest = receiverInstanceDigest(instanceId, userIdentity);
  if (platform === "win32") {
    return `\\\\.\\pipe\\sunear-codex-receiver-${digest}`;
  }
  return resolve(stableControlDirectory(platform, temporaryDirectory), `sunear-receiver-${process.getuid?.() ?? "user"}-${digest.slice(0, 12)}.sock`);
}

export function receiverLockPath(instanceId = RECEIVER_INSTANCE_ID, temporaryDirectory, userIdentity = os.userInfo().username) {
  return resolve(stableControlDirectory(process.platform, temporaryDirectory), `sunear-receiver-${process.getuid?.() ?? "user"}-${receiverInstanceDigest(instanceId, userIdentity).slice(0, 12)}.lock`);
}

async function readHookInput() {
  if (process.stdin.isTTY) return {};
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function sendControl(socketPath, message, timeoutMs = 2_000) {
  return new Promise((resolvePromise, reject) => {
    const socket = net.createConnection(socketPath);
    let response = "";
    const timer = setTimeout(() => socket.destroy(new Error("SUNEAR_RECEIVER_CONTROL_TIMEOUT")), timeoutMs);
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.end(`${JSON.stringify(message)}\n`));
    socket.on("data", (chunk) => { response += chunk; });
    socket.on("error", reject);
    socket.on("close", () => {
      clearTimeout(timer);
      if (!response.trim()) return reject(new Error("SUNEAR_RECEIVER_CONTROL_EMPTY_RESPONSE"));
      try {
        const parsed = JSON.parse(response);
        if (parsed?.ok !== true) return reject(new Error(String(parsed?.error ?? "SUNEAR_RECEIVER_CONTROL_FAILED")));
        resolvePromise(parsed);
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function waitForControl(socketPath) {
  let lastError;
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      return await sendControl(socketPath, { command: "status" });
    } catch (error) {
      lastError = error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
  }
  throw lastError ?? new Error("SUNEAR_RECEIVER_START_TIMEOUT");
}

async function waitForControlStop(socketPath) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      await sendControl(socketPath, { command: "status" }, 250);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    } catch {
      return;
    }
  }
  throw new Error("SUNEAR_RECEIVER_STOP_TIMEOUT");
}

function xml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
const psLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
const windowsArgument = (value) => `"${String(value).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`;

export function receiverStartupConfiguration({ executable, dataDirectory, pluginRoot, codexHome, agentKind, platform = process.platform, homeDirectory = os.homedir() }) {
  if (!["codex_desktop", "codex_cli"].includes(agentKind)) throw new Error("SUNEAR_RECEIVER_AGENT_KIND_INVALID");
  const label = `com.sunear.receiver.${agentKind}`;
  const cwd = resolve(dataDirectory, "workspace");
  const args = ["daemon", "--cwd", cwd, "--data-dir", dataDirectory, "--plugin-root", pluginRoot, "--codex-home", codexHome, "--agent-kind", agentKind];
  const log = resolve(dataDirectory, "receiver.log");
  if (platform === "darwin") {
    const path = resolve(homeDirectory, "Library/LaunchAgents", `${label}.plist`);
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${xml(label)}</string>
<key>ProgramArguments</key><array>${[executable, ...args].map((arg) => `<string>${xml(arg)}</string>`).join("")}</array>
<key>WorkingDirectory</key><string>${xml(cwd)}</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
<key>ThrottleInterval</key><integer>30</integer>
<key>StandardOutPath</key><string>${xml(log)}</string>
<key>StandardErrorPath</key><string>${xml(log)}</string>
</dict></plist>
`;
    return { label, path, content, cwd };
  }
  if (platform === "win32") {
    const path = resolve(dataDirectory, "receiver-startup.ps1");
    const content = `$ErrorActionPreference = 'Stop'
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute ${psLiteral(executable)} -Argument ${psLiteral(args.map(windowsArgument).join(" "))} -WorkingDirectory ${psLiteral(cwd)}
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName ${psLiteral(label)} -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName ${psLiteral(label)}
`;
    return { label, path, content, cwd };
  }
  throw new Error("SUNEAR_RECEIVER_PLATFORM_UNSUPPORTED");
}

async function installReceiverStartup(socketPath, dataDirectory, pluginIdentity, agentKind) {
  const lockPath = `${receiverLockPath(`${RECEIVER_INSTANCE_ID}:${agentKind}`)}.install`;
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const lock = acquireDaemonLock(lockPath);
    if (lock) {
      try { return await configureReceiverStartup(socketPath, dataDirectory, pluginIdentity, agentKind); }
      finally { closeSync(lock.descriptor); unlinkSync(lock.lockPath); }
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error("SUNEAR_RECEIVER_INSTALL_TIMEOUT");
}

async function configureReceiverStartup(socketPath, dataDirectory, pluginIdentity, agentKind) {
  if (!isCompiledReceiverExecutable()) throw new Error("SUNEAR_RECEIVER_AUTOSTART_REQUIRES_NATIVE_BUILD");
  const config = receiverStartupConfiguration({ executable: process.execPath, dataDirectory, agentKind,
    pluginRoot: resolve(process.env.PLUGIN_ROOT), codexHome: resolve(process.env.CODEX_HOME ?? resolve(os.homedir(), ".codex")) });
  let previous;
  try { previous = await readFile(config.path, "utf8"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  let existing;
  try { existing = await sendControl(socketPath, { command: "status" }); } catch {}
  const domain = `gui/${process.getuid?.()}`;
  const loaded = process.platform === "darwin"
    ? spawnSync("launchctl", ["print", `${domain}/${config.label}`], { stdio: "ignore", timeout: 5_000 }).status === 0
    : spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", `$ErrorActionPreference = 'Stop'; Get-ScheduledTask -TaskName ${psLiteral(config.label)} -ErrorAction Stop | Out-Null`], { stdio: "ignore", timeout: 5_000 }).status === 0;
  if (previous === config.content && loaded && receiverRuntimeMatches(existing, pluginIdentity)) {
    if (["degraded", "starting"].includes(existing.state)) await sendControl(socketPath, { command: "recover" });
    return;
  }
  if (existing) { await sendControl(socketPath, { command: "stop" }); await waitForControlStop(socketPath); }
  await mkdir(dirname(config.path), { recursive: true, mode: 0o700 });
  await mkdir(config.cwd, { recursive: true, mode: 0o700 });
  const temporary = `${config.path}.${process.pid}.tmp`;
  await writeFile(temporary, config.content, { mode: 0o600 });
  await rename(temporary, config.path);
  if (process.platform === "darwin") {
    if (loaded) await runStartupCommand("launchctl", ["bootout", `${domain}/${config.label}`]);
    await runStartupCommand("launchctl", ["bootstrap", domain, config.path]);
  } else await runStartupCommand("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", config.path]);
  const status = await waitForControl(socketPath);
  if (!receiverRuntimeMatches(status, pluginIdentity)) throw new Error("SUNEAR_RECEIVER_START_IDENTITY_MISMATCH");
  await sendControl(socketPath, { command: "recover" });
}

function runStartupCommand(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    const timer = setTimeout(() => { child.kill(); reject(new Error("SUNEAR_RECEIVER_AUTOSTART_TIMEOUT")); }, 15_000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); if (code === 0) resolvePromise(); else reject(new Error(`SUNEAR_RECEIVER_AUTOSTART_FAILED:${code}`)); });
  });
}

function launchBrowser(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`SUNEAR_BROWSER_OPEN_FAILED:${code}`)));
  });
}

async function openBrowserPairingUrl(url) {
  if (process.platform === "darwin") {
    try { await launchBrowser("/usr/bin/open", ["-a", "Google Chrome", url]); return; }
    catch { await launchBrowser("/usr/bin/open", [url]); return; }
  }
  if (process.platform === "win32") return launchBrowser("cmd", ["/c", "start", "", url]);
  return launchBrowser("xdg-open", [url]);
}

function acquireDaemonLock(lockPath) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const descriptor = openSync(lockPath, "wx", 0o600);
      writeSync(descriptor, `${process.pid}\n`);
      return { descriptor, lockPath };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const owner = Number(readFileSync(lockPath, "utf8").trim());
      try {
        if (Number.isSafeInteger(owner) && owner > 0) process.kill(owner, 0);
        return null;
      } catch (ownerError) {
        if (ownerError?.code !== "ESRCH") return null;
        try {
          unlinkSync(lockPath);
        } catch (unlinkError) {
          if (unlinkError?.code !== "ENOENT") throw unlinkError;
        }
      }
    }
  }
  return null;
}

export async function runDaemon({ socketPath, lockPath, cwd, dataDirectory, receiverIdentity, pluginIdentity }) {
  mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
  const lock = acquireDaemonLock(lockPath);
  if (!lock) return;
  let released = false;
  const releaseLock = () => {
    if (released) return;
    released = true;
    closeSync(lock.descriptor);
    try {
      unlinkSync(lock.lockPath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  };
  process.once("exit", releaseLock);
  if (process.platform !== "win32") {
    try {
      await sendControl(socketPath, { command: "status" }, 250);
      process.off("exit", releaseLock);
      releaseLock();
      return;
    } catch {}
    await unlink(socketPath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
  let receiverState = "starting";
  let activeReceiver = null;
  let stopRequested = false;
  let recoveryError = null;
  let interactiveAuthorization = false;
  let consecutiveFailures = 0;
  let resumeRecovery = null;
  let generation = 0;
  const canonicalOrigin = new URL(process.env.SUNEAR_CANONICAL_ORIGIN ?? "https://stage.sunearbuild.com").origin;
  const localAssets = await startSunearLocalAssetServer({ directory: resolve(dataDirectory, "local-assets"), origin: canonicalOrigin });
  let requestedGeneration = 0;
  const closeServer = () => { if (server.listening) server.close(); };
  const stopDaemon = async () => {
    if (stopRequested) return;
    stopRequested = true;
    resumeRecovery?.();
    await activeReceiver?.stop();
    closeServer();
  };
  const onTermination = () => { void stopDaemon(); };
  process.on("SIGTERM", onTermination);
  process.on("SIGINT", onTermination);
  const server = net.createServer((socket) => {
    let input = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => { input += chunk; });
    socket.on("end", async () => {
      let response;
      try {
        const message = JSON.parse(input.trim());
        if (message.command === "recover") {
          interactiveAuthorization = true;
          requestedGeneration = Math.max(requestedGeneration, receiverState === "starting" ? generation : generation + 1);
          recoveryError = null;
          if (resumeRecovery) { receiverState = "starting"; resumeRecovery(); }
          else if (activeReceiver && receiverState !== "starting") { activeReceiver.recoveryRequested = true; activeReceiver.wakeForWork(); receiverState = "recovering"; }
        }
        else if (message.command !== "status" && message.command !== "stop") throw new Error("INVALID_RECEIVER_CONTROL_COMMAND");
        response = {
          ok: true,
          version: RECEIVER_VERSION,
          ...pluginIdentity,
          state: receiverState,
          generation,
          requestedGeneration,
          recoveryError,
          deviceId: receiverIdentity.deviceId,
          receiverId: receiverIdentity.receiverId,
          pid: process.pid,
        };
        socket.end(`${JSON.stringify(response)}\n`);
        if (message.command === "stop") {
          await stopDaemon();
        }
      } catch (error) {
        response = { ok: false, error: error instanceof Error ? error.message : String(error) };
        socket.end(`${JSON.stringify(response)}\n`);
      }
    });
  });

  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    process.umask(0o077);
    server.listen(socketPath, resolvePromise);
  });
  if (process.platform !== "win32") await chmod(socketPath, 0o600);
  await writeFile(resolve(dataDirectory, "receiver.json"), `${JSON.stringify({ pid: process.pid, socketPath, version: RECEIVER_VERSION })}\n`, { mode: 0o600 });

  try {
    while (!stopRequested) {
      receiverState = "starting";
      generation += 1;
      recoveryError = null;
      const receiver = new SunearCodexReceiver({
        cwd,
        ...receiverIdentity,
        ...pluginIdentity,
        logger: { error: (message) => process.stderr.write(`[receiver] ${message}\n`) },
        onStatusChange: (status) => { receiverState = status; if (status === "ready") consecutiveFailures = 0; },
        onBrowserPairingUrl: (url) => interactiveAuthorization ? openBrowserPairingUrl(localAssets.pairUrl(url)) : undefined,
        onOAuthAuthorizationUrl: (url) => {
          if (!interactiveAuthorization) throw new Error("SUNEAR_AUTHORIZATION_REQUIRED");
          return openBrowserPairingUrl(url);
        },
      });
      activeReceiver = receiver;
      try {
        await receiver.run();
      } catch (error) {
        await receiver.stop();
        if (!stopRequested) {
          const intentionalRecovery = error instanceof Error && error.message === "SUNEAR_RECOVERY_REQUESTED";
          if (!intentionalRecovery) consecutiveFailures += 1;
          receiverState = intentionalRecovery ? "starting" : "degraded";
          recoveryError = intentionalRecovery ? null : error instanceof Error ? error.message.match(/^[A-Z][A-Z_]+/)?.[0] ?? "SUNEAR_RECOVERY_FAILED" : "SUNEAR_RECOVERY_FAILED";
          if (recoveryError) process.stderr.write(`${recoveryError}\n`);
          if (receiver.oauthLoginAttempted && !intentionalRecovery) {
            await new Promise((resolvePromise) => { resumeRecovery = resolvePromise; });
            resumeRecovery = null;
          }
        }
      } finally {
        if (requestedGeneration <= generation) interactiveAuthorization = false;
        activeReceiver = null;
      }
      if (!stopRequested && receiverState !== "starting") {
        await new Promise((resolvePromise) => {
          const delay = Math.min(MAX_RESTART_DELAY_MS, RESTART_DELAY_MS * 2 ** Math.min(4, Math.max(0, consecutiveFailures - 1)));
          const timer = setTimeout(resolvePromise, delay);
          resumeRecovery = () => { clearTimeout(timer); resolvePromise(); };
        });
        resumeRecovery = null;
      }
    }
    receiverState = "stopped";
  } finally {
    process.off("SIGTERM", onTermination);
    process.off("SIGINT", onTermination);
    closeServer();
    await localAssets.close();
    if (process.platform !== "win32") await unlink(socketPath).catch(() => {});
    process.off("exit", releaseLock);
    releaseLock();
  }
}

async function main() {
  const command = process.argv[2];
  if (process.env.SUNEAR_RECEIVER_CHILD === "1" && command === "session-start") return;
  for (const [option, variable] of [["--plugin-root", "PLUGIN_ROOT"], ["--codex-home", "CODEX_HOME"], ["--agent-kind", "CODEX_INTERNAL_ORIGINATOR_OVERRIDE"]]) {
    const value = flag(option); if (value) process.env[variable] = value;
  }
  const hook = command === "session-start" ? await readHookInput() : {};
  const dataDirectory = resolve(flag("--data-dir", process.env.PLUGIN_DATA ?? resolve(dirname(scriptPath), ".data")));
  const receiverIdentity = await readOrCreateReceiverIdentity(dataDirectory);
  const cwd = resolve(flag("--cwd", hook.cwd ?? process.cwd()));
  const receiverInstanceId = `${RECEIVER_INSTANCE_ID}:${receiverIdentity.agentKind}`;
  const socketPath = receiverSocketPath(receiverInstanceId);
  const lockPath = receiverLockPath(receiverInstanceId);

  try {
    if (command === "daemon") {
      await runDaemon({ socketPath, lockPath, cwd, dataDirectory, receiverIdentity, pluginIdentity: readPluginRuntimeIdentity() });
    }
    else if (command === "session-start") {
      await installReceiverStartup(socketPath, dataDirectory, readPluginRuntimeIdentity(), receiverIdentity.agentKind);
    } else if (command === "cache-image") {
      const file = flag("--file");
      if (!file) throw new Error("SUNEAR_LOCAL_ASSET_FILE_REQUIRED");
      console.log(JSON.stringify(await new SunearLocalAssetStore(resolve(dataDirectory, "local-assets")).put(file)));
    } else if (command === "status") console.log(JSON.stringify(await sendControl(socketPath, { command: "status" }), null, 2));
    else if (command === "stop") await sendControl(socketPath, { command: "stop" });
    else {
      console.error("Usage: sunear-codex-receiver-supervisor.mjs <session-start|cache-image|status|stop|daemon>");
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    // An uninstalled or invalid plugin must not enter an OS restart loop.
    process.exitCode = command === "daemon" && (error?.code === "ENOENT" || /^SUNEAR_PLUGIN_/.test(error?.message ?? "")) ? 0 : 1;
  }
}

if (resolve(process.argv[1] ?? "") === resolve(scriptPath)) await main();
