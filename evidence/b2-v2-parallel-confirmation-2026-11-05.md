# Seren 7 V2 CP025 — second-set model-free confirmation

- **Source revision of baseline:** GitHub main `b52b636`.
- **Candidate:** `app/js/b2-semantic-extraction.mjs` from isolated `agent/semantic-v2`, SHA-256 when evaluated `28a902de3848d028a94da984da8cef4eee918cab5bf3fd022bbd15f248a3ed85`.
- **Fixture:** `tools/fixtures/b2_v2_parallel_dependency_confirmation_2026_11_05.json`, SHA-256 `fb9cedee175024d2871d0653d2f4e62970be2d79b89674077f71744b0b7933b8`, 40 cases. Frozen before candidate execution and not supplied to the semantic author before first scoring.
- **Environment:** Node.js model-free source parser, no Falcon, browser, network or GPU.
- **Exact reproducer:** `node tools/b2_v2_parallel_independent_eval.mjs --confirm --candidate=/ABSOLUTE/PATH/TO/app/js/b2-semantic-extraction.mjs`.
- **One-shot first evaluation:** 2026-11-05; no prompt/fixture changes between hash freeze and candidate score.

| Metric | Original dependency parser | Candidate semantic extractor |
|---|---:|---:|
| Supported feasible/infeasible cases correctly interpreted | **15 / 27** | **27 / 27** |
| Correct abstentions on unsupported/ambiguous/negative cases | **13 / 13** | **13 / 13** |
| Unsafe acceptances or wrong source-edge orientations | **0 / 40** | **0 / 40** |
| Independent baseline mutation tests | 4 / 4 rejected | Not evaluated by these four baseline mutation probes |

The candidate is separately checked with `verifyExtractedDependencyFacts`, and candidate graph facts are independently compared to authored gold dependency edges and source spans. The candidate does **not** receive gold-derived action names: the harness supplies only a list explicitly present in the original source goal. The baseline additionally executes both source-graph traversals and checks their answers against an independent gold permutation oracle.

**Interpretation:** This is evidence of better *bounded dependency-language coverage* on this one new set, with no observed false source-edge admission. It is **not** a statistical estimate of general non-template natural-language understanding. The evaluator author had access to source implementation (not independent from the research team), and the corpus remains small and synthetic. The candidate has not yet been wired into `SpiralController`, and no full task/Falcon/browser, permissioned TinyLinux or P4 result was scored. Human review and external unfamiliar questions remain open.

**Status: PARTIAL/PASS for model-free scoped extraction confirmation, NOT PASSED for broad V2 or released app.** Retain this fixture sealed from further policy tuning; any subsequent changes need a new confirmation set.
