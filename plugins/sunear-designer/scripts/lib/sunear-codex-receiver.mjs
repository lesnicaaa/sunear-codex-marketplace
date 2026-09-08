import { CodexAppServerClient, resolveCodexExecutable } from "./codex-app-server-client.mjs";
import {
  RECEIVER_RUNTIME,
  RECEIVER_VERSION,
  assertReceiverTools,
  buildExecutionPrompt,
  callSunearTool,
  parseClaimedExecutionRequest,
} from "./sunear-codex-receiver-core.mjs";

const DEFAULT_HEARTBEAT_MS = 15_000;
const DEFAULT_POLL_MS = 60_000;
const DEFAULT_EXECUTION_TIMEOUT_MS = 30 * 60_000;
const MCP_STARTUP_TIMEOUT_MS = 30_000;
const HEARTBEAT_REQUEST_TIMEOUT_MS = 10_000;
const STOP_REPORT_TIMEOUT_MS = 5_000;
const SETTLEMENT_MARGIN_MS = 5_000;
const CLAIM_RENEWAL_MS = 10_000;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function receiverErrorCode(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("UNSUPPORTED_EXECUTION_SCHEMA")) return "UNSUPPORTED_EXECUTION_SCHEMA";
  if (message.startsWith("UNSUPPORTED_EXECUTION_COMMAND")) return "UNSUPPORTED_EXECUTION_COMMAND";
  if (message.startsWith("INVALID_EXECUTION_REQUEST")) return "INVALID_EXECUTION_REQUEST";
  if (message.startsWith("EXECUTION_REQUEST_LEASE_EXPIRED")) return "EXECUTION_REQUEST_LEASE_EXPIRED";
  if (message.startsWith("EXECUTION_REQUEST_CLAIM_LOST")) return "EXECUTION_REQUEST_CLAIM_LOST";
  if (message.startsWith("SUNEAR_MCP_NOT_AUTHENTICATED")) return "SUNEAR_MCP_NOT_AUTHENTICATED";
  if (message.startsWith("SUNEAR_RECEIVER_TOOLS_MISSING")) return "SUNEAR_RECEIVER_TOOLS_MISSING";
  if (message.startsWith("CODEX_APP_SERVER")) return "CODEX_APP_SERVER_ERROR";
  if (message.startsWith("CODEX_DIAGNOSTIC_RESULT_MISSING")) return "CODEX_DIAGNOSTIC_RESULT_MISSING";
  if (message.startsWith("CODEX_TURN_USAGE_LIMIT_EXCEEDED")) return "CODEX_USAGE_LIMIT_EXCEEDED";
  if (message.startsWith("CODEX_TURN_SESSION_BUDGET_EXCEEDED")) return "CODEX_SESSION_BUDGET_EXCEEDED";
  if (message.startsWith("CODEX_TURN_UNAUTHORIZED")) return "CODEX_UNAUTHORIZED";
  if (message.startsWith("CODEX_TURN_SANDBOX_ERROR")) return "CODEX_SANDBOX_ERROR";
  if (message.startsWith("CODEX_TURN_SERVER_OVERLOADED")) return "CODEX_SERVER_OVERLOADED";
  if (message.startsWith("CODEX_TURN_INTERNAL_SERVER_ERROR")) return "CODEX_INTERNAL_SERVER_ERROR";
  if (message.startsWith("CODEX_TURN_INTERRUPTED")) return "CODEX_TURN_INTERRUPTED";
  if (message.startsWith("CODEX_TURN_FAILED")) return "CODEX_TURN_FAILED";
  return "CODEX_EXECUTION_FAILED";
}

function codexErrorName(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return Object.keys(value)[0] ?? "unknown";
  return "unknown";
}

function turnFailureError(turn) {
  const status = String(turn?.status ?? "unknown");
  if (status === "interrupted") return new Error("CODEX_TURN_INTERRUPTED");
  if (status !== "failed") return new Error(`CODEX_TURN_${status.toUpperCase()}`);
  const codexError = codexErrorName(turn?.error?.codexErrorInfo)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toUpperCase();
  return new Error(codexError === "UNKNOWN" ? "CODEX_TURN_FAILED" : `CODEX_TURN_${codexError}`);
}

function finalAgentMessage(turn) {
  if (!Array.isArray(turn?.items)) return "";
  return turn.items.reduce((result, item) => item?.type === "agentMessage"
    && (!item.phase || item.phase === "final_answer") && typeof item.text === "string" && item.text.trim()
    ? item.text.trim() : result, "");
}

function claimIdentity(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.requestId !== "string" || !Number.isSafeInteger(value.fencingToken)) return null;
  return { requestId: value.requestId, fencingToken: value.fencingToken };
}

function isFatalReceiverError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith("CODEX_APP_SERVER")
    || message.startsWith("SUNEAR_MCP_NOT_AUTHENTICATED")
    || message.startsWith("SUNEAR_MCP_NOT_CONFIGURED")
    || message.startsWith("SUNEAR_RECEIVER_TOOLS_MISSING");
}

export class SunearCodexReceiver {
  /**
   * @param {{
   *   cwd?: string,
   *   client?: import("./codex-app-server-client.mjs").CodexAppServerClient,
   *   heartbeatMs?: number,
   *   pollMs?: number,
   *   model?: string,
   *   executionTimeoutMs?: number,
   *   claimRenewalMs?: number,
   *   sleep?: (milliseconds: number) => Promise<void>,
   *   now?: () => number,
   *   receiverId: string,
   *   deviceId: string,
   *   deviceName: string,
   *   agentName: string,
   *   agentKind: "codex_desktop" | "codex_cli",
   *   pluginId: string,
   *   pluginSource: "public_marketplace" | "personal_local",
   *   pluginVersion: string,
   *   logger?: Pick<Console, "error">,
   *   onStatusChange?: (status: "ready" | "degraded" | "stopped") => void,
   *   onBrowserPairingUrl?: (url: string) => Promise<void> | void,
   *   onOAuthAuthorizationUrl?: (url: string) => Promise<void> | void,
   * }} [options]
   */
  constructor({
    receiverId,
    deviceId,
    deviceName,
    agentName,
    agentKind,
    pluginId,
    pluginSource,
    pluginVersion,
    cwd = process.cwd(),
    client,
    heartbeatMs = DEFAULT_HEARTBEAT_MS,
    pollMs = DEFAULT_POLL_MS,
    model = "gpt-5.6-terra",
    executionTimeoutMs = DEFAULT_EXECUTION_TIMEOUT_MS,
    claimRenewalMs = CLAIM_RENEWAL_MS,
    sleep = delay,
    now = Date.now,
    logger = console,
    onStatusChange = () => {},
    onBrowserPairingUrl = () => {},
    onOAuthAuthorizationUrl = onBrowserPairingUrl,
  } = {}) {
    if (typeof receiverId !== "string" || !receiverId) throw new Error("SUNEAR_RECEIVER_ID_REQUIRED");
    if (typeof deviceId !== "string" || !deviceId) throw new Error("SUNEAR_DEVICE_ID_REQUIRED");
    if (typeof deviceName !== "string" || !deviceName) throw new Error("SUNEAR_RECEIVER_DEVICE_NAME_REQUIRED");
    if (typeof agentName !== "string" || !agentName) throw new Error("SUNEAR_RECEIVER_AGENT_NAME_REQUIRED");
    if (typeof pluginId !== "string" || !pluginId) throw new Error("SUNEAR_PLUGIN_ID_REQUIRED");
    if (pluginSource !== "public_marketplace" && pluginSource !== "personal_local") throw new Error("SUNEAR_PLUGIN_SOURCE_INVALID");
    if (typeof pluginVersion !== "string" || !pluginVersion) throw new Error("SUNEAR_PLUGIN_VERSION_REQUIRED");
    this.receiverId = receiverId;
    this.deviceId = deviceId;
    this.deviceName = deviceName;
    this.agentName = agentName;
    this.agentKind = agentKind;
    this.pluginId = pluginId;
    this.pluginSource = pluginSource;
    this.pluginVersion = pluginVersion;
    this.cwd = cwd;
    this.client = client ?? new CodexAppServerClient({
      command: resolveCodexExecutable({ agentKind }),
      cwd,
      environment: { ...process.env, SUNEAR_RECEIVER_CHILD: "1" },
    });
    this.heartbeatMs = heartbeatMs;
    this.pollMs = pollMs;
    this.model = model;
    this.executionTimeoutMs = executionTimeoutMs;
    this.claimRenewalMs = claimRenewalMs;
    this.sleep = sleep;
    this.now = now;
    this.logger = logger;
    this.onStatusChange = onStatusChange;
    this.onBrowserPairingUrl = onBrowserPairingUrl;
    this.onOAuthAuthorizationUrl = onOAuthAuthorizationUrl;
    this.browserPairingOpened = false;
    this.oauthLoginAttempted = false;
    this.controlThreadId = null;
    this.lastHeartbeatAt = 0;
    this.stopping = false;
    this.heartbeatInFlight = null;
    this.heartbeatTimer = null;
    this.stopPromise = null;
    this.recoveryRequested = false;
    this.notification = null;
    this.notificationSocket = null;
    this.notificationRetry = null;
    this.notificationDelayMs = 1000;
    this.workPending = false;
    this.workWaiter = null;
  }

  setStatus(status) {
    try { this.onStatusChange(status); }
    catch (error) { this.logger.error(error instanceof Error ? error.message : String(error)); }
  }

  async initialize() {
    await this.client.start({
      name: "sunear_codex_receiver",
      title: "Sunear Codex Receiver",
      version: RECEIVER_VERSION,
    });
    this.controlThreadId = await this.startThread();
    await this.ensureReceiverTools(this.controlThreadId);
    await callSunearTool(this.client, this.controlThreadId, "workflow_context", {
      agentWorkId: `sunear-receiver:${this.receiverId}`,
    });
    await this.report("ready");
    return this.controlThreadId;
  }

  async startThread() {
    const response = await this.client.request("thread/start", {
      cwd: this.cwd,
      approvalPolicy: "never",
      sandbox: "read-only",
      ephemeral: true,
      serviceName: "sunear_receiver",
      model: this.model,
    });
    const threadId = response?.thread?.id;
    if (typeof threadId !== "string" || !threadId) throw new Error("CODEX_APP_SERVER_THREAD_START_FAILED");
    return threadId;
  }

  async waitForReceiverTools(threadId) {
    const deadline = this.now() + MCP_STARTUP_TIMEOUT_MS;
    let lastError;
    while (this.now() < deadline) {
      try {
        const response = await this.client.request("mcpServerStatus/list", {
          threadId,
          detail: "toolsAndAuthOnly",
          limit: 100,
        });
        return assertReceiverTools(response);
      } catch (error) {
        lastError = error;
        if (error instanceof Error && error.message.startsWith("SUNEAR_MCP_NOT_AUTHENTICATED")) throw error;
        if (error instanceof Error && error.message.startsWith("SUNEAR_RECEIVER_TOOLS_MISSING")) {
          // OAuth capability in status is not proof that the stored grant still works.
          try { await callSunearTool(this.client, threadId, "workflow_context", { agentWorkId: `sunear-receiver:${this.receiverId}` }); }
          catch (probeError) {
            if (probeError instanceof Error && probeError.message.startsWith("SUNEAR_MCP_NOT_AUTHENTICATED")) throw probeError;
          }
        }
        await this.sleep(250);
      }
    }
    throw lastError ?? new Error("SUNEAR_MCP_STARTUP_TIMEOUT");
  }

  async ensureReceiverTools(threadId) {
    try {
      return await this.waitForReceiverTools(threadId);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("SUNEAR_MCP_NOT_AUTHENTICATED") || this.oauthLoginAttempted) throw error;
      this.oauthLoginAttempted = true;
      const completed = this.client.createNotificationWaiter(
        (message) => message.method === "mcpServer/oauthLogin/completed"
          && message.params?.name === "sunear"
          && (message.params?.threadId == null || message.params.threadId === threadId),
        5 * 60_000,
      );
      try {
        const response = await this.client.request("mcpServer/oauth/login", { name: "sunear", threadId, clientRegistration: "dcr" });
        if (typeof response?.authorizationUrl !== "string" || !response.authorizationUrl.startsWith("https://")) {
          throw new Error("SUNEAR_MCP_OAUTH_URL_INVALID");
        }
        await this.onOAuthAuthorizationUrl(response.authorizationUrl);
        const notification = await completed.promise;
        if (notification.params?.success !== true) {
          const detail = String(notification.params?.error ?? "unknown");
          throw new Error(/keyring|keychain|Operation not permitted/i.test(detail)
            ? "SUNEAR_CREDENTIAL_PERSISTENCE_FAILED" : "SUNEAR_MCP_OAUTH_FAILED");
        }
        await this.client.request("config/mcpServer/reload", {});
        return this.waitForReceiverTools(threadId);
      } finally {
        completed.cancel();
      }
    }
  }

  async report(status, timeoutMs) {
    if (!this.controlThreadId) throw new Error("SUNEAR_RECEIVER_NOT_INITIALIZED");
    const response = await callSunearTool(this.client, this.controlThreadId, "report_agent_execution_receiver", {
      receiverId: this.receiverId,
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      agentName: this.agentName,
      agentKind: this.agentKind,
      runtime: RECEIVER_RUNTIME,
      status,
      version: RECEIVER_VERSION,
      pluginId: this.pluginId,
      pluginSource: this.pluginSource,
      pluginVersion: this.pluginVersion,
    }, timeoutMs);
    this.lastHeartbeatAt = this.now();
    if (response.notification) {
      this.notification = response.notification;
      this.connectNotifications();
    }
    this.setStatus(status);
    if (!this.browserPairingOpened && typeof response.browserPairingUrl === "string") {
      try { await this.onBrowserPairingUrl(response.browserPairingUrl); this.browserPairingOpened = true; }
      catch (error) { this.logger.error(`SUNEAR_BROWSER_PAIRING_OPEN_FAILED: ${error instanceof Error ? error.message : String(error)}`); }
    }
    return response;
  }

  wakeForWork() {
    this.workPending = true;
    this.workWaiter?.();
  }

  waitForWork() {
    if (this.stopping || this.workPending) { this.workPending = false; return Promise.resolve(); }
    return new Promise((resolve) => {
      const finish = () => { clearTimeout(timer); this.workWaiter = null; this.workPending = false; resolve(); };
      const timer = setTimeout(finish, this.pollMs);
      this.workWaiter = finish;
    });
  }

  connectNotifications() {
    if (this.stopping || this.notificationSocket || this.notificationRetry || !this.notification) return;
    const grant = this.notification;
    if (grant.expiresAt <= this.now()) return;
    let url;
    try { url = new URL(grant.url); } catch { return; }
    if ((url.protocol !== "wss:" && !(url.protocol === "ws:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
      || url.username || url.password || url.search || url.hash || url.pathname !== "/api/agent/v1/receiver-notifications"
      || typeof grant.ticket !== "string" || grant.ticket.length > 2048) return;
    const retry = () => {
      if (this.stopping) return;
      this.notificationRetry = setTimeout(() => {
        this.notificationRetry = null; this.connectNotifications();
      }, this.notificationDelayMs + Math.floor(Math.random() * 500));
      this.notificationDelayMs = Math.min(60_000, this.notificationDelayMs * 2);
    };
    try {
      const socket = new WebSocket(url);
      this.notificationSocket = socket;
      const deadline = setTimeout(() => socket.close(), Math.max(1, grant.expiresAt - this.now()));
      const handshake = setTimeout(() => socket.close(), 10_000);
      socket.addEventListener("open", () => socket.send(JSON.stringify({ ticket: grant.ticket })));
      socket.addEventListener("message", (event) => {
        if (event.data !== '{"type":"wake"}') return;
        clearTimeout(handshake);
        this.notificationDelayMs = 1000;
        this.wakeForWork();
      });
      socket.addEventListener("error", () => socket.close());
      socket.addEventListener("close", () => {
        clearTimeout(deadline); clearTimeout(handshake);
        if (this.notificationSocket === socket) this.notificationSocket = null;
        retry();
      });
    } catch { retry(); }
  }

  async heartbeatIfDue() {
    if (this.now() - this.lastHeartbeatAt < this.heartbeatMs) return;
    if (!this.heartbeatInFlight) {
      this.heartbeatInFlight = this.report("ready", HEARTBEAT_REQUEST_TIMEOUT_MS).catch((error) => {
        this.setStatus("degraded");
        throw error;
      }).finally(() => {
        this.heartbeatInFlight = null;
      });
    }
    await this.heartbeatInFlight;
  }

  async pollOnce() {
    if (!this.controlThreadId) throw new Error("SUNEAR_RECEIVER_NOT_INITIALIZED");
    await this.heartbeatIfDue();
    const response = await callSunearTool(this.client, this.controlThreadId, "get_agent_execution_request", { receiverId: this.receiverId });
    if (!response.request) return null;

    const identity = claimIdentity(response.request);
    let request;
    try {
      request = parseClaimedExecutionRequest(response.request, this.receiverId);
    } catch (error) {
      if (identity) await this.finishFailure(identity, error);
      throw error;
    }

    if (request.leaseExpiresAt <= this.now() + SETTLEMENT_MARGIN_MS) {
      const error = new Error("EXECUTION_REQUEST_LEASE_EXPIRED");
      await this.finishFailure(request, error);
      throw error;
    }

    let resultText;
    try {
      resultText = await this.execute(request);
    } catch (error) {
      await this.finishFailure(request, error);
      throw error;
    }
    await this.finish(request, "completed", undefined, resultText);
    this.logger.error(JSON.stringify({ event: "sunear_receiver_execution_timing", at: new Date(this.now()).toISOString(),
      requestId: request.requestId, receiverId: this.receiverId, stage: "settled", model: this.model }));
    return request;
  }

  async execute(request) {
    const startedAt = this.now();
    const trace = (stage, extra = {}) => this.logger.error(JSON.stringify({
      event: "sunear_receiver_execution_timing", at: new Date(this.now()).toISOString(),
      requestId: request.requestId, receiverId: this.receiverId,
      elapsedMs: this.now() - startedAt, stage, model: this.model, ...extra,
    }));
    trace("claimed");
    const threadId = await this.startThread();
    trace("thread_started", { threadId });
    if (request.command.type !== "receiver_diagnostic") {
      await this.ensureReceiverTools(threadId);
      trace("tools_ready", { threadId });
    }
    if (request.leaseExpiresAt <= this.now() + SETTLEMENT_MARGIN_MS) throw new Error("EXECUTION_REQUEST_LEASE_EXPIRED");
    const completed = this.client.createNotificationWaiter(
      (message) => message.method === "turn/completed" && message.params?.threadId === threadId,
      this.executionTimeoutMs,
    );
    let turnId;
    let turnFinished = false;
    let renewalTimer;
    let rejectRenewal;
    let renewalInFlight = false;
    let finalMessage = "";
    let firstOutput = false;
    const unsubscribe = this.client.subscribeNotifications((message) => {
      if (!firstOutput && message.params?.threadId === threadId && message.method === "item/agentMessage/delta") {
        firstOutput = true;
        trace("first_output", { threadId });
      }
      const item = message?.method === "item/completed" ? message.params?.item : null;
      if (message.params?.threadId === threadId && item?.type === "agentMessage" && (!item.phase || item.phase === "final_answer") && typeof item.text === "string") {
        finalMessage = item.text.trim();
      }
    });
    const renewalFailure = new Promise((_, reject) => { rejectRenewal = reject; });
    const renew = async () => {
      if (renewalInFlight || turnFinished) return;
      renewalInFlight = true;
      try {
        const response = await callSunearTool(this.client, this.controlThreadId, "renew_agent_execution_request", {
          requestId: request.requestId,
          receiverId: this.receiverId,
          fencingToken: request.fencingToken,
        }, HEARTBEAT_REQUEST_TIMEOUT_MS);
        if (!response.request) throw new Error("EXECUTION_REQUEST_CLAIM_LOST");
      } finally {
        renewalInFlight = false;
      }
    };
    try {
      const started = await this.client.request("turn/start", {
        threadId,
        input: [{ type: "text", text: buildExecutionPrompt(request) }],
        cwd: this.cwd,
        approvalPolicy: "never",
        sandboxPolicy: { type: "readOnly" },
      }, Math.min(this.executionTimeoutMs, request.leaseExpiresAt - this.now() - SETTLEMENT_MARGIN_MS));
      turnId = started?.turn?.id;
      trace("turn_started", { threadId, turnId });
      if (!turnId) throw new Error("CODEX_APP_SERVER_TURN_START_FAILED");
      await renew();
      renewalTimer = setInterval(() => void renew().catch(rejectRenewal), this.claimRenewalMs);
      const notification = await Promise.race([completed.promise, renewalFailure]);
      turnFinished = true;
      const completedTurn = notification.params?.turn;
      const status = completedTurn?.status;
      trace("turn_completed", { threadId, turnId, status });
      if (status !== "completed") throw turnFailureError(completedTurn);
      finalMessage ||= finalAgentMessage(completedTurn);
      if (request.command.type === "receiver_diagnostic" && !finalMessage) throw new Error("CODEX_DIAGNOSTIC_RESULT_MISSING");
      return request.command.type === "receiver_diagnostic" ? finalMessage : undefined;
    } catch (error) {
      completed.cancel();
      if (turnId && !turnFinished) {
        try { await this.client.request("turn/interrupt", { threadId, turnId }, HEARTBEAT_REQUEST_TIMEOUT_MS); }
        catch (interruptError) {
          await this.client.close();
          throw new Error(`CODEX_APP_SERVER_INTERRUPT_FAILED: ${interruptError instanceof Error ? interruptError.message : String(interruptError)}`, { cause: error });
        }
      } else if (!turnId && error instanceof Error && error.message.includes("CODEX_APP_SERVER_REQUEST_TIMEOUT: turn/start")) {
        await this.client.close();
      }
      throw error;
    } finally {
      unsubscribe();
      if (renewalTimer) clearInterval(renewalTimer);
    }
  }

  async finish(request, outcome, failureCode, resultText) {
    await callSunearTool(this.client, this.controlThreadId, "finish_agent_execution_request", {
      requestId: request.requestId,
      receiverId: this.receiverId,
      fencingToken: request.fencingToken,
      outcome,
      ...(failureCode ? { errorCode: failureCode } : {}),
      ...(resultText ? { resultText } : {}),
    });
  }

  async finishFailure(request, executionError) {
    try { await this.finish(request, "failed", receiverErrorCode(executionError)); }
    catch (settlementError) {
      this.logger.error(`SUNEAR_EXECUTION_SETTLEMENT_FAILED: ${settlementError instanceof Error ? settlementError.message : String(settlementError)}`);
    }
  }

  async run() {
    await this.initialize();
    this.heartbeatTimer = setInterval(() => {
      void this.heartbeatIfDue().catch((error) => this.logger.error(error instanceof Error ? error.message : String(error)));
    }, Math.min(5_000, Math.max(1_000, Math.floor(this.heartbeatMs / 2))));
    try {
      while (!this.stopping) {
        if (this.recoveryRequested) throw new Error("SUNEAR_RECOVERY_REQUESTED");
        try {
          const executed = await this.pollOnce();
          if (executed) continue;
        } catch (error) {
          if (isFatalReceiverError(error)) throw error;
          this.logger.error(error instanceof Error ? error.message : String(error));
        }
        if (!this.stopping) await this.waitForWork();
      }
    } finally {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  async stop() {
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = this.performStop();
    return this.stopPromise;
  }

  async performStop() {
    this.stopping = true;
    clearTimeout(this.notificationRetry);
    this.notificationRetry = null;
    this.notificationSocket?.close();
    this.notificationSocket = null;
    this.wakeForWork();
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.controlThreadId) {
      try {
        await this.report("stopped", STOP_REPORT_TIMEOUT_MS);
      } catch (error) {
        this.logger.error(error instanceof Error ? error.message : String(error));
      }
    }
    await this.client.close();
  }
}
