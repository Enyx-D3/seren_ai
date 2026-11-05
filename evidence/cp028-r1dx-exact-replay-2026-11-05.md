# CP028 — R1/R1D/R1DX exact shared-state slice

Status: **PARTIAL V2 RESEARCH — Node independently checked; browser UI, persistence, native TinyLinux and broader reasoning unverified.**

## Baseline / contract

- Based on integration revision `ca69551`; developer experimental only. Owner SRS §10–12, TRD §8 and Plan workstream 10 require versioned shared state, exact identity/proof, causal replay, source invalidation and actual cost measurement.
- Added `app/js/b2-r1dx-shared-state.mjs` without changing active chat/UI or service-worker packaging.
- R1: bounded typed integer DAG (2–6 source values, 1–12 operations, add/subtract/multiply) with immutable per-node SHA-256 fingerprints including source identity/version/value and operation policy/version/parents. **This is not source authenticity:** the caller's numeric claims and provenance labels remain untrusted external facts.
- R1D: deterministic ordered delta chain (sequence, previous hash, node, fingerprint, exact decimal value, calculated/reused mode), plus independent replay that recomputes all integer results with the existing dual-parser exact arithmetic engine. A byte/hash chain is a consistency check, not a signature or actual resource attestation.
- R1DX: on a same-program versioned update, unchanged verified node identity can be reused; a changed source's value requires a higher source version. Even a provenance-only source version bump invalidates affected descendants. Program structural changes require a program version bump; dependent operation fingerprints include that version. Missing dependencies, dead/incomplete branches, stale versions and unverified imported prior objects are rejected. A serialized state can be locally restored **only after** full independent replay; only locally attested immutable snapshots are eligible for reuse.
- Values are exact integers (`BigInt`), source absolute values ≤1 billion, intermediate values ≤120 decimal digits, finite DAG/cycle-free topological form. No approximate merging, model, WASM/VM, shell, filesystem or network authority.

## Execution / measured result

| Check | Result |
| --- | --- |
| `npm run test:cp028:r1dx` | PASS; 160 randomized fresh graphs vs standalone BigInt oracle and independent R1D replay; explicit state tampering, extra/missing/incorrect source/operation metadata, stale version, unverified restore, dead branches rejected |
| `npm test` | PASS (full existing B2/CP025/CP029 test chain plus CP028) |
| Measured 200-graph batches ×7, linux/x64 Node v24.22.1 | Median 23.27 ms full reconstruction versus 20.58 ms warm reuse; ratio 1.131×. Individual pairs range 0.883–1.251×. Not a reproducible general speedup; wall-time sensitivity and per-graph SHA overhead matter. |
| First four-source/four-op graph | Fresh: 8 nodes calculated; unchanged exact repeat: 8 reused; one source edit: 4 invalidated/recomputed and 4 preserved; provenance-only version change invalidates 3 affected nodes. |

The receipt does **not** establish browser storage persistence, graph-size scaling, cross-process authenticated execution, source factual accuracy, new model reasoning, physical storage size, or real TinyLinux. No Falcon held-out cases were consumed; no push/deployment or original UI changes.

## Next gates / rollback

1. Wire into an opt-in real GraphOS/S7 controller path with source spans and user-visible replay status; validate on actual browser reload and storage corruption.
2. Compare against a strong incremental baseline and larger workloads under browser/phone timing, RAM, energy and source mutation profiles before claiming useful speedup.
3. Roll back by reverting the CP028 commit; active V1 inference remains unchanged.
