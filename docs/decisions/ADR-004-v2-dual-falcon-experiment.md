# ADR-004 — Seren 7 V1 baseline and V2 dual-Falcon/MRS experiment

**Date:** 2026-11-03  
**Status:** Accepted scope decision for *local V2 research*, not a released feature or implementation proof.  
**Supersedes:** The blanket ban on any future Coder model in ADR-002/003 and AGENTS.  
**Preserves:** ADR-002's single-Instruct *V1 production baseline*, browser-first privacy, offline behavior, exact verification and UI protections.

## Context
The owner originally selected a single Falcon-H1-Tiny-90M-Instruct model under B2 Spiral. On 2026-11-01/02, the owner authorized an expanded experiment: **two**, not four, tiny specialists—Instruct for language and Coder for executable candidate generation—with B2/MRS as the single reasoning conductor. Recovered GraphOS, rotating joints, L1/L2/L3 calculators, R1 shared state, Cortex, browser Workers, TinyLinux and retrieval are proposed selectable resources. Research receipts report narrow real dual-browser inference and simulator tests; GitHub main `d2fd6bc` does not include the complete integration.

## Decision
1. Maintain V1 one-Falcon Instruct as immutable performance/quality and UX fallback; do not silently replace current operation or expose unverified Coder.
2. Permit one **exact official Falcon-H1-Tiny-Coder-90M GGUF** experimental specialist after ID, quantization, tokenizer/chat/FIM template, checksum and hybrid-runtime compatibility verification. Additional Falcon Reason/Tool models are history-only, not active V2 dependencies.
3. Compare single, sequential-dual, simultaneous-dual, deterministic-only, optional isolated tool, and safe-stop modes under measured RAM, p50/p95 latency, correct task completion and accepted error; never presume concurrency is faster under contention.
4. B2/MRS owns request interpretation, resource routing, candidate path selection and verification; models supply hypotheses/code, not unreviewed authority. Verified exact work and source-checked state are reusable only with strict versioned dependency identity.
5. Keep primary Seren experience browser-first and local. Browser-side WASM Worker tool execution is in scope. A native TinyLinux execution lane remains **research-only** until a separate approved security/privacy/packaging decision proves process termination, isolation, permissions, resource budgets and fallback. Native inference speed is not a browser result.
6. Original Seren 7 UI and animated orb, chat/history/offline, no cloud LLM, truthful model/verification labels, migration/erase, frozen tests and rollback are release constraints.
7. Promote an experimental runtime only after independent end-to-end coding/planning/retrieval reasoning improvements on held-out tasks, not merely 10k matrix computations, simulated FLOPS, or generated tokens/sec.

## Evidence boundaries
- **IMPLEMENTED_IN_GITHUB_MAIN:** one Instruct worker, bounded B2 controller, strict arithmetic/Boolean/word/transfer, bounded two-claim logic and JavaScript delimiter diagnostics, conservative shadow calibration and local browser tools.
- **EXPERIMENTAL_HANDOFF:** CP010–CP022 GraphOS/matrix, rotating-joint, real two-Falcon Chromium CPU/WASM throughput, fixed Python/C++ tools and mock-source evidence bus results. Exact source is not merged in main; do not certify without replay.
- **MISSING/UNVERIFIED:** usable broad semantic translation, Level3 general benefit, full Falcon-led residual repair, secure native code sandbox, adaptive dual routing in Seren, live Internet evidence, physical-phone acceptance and P4 human confirmation.

## Failure and rollback
New functionality must be opt-in/reversible with a documented last-known-good source revision, model hashes and state-version migration plan. On invalid evidence, memory pressure, timeout, incorrect accepted answers, or failed calibration, brake the route and use an independently verified fallback or explicit uncertainty. Record negative experiments and retain existing data.

## Required follow-through
Synchronize AGENTS, PRD, AppFlow, UI_Spec, TRD, Schema, Plan, SRS, B2_Architecture_Traceability, README and CHECKPOINT_LOG in one documentation-only patch, then implement behind feature flags in a later code patch. Documentation is not implementation. No Git push or deployment follows from this ADR.


## 2026-11-04 scope clarification (documentation only)

The owner-restored [master SRS §§9–18](../SRS.md#9-restored-v2-master-scope-and-precedence-2026-11-04) and [coverage](../Seren7_V2_Recovery_Coverage.md) preserve Seren 7 = MRS and all simulator, hardware, virtual-computation, GraphOS/calculator, Cortex/retrieval and TRM research tracks. Dual hardware is not restricted to exactly WebGPU+WASM; all candidate backends remain capability- and evidence-gated. TRM is a research requirement with unknown local runtime compatibility and no official weights executed here; this clarification does not authorize silently adding another active language model. V1 one-Instruct, V2 optional official Coder, browser privacy and release permission boundaries remain as decided above.
