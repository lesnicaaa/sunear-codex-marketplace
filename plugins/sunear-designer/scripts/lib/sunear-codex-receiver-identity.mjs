import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import { resolve } from "node:path";

const RECEIVER_ID_PATTERN = /^agentreceiver_[A-Za-z0-9._:-]{1,110}$/;
const DEVICE_ID_PATTERN = /^agentdevice_[A-Za-z0-9._:-]{1,112}$/;
const AGENT_KINDS = new Set(["codex_desktop", "codex_cli"]);
const wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

function agentIdentity(originator) {
  const desktop = String(originator ?? "").toLowerCase().includes("desktop");
  return desktop ? { agentKind: "codex_desktop", agentName: "Codex Desktop" } : { agentKind: "codex_cli", agentName: "Codex CLI" };
}

function parseFile(content) {
  const value = JSON.parse(content);
  if (!value || typeof value !== "object" || !DEVICE_ID_PATTERN.test(value.deviceId)
    || typeof value.deviceName !== "string" || !value.deviceName.trim() || value.deviceName.length > 80
    || !value.instances || typeof value.instances !== "object" || Array.isArray(value.instances)
    || Object.entries(value.instances).some(([kind, id]) => !AGENT_KINDS.has(kind) || !RECEIVER_ID_PATTERN.test(id))) {
    throw new Error("SUNEAR_RECEIVER_IDENTITY_INVALID");
  }
  return value;
}

async function directoryNames(path) {
  try {
    return (await readdir(path, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function legacyIdentityPaths(codexHome, currentDataDirectory) {
  const paths = [resolve(currentDataDirectory, "receiver-identity.json")];
  const cacheRoot = resolve(codexHome, "plugins/cache");
  for (const marketplace of await directoryNames(cacheRoot)) {
    const pluginRoot = resolve(cacheRoot, marketplace, "sunear-designer");
    for (const version of await directoryNames(pluginRoot)) {
      paths.push(resolve(pluginRoot, version, "scripts/.data/receiver-identity.json"));
    }
  }
  return [...new Set(paths)];
}

async function newestLegacyIdentity(codexHome, currentDataDirectory) {
  const candidates = [];
  for (const path of await legacyIdentityPaths(codexHome, currentDataDirectory)) {
    try {
      candidates.push({ path, value: parseFile(await readFile(path, "utf8")), modifiedAt: (await stat(path)).mtimeMs });
    } catch (error) {
      if (path === resolve(currentDataDirectory, "receiver-identity.json") && error?.code !== "ENOENT") throw error;
      if (error?.code !== "ENOENT" && error?.message !== "SUNEAR_RECEIVER_IDENTITY_INVALID") throw error;
    }
  }
  return candidates.sort((left, right) => right.modifiedAt - left.modifiedAt || left.path.localeCompare(right.path))[0]?.value;
}

async function withIdentityLock(path, work) {
  const lockPath = `${path}.lock`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let descriptor;
    try {
      descriptor = await open(lockPath, "wx", 0o600);
      try { return await work(); }
      finally { await descriptor.close(); await unlink(lockPath).catch(() => {}); }
    } catch (error) {
      if (descriptor || error?.code !== "EEXIST") throw error;
      await wait(20);
    }
  }
  throw new Error("SUNEAR_RECEIVER_IDENTITY_LOCK_TIMEOUT");
}

export async function readOrCreateReceiverIdentity(dataDirectory, options = {}) {
  if (typeof dataDirectory !== "string" || !dataDirectory) throw new Error("SUNEAR_RECEIVER_DATA_DIRECTORY_REQUIRED");
  const codexHome = resolve(options.codexHome ?? process.env.CODEX_HOME ?? resolve((options.homeDirectory ?? os.homedir)(), ".codex"));
  const identityDirectory = resolve(codexHome, "sunear-designer/receiver");
  const path = resolve(identityDirectory, "receiver-identity.json");
  const hostName = options.hostName ?? os.hostname;
  const agent = agentIdentity(options.originator ?? process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE);
  await mkdir(identityDirectory, { recursive: true, mode: 0o700 });
  const value = await withIdentityLock(path, async () => {
    let current;
    try { current = parseFile(await readFile(path, "utf8")); }
    catch (error) {
      if (error?.code !== "ENOENT") throw error;
      current = await newestLegacyIdentity(codexHome, dataDirectory);
      if (!current) {
        const deviceName = String(hostName()).trim().slice(0, 80);
        if (!deviceName) throw new Error("SUNEAR_RECEIVER_DEVICE_NAME_INVALID");
        current = { deviceId: `agentdevice_${randomUUID()}`, deviceName, instances: {} };
      }
    }
    if (!current.instances[agent.agentKind]) {
      current.instances[agent.agentKind] = `agentreceiver_${randomUUID()}`;
    }
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(current)}\n`, { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
    return current;
  });
  return Object.freeze({ deviceId: value.deviceId, deviceName: value.deviceName.trim(), receiverId: value.instances[agent.agentKind], ...agent });
}
