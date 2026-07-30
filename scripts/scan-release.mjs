import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FORBIDDEN_PATH = /(?:^|\/)(?:private|engine|topology|geometry|drawings?|quotation|pricing|catalog|database|evolution|internal[-_ ]?(?:prompts?|plans?)|prompts?|plans?|fixtures?|source[-_ ]?maps?|credentials?)(?:[.\/_-]|$)|\.map$/i;
const FORBIDDEN_BYTES = [
  [/(?:\bsubmissionId\b|\bimportPath\b|\bsecret-key\b)/i, "legacy or secret field"],
  [/(?:\binternalPrompt\b|\binternalPlan\b|\binternal[ _-]+(?:prompt|plan)s?\b)/i, "internal prompt or plan"],
  [/\bprivate\b.{0,40}\b(?:engine|topology|geometry|drawing|quotation|pricing|catalog|database)\b.{0,40}\b(?:source|code|implementation|schema|model)\b/i, "private implementation marker"],
  [/(?:sourceMappingURL\s*=|\{\s*"version"\s*:\s*3\s*,\s*"sources"\s*:)/i, "source map"],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key"],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/, "AWS access key"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, "GitHub token"],
  [/\bsk_live_[A-Za-z0-9_-]{16,}\b/, "live secret key"],
  [/\b(?:SUNEAR_AGENT_API_KEY|API_KEY|SECRET_KEY|ACCESS_TOKEN|PASSWORD)\s*=\s*[^\s$<{][^\s]{7,}/i, "credential assignment"],
];

export function normalizeReleasePath(value) {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.split("/").includes("..")) {
    throw new Error(`Invalid release path: ${value}`);
  }
  return normalized;
}

async function listFiles(root, relative = "") {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Release must not contain symlinks: ${child}`);
    if (entry.isDirectory()) files.push(...await listFiles(root, child));
    else if (entry.isFile()) files.push(child);
    else throw new Error(`Unsupported release entry: ${child}`);
  }
  return files;
}

export async function scanReleaseDirectory(root, allowedPaths) {
  const allowed = new Set(allowedPaths.map(normalizeReleasePath));
  const files = await listFiles(root);
  for (const relativePath of files) {
    if (!allowed.has(relativePath)) {
      throw new Error(`File not present in release allowlist: ${relativePath}`);
    }
  }
  for (const relativePath of [...allowed].sort()) {
    if (!files.includes(relativePath)) throw new Error(`Allowlisted release file is missing: ${relativePath}`);
    if (FORBIDDEN_PATH.test(relativePath)) throw new Error(`Forbidden release path: ${relativePath}`);
    const absolutePath = path.join(root, relativePath);
    const stat = await lstat(absolutePath);
    if (!stat.isFile()) throw new Error(`Allowlisted release entry is not a regular file: ${relativePath}`);
    const bytes = await readFile(absolutePath);
    if (bytes.includes(0)) throw new Error(`Binary content is not allowed in release: ${relativePath}`);
    const text = bytes.toString("utf8");
    for (const [pattern, label] of FORBIDDEN_BYTES) {
      if (label === "private implementation marker" && /(?:^|\/)(?:README|SECURITY|PRIVACY)\.md$/i.test(relativePath)) continue;
      if (pattern.test(text)) throw new Error(`Forbidden release content (${label}) in ${relativePath}`);
    }
  }
  return files;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const root = path.resolve(process.argv[2] ?? ".");
  const allowlistPath = path.resolve(process.argv[3] ?? path.join(root, "release-allowlist.txt"));
  const allowed = (await readFile(allowlistPath, "utf8"))
    .split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  await scanReleaseDirectory(root, allowed);
  console.log(`Release scan passed: ${allowed.length} allowlisted files.`);
}
