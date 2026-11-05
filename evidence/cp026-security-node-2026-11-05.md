# CP026 security/offline policy slice — 2026-11-05

Status: **PARTIAL**. Source baseline: `agent/integration-v2` at `6eb39f8`; isolated branch `agent/cp026-privacy`. No push, deployment, actual browser or native TinyLinux invocation.

## Defects corrected

1. **Capability envelope integration failure.** `parseToolFabric()` returns `{name,arguments,raw}`. The new B2 capability validator intentionally rejects unknown envelope keys, so the `?b2_tools_v2=1` opt-in previously denied legitimate parser-produced tool calls before worker execution. The UI adapter now removes only the recognized audit-only `raw` metadata via `capabilityEnvelopeFromParsedTool()`; it still passes name and arguments to the strict validator, and unknown metadata is denied. The original raw proposal remains available to the separate audit trail. Denial/cancellation receipts explicitly carry `ok:false` and an error string for the existing Spiral failure path.
2. **Service worker cached arbitrary same-origin GET responses.** The older `fetch` handler cached any successful GET except `/models/`, including potentially sensitive dynamic/API paths. Its `activate` handler also deleted unrelated origin Cache API namespaces. The worker now caches only the enumerated static shell URLs, bypasses all other GET responses, and deletes only obsolete `seren7-shell-*` caches. Cache revision `v52` removes the previous `v51` cache that may contain overbroad responses. Offline asset fallback reads the current Seren shell cache specifically, not another app's cache. HTML navigation retains its original network-first and cached-shell fallback behavior.

## Reproducible narrow verification

```sh
node tools/b2_cp026_security_selftest.mjs
node tools/b2_tool_capability_selftest.mjs
node tools/b2_cortex_guard_selftest.mjs
node tools/b2_semantic_spiral_integration_selftest.mjs
git diff --check
node --check app/sw.js
node --check app/js/main.mjs
```

Observed: all commands returned exit 0 in Node on Linux. The new selftest explicitly exercises a model-parser-output tool proposal, Worker-contract doubles, wrong envelope/argument rejection, cancellation-consistent receipt shape, scope-relative allowlisted offline asset fallback, no dynamic/API/model cache insertion, and preservation of unrelated cache namespaces during activation.

## Remaining acceptance

- This is a **Node policy test**, not browser service-worker execution, real Falcon inference or physical network disconnection. Run the actual Playwright offline/UI/model/Stop/security checks on a machine with working Chromium, installed dependencies and verified model assets.
- Native Linux process isolation, network egress packet audit and device-level energy/RAM measures remain independent gates.
- All experimental flags remain disabled by default; original V1 remains rollback.

Rollback: revert this isolated commit, or cherry-pick only its individual file changes into the integrator branch; preserve the previous baseline as needed. Caveat: reverting the service-worker cache restriction would restore permissive same-origin caching, so it should be separately reviewed before rollback.
