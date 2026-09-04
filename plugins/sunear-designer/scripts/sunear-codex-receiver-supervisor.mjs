#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { chmod, unlink, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RECEIVER_VERSION } from "./lib/sunear-codex-receiver-core.mjs";
import { readOrCreateReceiverIdentity } from "./lib/sunear-codex-receiver-identity.mjs";
import { SunearCodexReceiver } from "./lib/sunear-codex-receiver.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const RECEIVER_INSTANCE_ID = "sunear-designer";
const RESTART_DELAY_MS = 5_000;
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

function sendControl(socketPath, message, timeoutMs = 2_000) {
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
  for (let attempt = 0; attempt < 40; attempt += 1) {
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
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await sendControl(socketPath, { command: "status" }, 250);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    } catch {
      return;
    }
  }
  throw new Error("SUNEAR_RECEIVER_STOP_TIMEOUT");
}

function launchDaemon({ cwd, dataDirectory, sessionId }) {
  mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
  const logDescriptor = openSync(resolve(dataDirectory, "receiver.log"), "a", 0o600);
  const compiledExecutable = isCompiledReceiverExecutable();
  const child = spawn(process.execPath, [...(compiledExecutable ? [] : [scriptPath]), "daemon", "--cwd", cwd, "--data-dir", dataDirectory, "--initial-session", sessionId], {
    cwd,
    detached: true,
    env: process.env,
    stdio: ["ignore", logDescriptor, logDescriptor],
  });
  child.unref();
  closeSync(logDescriptor);
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

async function startSession(socketPath, sessionId, cwd, dataDirectory, pluginIdentity) {
  let existing;
  try {
    existing = await sendControl(socketPath, { command: "status" });
  } catch {}
  if (existing && !receiverRuntimeMatches(existing, pluginIdentity)) {
    await sendControl(socketPath, { command: "stop" });
    await waitForControlStop(socketPath);
    existing = undefined;
  }
  if (!existing) {
    launchDaemon({ cwd, dataDirectory, sessionId });
    await waitForControl(socketPath);
  }
  return sendControl(socketPath, { command: "session-start", sessionId });
}

async function runDaemon({ socketPath, lockPath, cwd, dataDirectory, initialSessionId, receiverIdentity, pluginIdentity }) {
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
      return;
    } catch {}
    await unlink(socketPath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
  const sessions = new Set(initialSessionId ? [initialSessionId] : []);
  let receiverState = "starting";
  let activeReceiver = null;
  let stopRequested = false;
  const closeServer = () => { if (server.listening) server.close(); };
  const stopDaemon = async () => {
    if (stopRequested) return;
    stopRequested = true;
    sessions.clear();
    await activeReceiver?.stop();
    closeServer();
  };
  const server = net.createServer((socket) => {
    let input = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => { input += chunk; });
    socket.on("end", async () => {
      let response;
      try {
        const message = JSON.parse(input.trim());
        if (message.command === "session-start" && typeof message.sessionId === "string") sessions.add(message.sessionId);
        else if (message.command === "session-end" && typeof message.sessionId === "string") sessions.delete(message.sessionId);
        else if (message.command === "stop") sessions.clear();
        else if (message.command !== "status") throw new Error("INVALID_RECEIVER_CONTROL_COMMAND");
        response = {
          ok: true,
          version: RECEIVER_VERSION,
          ...pluginIdentity,
          state: receiverState,
          sessions: sessions.size,
          pid: process.pid,
        };
        socket.end(`${JSON.stringify(response)}\n`);
        if (message.command === "stop" || (message.command === "session-end" && sessions.size === 0)) {
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
      const receiver = new SunearCodexReceiver({
        cwd,
        ...receiverIdentity,
        ...pluginIdentity,
        logger: { error: (message) => process.stderr.write(`[receiver] ${message}\n`) },
        onStatusChange: (status) => { receiverState = status; },
        onBrowserPairingUrl: openBrowserPairingUrl,
        onOAuthAuthorizationUrl: openBrowserPairingUrl,
      });
      activeReceiver = receiver;
      try {
        await receiver.run();
      } catch (error) {
        await receiver.stop();
        if (!stopRequested) {
          receiverState = "degraded";
          process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
        }
      } finally {
        activeReceiver = null;
      }
      if (!stopRequested) await new Promise((resolvePromise) => setTimeout(resolvePromise, RESTART_DELAY_MS));
    }
    receiverState = "stopped";
  } finally {
    closeServer();
    if (process.platform !== "win32") await unlink(socketPath).catch(() => {});
    releaseLock();
  }
}

async function main() {
  const command = process.argv[2];
  if (process.env.SUNEAR_RECEIVER_CHILD === "1" && (command === "session-start" || command === "session-end")) return;
  const hook = command === "session-start" || command === "session-end" ? await readHookInput() : {};
  const dataDirectory = resolve(flag("--data-dir", process.env.PLUGIN_DATA ?? resolve(dirname(scriptPath), ".data")));
  const receiverIdentity = await readOrCreateReceiverIdentity(dataDirectory);
  const cwd = resolve(flag("--cwd", hook.cwd ?? process.cwd()));
  const sessionId = flag("--session", hook.session_id);
  const initialSessionId = flag("--initial-session");
  const receiverInstanceId = `${RECEIVER_INSTANCE_ID}:${receiverIdentity.agentKind}`;
  const socketPath = receiverSocketPath(receiverInstanceId);
  const lockPath = receiverLockPath(receiverInstanceId);

  try {
    if (command === "daemon") {
      if (typeof initialSessionId !== "string" || !initialSessionId) throw new Error("SUNEAR_RECEIVER_SESSION_ID_REQUIRED");
      await runDaemon({ socketPath, lockPath, cwd, dataDirectory, initialSessionId, receiverIdentity, pluginIdentity: readPluginRuntimeIdentity() });
    }
    else if (command === "session-start") {
      if (typeof sessionId !== "string" || !sessionId) throw new Error("SUNEAR_RECEIVER_SESSION_ID_REQUIRED");
      await startSession(socketPath, sessionId, cwd, dataDirectory, readPluginRuntimeIdentity());
    } else if (command === "session-end") {
      if (typeof sessionId !== "string" || !sessionId) throw new Error("SUNEAR_RECEIVER_SESSION_ID_REQUIRED");
      await sendControl(socketPath, { command: "session-end", sessionId }).catch(() => {});
    } else if (command === "status") console.log(JSON.stringify(await sendControl(socketPath, { command: "status" }), null, 2));
    else if (command === "stop") await sendControl(socketPath, { command: "stop" });
    else {
      console.error("Usage: sunear-codex-receiver-supervisor.mjs <session-start|session-end|status|stop|daemon>");
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (resolve(process.argv[1] ?? "") === resolve(scriptPath)) await main();
