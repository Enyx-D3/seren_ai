# Static web hosting and local model setup

1. Run `npm ci` and `npm run build:web` from this repository for the model-free release. For **private local use**, `npm run build:web:local-models` checks the single active Instruct GGUF hash and copies that file into `models/parts/` inside a gitignored `dist/seren7-web-*` bundle. The GGUF is about 56 MiB and the bundle includes `MODEL_BUNDLE_NOTICE.txt`. Do not publish a model-included bundle without reviewing the Falcon model license and redistribution obligations.
2. Serve that directory through HTTPS, or `http://localhost` for local use. Set `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` for browsers that support threaded WASM. Keep these headers on HTML, worker, and WASM responses. Static hosts may deliver files; there is no inference endpoint.
3. With the localhost development server or a private model-included bundle, the browser fetches the one Instruct model from the **same site** on first visit. It checks SHA-256 and GGUF metadata in the ingest Worker and stores the model locally. Progress is visible in Settings and beside the composer; Send enables after verification. Later visits use the browser copy, including offline revisits. If the site does not provide a model, Settings offers **Import GGUF files…**. The localhost server also offers **Import local verified files**. The standard `build:web` release remains model-free and requires manual import or a separately provided same-site model directory. Each browser profile has separate storage.
4. Wait for the page's offline shell to install, then revisit once with the network disabled. Model availability also depends on the browser retaining its local storage. Model weights are not service-worker cached; after first-use verification they live in browser storage. Settings offers conversation export/import, conversation deletion, model removal and a confirmed full local-data erase. Erase/removal suppresses automatic re-download on page reload; the user can explicitly retry Instruct preparation or import the GGUF manually.

The current verified path is Chromium CPU WebAssembly. WebGPU, physical mobile browsers, and the full CP011 release gate remain unverified. Read [CHECKPOINT_LOG.md](../CHECKPOINT_LOG.md) before claiming support on a device. The bundle has been smoke-tested at `/seren/` on localhost to check nested-path worker and service-worker URLs.

## Run the latest static bundle locally

```sh
npm ci
npm run build:web:local-models
PORT=8800 npm run serve:bundle -- dist/seren7-web-<new build suffix>
```

Replace the placeholder with the directory printed by the build command, then open `http://127.0.0.1:8800/`. This private bundle includes the one verified local Instruct GGUF. For the source app instead, run `npm run serve` and open `http://127.0.0.1:8799/`; if port 8799 is occupied, use the server already running there or choose another `PORT`.

## Vercel preview

Vercel receives a static bundle. Inference and browser data remain local. The build writes `vercel.json` into the bundle with COOP/COEP headers needed for threaded WASM and a no-cache service-worker script.

```sh
npm ci
npm run build:web
cd dist/seren7-web-<new build suffix>
vercel login  # if needed
vercel link   # select the intended existing project or create one
vercel project inspect --non-interactive
vercel deploy
```

Replace the placeholder with the newly printed directory. Confirm that `project inspect` names the intended owner and project. Choose **Other** if asked for a framework; the project root is the bundle directory containing `index.html` and `vercel.json`, and its output directory is `.` if asked. The resulting preview has no model weights: import the Instruct GGUF in Settings in that browser profile before chatting. Use `vercel deploy --prod` from the same linked directory only when you intend to replace production. Do not use `--prebuilt` with this bundle; that CLI option expects Vercel's `.vercel/output` format.

The one-model bundle may fit [Vercel's source upload limit](https://vercel.com/docs/limits) of 100 MB on Hobby and 1 GB on Pro, but check its actual size. Publishing the GGUF also requires a review of the exact [Falcon license terms](https://falconllm.tii.ae/falcon-terms-and-conditions.html). The model-free preview is the immediate deployment path while that review and the remaining acceptance gates are open. See [Vercel CLI deployment documentation](https://vercel.com/docs/cli/deploy) for account and project linking.
