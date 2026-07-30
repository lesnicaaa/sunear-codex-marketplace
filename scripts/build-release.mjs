import { createHash } from "node:crypto";
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { normalizeReleasePath, scanReleaseDirectory } from "./scan-release.mjs";

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function writeOctal(buffer, offset, length, value) {
  const rendered = value.toString(8).padStart(length - 1, "0") + "\0";
  buffer.write(rendered, offset, length, "ascii");
}

function tarHeader(name, size, mode) {
  if (Buffer.byteLength(name) > 100) throw new Error(`Release path exceeds tar limit: ${name}`);
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  writeOctal(header, 100, 8, mode);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header.write("0", 156, 1, "ascii");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  header.write("root", 265, 32, "ascii");
  header.write("root", 297, 32, "ascii");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  return header;
}

async function createTarGz(root, files) {
  const chunks = [];
  for (const relativePath of files) {
    const bytes = await readFile(path.join(root, relativePath));
    const sourceStat = await stat(path.join(root, relativePath));
    const mode = sourceStat.mode & 0o111 ? 0o755 : 0o644;
    chunks.push(tarHeader(relativePath, bytes.length, mode), bytes);
    const padding = (512 - (bytes.length % 512)) % 512;
    if (padding) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks), { level: 9, mtime: 0 });
}

async function readAllowlist(root) {
  const text = await readFile(path.join(root, "release-allowlist.txt"), "utf8");
  const files = text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map(normalizeReleasePath);
  if (new Set(files).size !== files.length) throw new Error("Release allowlist contains duplicate paths");
  return files.sort();
}

export async function buildRelease({ root = scriptRoot, output = path.join(root, "release") } = {}) {
  const files = await readAllowlist(root);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "sunear-release-"));
  try {
    for (const relativePath of files) {
      const source = path.join(root, relativePath);
      const sourceStat = await lstat(source);
      if (sourceStat.isSymbolicLink()) throw new Error(`Allowlisted source must not be a symlink: ${relativePath}`);
      if (!sourceStat.isFile()) throw new Error(`Allowlisted source is not a regular file: ${relativePath}`);
      const destination = path.join(temporaryRoot, relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(source, destination);
      await chmod(destination, sourceStat.mode & 0o111 ? 0o755 : 0o644);
    }
    await scanReleaseDirectory(temporaryRoot, files);

    const inventoryLines = [];
    for (const relativePath of files) {
      const digest = createHash("sha256").update(await readFile(path.join(temporaryRoot, relativePath))).digest("hex");
      inventoryLines.push(`${digest}  ${relativePath}`);
    }
    const archive = await createTarGz(temporaryRoot, files);
    await mkdir(output, { recursive: true });
    const inventoryPath = path.join(output, "release-inventory.txt");
    const archivePath = path.join(output, "sunear-codex-marketplace.tar.gz");
    await writeFile(inventoryPath, `${inventoryLines.join("\n")}\n`);
    await writeFile(archivePath, archive);
    return { archivePath, inventoryPath, inventory: files };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const result = await buildRelease();
  console.log(`Release archive: ${result.archivePath}`);
  console.log(`Release inventory: ${result.inventoryPath}`);
  console.log(`Release files: ${result.inventory.length}`);
}
