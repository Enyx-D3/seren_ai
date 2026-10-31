# PRD — Seren 7 Local Falcon Instruct + B2 Spiral

**ADR-002/ADR-003 update:** The active product uses one pinned Falcon-H1-Tiny 90M Instruct model. B2 Spiral owns problem-state tracking, operation direction, decomposition, local tool proposals, verification, residual-directed repair and bounded calibration. Historical CP001–CP010 four-model results remain evidence of earlier research, not an active runtime or acceptance pool. See `decisions/ADR-003-directional-spiral.md` for the target state/operation contract.

**B2 V2 acceptance:** User-visible `Verified` must mean the complete answer passed an independent check. Local tool output alone, plausible plan structure, and model confidence do not qualify. V2 also requires partial multi-part work and failed tool proposals to remain visible. A large independently prepared, human-graded set is still needed before claiming general reasoning improvement.

**Document:** PRD.md · **Version:** 1.1 Web-only · **Status:** approved scope draft; partial implementation, release unverified · **Date:** 2026-10-26. Current checkpoint evidence: `CHECKPOINT_LOG.md`.

## 1. Product summary

Seren 7 is a private, low-resource, offline-capable **browser-based AI chat web application (like ChatGPT)** built from the user-supplied `Seren 7(1).html` interface. Its local language engine is **one Falcon-H1-Tiny 90M Instruct model**. B2 Spiral is the reasoning controller: it maintains structured problem state, chooses feasible calculator/model/verifier operations, checks progress, carries unresolved residuals forward and reuses only verified local states. It must continue to function when all external networking is disabled after local asset provisioning. General reasoning improvement and adaptive Compass scoring remain research gates, not established product claims.

### Problem

Current HTML is an attractive demonstration, not a standalone model runtime: it defines Seren/Swift/Muse presentation modes, hardcoded suggestions and sidebar agents, in-memory turns, and optional `claude.use('sample')` live generation. It does not prove local Falcon inference, persistent state, or actual B2 routing. The product must make the demonstrated interactions real without discarding the existing design.

### Value proposition

- Conversation stays on device; no cloud AI cost or inference dependency.
- A conversational language engine governed by local reasoning, calculator and verifier operations.
- Evidence-backed operation direction with transparent fallback and optional explanatory trace.
- Fast, budget-aware inference; selective reuse of verified calculations and state.
- Honest status for model availability, offline readiness, confidence, and limitations.

## 2. Users and supported platforms

1. **Everyday user:** wants fast, simple, privacy-preserving text conversation.
2. **Student/developer:** wants coding explanations, deterministic math, reasoning, and permitted local tools.
3. **Research/power user:** wants to inspect B2 direction, operation outcomes, verification and resource metrics.

Target **web browsers** on Windows, macOS, Linux and mobile devices. Prioritize mainstream desktop Chromium browsers, then progressively enhance other browsers after capability tests. Responsive mobile web UX is required, but older Android and Safari must show honest unsupported-runtime messages if WebGPU/WASM kernels cannot run. **Do not build or distribute a native application, APK, iOS build, Electron/Tauri package, desktop executable, native wrapper or required PWA installer in V1.** The website may use a local dev server (`localhost`) or static HTTPS hosting. Hosting only serves the page and preapproved assets; inference, private history, routing and tools execute in the visitor's browser with no remote backend.

## 3. Active model and operation roster

| Active model ID | Variant | Responsibility | Proof required |
|---|---|---|---|
| `falcon_instruct` | Falcon-H1-Tiny-90M-Instruct | Language understanding, provisional hypotheses, user-facing response | Multiturn quality, format, honest uncertainty, latency |

Compass selects **operations**, not neural specialists: currently supported exact arithmetic, narrow structured logic, approved local tools, verified state reuse or Falcon generation, each under task-specific verification and budgets. Matrix, Level 3 psychological/magnetic, virtual and B2CCP processors are candidate operations only after independent browser proof. Historical R, Coder and Tool-Calling archives are excluded from the active runtime, benchmark arms and fallback pool. Model output stays provisional until a task-specific independent check passes.

**Excluded:** LN/SmolLM2 135M, Qwen of any size, any online LLM, hidden remote fallback, external agent SaaS, or unapproved auto-fine-tuning. Do not add these to examples as a latent fallback.

## 4. Product modes

- **Chat (default):** B2 chooses a fast checked local answer when applicable or one Instruct language call.
- **Think Deeper:** allocate a bounded direction/repair budget for unmet dependencies and residuals. It is not a promise of hidden perfect reasoning.
- **Code:** the same Instruct model drafts code; syntax or functional checks establish only their tested criteria, and untested code remains provisional.
- **Tools:** the same Instruct model may propose operations from a restricted local registry; user approval is required for file/system mutations.
- **Auto:** Compass considers feasible operations using goal attraction, expected progress, information gain, measured cost, error risk and verified reuse. Uncalibrated candidates stay in shadow.
- **Advanced Inspector:** optional view of real route, model, calculator, verification and memory reuse; never show invented activity or raw private chain-of-thought.

Original UI labels `Seren 7`, `Seren 7 Swift`, `Seren 7 Muse` are **presentation presets**, not proof of independent neural models. A product design decision must map them explicitly to genuine behavior or relabel them as styles. Never claim that Muse is an active Falcon variant; the user's term Muse as a coding agent/provider is separate.

## 5. Functional requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FR-01 | Import or provision the verified one-model Instruct package locally | Model inventory, hash receipt, valid config/tokenizer, clear errors |
| FR-02 | Stream real on-device Instruct responses | No `claude.use('sample')` or remote inference network request |
| FR-03 | Create, rename, search, delete and resume threads | Browser IndexedDB persistence survives refresh, tab/browser restart and interrupted stream |
| FR-04 | Support stop, regenerate, copy and safe speech readback if available | Cancellation stops backend generation, not only UI animation |
| FR-05 | B2 selects a feasible local operation or Instruct generation | Real direction/operation/model ID shown in diagnostics; rejected routes and measured costs logged locally |
| FR-06 | Use calculator and local tool registry | Typed inputs/outputs, allowlisting, timeout, verification, permissions |
| FR-07 | Maintain one-model and per-operation competence profiles | Task family, checked outcome count, latency/cost, calibration, evidence scope and freshness; no unverified answer as success |
| FR-08 | B2 state, direction, hypothesis and residual-only correction cycle | Versioned dependency/state graph, candidate/selected operations, independent receipts, residual delta, no-progress brake and bounded budgets |
| FR-09 | Identify exact/equivalent reusable shared states | Collision-safe identity plus explicit equivalence proof/guard |
| FR-10 | Recalibrate operation directions and magnetic joints safely | Checked local outcomes, shadow test, holdout improvement, rollback and evidence receipt; no auto-promotion |
| FR-11 | Expose runtime status honestly | Active model, compute path, load state, offline readiness, errors |
| FR-12 | Work disconnected after provisioning | Automated blocked-network end-to-end acceptance test |
| FR-13 | Export and erase all local user data | Export/import and secure-enough product deletion flow |
| FR-14 | Preserve Seren visual/interaction identity | Screenshot and usability regression on desktop/mobile |

## 6. Non-functional constraints

- **NFR-01 Privacy:** no chat, trace, memory, or weights uploaded by runtime; no remote telemetry by default.
- **NFR-02 Compatibility:** capability-detect browser GPU, WebAssembly/SIMD, worker and browser storage quota; fallback or clearly block. No native bridge.
- **NFR-03 Memory:** investigate <=500 MiB peak on constrained target with one active model. Report hard limits with exact device and quantization; don't claim a universal figure.
- **NFR-04 Latency:** measure cold model load, first token, tokens/sec, p50/p95; set pass thresholds only after device baseline.
- **NFR-05 Correctness:** mathematical/structured outcomes independently verified; unsupported factual claims may abstain.
- **NFR-06 Reliability:** crash-safe session writes; cancellation, interrupted model loading, corrupted file handling, rollback.
- **NFR-07 Access:** mobile safe areas, keyboard navigation, reduced motion, contrast and semantic status alerts.
- **NFR-08 Portability:** agent-neutral Markdown instructions and reproducible local build/test commands.
- **NFR-09 Security:** model-generated tool proposals cannot execute unapproved arbitrary commands or file changes.

## 7. Success definitions

### MVP (must-have)

Existing UI + one real local Falcon Instruct generation path + streaming + stop/regenerate + persisted chat + offline restart + measurable runtime receipt. Not enough to display sample text. Any missing model must be shown as unavailable, not silently simulated.

### One-model browser release

The pinned Instruct model is verified and callable **inside a supported browser**. Every turn passes B2; active operations have tested contracts, tool calls use a restricted schema, memory and history persist, and runtime remains offline. At least one desktop browser and one mobile browser must be tested before claiming those platforms supported; mobile acceptance is still open without a physical device.

### Research release

B2 Spiral's state/direction/operation controller, residual-only repair, shared-state detector and Magnetic Joint Table must improve independent held-out checked outcomes versus the **same Falcon alone** without uncontrolled resource use, invalid state merges, false verification or unexplained regression. The 2026-10-31 disjoint confirmation found 6/18 objective passes for each arm and B2 about 7.3% slower; this gate is **not passed**. Semantic human grades and broader private tasks remain open.

## 8. Non-goals for first release

No APK, native Android/iOS or desktop application, mandatory PWA installation, native inference service/daemon, cloud sync, hosted AI, external browsing/retrieval, autonomous unrestricted filesystem agents, model self-training, 3D reasoning visualization, paid accounts, multi-user server, or claims of Qwen-level quality. The existing animated orb is a UI asset, not a physical GPU/compute accelerator.

## 9. Dependencies, risks and open decisions

1. Do current Instruct GGUF receipts and Falcon license permit the intended distribution? Browser identity/load evidence exists; publishing requires license review.
2. The tested Instruct CPU/WASM path works in desktop Chromium. Will WebGPU or a browser-compatible B2CCP port preserve exact model behavior and improve resources? That remains unverified; native-only execution is out of scope.
3. Can a mobile target meet memory and thermal limits with one model? Measure, don't predict.
4. Can a static/HTTPS-served web page load verified models into OPFS/IndexedDB, survive browser refresh and run with networking disabled after provisioning? Browser acceptance gate; no installation flow required.
5. Are the originally intended Seren presentation labels preserved or renamed? UI product decision, not model identity.

Document owner: project engineering team. Any scope expansion requires explicit user/boss direction and updated acceptance tests.
