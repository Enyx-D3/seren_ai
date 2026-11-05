# CP027 – source-grounded conjunctive constraints (development evidence)

Date: 2026-11-05. Branch: `agent/cp027-reasoning`.

## Implemented

- The optional `experimentalDependency` semantic fallback can extract two mandatory
  prerequisites from one explicit three-action conjunction (e.g. *A requires B
  and C*; *B and C must finish before A*).
- Every derived edge retains the verbatim source clause, source offset, all
  matched action spans, its rule, and an independently checked edge index.
- The independent clause-coverage checker requires **both** edges of a supported
  conjunction. A missing, reversed, duplicate, reassigned, or source-offset-
  tampered edge cannot be promoted as a complete extraction.
- Ambiguity/disjunction, conditionals, unsupported fourth action in one clause,
  and extra instructions remain abstention cases; unsupported clauses are not
  silently discarded.
- A real `SpiralController` → semantic extraction → GraphOS → Cortex bounded
  repair → independent whole-task verification integration was exercised using
  **a deterministic model-output double**, not a Falcon runtime.

## Local development tests

`node tools/b2_cp027_conjunction_selftest.mjs`:

| Measure | Result |
| --- | ---: |
| Independently authored positive constrained-order prompts | 7/7 parsed and independently verified |
| Independently authored hard negatives | 15/15 abstained |
| Provenance/edge tamper mutations | 42/42 rejected |
| Controller/Cortex repair using model-output doubles | 1 valid repair admitted; 1 incorrect model choice rejected; 4 simulated model calls total |

`npm run test:v2:cp025` passed all existing semantic, Cortex, GraphOS,
capability, composition and CP025 sealed 40-case confirmation tests. The sealed
fixture remained unchanged (SHA-256:
`fb9cedee175024d2871d0653d2f4e62970be2d79b89674077f71744b0b7933b8`);
this is a compatibility regression, **not** a new independent CP027 score.

`npm test` was attempted but stopped in `tools/module_selftest.mjs` because the
optional local model file `workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf`
is absent (`ENOENT`). It is neither a test failure of the modified parser nor
evidence that the real model succeeds.

## Limits and remaining validation

- Conjunction support is intentionally a small, explicitly enumerated grammar;
  no claim of broad unfamiliar semantic reasoning follows.
- No real Falcon inference, live browser/device run, human grading or physical
  phone test occurred in this lane.
- Preserve the independently frozen CP026/CP027 holdouts for later external
  confirmation. Do not tune the parser on their individual failures.
- Full acceptance still requires a real local model and independent benchmark
  outside these development cases, plus integration and device smoke tests.
