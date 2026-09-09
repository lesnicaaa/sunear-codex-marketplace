import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const TYPES = new Map([[".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".webp", "image/webp"]]);
const KEY = /^[a-f0-9]{64}$/;
function signatureMatches(bytes, type) {
  if (type === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  return type === "image/webp" && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
}

export class SunearLocalAssetStore {
  constructor(directory, limits = {}) {
    this.directory = resolve(directory);
    this.maxAssetBytes = limits.maxAssetBytes ?? 16 * 1024 * 1024;
    this.maxCacheBytes = limits.maxCacheBytes ?? 512 * 1024 * 1024;
  }
  async put(filePath) {
    const type = TYPES.get(extname(filePath).toLowerCase());
    if (!type) throw new Error("SUNEAR_LOCAL_ASSET_TYPE_UNSUPPORTED");
    const bytes = await readFile(resolve(filePath));
    if (!bytes.length || bytes.length > this.maxAssetBytes) throw new Error("SUNEAR_LOCAL_ASSET_SIZE_INVALID");
    if (!signatureMatches(bytes, type)) throw new Error("SUNEAR_LOCAL_ASSET_SIGNATURE_INVALID");
    const key = createHash("sha256").update(bytes).digest("hex");
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const suffix = type === "image/png" ? ".png" : type === "image/jpeg" ? ".jpg" : ".webp";
    const destination = resolve(this.directory, `${key}${suffix}`);
    try { await stat(destination); } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
      await rename(temporary, destination);
    }
    await this.prune(destination);
    return { key, contentType: type, byteSize: bytes.length };
  }
  async entries() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const entries = [];
    for (const name of await readdir(this.directory)) {
      const match = name.match(/^([a-f0-9]{64})\.(png|jpg|webp)$/); if (!match) continue;
      const info = await stat(resolve(this.directory, name));
      entries.push({ key: match[1], name, byteSize: info.size, modifiedAt: info.mtimeMs });
    }
    return entries.sort((a,b) => b.modifiedAt - a.modifiedAt || a.name.localeCompare(b.name));
  }
  async get(key) {
    if (!KEY.test(key)) return null;
    const entry = (await this.entries()).find((item) => item.key === key); if (!entry) return null;
    return { bytes: await readFile(resolve(this.directory, entry.name)), contentType: TYPES.get(extname(entry.name)), byteSize: entry.byteSize };
  }
  async prune(protectedPath) {
    const entries = await this.entries(); let total = entries.reduce((sum,item) => sum + item.byteSize, 0);
    for (const entry of [...entries].reverse()) {
      const path = resolve(this.directory, entry.name);
      if (total <= this.maxCacheBytes || path === protectedPath) continue;
      await unlink(path).catch((error) => { if (error?.code !== "ENOENT") throw error; }); total -= entry.byteSize;
    }
  }
}

export async function startSunearLocalAssetServer({ directory, origin }) {
  const allowedOrigin = new URL(origin).origin;
  const token = randomBytes(32).toString("base64url");
  const store = new SunearLocalAssetStore(directory);
  const authorized = (url) => {
    const supplied = Buffer.from(url.searchParams.get("token") ?? "");
    const expected = Buffer.from(token);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/pair" && request.method === "GET") {
        const target = new URL(url.searchParams.get("target") ?? "");
        if (target.origin !== allowedOrigin || target.pathname !== "/api/agent-device-pair") throw new Error("SUNEAR_LOCAL_PAIR_TARGET_INVALID");
        const address = server.address();
        const bridge = Buffer.from(JSON.stringify({ port: address.port, token })).toString("base64url");
        target.hash = `sunear-local=${bridge}`;
        response.writeHead(302, { location: target.toString(), "cache-control": "no-store" }).end(); return;
      }
      if (request.headers.origin !== allowedOrigin || !authorized(url)) { response.writeHead(403).end(); return; }
      response.setHeader("access-control-allow-origin", allowedOrigin);
      response.setHeader("access-control-allow-private-network", "true");
      response.setHeader("vary", "Origin"); response.setHeader("cache-control", "no-store");
      if (request.method === "OPTIONS") { response.writeHead(204, { "access-control-allow-methods": "GET" }).end(); return; }
      if (request.method !== "GET") { response.writeHead(405).end(); return; }
      if (url.pathname === "/manifest") {
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ assets: await store.entries() })); return;
      }
      const match = url.pathname.match(/^\/assets\/([a-f0-9]{64})$/);
      const asset = match ? await store.get(match[1]) : null;
      if (!asset) { response.writeHead(404).end(); return; }
      response.writeHead(200, { "content-type": asset.contentType, "content-length": asset.byteSize }).end(asset.bytes);
    } catch { response.writeHead(400).end(); }
  });
  await new Promise((resolvePromise, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolvePromise); });
  const address = server.address();
  return { port: address.port, token, pairUrl(target) { return `http://127.0.0.1:${address.port}/pair?target=${encodeURIComponent(target)}`; }, close() { return new Promise((resolvePromise) => server.close(resolvePromise)); } };
}
