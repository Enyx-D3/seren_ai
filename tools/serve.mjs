// tools/serve.mjs — local static dev server for the Seren 7 web app.
// Serves app/ plus optional /models/*.gguf from local disk for browser tests.
// COOP/COEP headers enable wllama multi-thread WASM where supported.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = new URL("../app", import.meta.url).pathname;
const PORT = Number(process.env.PORT || 8799);
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".wasm": "application/wasm", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png",
  ".gguf": "application/octet-stream", ".safetensors": "application/octet-stream", ".txt": "text/plain; charset=utf-8", ".jinja": "text/plain; charset=utf-8",
};

const server = createServer(async (req, res) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
  let url = decodeURIComponent((req.url || "/").split("?")[0]);
  try {
    if (url.startsWith("/models/")) { // test-only local GGUF/safetensors mirror (workspace, gitignored)
      const p = normalize(join(ROOT, "..", "workspace", url.slice("/models/".length).replace(/\.\.+/g, ".")));
      if (!p.includes("/workspace/")) throw new Error("bad path");
      const s = await stat(p); res.writeHead(200, { "Content-Length": s.size, "Content-Type": MIME[extname(p)] || "application/octet-stream", "Accept-Ranges": "none" });
      readFile(p).then((b) => res.end(b));
      return;
    }
    let p = normalize(join(ROOT, url === "/" ? "index.html" : url));
    if (!p.startsWith(ROOT)) throw new Error("forbidden");
    let s = await stat(p);
    if (s.isDirectory()) { p = join(p, "index.html"); s = await stat(p); }
    const body = await readFile(p);
    res.writeHead(200, { "Content-Type": MIME[extname(p)] || "application/octet-stream", "Content-Length": body.length });
    res.end(body);
  } catch (e) {
    res.writeHead(404, { "Content-Type": "text/plain" }); res.end("404: " + e.message);
  }
});
server.listen(PORT, "127.0.0.1", () => console.log(`Seren dev server: http://127.0.0.1:${PORT}`));
