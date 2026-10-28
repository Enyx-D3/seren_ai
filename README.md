# Seren 7 — Browser-Only Local Four-Falcon AI (Web V1)

Agent-neutral blueprint, 2026-10-26. Read `AGENTS.md`, followed by the six specifications in `docs/`.

Mission: build a **web application accessed in a browser, like ChatGPT**, preserving the uploaded `Seren 7(1).html` interface and implementing genuine fully local inference with four Falcon-H1-Tiny 90M specialists: Instruct, Reasoning (R), Coder, Tool-Calling. No 135M, Qwen, cloud inference, or fake production agents. **Current scope excludes Android APK, iOS application, desktop application, native wrapper, Electron/Tauri package, and mandatory PWA installation.** It may be served as a static site over HTTPS or localhost; the AI still executes in the visitor's browser, not on the hosting server. All CP001–CP011 checkpoints must be completed for the **web-only** release. The working browser implementation and its remaining gates are recorded in `CHECKPOINT_LOG.md`. An unchanged copy of the UI is included at `reference/Seren_7_original.html` (SHA-256 `30361a2dbd0db381771b9c4e5f8db922e45db6c417f1e4b5493d65c1d1b96327`).

All four pairs of ZIP parts and manifests were located in Google Drive. CP001 recorded byte-level recovery for the truncated Instruct and Coder ZIPs and verified the four distributed GGUF hashes. A Chromium CPU WebAssembly worker has since loaded and generated tokens from all four GGUFs. The web application and checkpoints remain under test; `CHECKPOINT_LOG.md` is the current evidence ledger. Main archive folder: https://drive.google.com/drive/folders/1IZhJVobJhXeeotVLGW3g54Kz0dxYqajo . Instruct duplicate location: https://drive.google.com/drive/folders/141t5B_EMfRgl_16oeCpTN1-YV49m9_rS .

`CLAUDE.md` is a thin compatibility entry; other agents (Nemotron, Muse, Cursor, Codex) should use `AGENTS.md` without proprietary features. See `docs/Plan.md` for checkpoint gates and evidence rules.

## Local development

Run `npm run serve`, then open `http://127.0.0.1:8799/`. In Settings, click **Import local verified files** to copy the four already acquired and hash-verified GGUFs from `workspace/parts/` into that browser profile. You can also import the approved Q4_K_M files manually. Each browser profile stores its own model copies. If port 8799 is already in use, open the existing server URL rather than starting a second copy. The static server only serves assets; inference and conversations stay in the browser. `npm test` runs the logic checks. With the locally acquired model files present, `npm run test:browser` runs browser smoke tests. The `workspace/` model bytes are deliberately gitignored, so a fresh checkout needs user-approved model provisioning.

For a static release bundle, run `npm ci` then `npm run build:web`. This reconstructs gitignored WASM from the pinned npm package, checks asset hashes, and writes a model-free bundle under `dist/`. See [static hosting instructions](docs/Hosting.md).

Browser storage uses the existing `seren7` IndexedDB name, now at version 3, under [approved ADR-001](docs/decisions/ADR-001-browser-storage-schema.md). The migration preserves existing V2 conversations and OPFS model references; broader schema acceptance remains in progress.

**Current status:** working Chromium CPU/WASM chat path and offline revisit demonstrated. CP007 passes with an evidence-backed conservative Instruct fallback and explicit manual specialist choice; no specialist route has passed the Auto promotion gate. CP008's bounded local tools pass exact, denial, offline, receipt and timeout recovery tests. An isolated WebGPU feasibility test emitted tokens from all four exact GGUFs on this Mac, but WebGPU is not integrated into the app. B2CCP, mobile hardware, B2 Spiral, magnetic self-calibration, and full release acceptance are not yet verified. Read `CHECKPOINT_LOG.md` before claiming any checkpoint passed.

## Handoff tree

```text
README.md
AGENTS.md
CLAUDE.md
docs/PRD.md
docs/AppFlow.md
docs/UI_Spec.md
docs/TRD.md
docs/Schema.md
docs/Plan.md
reference/Seren_7_original.html
```
