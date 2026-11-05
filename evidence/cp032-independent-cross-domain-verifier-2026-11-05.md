# CP032 — independently authored cross-domain source-gold verifier

**Status: PASS (integrity of this locally authored development benchmark).** Broad
natural-language or real Falcon reasoning acceptance: **NOT ESTABLISHED**.

## Source and method

- Code baseline: `256d866` (`agent/integration-v2`). This independent lane changes
  no candidate parser, runtime, checkpoint documentation, frozen CP026 fixture,
  permissions, or active V1 route.
- New exact source fixture:
  `tools/fixtures/b2_cp032_cross_domain_2026_11_05.json`.
- SHA-256:
  `174c6cb7a34066871e6576969288639bbe4d3fcd49e0b721dc902cd1f2c8b0ca`.
- 42 genuinely new, manually written cases across 25 named operational
  domains: 24 feasible orders, 6 infeasible cycles and 12 cases requiring
  conservative abstention. No CP026 held-out source or gold was read, copied
  or used for tuning. No model was used to generate fixture or truth labels.
- For positive/cycle tasks, gold consists of a closed action inventory,
  explicitly directed manually interpreted edges, and the exact source
  quotations supporting each edge. A **separate bounded permutation oracle**
  checks feasibility; it never trusts the candidate's GraphOS, source parser
  or reported verification. Negative tasks carry exact quoted policy/uncertainty
  anchors. This is still author-originated interpretation, not external human
  validation of semantic truth.
- Compare the unchanged CP027 existing controller with explicit opt-in
  `experimentalProseV2:true` under the same `experimentalDependency:true`
  and `experimentalCortexGuard:true`. AB/BA case order alternates.
  Both routes use **zero model calls**. No model generator or test double was
  passed. Performance measures are raw Node development instrumentation.

## Observed results

| Whole-task outcome | Existing CP027 | New opt-in prose |
|---|---:|---:|
| Feasible orders correct / 24 | 0 | **5** |
| Infeasible cycles correctly identified / 6 | 0 | **3** |
| Safe abstentions / 12 | 12 | **12** |
| Total policy-correct / 42 | 12 | **20** |
| False verification | 0 | **0** |
| Unsolved feasible problems | 24 | **19** |
| Actual model calls | 0 | 0 |
| Actual browser runs | 0 | 0 |

The opt-in parser covers eight additional objective tasks relative to the
unchanged controller on this new **development** set. It still fails most
feasible prose, so it is not a release-level solution. Since arms do not
complete an identical set of tasks and the models were never run, **no
general latency or intelligence speedup is claimed**. Unverified answers
are not counted as success.

## Adversarial checks and traceability

- `node tools/b2_cp032_independent_selftest.mjs` — PASS. Includes 14
  gold/provenance/hash-tamper negatives, false verification of a missing,
  reordered or out-of-inventory answer, cycle verification and explicit
  policy abstention. The 42×2 raw outcome rows are independently re-scored.
- `node tools/b2_cp032_independent_eval.mjs` — PASS under a
  zero-false-verification condition. Emits
  `evidence/cp032-independent-cross-domain-evaluation-2026-11-05.json`.
- 84 actual local controller executions, 0 model calls, 0 runtime errors.
  Candidate performed 8 deterministic calculator operations, baseline 0;
  this is **not** an equal-work speed comparison.
- The fixture validator rejects duplicated case/action/edge identities,
  forged source quotes, missing source anchors, mislabeled cycles, changed
  fixture checksum and insufficient category/domain diversity.

## Non-acceptance and next gate

This verifier is a developmental oracle with human-authored source semantics.
It does not validate broad unfamiliar writing, Coder, native TinyLinux,
TRM, physical hardware, WebGPU, offline reload, or other MRS modules.
An independent external blinded set and real same-Falcon controlled A/B,
with human semantic grading where needed, remain required before promoting
P1/P2 or V2 full application status.

No push, deployment, or active-model switch occurred.
