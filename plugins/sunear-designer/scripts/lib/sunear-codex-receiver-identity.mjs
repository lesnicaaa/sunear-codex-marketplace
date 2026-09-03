import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
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
  const path = resolve(dataDirectory, "receiver-identity.json");
  const hostName = options.hostName ?? os.hostname;
  const agent = agentIdentity(options.originator ?? process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE);
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const value = await withIdentityLock(path, async () => {
    let current;
    try { current = parseFile(await readFile(path, "utf8")); }
    catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const deviceName = String(hostName()).trim().slice(0, 80);
      if (!deviceName) throw new Error("SUNEAR_RECEIVER_DEVICE_NAME_INVALID");
      current = { deviceId: `agentdevice_${randomUUID()}`, deviceName, instances: {} };
    }
    if (!current.instances[agent.agentKind]) {
      current.instances[agent.agentKind] = `agentreceiver_${randomUUID()}`;
      const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(current)}\n`, { mode: 0o600, flag: "wx" });
      await rename(temporary, path);
    }
    return current;
  });
  return Object.freeze({ deviceId: value.deviceId, deviceName: value.deviceName.trim(), receiverId: value.instances[agent.agentKind], ...agent });
}
