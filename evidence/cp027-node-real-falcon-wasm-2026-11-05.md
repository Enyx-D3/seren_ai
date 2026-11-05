# CP027 isolated Node real Falcon-WASM diagnostic — 2026-11-05

Status: **PASS for actual pinned Falcon text generation in Node CPU/WASM**. **NOT** a browser, mobile, offline, B2 A/B, TinyLinux, dual-model, or reasoning-quality PASS.

## Reproduce

In a local checkout with `npm ci`, `npm run prepare:runtime`, and approved gitignored model bytes at `workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf`:

```sh
timeout 35s node tools/cp027_node_wllama_smoke.mjs
```

The probe uses only the approved local Falcon-H1-Tiny-90M-Instruct-Q4_K_M GGUF (58,600,064 bytes, SHA-256 `e7d655345a876ecb073ea86f5ce68e412b99090c34a6bde8a2982bc48afb2612`) and the pinned single-thread Wllama WASM (`aced0c759f668e17d618114b8688bf55b32289dbdbd08b6e3254b0bc75838ad5`) with pinned vendor ESM (`08e0fad5c9efdf4414ca2e27d0d8d5bdfa54d91a8054b40d9d9c90c9ce870b9d`). There is no cloud model, model substitution, native host command tool, or inference server.

## Measured runs (this sandbox)

| Run | Load ms | First token ms | Generation wall ms | Generated token count | Generated text | Process outcome |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Initial prototype | 1,397 | 8,346 | 8,468 | 2 | `Hello.` | decoder emitted actual text; script left an uncleared watchdog and was later terminated; **not accepted as clean exit** |
| Fixed single-file probe | 788 | 6,554 | 6,653 | 2 | `Hello.` | exit 0 |
| Reusable module probe | 635 | 6,417 | 6,526 | 2 | `Hello.` | exit 0 |
| Final bounded module probe | 427 | 7,547 | 7,662 | 2 | `Hello.` | exit 0 |
| Dependency-isolated rerun (no `node_modules` symlink) | 544 | 6,652 | 6,751 | 2 | `Hello.` | exit 0 |

The first-token time is measured from the start of model completion, and includes prompt processing. These four tiny examples are not a stable TPS benchmark, A/B comparison or evidence of semantic reasoning gain.

## Mechanism and scope

`tools/b2_node_wllama_runtime.mjs` exports `createPinnedFalconNodeSession({nCtx,seed,maxLoadMs})`. It accepts only the pinned local model and runtime hashes, loads one Falcon through the existing Wllama CPU WASM and adapts Wllama's browser Blob Worker message contract to **Node Worker threads**. The Emscripten Worker fetch path reads the pinned WASM via local data URI; this avoids the unsupported Node-filesystem treatment of a data URL and does **not** circumvent the operating-system Chromium socket restriction.

The returned session provides `generate({turns,maxTokens,temperature,maxGenerateMs})`, with `maxTokens` 1–128, best-effort abort timeout and no concurrent generation, plus `close()`. Use an outer process watchdog for a hard deadline. The transcript model receives the application's actual `buildChatPrompt` formatter. The smoke passes a single user message asking for `hello` and asserts nonempty output and at least one generated token.

**Remaining:** Real Chromium/UI/offline evidence remains blocked by `socket() failed: Operation not permitted (1)` in this sandbox. For CP026 comparison, a separate offline Node A/B harness can now call the same real Falcon session to obtain useful but explicitly **Node-only** paired results; browser performance must be independently measured on a browser-capable device.
