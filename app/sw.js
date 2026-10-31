/* Seren 7 — service worker: offline app shell.
   Scope: the whole site. Model weights (/models/*) are NEVER cached here —
   after ingest they live in OPFS/IndexedDB, so the SW keeps only code+fonts,
   letting an offline revisit of the page still boot and chat with cached models. */
const CACHE = "seren7-shell-v30";

const FONT_FILES = (() => {
  const out = [];
  for (let i = 1; i <= 17; i++) {
    out.push("./fonts/f" + (i < 10 ? "0" + i : i) + ".woff2");
  }
  return out;
})();

const SHELL = [
  "./",
  "./index.html",
  "./THIRD_PARTY_NOTICES.txt",
  "./css/base.css",
  "./css/app.css",
  "./fonts/fonts.css",
  ...FONT_FILES,
  "./fonts/DM_Mono_OFL.txt",
  "./fonts/Fraunces_OFL.txt",
  "./fonts/Onest_OFL.txt",
  "./js/md.mjs",
  "./js/exact-arithmetic.mjs",
  "./js/runtime-limits.mjs",
  "./js/model-receipts.mjs",
  "./js/main.mjs",
  "./js/orb.mjs",
  "./js/store.mjs",
  "./js/gguf.mjs",
  "./js/prompts.mjs",
  "./js/tools.mjs",
  "./js/tool-runner.mjs",
  "./js/spiral.mjs",
  "./js/compass.mjs",
  "./js/sha256.mjs",
  "./vendor/jssha256/sha256.mjs",
  "./vendor/jssha256/LICENSE.txt",
  "./vendor/fflate/LICENCE",
  "./vendor/wllama/LICENCE",
  "./vendor/wllama/index.js",
  "./vendor/wllama/wllama-single.wasm",
  "./vendor/wllama/wllama-multi.wasm",
  "./workers/ingest-worker.mjs",
  "./workers/runtime-worker.mjs",
  "./workers/tool-worker.mjs",
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map((u) => cache.add(new Request(u, { cache: "reload" }))));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keep = new Set([CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

/* /models/* is the dev mirror + any hosted weight URL: bypass cache entirely. */
function isModelsUrl(url) { return url.pathname.includes("/models/"); }

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; /* cross-origin: default network */
  if (isModelsUrl(url)) return; /* weights go network-direct; never SW-cached */

  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        return fresh;
      } catch (err) {
        const cache = await caches.open(CACHE);
        return (await cache.match("./index.html")) || new Response("offline", { status: 503 });
      }
    })());
    return;
  }

  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) {
        const cache = await caches.open(CACHE);
        e.waitUntil(cache.put(req, fresh.clone()));
      }
      return fresh;
    } catch (err) {
      const hit = await caches.match(req);
      if (hit) return hit;
      throw err;
    }
  })());
});
