# Seren 7 — Browser-Only Local Four-Falcon AI (Web V1)

Agent-neutral blueprint, 2026-10-26. Read `AGENTS.md`, followed by the six specifications in `docs/`.

Mission: build a **web application accessed in a browser, like ChatGPT**, preserving the uploaded `Seren 7(1).html` interface and implementing genuine fully local inference with four Falcon-H1-Tiny 90M specialists: Instruct, Reasoning (R), Coder, Tool-Calling. No 135M, Qwen, cloud inference, or fake production agents. **Current scope excludes Android APK, iOS application, desktop application, native wrapper, Electron/Tauri package, and mandatory PWA installation.** It may be served as a static site over HTTPS or localhost; the AI still executes in the visitor's browser, not on the hosting server. All CP001–CP011 checkpoints must be completed for the **web-only** release. This handoff is a specification, not evidence of a completed runtime. An unchanged copy of the UI is included at `reference/Seren_7_original.html` (SHA-256 `30361a2dbd0db381771b9c4e5f8db922e45db6c417f1e4b5493d65c1d1b96327`).

All four pairs of ZIP parts and manifests were located in Google Drive. Binary reconstruction, tokenizers, hashes, inference, and browser/WebGPU/B2CCP compatibility still need verification. Main archive folder: https://drive.google.com/drive/folders/1IZhJVobJhXeeotVLGW3g54Kz0dxYqajo . Instruct duplicate location: https://drive.google.com/drive/folders/141t5B_EMfRgl_16oeCpTN1-YV49m9_rS .

`CLAUDE.md` is a thin compatibility entry; other agents (Nemotron, Muse, Cursor, Codex) should use `AGENTS.md` without proprietary features. See `docs/Plan.md` for checkpoint gates and evidence rules.

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
