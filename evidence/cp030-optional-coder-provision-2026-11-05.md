# CP030 — One optional 90M Falcon Coder, browser FIM research lane

**Status: PARTIAL / EXPERIMENTAL_ONLY.** V1 remains one Instruct model. Coder bytes and GGUF identity verified; opt-in software policy and model-free regression tests pass. Real Coder browser inference **has not been observed**; broad reasoning improvement, physical phone performance and deployment are unverified. No push or deployment made.

**2026-11-05 follow-up:** Real Coder Node CPU/WASM Worker inference subsequently **did produce tokens** in a restricted local test; see `evidence/cp030-coder-node-wasm-actual-2026-11-05.md`. This does not change the earlier browser blocker or V1 acceptance status.

## Authorized model identity and provenance

- Approved source: owner-authorized historical Google Drive model archive, file ID `1mKBcqix1JilIk4L88-1gEVbtBq5QCU7W`, folder ID `1IZhJVobJhXeeotVLGW3g54Kz0dxYqajo`.
- Source filename `Falcon-H1-Tiny-90M-Coder-Q4_K_M.gguf`. Local research alias `Falcon-H1-Tiny-Coder-Q4_K_M.gguf` (the model bytes are unchanged).
- Verified physical file length: **68,034,464 bytes**.
- Verified full SHA-256: `1f769dd9cc450a4a080ebd623e1bf7c15d0a3ccdfb40e339e6640c53228cd019`.
- This checksum matches existing `evidence/webgpu-v3-feasibility-2026-10-27.json` and is pinned in the optional runtime receipt roster.
- GGUF parser: `falcon-h1`, `general.file_type=15` (Q4_K_M), 24 blocks, embedding 512, BOS 17, EOS 11; **no chat template**. Official FIM token IDs: `<|prefix|>` 231, `<|suffix|>` 232, `<|middle|>` 230.
- Upstream vendor: [Technology Innovation Institute official Falcon-H1-Tiny-Coder GGUF card](https://huggingface.co/tiiuae/Falcon-H1-Tiny-Coder-90M-GGUF). The documented use case is Python fill-in-the-middle, **not** unstructured conversation or generic reasoning.
- GGUF binary is deliberately gitignored and **not committed**. Operator must copy the exact approved file into `workspace/parts/Falcon-H1-Tiny-Coder-Q4_K_M.gguf`; the Worker refuses wrong SHA-256.

## Exact opt-in boundary

1. `app/js/compass.mjs`, `app/js/main.mjs` and `app/js/prompts.mjs` are **unchanged**. V1 UI still loads Instruct only, and Instruct chat builder refuses the Coder ID.
2. `app/js/model-receipts.mjs` adds a pinned Coder hash and default-deny command validation without a new offline Worker import dependency. `app/workers/runtime-worker.mjs` requires literal `experimentalCoder:true` on each Coder **load and completion**, and accepts only bounded `taskKind:'python_fim'`, official ordered markers, maximum 256 generated tokens and expected stop IDs (11,15,16). A checksum match alone never authorizes a Coder request.
3. `app/js/b2-coder-experiment.mjs` provides a research-only Python FIM prompt builder, metadata proof and a decision **proposal**, not an automatic model switch. A provisional Coder completion is untrusted code (`mayExecuteCode:false`) requiring an independent code checker before any use. No native execution is enabled.
4. `tools/serve.mjs` serves this optional model only if a developer starts it with `B2_EXPERIMENTAL_CODER=1`; otherwise the endpoint remains denied. The default service worker/build/model catalog are untouched.
5. The Worker has one resident `wllama` instance, so loading Coder exits the prior model before allocating its replacement. This is **not** proof of peak memory safety; measure it in a successful browser trial.

## Executed checks, environment and limits

| Check | Actual result |
|---|---|
| `node tools/b2_cp030_coder_selftest.mjs --require-coder` | **PASS**: verified real 68 MB file bytes and SHA, GGUF metadata/FIM token IDs, tamper rejection, explicit opt-in, Python FIM policy and default V1 route |
| `npm test` | **PASS**: all existing module/B2/CP025 suites; independent CP025 sealed confirmation remains 27/27 supported, 13/13 scoped abstentions; this is **not** Coder reasoning evidence |
| `node --check tools/browser_b2_cp030_coder_smoke.mjs`, `node --check app/workers/runtime-worker.mjs`, `git diff --check` | **PASS** syntax and whitespace checks |
| `SEREN_CHROMIUM_EXECUTABLE=/usr/bin/chromium node tools/browser_b2_cp030_coder_smoke.mjs` | **BLOCKED**, Chromium process aborts before navigation: `process_singleton_posix.cc socket() failed: Operation not permitted (1)` in restricted Linux sandbox. No model load or Coder tokens observed. |
| Actual browser FIM output, code quality, V1→Coder→V1 switch, RAM/latency, phone | **NOT VERIFIED** |

Browser reproduction on unrestricted developer machine:

```sh
npm ci
node tools/b2_cp030_coder_selftest.mjs --require-coder
npm run test:cp030:coder:real
```

The real-browser harness starts a separate local dev server, fetches actual pinned GGUF bytes, checks that unapproved load and completion fail closed, tries one bounded official FIM completion with actual Worker token events, and checks clean unload. It does not fabricate token output. If the browser or WASM decoder rejects this model, record the failure and retain V1 as default.

## No-promotion conditions and rollback

Do **not** enable Coder in the normal UI or treat it as an improvement until genuine local completion, verified Python FIM output, paired held-out code tasks, independent tests, one-model peak RAM, latency, no external traffic and first-run/offline behavior pass on intended hardware. This is model routing research, not the full MRS/GraphOS/TinyLinux/Cortex scope.

Rollback: revert this checkpoint's optional modules, receipt roster addition, Worker experimental guards, dev-server option, test scripts and evidence. The unchanged V1 routing and prompt modules continue to use the prior single-Instruct path.
