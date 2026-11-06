# CP034 — CP033 GitHub source / Mac browser receipt reconciliation

Date: 2026-11-05. GitHub `main` source reviewed: `ac763ad` (`Seren7 CP033 integration`).

**Status: SCOPED BROWSER PASS, FULL MRS AND PRODUCT RELEASE NOT ACCEPTED.** This checkpoint reconciles already-recorded evidence; it does not claim a new physical browser or model run, change default runtime policy, or authorize deployment.

## Inputs and integrity checks

1. Mac owner-run `node tools/b2_cp032_browser_gate.mjs --mode full`, source receipt `evidence/cp032-browser-owner-2026-11-05T09-29-40.308Z.json` (SHA-256 `3b33d79dff71f3f9e00a3131edf09fb945d2bce380c45f3ad523831aefc22f62`). Mac arm64, Node v22.23.2, Playwright Chromium; the receipt records **9/9 PASS_SCOPED phases**, no reported phase issues, and `browserReleaseAccepted:false`. The tool, UI real local Instruct inference, lazy load, store, schema migration, export/delete/import, Stop, corrupt-model denial, and real CP026 A/B phases were run. Phase policy reports zero external requests and no native TinyLinux or physical-mobile acceptance.
2. Raw 56-row A/B receipt `evidence/b2-cp026-real-ab-2026-11-05T09-30-28.752Z.json` (SHA-256 `87eef91358f860def7e91b77d7aaf75e88527e281552f3dad2db2b7677f88b0d`), approved Instruct GGUF SHA-256 `e7d655345a876ecb073ea86f5ce68e412b99090c34a6bde8a2982bc48afb2612` and frozen 28-case fixture SHA-256 `bec2deb71bbd93f03d1aab7b48ae24a97e396a8e65a488610e937a125d7934a4`.
3. Independent source review recomputed the frozen fixture checksum, rescored every raw arm with `scoreIndependentOutcome`, and checked 56 distinct `(case,arm)` identities, 8/8 recorded source SHA-256 digests against committed `ac763ad` files, and `correct`, `falseVerification`, and `outcome` against the recorded per-row checks. **Zero mismatches.** The pre-commit Mac browser report says Git HEAD `b52b636`, because the test ran after applying source patches but before the `ac763ad` commit; the matching source hashes provide narrower byte-level linkage than that old HEAD field.

## Whole-task outcome and limits

| Measure | Falcon alone | B2 Spiral |
| --- | ---: | ---: |
| Frozen cases (counterbalanced arms) | 28 | 28 |
| Independently policy-correct | 0 | 11 |
| Feasible orders correctly completed / 16 | 0 | **0** |
| Correct infeasible detections / 3 | 0 | 2 |
| Correct policy abstentions / 9 | 0 | 9 |
| False verification | 0 | 0 |
| Model calls | 28 | 4 |
| Generated tokens | 1,627 | 38 |
| Runtime errors | 0 | 0 |

There is **no pair that both arms solved correctly**. Comparable time-to-correct is undefined; do not present low B2 median latency from immediate abstentions as a speedup. This benchmark does not prove general source interpretation, model-led repair, TinyLinux, or device release readiness. No human-semantic grades were supplied.

## Corrected gate accounting

- `S7_CP026_BROWSER_GENERATION`: prior Linux-environment `BLOCKED` remains historical; Mac Chromium now **PASS_SCOPED** for pinned local Worker generation and the tested Stop/lazy-load conditions. Not `PASS_RELEASE`.
- `S7_CP026_INDEPENDENT_AB`: raw A/B was executed, but **PARTIAL** remains because 0/16 feasible tasks were solved, no broad semantic generalization was shown, and no both-correct latency comparison exists.
- `S7_CP031_BROWSER_OFFLINE`: advance environment status from `BLOCKED` to **PARTIAL** for the scoped Mac UI/store/Stop/privacy receipts; a separately evidenced OS-network-disconnected full revisit, device/accessibility and production-wide privacy acceptance are still open.
- `S7_CP031_DEVICE_ACCESS` and `S7_CP031_RELEASE_SIGNOFF`: still **NOT_RUN**. `S7_CP029_NATIVE_TINYLINUX`: still **NOT_RUN**. No `PASS_RELEASE` has been entered.

**Next:** improve unfamiliar feasible-task interpretation against fresh evaluation material without tuning on the frozen CP026 set; keep Cortex repair provenance and fail-closed source invalidation; validate real parallelism/native isolation and on-device mobile behavior separately; obtain owner/Shafi sign-off only after all applicable evidence exists.

**Rollback/document history:** This note amends the release-gate ledger and checkpoint planning records only. It does not rewrite the older Linux-browser failure, pre-commit Mac Git HEAD field, raw model outputs, or frozen fixture. Restore this document-only diff if the reconciliation itself is disputed; leave all runtime artifacts untouched.
