# CP034 — six-lane engineering checkpoint (2026-11-05)

Baseline: fetched `Enyx-D3/seren_ai` main `ac763ad` (CP033). All changes are
local and uncommitted. Existing V1 one-Instruct route stays the default; none
of these development results authorizes automatic production promotion.

## Implemented

1. **Grounded semantic coverage:** Opt-in prose V3 now admits eleven more
   explicit dependency wording forms while keeping original source anchors,
   polarity and negative-sentence abstention. New development tests cover
   12/12 feasible examples, 1/1 directed cycle, 15/15 uncertain/unsafe inputs,
   two forged-source rejections; no model calls. This is bounded grammar work.
2. **Real browser developer entry:** A dedicated URL policy is default-off;
   `?b2_dependency=1&b2_prose_v3=1&b2_cortex=1` allows an explicitly opted-in
   source-prose experiment. Conflicting/duplicate flags fail closed. The
   service-worker shell version was bumped and the build requires the new
   imported module. No assertion of normal-chat prose deployment.
3. **Cortex and active Spiral Stop safety:** The dev residual cycle rechecks
   cancellation and live source identity after awaited model output. The
   actual Spiral controller rejects late outputs after Stop, including the
   dependency proposal, ordinary model reply, tool retry and repair routes.
   Regression tests exercise cancellation and retain a positive checked
   non-aborted control; model-return values are controlled doubles in tests.
4. **Flow cleanup and actual Node Workers:** A failed exact-work DAG batch
   aborts siblings and awaits their cleanup before any result is promoted.
   Six complete graph runs were independently replayed; Worker cancellation
   and forged-output tests leave no surviving workers. This is real Node
   worker-thread concurrency, not verified browser GPU/CPU parallel benefit.
5. **Optional Linux namespace fixed-task lane:** A bounded, typed Node tool
   launches fixed integer tasks under available Linux user/network/PID
   namespace restrictions and enforced process-group kill. Eighteen checks
   pass, including no host workspace/network routes and actual timeout/abort.
   It does **not** constitute a booted TinyLinux guest, virtualized storage,
   arbitrary code sandbox or browser integration. No `/dev/kvm`/QEMU proof.
6. **Release evidence correction:** Mac CP033 9/9 browser phases and the real
   56-row CP026 A/B now have independently reconciled source hashes, counts
   and a time-scoped ledger. No `PASS_RELEASE` entries were created.

## Reproducible checks

- `npm test` — **PASS** on Linux/x64 Node v24.22.1 with the approved local
  Instruct GGUF available. This tests model metadata plus Node logic, not fresh
  browser Falcon reasoning.
- `npm run test:cp034` — **PASS**, including new semantic, Cortex, Stop and
  physical Node Worker validation.
- `npm run test:cp034:native` — **PASS**, 18 scoped namespace checks, if this
  host has working `unshare` + `bwrap` capabilities. This host-only optional
  test is intentionally outside default `npm test`.
- `npm run build:web` — **PASS**; model-free static bundle has 84 assets.
- `git diff --check` — **PASS**.
- `node tools/b2_cp032_browser_gate.mjs --mode smoke` — **BLOCKED_PREFLIGHT**
  on this Linux checkout: `chromium_binary_missing`, zero phases. The prior
  independently recorded CP033 Mac full browser 9/9 PASS_SCOPED remains valid
  for that pinned source, not for this changed CP034 source.

**Flow timing variance:** One dedicated Worker selftest reported serial
1661.88 ms versus parallel 924.81 ms (1.80x for that narrow run). During the
broader `npm test`, the same selftest recorded serial median 1822.13 ms and
parallel median 1944.61 ms (0.94x). Both passed exact correctness and overlap
checks. There is **no demonstrated reliable product-level speedup**; measure
on target hardware and repeated isolated runs before any route promotion.

## Still not complete

- Held-out semantic interpretation across unfamiliar multi-document prose,
  aliases/coreference and conflicting clauses; real same-Falcon A/B must show
  feasible whole-task gains without false verification. The untouched CP026
  benchmark remains **0/16 feasible tasks** for its old candidate.
- Real Falcon-led Cortex repair quality across independent unseen tasks, not
  just cancel-proof model doubles or deterministic graph solving.
- General R1/R1DX proof reuse, B2CCP, true TinyLinux guest/native execution,
  browser Worker/Flow hardware behavior, measured p95/memory/power benefit.
- Optional Coder/dual-Falcon, TRM and retrieval paths require separate
  scope-specific research comparisons, permission/security and model licenses.
- New CP034 Mac real browser + offline revisit, actual physical mobile,
  accessibility/thermal and final owner/Shafi release acceptance.

Rollback: disable all CP034 URL research flags for an immediate V1 fallback;
for source rollback, reverse the CP034 patch against `ac763ad` after reviewing
local changes. Preserve historical raw CP026/CP033 evidence and CP032 fixtures.
