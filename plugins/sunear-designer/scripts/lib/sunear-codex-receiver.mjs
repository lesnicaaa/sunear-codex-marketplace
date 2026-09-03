import os from "node:os";
import { CodexAppServerClient } from "./codex-app-server-client.mjs";
import {
  RECEIVER_RUNTIME,
  RECEIVER_VERSION,
  assertReceiverTools,
  buildExecutionPrompt,
  callSunearTool,
  parseClaimedExecutionRequest,
} from "./sunear-codex-receiver-core.mjs";

const DEFAULT_HEARTBEAT_MS = 15_000;
const DEFAULT_POLL_MS = 5_000;
const DEFAULT_EXECUTION_TIMEOUT_MS = 30 * 60_000;
const MCP_STARTUP_TIMEOUT_MS = 30_000;
const HEARTBEAT_REQUEST_TIMEOUT_MS = 10_000;
const STOP_REPORT_TIMEOUT_MS = 5_000;
const SETTLEMENT_MARGIN_MS = 5_000;
const CLAIM_RENEWAL_MS = 10_000;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorCode(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("UNSUPPORTED_EXECUTION_SCHEMA")) return "UNSUPPORTED_EXECUTION_SCHEMA";
  if (message.startsWith("UNSUPPORTED_EXECUTION_COMMAND")) return "UNSUPPORTED_EXECUTION_COMMAND";
  if (message.startsWith("INVALID_EXECUTION_REQUEST")) return "INVALID_EXECUTION_REQUEST";
  if (message.startsWith("EXECUTION_REQUEST_LEASE_EXPIRED")) return "EXECUTION_REQUEST_LEASE_EXPIRED";
  if (message.startsWith("EXECUTION_REQUEST_CLAIM_LOST")) return "EXECUTION_REQUEST_CLAIM_LOST";
  if (message.startsWith("SUNEAR_MCP_NOT_AUTHENTICATED")) return "SUNEAR_MCP_NOT_AUTHENTICATED";
  if (message.startsWith("SUNEAR_RECEIVER_TOOLS_MISSING")) return "SUNEAR_RECEIVER_TOOLS_MISSING";
  if (message.startsWith("CODEX_APP_SERVER")) return "CODEX_APP_SERVER_ERROR";
  return "CODEX_EXECUTION_FAILED";
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
   *   executionTimeoutMs?: number,
   *   claimRenewalMs?: number,
   *   sleep?: (milliseconds: number) => Promise<void>,
   *   now?: () => number,
   *   hostName?: () => string,
   *   logger?: Pick<Console, "error">,
   *   onStatusChange?: (status: "ready" | "degraded" | "stopped") => void,
   * }} [options]
   */
  constructor({
    cwd = process.cwd(),
    client,
    heartbeatMs = DEFAULT_HEARTBEAT_MS,
    pollMs = DEFAULT_POLL_MS,
    executionTimeoutMs = DEFAULT_EXECUTION_TIMEOUT_MS,
    claimRenewalMs = CLAIM_RENEWAL_MS,
    sleep = delay,
    now = Date.now,
    hostName = os.hostname,
    logger = console,
    onStatusChange = () => {},
  } = {}) {
    this.cwd = cwd;
    this.client = client ?? new CodexAppServerClient({
      cwd,
      environment: { ...process.env, SUNEAR_RECEIVER_CHILD: "1" },
    });
    this.heartbeatMs = heartbeatMs;
    this.pollMs = pollMs;
    this.executionTimeoutMs = executionTimeoutMs;
    this.claimRenewalMs = claimRenewalMs;
    this.sleep = sleep;
    this.now = now;
    this.hostName = hostName;
    this.logger = logger;
    this.onStatusChange = onStatusChange;
    this.controlThreadId = null;
    this.lastHeartbeatAt = 0;
    this.stopping = false;
    this.heartbeatInFlight = null;
    this.heartbeatTimer = null;
    this.stopPromise = null;
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
    await this.waitForReceiverTools(this.controlThreadId);
    await callSunearTool(this.client, this.controlThreadId, "workflow_context", {
      agentWorkId: `sunear-receiver:${this.hostName()}`,
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
        await this.sleep(250);
      }
    }
    throw lastError ?? new Error("SUNEAR_MCP_STARTUP_TIMEOUT");
  }

  async report(status, timeoutMs) {
    if (!this.controlThreadId) throw new Error("SUNEAR_RECEIVER_NOT_INITIALIZED");
    const response = await callSunearTool(this.client, this.controlThreadId, "report_agent_execution_receiver", {
      runtime: RECEIVER_RUNTIME,
      status,
      version: RECEIVER_VERSION,
    }, timeoutMs);
    this.lastHeartbeatAt = this.now();
    this.setStatus(status);
    return response;
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
    const response = await callSunearTool(this.client, this.controlThreadId, "get_agent_execution_request");
    if (!response.request) return null;

    const identity = claimIdentity(response.request);
    let request;
    try {
      request = parseClaimedExecutionRequest(response.request);
    } catch (error) {
      if (identity) await this.finishFailure(identity, error);
      throw error;
    }

    if (request.leaseExpiresAt <= this.now() + SETTLEMENT_MARGIN_MS) {
      const error = new Error("EXECUTION_REQUEST_LEASE_EXPIRED");
      await this.finishFailure(request, error);
      throw error;
    }

    try {
      await this.execute(request);
    } catch (error) {
      await this.finishFailure(request, error);
      throw error;
    }
    await this.finish(request, "completed");
    return request;
  }

  async execute(request) {
    const threadId = await this.startThread();
    await this.waitForReceiverTools(threadId);
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
    const renewalFailure = new Promise((_, reject) => { rejectRenewal = reject; });
    const renew = async () => {
      if (renewalInFlight || turnFinished) return;
      renewalInFlight = true;
      try {
        const response = await callSunearTool(this.client, this.controlThreadId, "renew_agent_execution_request", {
          requestId: request.requestId,
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
      if (!turnId) throw new Error("CODEX_APP_SERVER_TURN_START_FAILED");
      await renew();
      renewalTimer = setInterval(() => void renew().catch(rejectRenewal), this.claimRenewalMs);
      const notification = await Promise.race([completed.promise, renewalFailure]);
      turnFinished = true;
      const status = notification.params?.turn?.status;
      if (status !== "completed") throw new Error(`CODEX_TURN_${String(status ?? "UNKNOWN").toUpperCase()}`);
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
      if (renewalTimer) clearInterval(renewalTimer);
    }
  }

  async finish(request, outcome, failureCode) {
    await callSunearTool(this.client, this.controlThreadId, "finish_agent_execution_request", {
      requestId: request.requestId,
      fencingToken: request.fencingToken,
      outcome,
      ...(failureCode ? { errorCode: failureCode } : {}),
    });
  }

  async finishFailure(request, executionError) {
    try { await this.finish(request, "failed", errorCode(executionError)); }
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
        try {
          await this.pollOnce();
        } catch (error) {
          if (isFatalReceiverError(error)) throw error;
          this.logger.error(error instanceof Error ? error.message : String(error));
        }
        if (!this.stopping) await this.sleep(this.pollMs);
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
