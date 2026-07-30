#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_DESIGNS = 20;
const MAX_SOURCES = 20;
const MAX_EVIDENCE_ITEMS = 100;
const MAX_EVIDENCE_TEXT_BYTES = 4096;
const PRODUCTION_BASE_URL = "https://www.sunearbuild.com";
const REVIEW_URL_KEYS = new Set(["reviewUrl", "reviewURL", "reviewToken", "accessToken"]);

function outputWriter(stream) {
  return (value) => stream.write(`${value}\n`);
}

function getBaseUrl() {
  const configured = process.env.SUNEAR_AGENT_BASE_URL || PRODUCTION_BASE_URL;
  let url;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("SUNEAR_AGENT_BASE_URL must be an absolute URL");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== "/")) {
    throw new Error("SUNEAR_AGENT_BASE_URL must contain only an origin");
  }
  if (local) {
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Local development URL must use HTTP or HTTPS");
    if (process.env.SUNEAR_AGENT_ALLOW_LOCALHOST !== "1") {
      throw new Error("Set SUNEAR_AGENT_ALLOW_LOCALHOST=1 to use a localhost development server");
    }
  } else if (url.protocol !== "https:") {
    throw new Error("SUNEAR_AGENT_BASE_URL must use HTTPS outside local development");
  }
  return url.origin;
}

function getApiKey() {
  const apiKey = process.env.SUNEAR_AGENT_API_KEY;
  if (!apiKey) throw new Error("SUNEAR_AGENT_API_KEY is required");
  return apiKey;
}

function parsePayload(text) {
  if (typeof text !== "string") throw new Error("This command requires a JSON object argument");
  if (Buffer.byteLength(text, "utf8") > MAX_INPUT_BYTES) throw new Error("Input exceeds the 2 MB limit");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Input must be valid JSON");
  }
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("Input must be a JSON object");
  validateBoundedFacts(value);
  return value;
}

function validateBoundedFacts(value) {
  let evidenceItems = 0;
  function visit(node, key = "", insideEvidence = false) {
    if (typeof node === "string") {
      if (/^(?:JVBERi0|data:application\/pdf)/i.test(node) || key.toLowerCase().includes("pdf")) {
        throw new Error("Original PDF or document bytes must not be sent; submit source-backed facts only");
      }
      if (insideEvidence && Buffer.byteLength(node, "utf8") > MAX_EVIDENCE_TEXT_BYTES) {
        throw new Error("Evidence text must be at most 4096 bytes per item");
      }
      return;
    }
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      if (key === "designs" && node.length > MAX_DESIGNS) throw new Error("A request may contain at most 20 designs");
      if (key === "sources" && node.length > MAX_SOURCES) throw new Error("A request may contain at most 20 sources");
      const evidenceArray = insideEvidence || key.toLowerCase().includes("evidence");
      if (evidenceArray) {
        evidenceItems += node.length;
        if (evidenceItems > MAX_EVIDENCE_ITEMS) throw new Error("Evidence is limited to 100 items");
      }
      for (const item of node) visit(item, key, evidenceArray);
      return;
    }
    for (const [childKey, child] of Object.entries(node)) {
      if (/^(?:pdf|pdfBytes|documentBytes|fileBytes|base64|dataUrl)$/i.test(childKey)) {
        throw new Error("Original PDF or document bytes must not be sent; submit source-backed facts only");
      }
      visit(child, childKey, insideEvidence || childKey.toLowerCase().includes("evidence"));
    }
  }
  visit(value);
}

function safeIdentifier(value, label) {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`${label} must contain only letters, numbers, underscores, or hyphens`);
  return encodeURIComponent(value);
}

function stripSecrets(value, apiKey) {
  if (typeof value === "string") {
    return value
      .split(apiKey).join("[REDACTED]")
      .replace(/#access=[^\s"']+/gi, "[REDACTED]")
      .replace(/\brvw_[A-Za-z0-9_-]+\b/g, "[REDACTED]");
  }
  if (Array.isArray(value)) return value.map((child) => stripSecrets(child, apiKey));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !REVIEW_URL_KEYS.has(key))
    .map(([key, child]) => [key, stripSecrets(child, apiKey)]));
}

function requestIdOf(response, body) {
  return response.headers.get("x-request-id") || body?.requestId || "unavailable";
}

function reviewUrlOf(body) {
  if (typeof body?.reviewUrl !== "string") return undefined;
  const url = new URL(body.reviewUrl);
  if (url.protocol !== "https:") throw new Error("Server returned an invalid review URL");
  return url.href;
}

export async function execute(args, io = {}) {
  const fetchImpl = io.fetch || globalThis.fetch;
  const stdout = io.stdout || outputWriter(process.stdout);
  const stderr = io.stderr || outputWriter(process.stderr);
  const [command, ...operands] = args;
  if (!command || operands.some((arg) => /^--(?:api-key|base-url)(?:=|$)/.test(arg))) {
    throw new Error("Usage: capabilities|schema|examples|validate <json>|create <json>|read <projectId>|run <projectId> <runId>|revise <projectId> <json>|rotate <projectId>|open-review <reviewUrl>");
  }
  if (command === "open-review") {
    if (operands.length !== 1) throw new Error("open-review requires the canonical review URL");
    const url = new URL(operands[0]);
    if (url.protocol !== "https:") throw new Error("Review URL must use HTTPS");
    stdout(url.href);
    return { reviewUrl: url.href };
  }

  let path;
  let method = "GET";
  let payload;
  if (["capabilities", "schema", "examples"].includes(command) && operands.length === 0) path = `/api/agent/v1/${command}`;
  else if (command === "validate" && operands.length === 1) { path = "/api/agent/v1/validate"; method = "POST"; payload = parsePayload(operands[0]); }
  else if (command === "create" && operands.length === 1) { path = "/api/agent/v1/projects"; method = "POST"; payload = parsePayload(operands[0]); }
  else if (command === "read" && operands.length === 1) path = `/api/agent/v1/projects/${safeIdentifier(operands[0], "projectId")}`;
  else if (command === "run" && operands.length === 2) path = `/api/agent/v1/projects/${safeIdentifier(operands[0], "projectId")}/runs/${safeIdentifier(operands[1], "runId")}`;
  else if (command === "revise" && operands.length === 2) { path = `/api/agent/v1/projects/${safeIdentifier(operands[0], "projectId")}/revisions`; method = "POST"; payload = parsePayload(operands[1]); }
  else if (command === "rotate" && operands.length === 1) { path = `/api/agent/v1/projects/${safeIdentifier(operands[0], "projectId")}/review-link/rotate`; method = "POST"; payload = {}; }
  else throw new Error(`Unknown command or invalid arguments: ${command}`);

  const apiKey = getApiKey();
  const response = await fetchImpl(`${getBaseUrl()}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
      ...(payload === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  let body;
  try { body = await response.json(); } catch { body = {}; }
  const requestId = requestIdOf(response, body);
  if (!response.ok) {
    const message = `Sunear request failed (${response.status}); requestId=${requestId}`;
    stderr(message);
    throw new Error(message);
  }
  const safeBody = stripSecrets(body, apiKey);
  if (Object.keys(safeBody).length > 0) stdout(JSON.stringify(safeBody));
  if (command === "create" || command === "rotate") {
    const reviewUrl = reviewUrlOf(body);
    if (reviewUrl) stdout(reviewUrl);
  }
  return body;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  execute(process.argv.slice(2)).catch((error) => {
    const apiKey = process.env.SUNEAR_AGENT_API_KEY;
    let message = error instanceof Error ? error.message : "Sunear client failed";
    if (apiKey) message = message.split(apiKey).join("[REDACTED]");
    message = message.replace(/#access=[^\s"']+/gi, "#access=[REDACTED]").replace(/\brvw_[A-Za-z0-9_-]+\b/g, "[REDACTED]");
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
