# CP032 — bounded source-bound Cortex residual repair (development evidence)

2026-11-05 · Isolated branch `agent/cp032-repair` · Base `256d866`

## Implementation

- New `runCortexResidualCycle` is an **explicit opt-in** developer API; no default chat, deployment, release, phone or network setting is changed.
- Selects the first unmet quoted prerequisite, asks the injected model for a bounded A/B choice, then proposes **one local dependency edit** through the existing `repairOrderFromChoice` interface.
- A strict answer parser accepts only A, B, an exact source action, or an anchored matching label plus action name (`B: "Action"`). Free-form output, mismatched label/action, extra instructions and invented names are rejected.
- `createCortexDependencyGuard` admits only a permutation that strictly reduces residuals without breaking **any previously satisfied source constraint**. A separate whole-order oracle runs before the answer may be marked verified. Partials are not final answers.
- A/B options alternate based on source coordinates and attempt number to expose constant-letter model behavior. Limits: 1–4 model calls, no-progress brake, 4,000-character source, source-version equality, no arbitrary shell/code/tool invocation.
- Optional prose-v2 parsing now requires full source-clause replay inside the guard. It is off unless `allowProseV2` is explicitly true; established defaults are unchanged.

## Model-free authored development tests

`node tools/b2_cp032_cortex_residual_selftest.mjs` → **PASS**

- Six independently authored positive dependency tasks, 11 model-choice doubles, 7 A and 4 B; full source oracle accepts all six.
- Three unsupported/cyclic/untrusted source cases → no model call and no verification.
- Seven wrong, mismatched or malformed answer cases → none falsely verified.
- One stale source → no model call; one already-correct input → verified without a model-led repair.
- These model doubles are **not real Falcon** and do not establish neural-model capability.

## Actual pinned Falcon diagnostic (Node/WASM CPU, not browser)

`node tools/b2_cp032_cortex_real_probe.mjs` → **DEV_DIAGNOSTIC_NOT_ACCEPTANCE**

- Exact Falcon-H1-Tiny-90M-Instruct GGUF SHA256: `e7d655345a876ecb073ea86f5ce68e412b99090c34a6bde8a2982bc48afb2612`.
- Two new, developer-authored three-action tasks, three real Falcon calls each; **6 real model calls, 45 tokens**.
- Both complete orders independently replayed against separately specified gold prerequisite edges: **2/2 correct**, **0 false verification**.
- Each task had two admitted local edits and one rejected wrong predecessor. The model chose the `B` option on all six calls, so this tiny result **does not establish general Falcon reasoning or option-balanced accuracy**. Its success is scoped to the preserved-constraint repair path.
- Raw prompt choices, decoded model text, attempted corrections, admit/reject receipts, latencies and source hashes are in `cp032-real-falcon-residual-dev.json`.
- The earlier strict parser rejected Falcon's actual `B: "Action"` response shape (0/2); the anchored label-plus-source-action parser resolved this interface failure, without accepting arbitrary prose.

## Regressions and limits

- `node tools/b2_cortex_guard_selftest.mjs` → PASS.
- `node tools/b2_cp027_semantic_prose_selftest.mjs` → PASS (20 supported, 12 negatives, 0 false verified, no model calls).
- `npm run test:v2:cp025` → PASS.
- `npm run test:cp027:conjunction` → PASS.
- No frozen CP026 tuning, no external BBH, no blind holdout, no physical phone, no actual browser execution, no human grading, and no speedup/general reasoning claim.
- Remaining acceptance requirement: externally authored unfamiliar prose, broader real-model answer diversity, and actual browser/offline/device confirmation.
