# CP030 — typed recursive residual solver research slice

Date: 2026-11-05. Parent integration revision: `ca69551`.
Branch: `agent/cp030-trm` (isolated worktree).

## Scope and status

**EXPERIMENTAL_ONLY / PASS for the exact typed development scope.**
`app/js/b2-trm-residual.mjs` implements a 4×4 Sudoku symbolic recursive
residual worker, not an official Tiny Recursive Model, trained neural network,
or general-language interpreter. No extra model weights, browser settings,
normal-chat route, storage schema, permissions or product UI were changed.

Input is a strict five-line `SUDOKU4` string with four rows of digits `1`–`4`
and `.` blanks. Source clues carry their original UTF-16 offsets and values,
and the input's SHA-256 identity is rechecked before each solve. Incorrect
source versions, tampered clues, and non-grammar instructions are rejected.

The candidate repeats bounded local singleton propagation; if no cell can be
fixed, it branches only under depth and node caps, recording provisional
choices and checking local consistency. Nonprogress at the depth cap, node
exhaustion and round exhaustion **brake without claiming infeasibility**.
Exhaustively contradictory constraints may be labeled infeasible. Only an
independent whole-grid source/givens, rows, columns and boxes checker returns
`verified`. Intermediate progress is expressly `locally_consistent`, not a
verified solution.

## Executed confirmation (development-only)

Command: `node tools/b2_cp030_trm_residual_selftest.mjs`.
Environment: Node.js v24.22.1, workspace Linux; zero Falcon/other model calls.
24 distinct, locally generated development puzzles derived from legal grids;
this is not external, held-out, human-graded, or production evaluation.

| Check | Observed |
| --- | ---: |
| Recursive-residual candidate whole-grid independently verified | 24/24 |
| Exact MRV backtracking baseline whole-grid independently verified | 24/24 |
| Bounded no-progress/node/round brakes | 3/3 |
| Malformed/extra-instruction source negatives | 6/6 rejected |
| Changed-source, forged-clue/grid/hash negatives | 4/4 rejected |
| Invalid budget negatives | 4/4 rejected |

Search-node counts: recursive candidate **44**, exact baseline **244** across
the 24 cases. The candidate also executed **200 singleton-propagation rounds**
and **20 branch choices**. In one counterbalanced-order Node run the summed
function timings were ~**4.9 ms** for the recursive candidate versus ~**2.9
ms** for the exact baseline. These tiny diagnostic times are noisy and include
different work per path. They show **no measured speed gain**; fewer search
nodes do not establish lower end-to-end cost or quality improvement.

Existing compatibility command `npm run test:v2:cp025` passed, with the sealed
40-case CP025 fixture unchanged. `npm test` could not complete because
`workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf` is absent in this
isolated worktree (`ENOENT` at `tools/module_selftest.mjs`). This is an asset
blocker, not a claim of successful full-suite or real-model execution.

## Limits and next proof obligation

- A 4×4 formal puzzle is a bounded symbolic control experiment, **not**
  evidence of unfamiliar semantic reasoning or production TRM utility.
- The independent verifier establishes constraints relative to supplied clues;
  it does not independently authenticate a real-world source.
- Real official TRM weights, TinyLinux, model-guided residual proposals,
  browser/offline smoke and physical-device performance were not tested.
- Before integration into default B2, compare stronger exact baselines on
  independent, predeclared tasks and measure end-to-end benefit plus accepted
  error/abstention. A slower candidate should remain an opt-in research lane.

Rollback: remove the new research module, its development test and this
evidence file. No runtime imports or schema migration require rollback.
