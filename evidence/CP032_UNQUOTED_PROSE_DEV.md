# CP032 unquoted named-action prose — development evidence

Date: 2026-11-05. Branch: `agent/cp032-semantic-v3`.

## Scope and activation

- Adds a bounded, source-grounded parser for explicit unquoted named action inventories and dependency clauses. No general semantic extraction claim.
- `SpiralController.run(text, {experimentalDependency:true, experimentalProseV3:true})` activates the path; production/default settings remain unchanged.
- Closed action inventory, one order goal, all source clauses accounted for, exact action mentions, literal source spans, complete fact replay, and independent whole-order check are required. Unknown clauses cause abstention.
- Source statements are assumptions supplied by the requester, not independently established world facts. The model is not called for these tests.

## Development-only measurements

Fixture: `tools/fixtures/cp032_unquoted_prose_dev_2026_11_05.json`, SHA-256 `12018ca3b00c32a35ce16fe28f861ba29f033f7d13fd88588e60713cfd1232e8`.

Run `node tools/b2_cp032_semantic_prose_selftest.mjs`:

- 20/20 locally authored supported examples: exact action inventories, exact manually specified edges, independent source-clause coverage, and final whole-task order all pass.
- Default baseline admitted 0/20; opt-in V3 admitted 20/20 for this development set.
- 15/15 negative examples abstain; 0 false verifications; 13/13 provenance/source mutations rejected; 0 model calls.
- `npm run test:v2:cp025` passed CP025 semantic extraction, GraphOS, Cortex guard, integration and bounded parallel confirmation.
- `npm run test:cp027:prose:dev` passed its separate V2 authored examples and mutations.
- A standalone static build command could not complete in this isolated worktree because `vendor/wllama/wllama-single.wasm` is absent; no failure in CP032 assets was observed. The new module is explicitly listed in the build manifest requirement and offline service worker shell.

## Boundaries

- These examples are locally authored development cases, **not unseen independently sourced prose**, and the frozen CP026 holdout was not used as tuning input.
- No actual Falcon invocation, physical phone, human grading, browser UI smoke, or external benchmark success was demonstrated in CP032.
- Consequently there is no evidence that this lifts CP026 real-Falcon outcomes, broad semantic reasoning, or non-template natural-language acceptance. Default behavior is unchanged; the extension remains explicitly opt-in.
