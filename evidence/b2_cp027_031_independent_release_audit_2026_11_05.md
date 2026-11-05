# Seren 7 = MRS — CP027–031 independent release audit

Checkpoint: CP027–031 independent readiness gate, initial revision f3782a0

Status: **PARTIAL research integration; browser MVP and full-MRS release BLOCKED**

## What was independently executed

Command: node tools/b2_cp027_031_independent_release_selftest.mjs

Result: PASS_MODEL_FREE_NARROW. The test independently states a two-document
three-action schedule and checks both GraphOS directions against source-defined
inequalities. It rejects forged bundle objects, reversed results, false
infeasibility, stale source text/version, same-version source rewrites and
unreverified composition changes. It then forces a Cortex proposal to break a
previously valid relation, confirms that edit is rejected without changing
established state, rejects a stale-source hash, and promotes only a later
whole-order checked repair. Capability-policy tests reject ungranted,
arbitrary-shell and prototype-name tool requests without Worker allocation.
V1 still advertises only Falcon Instruct as its default live model.

These are local Node mechanism tests. No Falcon generation, graphical browser,
native TinyLinux, Coder, TRM, physical phone or power measurement took place in
this audit.

The machine-readable [release gate ledger](b2_cp027_031_release_gates.json)
separates PASS_SCOPED from PASS_RELEASE and records exact release obligations.
Its initial status distribution is five scoped mechanisms, four partial,
three blocked and seven not run. Neither scoped tests nor a status edit alone
qualify as a release: a future PASS_RELEASE requires a pinned machine-readable
receipt naming that gate. These counts are **not percentage completion**.

## Current decisive missing results

| Stage | Required next result | Evidence status at this cutoff |
| --- | --- | --- |
| CP026 | Real Chromium generated tokens and full frozen A/B | Model SHA/build PASS; browser launch blocked (socket EPERM); 0 real CP026 A/B |
| CP027 | Unfamiliar semantic extraction; verified Falcon-led residual-only repair | Narrow formal and Node cases; broad unseen repair not proven |
| CP028 | Versioned GraphOS/R1 states, reusable proof joins and checked residuals on multiple documents | Scoped two-source composition; generalized incremental memory not accepted |
| CP029 | L1–L3 exact/matrix/DELTA2, adaptive route, optional TinyLinux | Narrow L1 and Worker admission; matrix/native guest and held-out L3 gain not accepted |
| CP030 | Optional official Coder, dual routing, TRM worker and provenance-correct retrieval | Research requirements only at cutoff, not a live validated chain |
| CP031 | Offline app, storage/Stop, privacy, original orb, physical phone, accessibility, license, signoff | Browser blocked; mobile/thermal/signoff not run |

## Browser environment

The only local browser executable found in this audit environment is
/usr/bin/chromium. The CP026 browser specialist and integrated real-evaluation
attempt independently recorded its sandbox IPC socket launch failure. This
audit did not bypass or weaken operating-system sandbox restrictions. An
authorized Mac or normal Chromium CI worker remains the next acceptance venue.

## Independent gate policy

1. Every claimed result must specify task/sample denominator, exact source,
   model hash if applicable, runtime/browser/device, command and raw output.
2. A passed calculator or source-position oracle cannot verify unconstrained
   surrounding Falcon prose, code behavior or real-world source authenticity.
3. A held-out A/B requires independent outcome scoring, matching model/hardware,
   honest model-call and latency accounting, and no fixture tuning after
   its hash is frozen. A model-free pass is not a simulated real-model pass.
4. A browser Worker tool does not establish native TinyLinux isolation; stale
   and denied calls cannot be rewarded by calibration.
5. Browser MVP and complete research MRS release require separate gates.
   No invented composite score or calendar date substitutes for any missing
   measurable pass. Original V1 code remains the rollback target.

No deployment, GitHub push, unapproved model substitution or permission
escalation was performed.
