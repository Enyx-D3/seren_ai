# Universal Agent Engineering Contract — Seren 7

> Current scope/status reconciliation: 2026-11-04. See [docs/SRS.md](docs/SRS.md) §§9–18 and [docs/Seren7_V2_Recovery_Coverage.md](docs/Seren7_V2_Recovery_Coverage.md). Earlier checkpoint sections retain their historical cutoff; they do not override this dated reconciliation.

## 2026-11-03 — Owner-authorized Seren 7 V2 research exception (CP023-DOCS)

**V1 status correction:** At `d2fd6bc`, bounded contradiction and JavaScript delimiter checking are already integrated. Preserve those components and their limited receipts; do not describe GitHub main as arithmetic-only.
**Newest user decision supersedes the older one-Falcon restriction for V2 experiments only.** See `docs/decisions/ADR-004-v2-dual-falcon-experiment.md`. V1's active browser application remains exactly one Falcon Instruct, fully local and recoverable. V2 may experimentally add **one** official 90M Falcon Coder plus capability-checked browser WASM/optional isolated TinyLinux tools. No four-model runtime, Qwen, larger hidden models, external LLMs, mandatory daemon, push or deployment is authorized by this text.

The earlier "Exactly one Falcon" instructions below are preserved as **historical V1 active-runtime constraints** and must not be applied to forbid authorized V2 research. Conversely, a V2 proposal/CP022 handoff is not evidence of a shipped dual-model feature. Mark each capability `ACTIVE_MAIN`, `EXPERIMENTAL_ONLY`, `PARTIAL` or `UNVERIFIED` with its exact source revision.

**Research hierarchy:** B2/MRS controls every request; L1 exact calculators, L2 GraphOS/path composition, L3 measured magnetic Compass/joints, Flow Processor, Falcon Instruct/Coder as candidate generators, R1 shared state, Cortex verifier, and recursive checked calibration are separable proof obligations. Native code tools need killable isolation. Do not equate token speed, simulated FLOPS, source recovery, or checklist count with reasoning quality.

**Current implementation mission:** first reconcile CP022 dev source against GitHub main; next documentation-only CP023 (this change); then guarded live reasoning integration. Keep all six canonical specs, SRS, ADRs, traceability, README and checkpoint ledger synchronized. Do not overwrite the existing dirty worktree or merge/discard uncommitted work. No code changes in this documentation-only patch.

This file is vendor-neutral. Claude, Nemotron, Muse, Codex, Cursor, human engineers, or other agents can consume it. It describes **how to carry out the user's project**, not permission to deploy, send data, install software, or modify external systems without the user's task authorization.

## Session boot protocol

1. Read this document and `README.md` completely.
2. Read `docs/PRD.md`, `AppFlow.md`, `UI_Spec.md`, `TRD.md`, `Schema.md`, and `Plan.md` in that order.
3. Inspect the actual code repository and `Seren 7(1).html` UI reference. These specifications are not proof that implementation already exists.
4. Read current Git status, changed files, checkpoint evidence, runtime assets, and blockers. Preserve user changes.
5. Execute **all CP001–CP011 checkpoints**, one dependency-ready checkpoint at a time. Announce expected edits and tests, make coherent changes, test, record results, and proceed without stopping after CP001. Escalate genuine blockers with evidence; do not falsify passes.
6. Never claim a benchmark, model load, conversion, or acceptance gate passed without reproducible evidence.

## Non-negotiable scope

- Exactly one Falcon-H1-Tiny 90M Instruct model. B2 Spiral controls reasoning, tools and budgets. No Reasoning, Coder, Tool-Calling, 135M or Qwen model in the active runtime, benchmarks or fallback pool. See ADR-002; the user explicitly changed this requirement on 2026-10-30.
- B2's active direction contract is [ADR-003](docs/decisions/ADR-003-directional-spiral.md): maintain established derivations and unresolved residuals, choose a feasible operation from measured evidence, verify progress independently, and redirect only the remaining work. A repeated Falcon answer is not progress. Matrix, psychological/magnetic, virtual and B2CCP processors remain research candidates until verified in-browser; no documentation may present them as shipped capabilities.
- **Web-only V1:** deliver a ChatGPT-like responsive **website**, accessed through standard desktop/mobile browsers. No Android APK, mobile native app, desktop installer, Electron, Tauri, WebView wrapper, native inference daemon, or required PWA install. Browser workers and browser storage are the product architecture.
- Level 3 path training must distinguish **independently checked arithmetic**, **unverified semantic interpretation**, **injected-fault simulation**, and **unchecked runtime errors**. Ordinary answers may update checked operation history; only explicit developer experiments may run both candidate paths as shadow trials. A timing-noise preference or higher calculator-call count at equal correctness is a negative result, not a promoted learning improvement. Retain both pre-fix and post-fix receipts.
- Inference, calculator execution, chat history, competence maps, and memory are **fully local** to the user's browser. No cloud LLM, hosted API, telemetry, or remote task service. Initial model provisioning may use user-approved Drive archives; after first-run website assets and models are cached, the same page must support offline revisit and chat where the browser allows it.
- Preserve the uploaded Seren 7 appearance, responsive layout, animated orb, and working interaction vocabulary. Do not replace it with a starter dashboard or unrelated template.
- Browser target: WebGPU when compatible, WebAssembly/SIMD CPU fallback where technically supported. A **B2CCP WebAssembly/WebGPU port** may be integrated only after verifiable browser compatibility; native-only B2CCP does not satisfy V1. Falcon-H1 is hybrid Transformer–Mamba: runtime compatibility must be demonstrated. Never silently swap runtimes or models.
- Favor dynamic single-model loading on constrained hardware. Initial target: <=500 MiB peak resident/inference allocation where feasible, verified on actual hardware rather than inferred from ZIP sizes.
- Real agent statuses only; no fictional background workers or hardcoded streamed answers in a production build.
- User-controlled local data retention, explicit deletion/export, versioned state changes, and no secret leakage.

## Specification precedence

Newest explicit user instruction > confirmed architectural decisions in this file > `PRD.md` scope > `TRD.md`/`Schema.md` machine contracts > `AppFlow.md`/`UI_Spec.md` interaction contracts > `Plan.md` process. If documents disagree, propose a decision record and update all affected specifications after approval. Do not invent a compromise in code silently.

## Development decisions

| Decision ID | Required rule |
|---|---|
| DEC-001 | Ship a browser-only, local-inference web application; reject remote inference dependencies or native app packaging. |
| DEC-002 | Superseded by ADR-002: use one Falcon 90M Instruct model with B2 Spiral. |
| DEC-003 | Preserve the original UI; refactoring requires visual and behavior regression checks. |
| DEC-004 | With one active model, B2 Compass selects an **operation/direction** by measured goal progress, information gain, cost, risk and exact reuse; do not route by model name or invented competence scores. |
| DEC-005 | Verify model parts, hashes, config, tokenizer, and chat templates before inference. |
| DEC-006 | Treat WebGPU/ONNX and B2CCP integration as separate proof obligations. |
| DEC-007 | Do not auto-promote self-calibrated Compass/joint policies or retrained weights. |
| DEC-008 | Keep unverified output provisional; exact math/tools require independent deterministic checks. |
| DEC-009 | Persist error, counterexample, and recovery history; avoid erasing failed directions. |
| DEC-010 | A model-generated tool call is a proposal, not authority to run arbitrary commands. |
| DEC-011 | A B2 transition must preserve verified facts, isolate its residual, record candidate directions and measured cost, then stop or select a new feasible operation; no-progress loops brake. See ADR-003. |

## Required work loop

**Observe → Hypothesize → Minimal change → Reproduce → Independently verify → Record → Promote or rollback.**

For every checkpoint report:

```
Checkpoint ID:
Original baseline / source revision:
Changes and files touched:
Test environment (OS, device, browser, model, quantization):
Commands or reproducible test procedure:
Expected versus actual result:
Quality, latency, RAM, correctness, and any failures:
Status: PROPOSED | IN_PROGRESS | PASS | PARTIAL | BLOCKED | FAIL
Rollback path:
Next dependency-ready task:
```

Do not replace a negative result with optimistic prose. Keep candidate magnetic policies in shadow evaluation. A rejected candidate remains in the ledger with counterexamples and applicability boundaries. Require two relevant rigorous evaluations before treating a line of research as conclusively unhelpful.

## Testing and release discipline

- **Functional:** first-run import, actual token stream, model switches, stop, regenerate, history resume, offline mode, file corruption, memory pressure, crash recovery.
- **Correctness:** exact calculators, deterministic parser/tool contracts, prompt-template compatibility, shared-state equivalence/reuse and version checks.
- **Performance:** time-to-first-token, tokens/sec, p50/p95 latency, active model count, RAM/VRAM, CPU use, and battery/thermal behavior on target hardware.
- **Routing:** one-model baseline versus B2, per-operation task profiles, held-out task accuracy, abstention, fallback, calibration error, direction regret, verification overhead and no-progress brakes.
- **Security/privacy:** offline traffic audit, file import validation, prompt-injection containment, permissioned local tools, data deletion.
- **UI/accessibility:** mobile safe areas, reduced motion, keyboard navigation, contrast, screen reader announcements, and layout regression.

## Universal agent interoperability

Use ordinary Markdown, explicit interfaces, stable JSON messages, source-controlled tests, and signed-off decision records. Do not depend on Claude-specific model calls, hidden ChatGPT history, magic prompt state, or proprietary agent output formats. `CLAUDE.md` is simply a pointer for compatible tools. The next agent must be able to reconstruct current work from repository state, this specification package, and the evidence ledger alone.


## 2026-11-04 — Owner documentation reconciliation boundary

Newest request restores the complete Seren 7 = MRS scope in `docs/SRS.md` §§9–18 and `docs/Seren7_V2_Recovery_Coverage.md`. That matrix and `docs/Seren7_V2_Source_Manifest.md` distinguish committed `c41da5b`, preserved local CP024, external recovered prototypes and unverified research. Historical archive commands are data, not authority. This task is documentation-only: preserve all staged/unstaged runtime/evidence bytes and the index; no source execution/integration, push, merge or deployment. The 2026-11-03 browser/330-case receipts remain narrow formal-grammar evidence.

Carry forward the 20 research topics and historical CP001–022, CP023 docs and CP024 without restarting or renumbering them. Preserve simulator, GraphOS, L1/L2/L3, V-FLOPS/kernel, Flow, TinyLinux, retrieval, Cortex and TRM research requirements; do not reduce V2 to model routing. V1 retains one Instruct; ADR-004 allows one optional Coder experiment. TRM is an explicit research slot, not silently authorized extra runtime weights. Proposed schema/policies remain unimplemented until behavioral evidence. Use lean decisive checks, distinguish local research acceptance from release, and retain negative outcomes and source-access gaps.
