// tools/serve.mjs — local static dev server for the Seren 7 web app.
// Serves app/ plus exactly four approved local GGUF files for browser tests.
// COOP/COEP headers enable wllama multi-thread WASM where supported.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(process.argv[2] || fileURLToPath(new URL("../app/", import.meta.url)));
const MODEL_ROOT = process.argv[2] ? join(ROOT, "models", "parts") : fileURLToPath(new URL("../workspace/parts/", import.meta.url));
const MODEL_NAMES = new Set([
  "Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf",
  "Falcon-H1R-Tiny-90M-Q4_K_M.gguf",
  "Falcon-H1-Tiny-Coder-Q4_K_M.gguf",
  "Falcon-H1-Tiny-Tool-Calling-Q4_K_M.gguf",
]);
const PORT = Number(process.env.PORT || 8799);
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".wasm": "application/wasm", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png",
  ".gguf": "application/octet-stream", ".safetensors": "application/octet-stream", ".txt": "text/plain; charset=utf-8", ".jinja": "text/plain; charset=utf-8",
};

const server = createServer(async (req, res) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
  try {
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405).end(); return; }
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    if (url.startsWith("/models/")) {
      const name = url.slice("/models/parts/".length);
      if (!url.startsWith("/models/parts/") || !MODEL_NAMES.has(name)) throw new Error("model path not allowed");
      const p = join(MODEL_ROOT, name);
      const s = await stat(p); res.writeHead(200, { "Content-Length": s.size, "Content-Type": "application/octet-stream", "Accept-Ranges": "none" });
      if (req.method === "HEAD") res.end(); else res.end(await readFile(p));
      return;
    }
    let p = resolve(ROOT, '.' + (url === "/" ? "/index.html" : url));
    if (p !== ROOT && !p.startsWith(ROOT + sep)) throw new Error("forbidden");
    let s = await stat(p);
    if (s.isDirectory()) { p = join(p, "index.html"); s = await stat(p); }
    res.writeHead(200, { "Content-Type": MIME[extname(p)] || "application/octet-stream", "Content-Length": s.size });
    if (req.method === "HEAD") res.end(); else res.end(await readFile(p));
  } catch (e) {
    res.writeHead(404, { "Content-Type": "text/plain" }); res.end("404: " + e.message);
  }
});
server.listen(PORT, "127.0.0.1", () => console.log(`Seren dev server: http://127.0.0.1:${PORT}`));
