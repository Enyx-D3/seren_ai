# CP026-RUNTIME-01 — Pinned Falcon + browser runtime recovery (PARTIAL)

Date: 2026-11-05. Isolated implementation branch `agent/cp026-runtime` from integration source `6eb39f8`. This is a reproducible **runtime-asset and model-metadata** checkpoint, not a successful Falcon inference checkpoint. No push/deployment.

## Model identity and bytes

- Historical user-approved Drive model source ID: `14eWEg9rni_4cMX8QMnZBlpWV6D5QPW66`, titled `Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf`, MIME `application/octet-stream`. Found through repository's `workspace/tools/cp001_acquire.zsh` and checked using the connected Drive metadata/fetch interfaces.
- Recovered original file into **gitignored local-only** `workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf`. Exact size: **58,600,064 bytes**. Actual `sha256sum`: `e7d655345a876ecb073ea86f5ce68e412b99090c34a6bde8a2982bc48afb2612`, matching the pre-existing historical expected hash in `CHECKPOINT_LOG.md`.
- `node tools/module_selftest.mjs` **PASS**: GGUF type Q4_K_M, Falcon-H1, 24 blocks, context, tokenizer/chat markers and pinned first-megabyte integrity. This verifies input identity and parser metadata, **not** model inference.
- GGUF source bytes are not committed; normal cloning still requires user-authorized local provisioning. Do not publish the included-weights private bundle without license review.

## Reproducible environment

Environment: isolated Linux workspace; Node v24.22.1, system Chromium at `/usr/bin/chromium`. Original npm default cache pointed at a missing/unwritable `/home/agent/.npm` directory and first `npm ci` failed. Recovery used a workspace-local npm cache:

```bash
npm ci --cache /workspace/scratch/c4f7ff7789b9/seren_cp026_runtime/workspace/npm-cache --fetch-retries=0 --fetch-timeout=15000
npm run prepare:runtime
npm test
npm run build:web
npm run build:web:local-models
```

Observed:

- `npm ci` **PASS**, six packages; no package-lock change.
- Wllama 2.4.0 source and WASM pins **PASS** against unchanged `tools/prepare_runtime.mjs`: JS `08e0fad5c9efdf4414ca2e27d0d8d5bdfa54d91a8054b40d9d9c90c9ce870b9d`; single WASM `aced0c759f668e17d618114b8688bf55b32289dbdbd08b6e3254b0bc75838ad5`; multi WASM `f69f292f06d9c5c63ac447aac768c3d508fe7a56f0a7926bd12cc33370bc627d`.
- Full `npm test` **PASS**, including module/model metadata, all existing B2 Node regression suites, and CP025 model-free confirmation.
- `npm run build:web` **PASS**, model-free static bundle with 73 assets.
- `npm run build:web:local-models` **PASS**, private 75-asset bundle containing the single verified local Instruct model. Dist artifacts and model bytes remain gitignored.

## Browser inference gate (BLOCKED)

The `playwright` npm package installed, but the managed Chromium executable is absent, so the stock `node tools/browser_runtime_smoke.mjs` fails before browser launch. A developer-only `SEREN_CHROMIUM_EXECUTABLE` path override was added without changing the default. With `PORT=8799 npm run serve` in another process and `SEREN_CHROMIUM_EXECUTABLE=/usr/bin/chromium node tools/browser_runtime_smoke.mjs`, system Chromium launches then aborts with `Check failed: . socket() failed: Operation not permitted (1)`. This is a sandbox IPC permission failure; it is **not** evidence of model success or model failure.

Therefore no local browser generated tokens in this environment, no live Falcon-led repair was evaluated, and the real model-included online/offline/smoke/latency/RAM gate is still **BLOCKED**. Do not infer app readiness from successful builds.

## Rollback and next dependency

Only tracked code alteration: optional executable override inside `tools/browser_runtime_smoke.mjs`; remove or revert it to restore exact prior default. Next step is to execute that existing real-inference smoke and CP026 fresh A/B tests in an authorized browser environment with Chromium IPC available, using the recovered, hashed GGUF and pinned Wllama assets. Keep failure evidence and verify model-only vs B2 with equal prompts/weights.
