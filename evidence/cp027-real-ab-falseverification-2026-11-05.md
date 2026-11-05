# CP027 genuine Node A/B — independent false-verification red-team

**Status: PATCH_VERIFIED_SCOPED; actual GGUF A/B rerun not performed.**

- Base revision: `f08bb80` (isolated worktree, no changes to frozen 28-case gold/scorer).
- Evidence inspected: `evidence/b2-cp027-node-real-ab-2026-11-05T06-21-45.078Z.json` in integration worktree (untracked at inspection time).
- Failing case: `cp026_h026_missing`; gold `abstain`, but B2 emitted `["Legal clearance","Post notice","Print notice"]` and `verification.status=verified`. Thus this was **one false verification**, not a valid success or speedup claim.
- Root cause: named goal requested only `Post notice` and `Print notice`; source premise introduced `Legal clearance`, which is an external prerequisite. Semantic inference widened the action inventory by unioning all quoted premise names with goal names. Its completeness guard checked only whether **all goal names were included**, missing the inverse check. Independent verifier likewise omitted the inverse check. The correct response is abstention rather than inventing a broader task.

## Patch

1. `app/js/b2-semantic-extraction.mjs`: named goal lists are closed-world inventories. Source extraction records `prerequisite_outside_requested_inventory` and abstains when an inferred prerequisite lies outside the explicitly requested task. Independent source verifier reconstructs the same condition and rejects forged `parsed` reports.
2. `app/js/b2-dependency-task.mjs`: strict legacy extraction also refuses the widened inventory, preventing fallback bypass. Its order verifier refuses known unresolved source contracts, even when the positional inequalities happen to pass.
3. `tools/b2_cp027_inventory_fail_closed_selftest.mjs`: five independently authored adversarial variants across quoted/unquoted/case forms, two positive controls, one tampered-status check; end-to-end opt-in Spiral admission must abstain on excluded prerequisites.

## Reproduction

| Command | Observed result |
|---|---|
| `node tools/b2_cp027_inventory_fail_closed_selftest.mjs` | PASS, 5 adversarial + 2 positive + tamper |
| `node tools/b2_dependency_task_selftest.mjs` | PASS |
| `npm run test:v2:cp025` | PASS; 27/27 accepted supported, 13/13 abstained, frozen 40-case confirmation |
| `npm run test:cp026:oracle` | PASS, frozen independent gold structural selftest; **no model calls** |
| `npm test` | BLOCKED: missing local `workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf` in isolated worktree, not a failing app assertion |

## Acceptance boundary

This is a narrow source-contract fix. It prevents the observed excluded-prerequisite false verification and tested variants; it **does not establish zero false verifications on a fresh genuine Falcon run**. Repeat the identical 28-case frozen A/B in the integration environment with available GGUF, preserve source/fixture hash and score untouched, then inspect every `claimedVerified` row for source completeness. Do not market a comparative speedup from this dataset (no comparable time-to-correct pairs).

No push/deployment. No browser, physical-phone or human evaluation performed.
