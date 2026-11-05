# Seren 7 — Software Requirements Specification

> Current scope/status reconciliation: 2026-11-04. See [SRS.md](SRS.md) §§9–18 and [Seren7_V2_Recovery_Coverage.md](Seren7_V2_Recovery_Coverage.md). Earlier checkpoint sections retain their historical cutoff; they do not override this dated reconciliation.

## 2026-11-03 V1 development SRS continuity notice (CP023-DOCS)
This document accurately describes the bounded V1 development state at GitHub `d2fd6bc`, including narrow cross-domain source-grounded contradiction and JavaScript delimiter diagnosis; it is not the full V2 release specification. New owner-authorized experimental dual-Falcon/GraphOS/TinyLinux requirements and the longer historical SRS are consolidated separately in `docs/SRS.md`. References below to one Instruct and prohibition of Coder are constraints on the active V1 runtime; ADR-004 permits *disabled-by-default V2 research* only. Nothing here promotes the failed real Falcon code repair, small A/B objective results or frozen 31-case set to production acceptance.

**Version:** 2026-11-01 development baseline  
**Authority:** newest user instruction, `AGENTS.md`, ADR-001/002/003 and six canonical specifications.  
**Evidence:** `CHECKPOINT_LOG.md`; this SRS describes both accepted behavior and open gates, not a release certificate.

## 1. Product boundary

Seren 7 is a responsive browser website preserving the original visual design. All inference, reasoning, tools, history and memory operate in the user's browser. Static hosting may supply the shell and approved model bytes; it does not process prompts. The active language engine is exactly one verified Falcon-H1-Tiny 90M Instruct model. Historical four-model receipts do not authorize those models in the active runtime. Native apps, remote LLMs and public deployment are outside this mission.

## 2. Status key

- **Implemented:** source and relevant execution evidence exist in the ledger.
- **Partial:** a bounded contract works, with uncovered cases or incomplete acceptance.
- **Experimental:** opt-in/shadow behavior without promotion evidence.
- **Missing:** no executable proof or required external review.

## 3. User and runtime requirements

| ID | Requirement | Current status | Acceptance evidence still required |
|---|---|---|---|
| SRS-01 | Load and hash-check the single Falcon model in a browser Worker | Implemented on tested desktop Chromium | Mobile browser/device support and resource limits |
| SRS-02 | Stream, stop, regenerate and persist local conversation | Implemented on tested desktop | Full multi-browser/device acceptance |
| SRS-03 | Operate after offline revisit with cached shell/model | Implemented on tested desktop | Mobile offline and quota pressure |
| SRS-04 | Export/delete user data and reject corrupt files | Implemented on tested desktop | Broader storage recovery and race tests |
| SRS-05 | Preserve original layout, orb, keyboard and accessible statuses | Partial | Physical mobile, screen reader and thermal acceptance |
| SRS-06 | Never send prompts/history to cloud inference or telemetry | Implemented for tested flows | Release traffic audit across all supported browsers |

## 4. B2 reasoning requirements

| ID | Requirement | Current status | Acceptance evidence still required |
|---|---|---|---|
| B2-01 | Construct source-grounded intent, facts, spans, unknown, constraints and dependencies before generation | Partial | General natural-language semantic relations and code contracts |
| B2-02 | Track candidate operations and executable dependency-ready Level 2 paths | Partial | Cross-domain composition beyond strict grammars |
| B2-03 | Select among alternative paths using applicability, progress, information, cost, error and reuse | Partial | Measured unseen benefit over conservative policy |
| B2-04 | Execute Level 1 exact arithmetic and bounded Boolean operations with independent checks | Implemented in narrow domains | Wider mathematical and logical coverage |
| B2-05 | Detect two explicit contradictory claims by checked direct comparison and assignment enumeration | Partial | Natural paraphrases, quantified logic and independent external suite |
| B2-06 | Locate a JavaScript delimiter mismatch with two scans, without running untrusted code | Partial | Full syntax parser and executable behavioral tests |
| B2-07 | Keep source claims, model hypotheses, tool results, verified components and assumptions separate | Partial | Audit all operations/serialization paths |
| B2-08 | Preserve verified components and repair only a residual | Partial | Real successful Falcon-led repair with independent result check |
| B2-09 | Rotate after path failure, contract on verified work, brake on no progress | Partial | More than one narrow controlled-fault family and explicit state-machine proof |
| B2-10 | Persist checked calibration and change later operation choice without leakage or auto-promotion | Partial | Browser-reload and unseen quality/cost gain for new cross-domain paths |
| B2-11 | Compose general Level 3 Magnetic routes over Level 1/2/Falcon/reuse/verification | Experimental | Independent path-quality gain and resource guard |
| B2-12 | Treat unsupported interpretation and unverified prose honestly | Implemented for checked paths | Adversarial and mixed-claim audit |

## 5. Intermediate representation contract

A B2 problem state records `intent`, source-quoted `facts` with offsets and provenance, `requiredUnknowns`, `constraints`, `dependencies`, `candidateOperations`, `availableKnowledge`, `missingKnowledge`, `verification` requirements, `verifiedFacts`, `residuals`, visited directions and compute budget. Graph edges indicate stated input, prerequisite, proposed operation or verified derivation. A user statement is `assumed_input`; it is not an externally verified fact. A model hypothesis is provisional. A tool result becomes a checked fact only after an applicable independent verifier. A checked code delimiter edit is a component, not proof of program behavior. See `docs/Schema.md` for physical IndexedDB V3 mapping and `app/js/b2-direction.mjs` for the current schema-v2 in-message graph.

## 6. Execution and safety contract

1. Parse a bounded request and construct problem state before the first Falcon call.
2. Generate only operations whose source-grounded preconditions hold. Unrecognized input follows a provisional Falcon route.
3. Score eligible paths, record every candidate and the selected path, and execute within a bounded budget.
4. Independently check each supported result; retain verified intermediate nodes and isolate failed/residual nodes.
5. Try another feasible unvisited path after failure. Stop when verified completion, no productive path or budget exhaustion occurs.
6. A Falcon repair request names only the residual and preserves checked components. A proposed code patch must preserve all existing characters except one inserted expected delimiter. Failed proposals remain in the trace.
7. A full answer may be labelled `verified` only when all required claims have independent checks. No model-generated tool call can execute arbitrary code or shell commands.

## 7. Evaluation and release gates

Compare Falcon-alone and Falcon+B2 with identical verified weights, inference settings, hardware and counterbalanced order. Freeze an unseen set before evaluation, do not feed its labels into calibration, use independent checkers for exact/executable outcomes, and blind human graders for planning/conversation. Record accuracy, false verification, repair success, model and tool calls, tokens, latency, peak RAM and route decisions. Attribute deterministic operation gains to the system rather than to intrinsic Falcon accuracy. Preserve every failed experiment and the prior frozen 31-case fixture. The present cross-domain development fixture is locally authored and does not satisfy the independent general-improvement gate. Physical-phone acceptance and a successful Falcon-led full repair remain open.

The 2026-11-01 six-case browser A/B engineering probe used the same one Falcon Worker, verified weights, prompt builder, 0.2 temperature, 128-token cap and AB/BA order. Corrected v2 objective math/logic scoring was 1/3 Falcon-alone and 3/3 B2; code, planning and conversation were left for human review. The v1 and first v2 scorer errors are retained as negative evidence. This small locally authored result is not a general-release claim.

## 8. Reproduction and change control

Run `npm test`, `npm run test:browser`, `node tools/browser_offline_smoke.mjs`, `npm run build:web` and focused scripts listed in `CHECKPOINT_LOG.md`. Advance service-worker cache versions when adding browser modules. Keep private model bytes out of Git. A material spec conflict requires a decision record under `AGENTS.md`; this SRS adopts the existing ADRs and does not create a new architectural decision. No policy is auto-promoted from self-calibration or developer-only shadow trials.


### 2026-11-03 — CP024 local browser/source hardening

CP024 local experiment is now browser-invocable (`?b2_chain=1`) with offline shell coverage and source-coordinate verification. Default V1 and one-model runtime remain the baseline. This narrow formal-logic experiment does not close broad semantic understanding, model-led repair, calibration benefit or independent P4 acceptance.


## Full V2 scope authority — 2026-11-04

This concise V1/development SRS remains historical and implementation-scoped. [Consolidated master SRS §§9–18](SRS.md#9-restored-v2-master-scope-and-precedence-2026-11-04) restores the complete Seren 7 = MRS research architecture, including simulator workshop, GraphOS/R1, three calculator levels, Compass/MGB/joints, Flow/virtual computation/V-FLOPS, dual hardware, TinyLinux, retrieval, Cortex and TRM. [Coverage matrix](Seren7_V2_Recovery_Coverage.md) distinguishes local `c41da5b` + CP024 from recovered external prototypes and unverified capabilities. Existing narrow receipts are preserved; no broad reasoning acceptance or runtime change is implied.
