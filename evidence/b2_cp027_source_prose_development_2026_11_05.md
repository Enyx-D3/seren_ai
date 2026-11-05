# CP027 source-grounded prose extension — development experiment

Date: 2026-11-05. Branch: `agent/cp027-semantic-prose`. **Candidate only; disabled in ordinary chat.** This is neither an independently sealed holdout nor a real-model reasoning result. No CP026 holdout case was inspected or used for tuning.

## Source contract

- Opt-in requires `experimentalDependency: true` **and** `experimentalProseV2: true`.
- A closed inventory of 2–7 quoted actions, exactly one scheduling goal, and mandatory dependency clauses are required. Unsupported source clauses, unknown action names, conditional/disjunctive or historically descriptive clauses abstain.
- Every source clause has an exact source span and must be consumed. An independent source replay checks every inventory/goal/edge clause, direction, exact offsets, total edge count, action mentions and polarity; then GraphOS dependency traversal is checked by the preexisting independent whole-order verifier.
- Existing parsers have priority; prior default behavior remains unchanged. This only solves a bounded text-to-constraints grammar, not arbitrary English understanding or external factual truth.

## New development-only corpus

New fixture: `tools/fixtures/b2_cp027_prose_development_2026_11_05.json`.

SHA-256: `bf1b52ebbec2a6bbdab3344c2aa8b8e00f43620f9703b7996e97c5cff3c6f4fe`.

| Measure | Existing opt-in parser | New separately opt-in parser |
| --- | ---: | ---: |
| Feasible scheduling tasks fully checked | 0/20 | **20/20** |
| Unsafe/unknown tasks safely abstained | 12/12 | **12/12** |
| False verifications | 0 | **0** |
| Node model calls | 0 | **0** |
| Source/receipt tamper variants rejected | — | **10/10** |

Command: `npm run test:cp027:prose:dev`. Unit result: PASS.

## Clear limitations / next gate

These cases were **locally authored development examples**, with intentionally supported wording. The module has no claim to robust unseen prose coverage, general semantics, strong independent authorship or Falcon recovery. Future work requires independent unseen expert-authored cases, ambiguity-oriented red teaming, direct browser/offline smoke and real on-device Falcon A/B, and only then an explicit promotion decision.

No model weights, deployments, GitHub pushes, or CP026 acceptance criteria were changed.
