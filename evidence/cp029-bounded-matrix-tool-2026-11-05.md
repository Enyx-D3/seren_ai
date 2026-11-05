# CP029 — bounded exact matrix browser-tool lane

Status: **PARTIAL IMPLEMENTATION; NODE/POLICY VERIFIED; REAL BROWSER AND NATIVE TINYLINUX UNVERIFIED**.

## Scope and provenance

- Source baseline: `agent/integration-v2` revision `f3782a0` in the Seren 7 repository.
- Owner plan: `docs/Plan.md` workstreams 07 (L1 contracts), 08 (L2 matrix), and 11 (isolated tools); `docs/TRD.md` execution lanes and L1/L2/L3 acceptance separation.
- Smallest delivered functional slice: `matrix_multiply_exact`, a typed Worker-dispatchable, capability-denied-by-default local exact calculation, *not* TinyLinux, arbitrary code execution, a semantic reasoning engine, or a completed L2 GraphOS composition.
- Inputs: two JSON-encoded, 2×2, 3×3, or 4×4 **square integer** matrices with entries in [-1,000,000,000, 1,000,000,000], a 256-character limit per encoded argument, and strict tool schema. Mismatched dimensions fail closed. Outputs: JSON-encoded decimal-string cells so products beyond JavaScript safe integer limits retain their full precision.
- Code: `app/js/b2-matrix-tools.mjs` implements row-dot and rank-one outer-product indexing paths using `BigInt`, crosschecks every output cell; `app/js/tools.mjs` exposes only this arithmetic operation. A verified result covers **only the matrix calculation given the supplied inputs**, not the trustworthiness of source text or the rest of a task.
- The existing `app/workers/tool-worker.mjs` and `app/js/b2-tool-capability.mjs` provide isolated browser Worker dispatch, default denial, explicit named allowlist, `local_compute_only` permission, call budget, per-call timeout, abort signal, and Worker termination. No native shell, arbitrary Python/C++, file access, network, privileged process or automatic permission promotion is added.
- Offline asset enumeration extended in `app/sw.js` (shell v53); `tools/build_web.mjs` required-asset list extended.

## Reproducible checks

| Command | Observed result | Scope |
| --- | --- | --- |
| `npm run test:cp029:matrix` | PASS: known cases, 240 deterministic randomized dimension-2..4 pairs, malformed dimensions/types/values, 3 Worker-contract dispatches, denial/budgets/abort/timeout | Node + Worker-contract doubles; **not a real browser test** |
| `node tools/b2_cp026_security_selftest.mjs` | PASS | Offline service-worker privacy/cache policy in Node doubles; cache name parsed from actual SW code |
| `npm test` | PASS | Existing module/B2/CP025 suite and new CP029 matrix selftest |
| `npm run build:web` | PASS, 74 web assets, GGUF weights excluded | Packaging only; not UI execution |

No measured Falcon A/B improvement, genuine semantic planning, L3 policy, native TinyLinux boot/process isolation, physical phone, memory/energy acceptance, or held-out broad reasoning is claimed. The native TinyLinux branch remains research-only per the plan until isolation, permissions, killability and resource evidence exist. A real browser Worker/offline/cancel smoke and whole-task GraphOS matrix composition are the next gates.

## Safety and rollback

- Strict schemas reject unknown tool names/arguments; invalid matrix payloads return tool failure. No user prose may grant tool permissions.
- Memory/CPU cost is bounded by at most 4×4 matrix cells, 256-character argument strings, and finite call count/timeout in the capability session; exact intermediate values are finite under the entry bound.
- To roll back this slice, revert the CP029 commit. Existing V1 model-selection code, stored data, default model files and deployments are unchanged. No push or deploy was performed.
