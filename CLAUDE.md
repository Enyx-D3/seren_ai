# Seren 7 agent bootstrap

Read `AGENTS.md`, `README.md`, and all six files in `docs/` before changing code. These specifications are also for Nemotron, Muse, Codex, Cursor, and other agents; do not invent Claude-only behavior.

The product is a **browser-only, fully local-inference web application** like ChatGPT, using **only** four Falcon-H1-Tiny 90M specialist variants: Instruct, R, Coder, Tool-Calling. The 135M and Qwen models and cloud inference are excluded. No APK, native wrapper, or mandatory PWA installation in V1. Preserve the supplied Seren 7 HTML design. CP001 reconstruction/recovery and GGUF hash receipts are recorded in `CHECKPOINT_LOG.md`; browser CPU/WASM inference has preliminary evidence there. Do not infer WebGPU, B2CCP, mobile, or release acceptance from those results.

Complete CP001 through CP011 in order, using the next uncompleted checkpoint as the immediate unit of work. State scope and test plan; record concrete results. A proposed feature is not a shipped feature.
