# PRD — Seren 7 Local Four-Falcon AI

**Document:** PRD.md · **Version:** 1.1 Web-only · **Status:** approved scope draft; partial implementation, release unverified · **Date:** 2026-10-26. Current checkpoint evidence: `CHECKPOINT_LOG.md`.

## 1. Product summary

Seren 7 is a private, low-resource, offline-capable **browser-based AI chat web application (like ChatGPT)** built from the user-supplied `Seren 7(1).html` interface. Its local intelligence is a **four-specialist Falcon-H1-Tiny 90M system** coordinated by a measured B2 Magnetic Compass, B2 Spiral, calculator contracts, and local R1/.ASIF-style shared-state memory. It must continue to function when all external networking is disabled after local asset provisioning. The initial deliverable is a working, honest browser chatbot; higher-order self-calibration is released only through separately verified checkpoints.

### Problem

Current HTML is an attractive demonstration, not a standalone model runtime: it defines Seren/Swift/Muse presentation modes, hardcoded suggestions and sidebar agents, in-memory turns, and optional `claude.use('sample')` live generation. It does not prove local Falcon inference, persistent state, or actual B2 routing. The product must make the demonstrated interactions real without discarding the existing design.

### Value proposition

- Conversation stays on device; no cloud AI cost or inference dependency.
- A conversational default with focused reasoning, code, and tool specialists.
- Task-aware routing with transparent fallback and optional explanatory trace.
- Fast, budget-aware inference; selective reuse of verified calculations and state.
- Honest status for model availability, offline readiness, confidence, and limitations.

## 2. Users and supported platforms

1. **Everyday user:** wants fast, simple, privacy-preserving text conversation.
2. **Student/developer:** wants coding explanations, deterministic math, reasoning, and permitted local tools.
3. **Research/power user:** wants to inspect Compass route, specialist outcomes, verification and resource metrics.

Target **web browsers** on Windows, macOS, Linux and mobile devices. Prioritize mainstream desktop Chromium browsers, then progressively enhance other browsers after capability tests. Responsive mobile web UX is required, but older Android and Safari must show honest unsupported-runtime messages if WebGPU/WASM kernels cannot run. **Do not build or distribute a native application, APK, iOS build, Electron/Tauri package, desktop executable, native wrapper or required PWA installer in V1.** The website may use a local dev server (`localhost`) or static HTTPS hosting. Hosting only serves the page and preapproved assets; inference, private history, routing and tools execute in the visitor's browser with no remote backend.

## 3. Model roster (exclusive)

| Model ID | Variant | Proposed initial responsibility | Proof required |
|---|---|---|---|
| `falcon_instruct` | Falcon-H1-Tiny-90M-Instruct | Default text dialogue and final presentation | Multiturn conversation, format, hallucination, latency |
| `falcon_reason` | Falcon-H1-Tiny-R-90M | Multi-step reasoning, decomposition and B2 Spiral proposals | Held-out logic/math, calibration, residual handling |
| `falcon_coder` | Falcon-H1-Tiny-Coder-90M | Programming questions and code drafting | Syntax, unit tests, explanations, refusal/abstention |
| `falcon_tools` | Falcon-H1-Tiny-Tool-Calling-90M | Structured selection of allowlisted local tools | JSON/schema validity, correct tool selection, no unsafe action |

Names suggest roles but do not substitute for measured competence. Compass profiles are initially conservative and may prefer Instruct plus deterministic calculator. Model outputs are untrusted until they pass the task's verification policy.

**Excluded:** LN/SmolLM2 135M, Qwen of any size, any online LLM, hidden remote fallback, external agent SaaS, or unapproved auto-fine-tuning. Do not add these to examples as a latent fallback.

## 4. Product modes

- **Chat (default):** respond in conversational style using Instruct or a calibrated route.
- **Think Deeper:** allocate higher reasoning budget, optionally use R specialist, deterministic calculators, intermediate verifier and abstention. This is not a promise of hidden perfect reasoning.
- **Code:** Coder candidate with syntax/test verification and Instruct presentation where useful.
- **Tools:** Tool-Calling proposes operations from a restricted local registry; user approval for file/system mutations.
- **Auto:** Compass chooses based on task class, confidence, expected quality, resource cost, prior verified outcomes and available device features.
- **Advanced Inspector:** optional view of real route, model, calculator, verification and memory reuse; never show invented activity or raw private chain-of-thought.

Original UI labels `Seren 7`, `Seren 7 Swift`, `Seren 7 Muse` are **presentation presets**, not proof of independent neural models. A product design decision must map them explicitly to a genuine route or relabel them as styles. Never claim that Muse is one of the four Drive models; the user's term Muse as a coding agent/provider is separate.

## 5. Functional requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FR-01 | Import or provision verified four-model package locally | Model inventory, hash receipt, valid config/tokenizers, clear errors |
| FR-02 | Stream real on-device Instruct responses | No `claude.use('sample')` or remote inference network request |
| FR-03 | Create, rename, search, delete and resume threads | Browser IndexedDB persistence survives refresh, tab/browser restart and interrupted stream |
| FR-04 | Support stop, regenerate, copy and safe speech readback if available | Cancellation stops backend generation, not only UI animation |
| FR-05 | Auto/explicit specialist routing | Real model ID shown in diagnostics; routes logged locally |
| FR-06 | Use calculator and local tool registry | Typed inputs/outputs, allowlisting, timeout, verification, permissions |
| FR-07 | Maintain model competence profiles | Task family, sample count, measured score, calibration and freshness |
| FR-08 | B2 Spiral hypothesis and correction cycle | Versioned run, independent verifier, fallback, bounded budgets |
| FR-09 | Identify exact/equivalent reusable shared states | Collision-safe identity plus explicit equivalence proof/guard |
| FR-10 | Recalibrate Compass and magnetic joints safely | Shadow test, holdout improvement, rollback and evidence receipt |
| FR-11 | Expose runtime status honestly | Active model, compute path, load state, offline readiness, errors |
| FR-12 | Work disconnected after provisioning | Automated blocked-network end-to-end acceptance test |
| FR-13 | Export and erase all local user data | Export/import and secure-enough product deletion flow |
| FR-14 | Preserve Seren visual/interaction identity | Screenshot and usability regression on desktop/mobile |

## 6. Non-functional constraints

- **NFR-01 Privacy:** no chat, trace, memory, or weights uploaded by runtime; no remote telemetry by default.
- **NFR-02 Compatibility:** capability-detect browser GPU, WebAssembly/SIMD, worker and browser storage quota; fallback or clearly block. No native bridge.
- **NFR-03 Memory:** investigate <=500 MiB peak on constrained target, one active specialist by default. Report hard limits with exact device and quantization; don't claim a universal figure.
- **NFR-04 Latency:** measure cold model load, first token, tokens/sec, p50/p95; set pass thresholds only after device baseline.
- **NFR-05 Correctness:** mathematical/structured outcomes independently verified; unsupported factual claims may abstain.
- **NFR-06 Reliability:** crash-safe session writes; cancellation, interrupted model loading, corrupted file handling, rollback.
- **NFR-07 Access:** mobile safe areas, keyboard navigation, reduced motion, contrast and semantic status alerts.
- **NFR-08 Portability:** agent-neutral Markdown instructions and reproducible local build/test commands.
- **NFR-09 Security:** model-generated tool proposals cannot execute unapproved arbitrary commands or file changes.

## 7. Success definitions

### MVP (must-have)

Existing UI + one real local Falcon Instruct generation path + streaming + stop/regenerate + persisted chat + offline restart + measurable runtime receipt. Not enough to display sample text. Any missing model must be shown as unavailable, not silently simulated.

### Four-specialist release

All four models individually verified and callable **inside a supported browser**; Auto Compass chooses among available roles with a competence map; tool calls require a restricted schema; memory and history persist; runtime remains offline; at least one desktop browser and one mobile browser are tested (mobile unsupported cases are reported, not concealed).

### Research release

B2 Spiral, shared-state detector and Magnetic Joint Table improve held-out verified outcomes versus static routing **without** uncontrolled resource use, invalid state merges, or unexplained regression. This is an experimental gate, not an MVP promise.

## 8. Non-goals for first release

No APK, native Android/iOS or desktop application, mandatory PWA installation, native inference service/daemon, cloud sync, hosted AI, external browsing/retrieval, autonomous unrestricted filesystem agents, model self-training, 3D reasoning visualization, paid accounts, multi-user server, or claims of Qwen-level quality. The existing animated orb is a UI asset, not a physical GPU/compute accelerator.

## 9. Dependencies, risks and open decisions

1. Are all eight archive parts complete, hash-correct and legally redistributable? Binary proof pending.
2. Does Falcon-H1's hybrid Transformer–Mamba execution work **entirely inside the browser** through WebGPU/WASM or a browser-compatible B2CCP port? Compatibility pending; native-only execution is out of scope.
3. Can a mobile target meet memory and thermal limits with sequential loading? Measure, don't predict.
4. Can a static/HTTPS-served web page load verified models into OPFS/IndexedDB, survive browser refresh and run with networking disabled after provisioning? Browser acceptance gate; no installation flow required.
5. Are the originally intended Seren presentation labels preserved or renamed? UI product decision, not model identity.

Document owner: project engineering team. Any scope expansion requires explicit user/boss direction and updated acceptance tests.
