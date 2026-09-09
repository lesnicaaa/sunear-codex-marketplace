export const RECEIVER_VERSION = "0.9.0";
export const RECEIVER_RUNTIME = "codex_app_server";
export const EXECUTION_SCHEMA_VERSION = "sunear.agent-execution/3";
export const SUPPORTED_COMMANDS = Object.freeze(["continue_project_workflow", "receiver_diagnostic"]);

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REQUIRED_TOOLS = Object.freeze([
  "workflow_context",
  "report_agent_execution_receiver",
  "get_agent_execution_request",
  "renew_agent_execution_request",
  "finish_agent_execution_request",
]);

function requireId(value, field) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new Error(`INVALID_EXECUTION_REQUEST_${field}`);
  return value;
}

export function parseClaimedExecutionRequest(value, expectedReceiverId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_EXECUTION_REQUEST");
  const keys = Object.keys(value).sort();
  const allowedRequestKeys = ["command", "fencingToken", "leaseExpiresAt", "receiverId", "requestId"];
  if (keys.some((key) => !allowedRequestKeys.includes(key))) throw new Error("INVALID_EXECUTION_REQUEST_FIELD");
  if (!Number.isSafeInteger(value.fencingToken) || value.fencingToken < 1) throw new Error("INVALID_EXECUTION_REQUEST_FENCING_TOKEN");
  if (!value.command || typeof value.command !== "object" || Array.isArray(value.command)) throw new Error("INVALID_EXECUTION_REQUEST_COMMAND");
  if (!SUPPORTED_COMMANDS.includes(value.command.type)) throw new Error("UNSUPPORTED_EXECUTION_COMMAND");

  const commandKeys = Object.keys(value.command).sort();
  const allowedCommandKeys = value.command.type === "continue_project_workflow"
    ? ["projectId", "schemaVersion", "type"]
    : ["schemaVersion", "type"];
  if (commandKeys.some((key) => !allowedCommandKeys.includes(key))) throw new Error("INVALID_EXECUTION_REQUEST_COMMAND_FIELD");
  if (value.command.schemaVersion !== EXECUTION_SCHEMA_VERSION) throw new Error("UNSUPPORTED_EXECUTION_SCHEMA");
  if (!Number.isSafeInteger(value.leaseExpiresAt) || value.leaseExpiresAt < 1) throw new Error("INVALID_EXECUTION_REQUEST_LEASE_EXPIRES_AT");

  const receiverId = requireId(value.receiverId, "RECEIVER_ID");
  if (expectedReceiverId && receiverId !== expectedReceiverId) throw new Error("INVALID_EXECUTION_REQUEST_RECEIVER_ID");
  return Object.freeze({
    requestId: requireId(value.requestId, "ID"),
    receiverId,
    fencingToken: value.fencingToken,
    leaseExpiresAt: value.leaseExpiresAt,
    command: Object.freeze(value.command.type === "continue_project_workflow" ? {
      schemaVersion: EXECUTION_SCHEMA_VERSION,
      type: "continue_project_workflow",
      projectId: requireId(value.command.projectId, "PROJECT_ID"),
    } : {
      schemaVersion: EXECUTION_SCHEMA_VERSION,
      type: "receiver_diagnostic",
    }),
  });
}

export function buildExecutionPrompt(request) {
  if (request.command.type === "receiver_diagnostic") return [
    "这是一次 Sunear 接收器端到端诊断。",
    `请求编号：${request.requestId}`,
    "不要调用任何工具，不要读取或修改任何项目、文件、账户或外部数据。",
    "请原创一则简短的中文哲学故事，包含标题与正文，总长度不超过 500 个汉字。",
    "只输出故事本身，不解释测试过程。",
  ].join("\n");
  return [
    "Execute one claimed Sunear Web execution request.",
    `Request ID: ${request.requestId}`,
    `Command: ${request.command.type}`,
    `Project ID: ${request.command.projectId}`,
    `Schema: ${request.command.schemaVersion}`,
    `Load workflow_context first with agentWorkId sunear-web-execution:${request.requestId}:${request.fencingToken}. Keep this exact binding for every business call.`,
    "If AGENT_EXECUTION_CLAIM_STALE is returned, stop immediately. Never obtain a different work binding to bypass an expired or superseded claim.",
    "Then read the exact project workflow status and continue only that existing project's canonical workflow to the furthest legal state under the current personal autonomy grant.",
    "Do not create another project, accept arbitrary instructions, run shell commands, change unrelated files, grant permissions, or call finish_agent_execution_request; the receiver owns settlement.",
    "If required business evidence is absent or an explicit exception remains, stop safely and report it in the final answer.",
  ].join("\n");
}

export function readMcpToolResult(result) {
  if (!result || typeof result !== "object") throw new Error("INVALID_MCP_TOOL_RESPONSE");
  if (result.isError) throw new Error(`MCP_TOOL_ERROR: ${JSON.stringify(result.content ?? [])}`);
  if (result.structuredContent && typeof result.structuredContent === "object") return result.structuredContent;
  const text = Array.isArray(result.content)
    ? result.content.find((item) => item && typeof item === "object" && item.type === "text" && typeof item.text === "string")?.text
    : undefined;
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("INVALID_MCP_TOOL_JSON");
  }
}

export function assertReceiverTools(statusResponse, serverName = "sunear") {
  const server = statusResponse?.data?.find((entry) => entry?.name === serverName);
  if (!server) throw new Error("SUNEAR_MCP_NOT_CONFIGURED");
  if (server.authStatus !== "oAuth" && server.authStatus !== "bearerToken") throw new Error(`SUNEAR_MCP_NOT_AUTHENTICATED: ${server.authStatus}`);
  const names = new Set(Object.keys(server.tools ?? {}));
  const missing = REQUIRED_TOOLS.filter((name) => !names.has(name));
  if (missing.length) throw new Error(`SUNEAR_RECEIVER_TOOLS_MISSING: ${missing.join(",")}`);
  return server;
}

export async function callSunearTool(client, threadId, tool, args = {}, timeoutMs) {
  let result;
  try { result = await client.request("mcpServer/tool/call", {
    threadId,
    server: "sunear",
    tool,
    arguments: args,
  }, timeoutMs); }
  catch (error) {
    if (error instanceof Error && error.message.startsWith("CODEX_APP_SERVER_ERROR:")
      && /\bAuth required\b|\binvalid_grant\b/.test(error.message)) {
      throw new Error("SUNEAR_MCP_NOT_AUTHENTICATED");
    }
    throw error;
  }
  return readMcpToolResult(result);
}
