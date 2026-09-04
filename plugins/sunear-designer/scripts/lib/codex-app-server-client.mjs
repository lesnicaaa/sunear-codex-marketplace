import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import { resolve } from "node:path";
import readline from "node:readline";

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @param {{
 *   agentKind?: string,
 *   platform?: string,
 *   environment?: Record<string, string | undefined>,
 *   homeDirectory?: string,
 *   fileExists?: (path: string) => boolean,
 * }} [options]
 */
export function resolveCodexExecutable({
  agentKind = "codex_cli",
  platform = process.platform,
  environment = process.env,
  homeDirectory = os.homedir(),
  fileExists = existsSync,
} = {}) {
  const configured = environment.SUNEAR_CODEX_EXECUTABLE?.trim();
  if (configured) return configured;
  if (agentKind === "codex_desktop" && platform === "darwin") {
    const desktopCandidates = [
      "/Applications/ChatGPT.app/Contents/Resources/codex",
      resolve(homeDirectory, "Applications/ChatGPT.app/Contents/Resources/codex"),
      "/Applications/Codex.app/Contents/Resources/codex",
      resolve(homeDirectory, "Applications/Codex.app/Contents/Resources/codex"),
    ];
    const desktopExecutable = desktopCandidates.find((candidate) => fileExists(candidate));
    if (desktopExecutable) return desktopExecutable;
  }
  return "codex";
}

export function safeServerRequestResponse(method) {
  if (method === "item/commandExecution/requestApproval" || method === "item/fileChange/requestApproval") {
    return { decision: "cancel" };
  }
  if (method === "execCommandApproval" || method === "applyPatchApproval") {
    return { decision: "abort" };
  }
  if (method === "mcpServer/elicitation/request") return { action: "cancel", content: null };
  if (method === "item/tool/requestUserInput") return { answers: {} };
  return undefined;
}

export class CodexAppServerClient {
  constructor({
    command = "codex",
    args = ["app-server", "--stdio"],
    cwd,
    environment = process.env,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    spawnProcess = spawn,
    onLog = () => {},
  } = {}) {
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.environment = environment;
    this.requestTimeoutMs = requestTimeoutMs;
    this.spawnProcess = spawnProcess;
    this.onLog = onLog;
    this.nextRequestId = 1;
    this.pending = new Map();
    this.notificationWaiters = new Set();
    this.notificationListeners = new Set();
    this.process = null;
    this.closed = false;
  }

  async start(clientInfo) {
    if (this.process) throw new Error("CODEX_APP_SERVER_ALREADY_STARTED");
    const child = this.spawnProcess(this.command, this.args, {
      cwd: this.cwd,
      env: this.environment,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.process = child;
    readline.createInterface({ input: child.stdout }).on("line", (line) => this.handleLine(line));
    readline.createInterface({ input: child.stderr }).on("line", (line) => this.onLog("app-server", line));
    child.once("error", (error) => this.failAll(new Error(`CODEX_APP_SERVER_START_FAILED: ${errorMessage(error)}`)));
    child.once("exit", (code, signal) => {
      this.process = null;
      if (!this.closed) this.failAll(new Error(`CODEX_APP_SERVER_EXITED: code=${code ?? "null"} signal=${signal ?? "null"}`));
    });

    const initialized = await this.request("initialize", {
      clientInfo,
      capabilities: { experimentalApi: true },
    });
    this.notify("initialized", {});
    return initialized;
  }

  request(method, params, timeoutMs = this.requestTimeoutMs) {
    if (!this.process?.stdin?.writable) return Promise.reject(new Error("CODEX_APP_SERVER_NOT_RUNNING"));
    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CODEX_APP_SERVER_REQUEST_TIMEOUT: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      this.write({ method, id, params });
    });
  }

  notify(method, params) {
    this.write({ method, params });
  }

  waitForNotification(predicate, timeoutMs = this.requestTimeoutMs) {
    return this.createNotificationWaiter(predicate, timeoutMs).promise;
  }

  createNotificationWaiter(predicate, timeoutMs = this.requestTimeoutMs) {
    let waiter;
    const promise = new Promise((resolve, reject) => {
      waiter = { predicate, resolve, reject, timer: undefined };
      waiter.timer = setTimeout(() => {
        this.notificationWaiters.delete(waiter);
        reject(new Error("CODEX_APP_SERVER_NOTIFICATION_TIMEOUT"));
      }, timeoutMs);
      this.notificationWaiters.add(waiter);
    });
    return {
      promise,
      cancel: () => {
        if (!this.notificationWaiters.delete(waiter)) return;
        clearTimeout(waiter.timer);
      },
    };
  }

  subscribeNotifications(listener) {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.onLog("invalid-json", line);
      return;
    }

    if (Object.hasOwn(message, "id") && (Object.hasOwn(message, "result") || Object.hasOwn(message, "error"))) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`CODEX_APP_SERVER_ERROR: ${JSON.stringify(message.error)}`));
      else pending.resolve(message.result);
      return;
    }

    if (Object.hasOwn(message, "id") && typeof message.method === "string") {
      const result = safeServerRequestResponse(message.method);
      if (result === undefined) {
        this.write({ id: message.id, error: { code: -32601, message: "Receiver does not authorize interactive server requests." } });
      } else {
        this.write({ id: message.id, result });
      }
      return;
    }

    if (typeof message.method !== "string") return;
    for (const listener of this.notificationListeners) listener(message);
    for (const waiter of this.notificationWaiters) {
      if (!waiter.predicate(message)) continue;
      clearTimeout(waiter.timer);
      this.notificationWaiters.delete(waiter);
      waiter.resolve(message);
    }
  }

  async close() {
    this.closed = true;
    const child = this.process;
    this.process = null;
    if (!child) return;
    child.kill("SIGTERM");
    this.failAll(new Error("CODEX_APP_SERVER_CLOSED"));
  }

  write(message) {
    if (!this.process?.stdin?.writable) throw new Error("CODEX_APP_SERVER_NOT_RUNNING");
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  failAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    for (const waiter of this.notificationWaiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.notificationWaiters.clear();
    this.notificationListeners.clear();
  }
}
