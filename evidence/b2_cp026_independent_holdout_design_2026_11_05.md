# Seren 7 CP026 independent holdout — frozen before any model run

- **Status:** FIXTURE_FROZEN / REAL_MODEL_EVAL_NOT_RUN.
- **Source baseline:** `agent/integration-v2` commit `6eb39f8`.
- **Owner:** isolated CP026 independent-verifier workstream; not the semantic extractor or model evaluation implementer.
- **Fixture:** `tools/fixtures/b2_cp026_independent_holdout_2026_11_05.json`.
- **Exact SHA-256:** `bec2deb71bbd93f03d1aab7b48ae24a97e396a8e65a488610e937a125d7934a4`.
- **Denominator:** 28 locally authored, domain-varied dependency tasks: 16 well-specified feasible, 3 contradictory cyclic and 9 scoped conservative-abstention cases. Gold records list independently annotated complete action inventories and prerequisite edges. Names, wording and domains were authored after CP025 was committed, with no feedback from executing these tasks against the candidate.
- **Oracle:** `tools/b2_cp026_independent_oracle.mjs`. It imports no Seren solver/parser, requires a frozen file checksum, validates every gold action and edge, independently detects cycles with a Kahn traversal, and validates all action permutations against the gold edge list. The explicit-answer scorer supports unambiguous JSON/arrow schedules, explicit infeasibility and explicit abstention; nonstandard prose remains unscorable for separate blinded human adjudication rather than being guessed as correct.
- **Scope caveats:** Gold `abstain` means that a **conservative fully-verified whole-task claim** is not supported under the project's safety policy. It is not a universal philosophical proof that any suggested order would be wrong. A factual assertion in a quoted source is an assumption for conditional dependency reasoning, not independently established real-world truth. Some tests deliberately exceed current fixed grammar and should be counted as missed support, not excluded.
- **Anti-leakage:** Freeze before first paired real-model comparison. This fixture must never update extraction rules, Compass policy, prompts, or calibration. A rerun after inspecting outputs is development evidence and needs a new holdout for confirmation. The fixture is committed and therefore is *not secret*; independence comes from authoring separation, upfront hash, no tuning and an independently implemented oracle. Local authorship and possible public pretraining contamination should be reported accurately.

## Required real Falcon A/B execution

1. Use the exact pinned Falcon-H1-Tiny 90M Instruct bytes, tokenizer/template, one Worker/browser environment and comparable task budgets in both arms. No mocked generation or model call counter is a real evaluation.
2. Counterbalance Falcon-only and B2 order (AB/BA) by predeclared ID order. Preserve the exact input source, timing boundary, generation parameters, source/model SHA-256, browser/device/OS, cold/warm load and runtime limits.
3. Store every raw answer and claimed verification status. Use the independent oracle to score ordered outcomes and report parse/unscorable outputs separately; retain failures, including purportedly verified but incorrect claims.
4. Report each category separately: correct feasibility, exact complete-order correctness, proper safe abstention, false verification, total task coverage, answer/time-to-correct where both arms solve, model/tool calls, TTFT/TPS, p50/p95 wall time, sampled peak memory and cancellations.
5. Do not call a lower aggregate latency a speedup when B2 immediately abstains and the baseline attempts a full answer. Do not pool subjective explanations into objective machine accuracy. Any additional natural-language adjudication should be blinded and independently signed.

## Reproducibility receipt

Command: `node tools/b2_cp026_independent_oracle.mjs`

Observed before real-model run: structural gold oracle PASS; 16 feasible, 3 infeasible, 9 abstain; 0 actual model runs. Does **not** establish Falcon quality, B2 performance, browser functionality, native TinyLinux execution or general reasoning accuracy.

Rollback: delete the new fixture/oracle/evidence files on their independent branch. No app/runtime files were altered.
