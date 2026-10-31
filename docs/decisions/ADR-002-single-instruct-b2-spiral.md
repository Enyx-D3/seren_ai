# ADR-002 — Single Falcon Instruct with B2 Spiral

**Decision:** Approved by the user's explicit 2026-10-30 B2 Spiral implementation request. Supersedes DEC-002 and the four-specialist runtime portions of the original PRD, flow, UI, TRD, Schema and Plan. Historical four-model CP001–CP010 evidence remains unchanged as research history; it is not a claim about the new build.

Seren 7 now admits only the pinned Falcon-H1-Tiny 90M Instruct Q4_K_M GGUF. B2 Spiral receives every user request, selects a bounded fast or iterative path, decomposes multi-part work, asks the same Falcon for hypotheses, routes approved local tools, independently verifies exact results, records residuals, and may repair within budget. Unverifiable claims remain provisional. Exact shared states retain their checksum and recovery behavior. Calibration may change only bounded software budgets based on verified outcomes; it may not alter model weights or promote an untested policy. No separate Reasoning, Coder or Tool-Calling model is available in runtime, import, build or fallback.

The active controller interface and its present applicability limits are specified in [B2_Spiral.md](../B2_Spiral.md).

The existing production Vercel deployment and older static bundles are historical four-model builds until a new deployment is explicitly requested and verified. The one-model architecture requires fresh paired benchmark and browser regression evidence before release. Physical mobile acceptance remains open because no physical phone is available.
