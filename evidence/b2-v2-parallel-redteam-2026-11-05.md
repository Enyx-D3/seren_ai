# Seren 7 V2 parallel-train independent red-team — initial baseline

- **Checkpoint:** CP025 model-free extraction/ordering development oracle, preliminary (not P4)
- **Revision:** `b52b636` on isolated `agent/verifier-v2` branch; development fixture authored separately from program parser and prior frozen P4 cases
- **Environment:** Node.js on Linux, no Falcon weight, no model inference, no browser, no TinyLinux guest, no external requests
- **Reproduce:** `node tools/b2_v2_parallel_independent_eval.mjs`; detail `--json`; optional `--candidate=/absolute/path/to/app/js/b2-semantic-extraction.mjs`
- **Fixture:** `tools/fixtures/b2_v2_parallel_dependency_redteam.json` (36 independently authored cases, SHA-256 `1b2512fef0ea75d8c3df5cb592ea592ee88010cd6fce33d5c1637d6028ccfd81`). This is a **development** fixture: its three baseline misses were subsequently shared with the semantic-extraction author. Do not present later gains on it as held-out confirmation.

## Baseline observations

| Category | Count | Observed result |
|---|---:|---|
| Source-grounded feasible/infeasible order cases | 23 | 20 independently checked correct; 3 abstentions |
| Intentionally ambiguous, unsupported, negative, or injection cases | 13 | 13 abstained; no unsafe acceptance |
| Targeted source/evidence mutation probes | 4 | 4 rejected by `checkSourceRelationship` |
| False verifications on these cases | 36 | 0 |

**Identified coverage misses** (safe abstentions, not parser hallucinations):

- `P05`: unquoted `review proofs precedes publish report`.
- `P07`: unquoted `permit inspection is required before permit approval`.
- `P08`: unquoted `ship order may begin only once pack order is complete`.

The baseline parser and two graph traversal methods are assessed against independently authored gold source-edge relationships. The fixture includes duplicate relations, cycles, negation, modality/exception clauses and an instruction-injection attempt. A correct answer in this harness proves only bounded scheduling **relative to user-stated constraints**; it does not independently establish facts about the outside world.

`node tools/b2_dependency_task_selftest.mjs` passed. `node tools/b2_entailment_selftest.mjs` passed, including its separate 330-case graph/query oracle. `git diff --check` passed. The full `npm test` / browser/model-dependent suites were not run in this worktree; the gitignored local Falcon GGUF is absent in fresh checkout.

## Admission rules for a future CP025 extractor

The `--candidate` hook evaluates `extractDependencyRelations(source, {actionNames})` plus `verifyExtractedDependencyFacts(source, result)`. Action names supplied to this hook are extracted from an explicit user-provided goal list, never from the hidden gold edges. It reports independent source-edge agreement, source-span identity and candidate verifier results. A candidate extraction **does not** earn an end-to-end verified-answer pass until its graph is actually executed and the whole-task independent oracle passes.

**Status: PARTIAL / model-free development baseline.** A separately frozen and unshared second set is documented in `b2-v2-parallel-confirmation-2026-11-05.md`. No Falcon-only versus B2 A/B, latency speedup, model-led repair success, physical phone or P4 general reasoning acceptance is claimed. Preserve all three misses and any later failures. The trace/report can be integrated without changing V1 runtime files.
