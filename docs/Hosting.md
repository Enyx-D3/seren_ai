# Static web hosting and local model setup

1. Run `npm ci` and `npm run build:web` from this repository for the model-free release. For **private local use**, `npm run build:web:local-models` additionally checks the four exact CP001 GGUF hashes and copies those user-provided model files into `models/parts/` inside a gitignored `dist/seren7-web-*` bundle. The latter is roughly 300 MiB on disk and includes `MODEL_BUNDLE_NOTICE.txt`. Do not publish a model-included bundle without reviewing the exact Falcon model license and redistribution obligations.
2. Serve that directory through HTTPS, or `http://localhost` for local use. Set `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` for browsers that support threaded WASM. Keep these headers on HTML, worker, and WASM responses. Static hosts may deliver files; there is no inference endpoint.
3. With the localhost development server or a private model-included bundle, the browser fetches all four model files from the **same site** in sequence on first visit. It checks each exact SHA-256 and GGUF metadata in the ingest Worker and stores them locally. Progress is visible in Settings and beside the composer; Send enables after the selected model is verified. Later visits use the browser copies, including offline revisits. If the site does not provide models, Settings offers **Import GGUF files…**. The localhost server also offers **Import local verified files**. The standard `build:web` release remains model-free and requires manual import or a separately provided same-site model directory. Each browser profile has separate storage.
4. Wait for the page's offline shell to install, then revisit once with the network disabled. Model availability also depends on the browser retaining its local storage. Model weights are not service-worker cached; after first-use verification they live in browser storage. Settings offers conversation export/import, conversation deletion, model removal and a confirmed full local-data erase. Erase/removal suppresses automatic re-download on page reload; the user can explicitly select a specialist to retry same-site preparation or import GGUF files manually.

The current verified path is Chromium CPU WebAssembly. WebGPU, physical mobile browsers, and the full CP011 release gate remain unverified. Read [CHECKPOINT_LOG.md](../CHECKPOINT_LOG.md) before claiming support on a device. The bundle has been smoke-tested at `/seren/` on localhost to check nested-path worker and service-worker URLs.

## Run the latest static bundle locally

```sh
npm ci
npm run build:web:local-models
PORT=8800 npm run serve:bundle -- dist/seren7-web-<new build suffix>
```

Replace the placeholder with the directory printed by the build command, then open `http://127.0.0.1:8800/`. This private bundle includes the four previously verified local GGUF files. For the source app instead, run `npm run serve` and open `http://127.0.0.1:8799/`; if port 8799 is occupied, use the server already running there or choose another `PORT`.

## Vercel preview

Vercel receives a static bundle. Inference and browser data remain local. The build writes `vercel.json` into the bundle with COOP/COEP headers needed for threaded WASM and a no-cache service-worker script.

```sh
npm ci
npm run build:web
vercel deploy --cwd dist/seren7-web-<new build suffix>
```

Replace the placeholder with the newly printed directory. When prompted, link or create the Vercel project and choose **Other** if asked for a framework. The project root is the bundle directory containing `index.html` and `vercel.json`; its output directory is `.` if Vercel asks. The resulting preview has no model weights: import each GGUF in Settings in that browser profile before chatting. Do not use `--prebuilt` with this bundle; that CLI option expects Vercel's `.vercel/output` format.

The four-model bundle is about 304 MB. [Vercel's source upload limit](https://vercel.com/docs/limits) is 100 MB on Hobby and 1 GB on Pro, so it exceeds the Hobby CLI limit. Publishing the GGUFs also requires a separate review of the exact [Falcon license terms](https://falconllm.tii.ae/falcon-terms-and-conditions.html). The model-free preview is the deployable path while that review and the remaining acceptance gates are open. See [Vercel CLI deployment documentation](https://vercel.com/docs/cli/deploy) for account and project linking.
