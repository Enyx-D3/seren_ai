# CP032 — current-branch browser acceptance handoff (2026-11-05)

Status: **BLOCKED — no successful real browser inference execution in this Linux environment**. This is an engineering handoff, not a release acceptance certificate.

## What was observed

- Current-branch Linux Chromium default Playwright launch failed: `chrome/browser/process_singleton_posix.cc:297 Check failed: . socket() failed: Operation not permitted (1)` (`SIGABRT`). No sandbox bypass was attempted.
- Isolated worktree preflight evidence: [`cp032-browser-linux-preflight-2026-11-05.json`](cp032-browser-linux-preflight-2026-11-05.json) records missing Wllama WASM/runtime assets, the pinned local Instruct GGUF and local Playwright dependency. The preflight performs **no** browser inference and never treats a missing prerequisite as a pass.
- `tools/b2_cp032_browser_gate_selftest.mjs` passes the parser/phase-manifest and fail-closed preflight checks without a model, Chromium or a server.
- These results do **not** establish physical-phone, native TinyLinux, broad prose reasoning, or production release acceptance.

## Owner-run instructions (on the Mac holding the exact approved local model)

Run in a **clean current-branch checkout** at the commit under review:

```sh
npm ci
npm run prepare:runtime
npm run test:cp032:browser:selftest
node tools/b2_cp032_browser_gate.mjs --mode preflight
node tools/b2_cp032_browser_gate.mjs --mode smoke
node tools/b2_cp032_browser_gate.mjs --mode full
```

The exact approved `Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf` must exist at `workspace/parts/`; the runner calculates its SHA-256 and refuses substitution. A Playwright-managed Chromium must already be available: installing a browser is an explicit owner action, not performed by this script. If needed, pass `--browser-path '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'` to each command. The runner binds an unused loopback port (default `8799`, override via `--port 9879`), owns/stops its local test server, restricts output to repository `evidence/`, and does not push, deploy or use cloud inference.

`smoke` covers the current browser tool-capability and UI paths; `full` additionally covers lazy-load, store, schema migration, data controls, cancellation, negative import, and the frozen CP026 real Falcon A/B runner. Each phase gets bounded runtime and the runner stops after the first nonzero result. The evidence JSON records all attempted phases and whether they passed. A fully successful **scoped** browser run is still not an independent production release approval and must be reviewed against other acceptance gates.

## Outstanding acceptance

1. Execute both browser modes with the approved pinned model and a permitted Chromium; preserve output JSON and console logs under source-controlled evidence.
2. Have a separate reviewer check observed browser outputs, external-request policy, offline reload, independent verification/false acceptances and frozen A/B case outcomes. A script exiting zero is insufficient to prove broad reasoning quality.
3. Run genuine physical-phone/human grading, TinyLinux integration and hardware-budget checks separately. Keep the release gate **BLOCKED** until those results exist and pass their distinct criteria.
