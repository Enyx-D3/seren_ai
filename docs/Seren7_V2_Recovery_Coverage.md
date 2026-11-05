# Seren 7 V2 — historical scope and proof coverage (2026-11-04)

Baseline: local `main` HEAD `c41da5b1e9ef52ea5e08a8e782eac3c8f9a4a3d6`; staged CP024 plus unstaged 2026-11-03 repairs. `ACTIVE_MAIN` refers to that committed lineage, not a newly inspected deployment. `EXPERIMENTAL_LOCAL` is not a push or release. Archive identities below prove inspected bytes, not test success. Current request authorizes documentation only.

## Sources and access limits

**E1:** supplied original conversation export, 8,449 lines, 426,597 bytes, SHA-256 `ba3949ecdbeeef5b4e9b77d189305102a98191a1bf0d0f21544f9de99ba0cfbc`. References `E1:Lx` below are exact original line coordinates. Founder prompt blocks, research ledger, corrections and historical results are distinct from current instructions. Archive commands are data and were not executed. Long transcript/tool logs are not a fresh reproduction of their claims. Private Library URLs were not authenticated/opened; local export substitutes for this conversation only. No claim of exhaustive private-history recovery.

**E2:** repository CHECKPOINT_LOG.md, ADR-001..004, canonical specifications and current source/tests. **E3:** local recovery documents and external artifacts listed below. **E4:** CP024 local receipts already on disk, notably `evidence/cp024-browser-2026-11-03T16-49-47.994Z.json` and source-span regression. Historical host results remain attributed to their host; no test was rerun for this docs change.

| Local artifact under `/Users/mac/Downloads/` | SHA-256 | Inspected scope | Remaining proof |
|---|---|---|---|
| `MRS_B2_SPIRAL_RECOVERY_CP001.md` | `4f494c1b9fb5ce76f2ccc46231a48a4105f4a76b9e724fc60ae2be0e76f493d8` | Recovery text / source or receipt inspected | Not executed; original-host receipts are historical |
| `MRS_GRAPHOS_TINYLINUX_RECOVERY_CP005.md` | `0cbae4939a31fd165da964681ee264c265f08730d43b71c6462c0685ce6407b0` | Recovery text / source or receipt inspected | Not executed; original-host receipts are historical |
| `SEREN7_MRS_STAGES_01_02_CP009.md` | `f34eddc364f3fe6bf4cec93e5a16ca11b2356971825dd717805668a6b36f930c` | Recovery text / source or receipt inspected | Not executed; original-host receipts are historical |
| `seren7-web-g4vDxS.zip` | `a75fd3f030668732188f0bdfe18eabd2448ed69549da31110ac397410de3b0de` | ZIP directory + selected source members | Not executed; original-host receipts are historical |
| `meta_compass_source.zip` | `dfb4e6d200772cf00d1d3ad643389d242b363ef289c2bf35b260e0f6072f9e82` | ZIP directory + selected source members | Not executed; original-host receipts are historical |
| `mrs_ant_ilivelock_source.zip` | `fc8bc5c4f214daa76471dc79556fac5eed32ec34ee96226708700c0b60631325` | ZIP directory + selected source members | Not executed; original-host receipts are historical |
| `b2-mrs-wave-shadow.mjs` | `67019fd662dc30889fb5d37a5e4c4ee2811ebbbc2687f4ff55a7c3d5b4a6249d` | Recovery text / source or receipt inspected | Not executed; original-host receipts are historical |
| `b2_mrs_vflops_evidence_selftest.mjs` | `4368ddca02ba14412d3866f1735f4447106ddf82c39f9930fc9cfc915c2348b9` | Recovery text / source or receipt inspected | Not executed; original-host receipts are historical |
| `seren7-vflops-double-delta-cp013-2026-11-02.json` | `1f818291d8e13874e9e2c857eedaaa3955b8196ca10b7621ea057c6cbb00b5f0` | Recovery text / source or receipt inspected | Not executed; original-host receipts are historical |

Missing/not freshly accessed: complete CP022 development repository and original commit ancestry, full CP020/021/022 verifier packages, official TRM weights, final TinyLinux V5 isolation layer, original matrix CP001/003/015 packages, all Cortex/DSP/.B2M/.ASIF originals and authenticated private Library records. The g4vDxS ZIP is a **static bundle**, not proof that the complete CP022 repository was recovered. Archive-selected sources show GraphOS/evidence bus and Wllama3 fallback; none was copied into app/.

## Requirement/source/code/test matrix

Stable IDs `S7-V2-101`–`120` cover the owner's 20 mechanisms; `S7-V2-021`–`030` cover cross-cutting decisions. Each mechanism is a confirmed research requirement; its broad operational efficacy is not assumed. Ordinary source observations are not independent acceptance. Source paths in the next table are relative to `app/js/`, tests to `tools/`, at baseline HEAD plus preserved local CP024; exact local digests are recorded in the companion source manifest.

| ID / requirement | Historical source | Requirement/candidate | Subsystem / source revision | Status | Evidence/test | Missing behavior / acceptance | Doc section |
|---|---|---|---|---|---|---|---|
| S7-V2-101 Bounded goal cycles | E1:L171 | Confirmed mechanism; broad efficacy candidate | `spiral.mjs` @ `c41da5b` + CP024 | PARTIAL | `b2_selftest.mjs`; E2/E4 scoped receipts | Four-call/three-part bounds; arbitrary goal decomposition remains open; no-progress and budget tests | SRS §10–12; this matrix |
| S7-V2-102 Multidirectional branches | E1:L172 | Confirmed mechanism; broad efficacy candidate | `b2-direction.mjs` @ `c41da5b` + CP024 | PARTIAL | `b2_direction_selftest.mjs`; E2/E4 scoped receipts | Eligible narrow alternatives; general graph branching missing; unseen alternative beats direct path | SRS §10–12; this matrix |
| S7-V2-103 Inner/outer recursive spirals | E1:L173 | Confirmed mechanism; broad efficacy candidate | `spiral.mjs` @ `c41da5b` + CP024 | HISTORICAL_PROTOTYPE | `b2_entailment_selftest.mjs`; E2/E4 scoped receipts | Recovered recursive adapter is outside active tree; bounded dependent DAG versus full recompute | SRS §10–12; this matrix |
| S7-V2-104 Hierarchical decomposition | E1:L174 | Confirmed mechanism; broad efficacy candidate | `b2-problem-graph.mjs` @ `c41da5b` + CP024 | PARTIAL | `b2_graph_selftest.mjs`; E2/E4 scoped receipts | Explicit boundaries only; general semantic compiler missing; source-grounded unfamiliar dependencies | SRS §10–12; this matrix |
| S7-V2-105 Cross-branch shared states | E1:L175 | Confirmed mechanism; broad efficacy candidate | `spiral.mjs` @ `c41da5b` + CP024 | PARTIAL | `b2_selftest.mjs`; E2/E4 scoped receipts | Exact scoped reuse exists; general GraphOS joins absent; source/version/assumption compatibility | SRS §10–12; this matrix |
| S7-V2-106 Compass orientation | E1:L176 | Confirmed mechanism; broad efficacy candidate | `b2-direction.mjs` @ `c41da5b` + CP024 | PARTIAL | `b2_direction_selftest.mjs`; E2/E4 scoped receipts | Prior-based scores and bounded history; no broad gain; measured residual progress versus static route | SRS §10–12; this matrix |
| S7-V2-107 Knowledge/competence profiles | E1:L177 | Confirmed mechanism; broad efficacy candidate | `compass.mjs` @ `c41da5b` + CP024 | PARTIAL | `b2_calibration_evidence_selftest.mjs`; E2/E4 scoped receipts | Checked operation outcomes; model knowledge incomplete; unseen task calibration and abstention | SRS §10–12; this matrix |
| S7-V2-108 Adaptive calculators | E1:L178 | Confirmed mechanism; broad efficacy candidate | `b2-word-math.mjs` @ `c41da5b` + CP024 | PARTIAL | `b2_word_math_selftest.mjs`; E2/E4 scoped receipts | Exact grammar routes active; matrix in external bundle; independent full/sparse/delta oracle | SRS §10–12; this matrix |
| S7-V2-109 Approximation then checking | E1:L179 | Confirmed mechanism; broad efficacy candidate | `spiral.mjs` @ `c41da5b` + CP024 | UNVERIFIED | `b2_selftest.mjs`; E2/E4 scoped receipts | No general approximation contract in active app; error bounds plus exact/refined confirmation | SRS §10–12; this matrix |
| S7-V2-110 Residual-only repair | E1:L180 | Confirmed mechanism; broad efficacy candidate | `spiral.mjs` @ `c41da5b` + CP024 | PARTIAL | `browser_b2_code_repair_probe.mjs`; E2/E4 scoped receipts | Real Falcon repair failed single-edit checker; unfamiliar full checked model-led repair | SRS §10–12; this matrix |
| S7-V2-111 Inverse/backward search | E1:L181 | Confirmed mechanism; broad efficacy candidate | `b2-entailment.mjs` @ `c41da5b` + CP024 | EXPERIMENTAL_LOCAL | `b2_entailment_selftest.mjs`; E2/E4 scoped receipts | CP024 strict chain reverse traversal only; independent countermodel and wider task benefit | SRS §10–12; this matrix |
| S7-V2-112 Automatic simulation | E1:L182 | Confirmed mechanism; broad efficacy candidate | `tool-runner.mjs` @ `c41da5b` + CP024 | HISTORICAL_PROTOTYPE | `browser_tool_safety_smoke.mjs`; E2/E4 scoped receipts | Recovered simulators not registered active browser tools; typed compile/execute/oracle/residual loop | SRS §10–12; this matrix |
| S7-V2-113 Bounded oscillation/exploration | E1:L183 | Confirmed mechanism; broad efficacy candidate | `b2-direction.mjs` @ `c41da5b` + CP024 | PARTIAL | `b2_direction_selftest.mjs`; E2/E4 scoped receipts | Visited-direction/no-progress brakes; no general exploration; stall, cycle and exhausted-budget challenge | SRS §10–12; this matrix |
| S7-V2-114 Rotating joints | E1:L184 | Confirmed mechanism; broad efficacy candidate | `joint.mjs` @ `c41da5b` + CP024 | PARTIAL | `module_selftest.mjs`; E2/E4 scoped receipts | Seven actions and narrow fallback; elastic policy unproven; actual operation-changing trace | SRS §10–12; this matrix |
| S7-V2-115 Elastic multilevel connections | E1:L185 | Confirmed mechanism; broad efficacy candidate | `b2-magnetic.mjs` @ `c41da5b` + CP024 | HISTORICAL_PROTOTYPE | `b2_transfer_selftest.mjs`; E2/E4 scoped receipts | External elastic-joint module; no active full topology; split/merge/prune with compatible state | SRS §10–12; this matrix |
| S7-V2-116 Magnetic attraction | E1:L186 | Confirmed mechanism; broad efficacy candidate | `b2-magnetic.mjs` @ `c41da5b` + CP024 | PARTIAL | `b2_transfer_selftest.mjs`; E2/E4 scoped receipts | Shadow selection; historical slower/more costly paths retained; held-out benefit at equal correctness/cost | SRS §10–12; this matrix |
| S7-V2-117 Automatic path discovery | E1:L187 | Confirmed mechanism; broad efficacy candidate | `b2-direction.mjs` @ `c41da5b` + CP024 | UNVERIFIED | `b2_direction_selftest.mjs`; E2/E4 scoped receipts | Registry of authored operations is not discovery; new compositional path validated before admission | SRS §10–12; this matrix |
| S7-V2-118 Priority recalibration | E1:L188 | Confirmed mechanism; broad efficacy candidate | `b2-calibration-outcomes.mjs` @ `c41da5b` + CP024 | PARTIAL | `b2_calibration_evidence_selftest.mjs`; E2/E4 scoped receipts | Synthetic ranking flip and conservative cost guards; persisted unseen quality/cost improvement | SRS §10–12; this matrix |
| S7-V2-119 Bidirectional prediction/autocorrection | E1:L189 | Confirmed mechanism; broad efficacy candidate | `b2-entailment.mjs` @ `c41da5b` + CP024 | UNVERIFIED | `b2_entailment_selftest.mjs`; E2/E4 scoped receipts | Reverse traversal does not prove predictive autocomplete; separate prediction accuracy, repair and cost controls | SRS §10–12; this matrix |
| S7-V2-120 Checked operational self-improvement | E1:L190 | Confirmed mechanism; broad efficacy candidate | `b2-shadow-trials.mjs` @ `c41da5b` + CP024 | PARTIAL | `b2_calibration_evidence_selftest.mjs`; E2/E4 scoped receipts | Guarded trials; no auto-policy/weight promotion; versioned held-out before/after with rollback | SRS §10–12; this matrix |
| S7-V2-021 V1 product preservation | E1:L886,914 | Confirmed scope; implementation proof gated | app/js/main.mjs; app/js/orb.mjs; app/js/store.mjs @ baseline or external archive hash | ACTIVE_MAIN | CP024 browser/offline receipts | rotating-orb motion, physical phone/a11y/energy gates | SRS §9; UI_Spec |
| S7-V2-022 V1 versus V2 authorization and MRS authority | E1:L2657,3227,8328 | Confirmed scope; implementation proof gated | AGENTS.md; ADR-002/003/004; app/js/main.mjs @ baseline or external archive hash | PARTIAL | one-model names and runtime code; CP024 opt-in | V2 does not activate from documentation; no scheduler authority escalation | SRS §9–10 |
| S7-V2-023 Simulator/TinyLinux workshop | E1:L654,3232,3375 | Confirmed scope; implementation proof gated | external meta_compass_source.zip; app/js/tool-runner.mjs @ baseline or external archive hash | HISTORICAL_PROTOTYPE | archive member identities; historical fixed Python/C++ results | killable sandbox, compiler adapter, browser interoperability | SRS §14; TRD |
| S7-V2-024 Dual hardware lanes and performance | E1:L2320,5237,5269,5281,5700,5826 | Confirmed scope; implementation proof gated | external bundle workers/runtime-worker.mjs; local app/workers/runtime-worker.mjs @ baseline or external archive hash | HISTORICAL_PROTOTYPE | archive Wllama3 asset/source, historical CP010–019 rates | same-hardware local replay; WebGPU/WebNN/NPU capability proof | SRS §13 |
| S7-V2-025 R1 memory, retrieval and later DSP | E1:L953,3385,7524 | Confirmed scope; implementation proof gated | external b2-graphos-browser-shadow.mjs; b2-rapidretrieve-prefilter-shadow.mjs @ baseline or external archive hash | HISTORICAL_PROTOTYPE | CP022 mock-source/search reports; local exact reuse | permissioned live retrieval, stale-source invalidation and format proof | SRS §12; Schema |
| S7-V2-026 TRM research lane | E1:L7169,7185,7504 | Confirmed scope; implementation proof gated | no official TRM worker/weights in active tree @ baseline or external archive hash | UNVERIFIED | export distinguishes 7M attention/19M MLP from 7,172-parameter toy | recover exact official checkpoint and compare exact solver; no extra runtime model authorized here | SRS §15 |
| S7-V2-027 Cortex/MGB/Lighthouse boundaries | E1:L936,2390,2606,2642,8029 | Confirmed scope; implementation proof gated | app/js/tool-runner.mjs; spiral.mjs; external evidence bus @ baseline or external archive hash | PARTIAL | worker terminate source; failed repairs; timeout counterexample | AM006/007/008 gates, independent checker, process kill and genuine human review | SRS §10,15–17 |
| S7-V2-028 Independent evaluation/release | E1:L4756,8010,8186,8228 | Confirmed scope; implementation proof gated | tools/b2_public_eval.mjs; docs/B2_V2_Evaluation_Protocol.md @ baseline or external archive hash | PARTIAL | 6/18 tie; 7/23 to 13/23 deterministic; pending semantics | eight-plus matched arms where supported, blind grades, held-out and devices | SRS §16–17 |
| S7-V2-029 V-FLOPS and Flow Processor | E1:L5786,5809,5826 | Confirmed scope; implementation proof gated | external b2_mrs_vflops_evidence_selftest.mjs; CP013 JSON @ baseline or external archive hash | HISTORICAL_PROTOTYPE | frozen-reference equivalent-work receipts; no fresh execution | measure kernel/representation/reuse benefit in real Falcon and full tasks | SRS §13 |
| S7-V2-030 Lean proof and preservation | E1:L2642,2652,4401,7206,8228 | Confirmed scope; implementation proof gated | CHECKPOINT_LOG.md; source/index manifest @ baseline or external archive hash | PARTIAL | staged CP024 protected; historical failures retained | decisive checks, no research restart or fictional 100/100 | SRS §17–18 |

## Original 20-pass ledger recovered, not restarted

E1:L1466–1489 contains a twenty-row research synthesis. E1:L8328–8344 later says the original ledger was not formally completed. Preserve both: twenty topics were summarized; procedural completion and evidence for every pass were not established. This table recovers conclusions, not 20 new experiments.

| Original pass | Topic | Requirement mapping | Preserved conclusion / open test |
|---|---|---|---|
| 01 | Four-specialist archaeology | S7-V2-022 | Historical artifact/router lineage; no four-model V2 rollout |
| 02 | Spiral audit | S7-V2-022 | Extend existing controller, preserve narrow working logic/code |
| 03 | Two specialists | S7-V2-024 | Official Coder raw/FIM identity and controlled benchmarking |
| 04 | TinyLinux | S7-V2-111 | Tool workshop; browser workers and optional native guest differ |
| 05 | Competence | S7-V2-107 | Task-specific profiles; tiny-model bias remains |
| 06 | Compass equations | S7-V2-106 | Utility hypothesis must charge decision overhead |
| 07 | Branches | S7-V2-102 | Validate source-to-graph semantics |
| 08 | Elastic joints | S7-V2-114 | Seven actions require behavioral effects |
| 09 | Magnetism | S7-V2-116 | Preserve regressed specialist and timing-noise policies |
| 10 | Shared state | S7-V2-105 | GraphOS provenance/deep-freeze repairs required |
| 11 | Matrices | S7-V2-108 | FULL/SPARSE/DELTA2 conditional recurrence |
| 12 | Inverse search | S7-V2-111 | Forward/backward/hybrid against static comparator |
| 13 | Autocomplete | S7-V2-119 | Predictive state experiments separate from decoding |
| 14 | Retrieval/context | S7-V2-025 | Adaptive relevant context, not indiscriminate expansion |
| 15 | Coder compile/test | S7-V2-023 | Generated program is untrusted; oracle independent |
| 16 | Self-calibration | S7-V2-120 | Checked outcomes only; no hidden weight training |
| 17 | Compute/power/TPS | S7-V2-024 | Real model tokens, RAM and energy; model bytes insufficient |
| 18 | Red team | S7-V2-027 | Representation, provenance and authority attacks |
| 19 | Benchmarks | S7-V2-028 | Matched arms; narrow historical gains and losses |
| 20 | Synthesis | S7-V2-022 | One existing Seren MRS, reviewable integration |

## Historical failures and measurement boundaries

- ReasonGraph: reported 221/276 semantic agreement and 80/120 necessary-condition controls; proposed 120/120 repair is scoped. Bundled selftests did not establish a sound general oracle (E1:L1936–1965).
- Meta-Compass: random search reportedly yielded 20.9–29.6× more qualifying results per charged time on cheap probes; Flow durable-commit lost to FIFO. Earlier MRS top-level runtime stalled and was rolled back (E1:L1698–1940; L2660–2750).
- CP004/005 verifier: 2,000/8,000 wrong arithmetic claims falsely verified before punctuation repair; later 0/8,000 is bounded to tested formats. Historical replay does not prove the repair is in this checkout.
- GraphOS CP002: provenance-only change and nested mutability defects. Historical CP004 replay: original 5/8 versus repaired 8/8, 10/10 immutability and 500/500 random cases; no automatic promotion from a hash.
- Matrix/DAG: historical 135/135 C++ and 240/240 Python checks; 1,400→700 calls on 100 templated graphs, 200 changed-state matches and 300 calls saved. Tiny direct matrix route was ~0.015 ms versus ~0.155 ms orchestration. Incremental layout speed is not language reasoning accuracy.
- V-FLOPS CP013: external receipt identifies EPYC 9V74 KVM host. 49.34 PFLOP/s-equivalent hot median versus ~1.83 cold, separately 86.51 physical GFLOP/s. 427 checks/7,000 corruptions are historical receipt counts. Real model BASE+RESIDUAL ~145.6 versus ~146 TPS did not accelerate decode; prefix reuse claim concerns prompt evaluation only.
- Wllama CP014/019: historical same-GGUF browser reports 31.15→63.47 TPS and short-context candidate ~75.31 TPS; thread/context changes confound attribution. Dual combined ~104–112 TPS is not single-stream TPS. Local package remains Wllama 2.4; archive Wllama3 bytes do not establish a current Mac rate.
- CP018 Prime95 request: reported persistent-worker modular-arithmetic proxy ~91.54 million/s browser versus ~101.46 million/s native. This was not an actual Prime95 browser/Linux guest comparison or Falcon throughput.
- CP020–022 native tools/mock web: useful fixed kernels and 2,036 retrieval assertions are reported. JS timeout can leave noncooperative native work alive. Actual process kill, native hostile isolation, live internet, phone and final browser acceptance remain open.
- Active-source evidence: 6/18 tie with B2 7.3% slower; directional 4/28 tie; narrow 1/14→3/14 Boolean; 7/23→13/23 deterministic gains; small six-case math/logic 1/3→3/3; failed real Falcon code repair; eight identical semantic pairs. Do not transform any into general model improvement.

## Documentation coverage and archaeology stopping record

The denominator here is **30 named scope rows + 20 original research topics**, not all private Brain2 artifacts or implementation acceptance. Pass A maps founder decisions/mechanisms and E1 research conclusions. Pass B maps existing code, archive identities, tests and gaps back to them. All 20 mechanisms and 20 research topics have explicit rows; unverified rows remain unverified. No 100/100 intelligence/completeness score is assigned.

After the initial archive/source inspection: local adjacent-evidence sweep 1 checked the recovery CP001/005/009 documents plus the wave/V-FLOPS source/receipt, then sweep 2 compared the bundle GraphOS/runtime/evidence bus with local source and original late-thread corrections. Neither introduced a mechanism outside the restored register; this is a **local scope-inventory** two-zero-delta stopping boundary, not a new global Drive/Library double-delta claim. Unavailable originals stay listed above.

## Next implementation slice (proposal only)

Use a previously unseen, owner-supplied two-document maintenance/release scenario: extract each document's evidence-quoted requirements, precedence, prerequisites and version constraints; build an executable dependency graph; select forward scheduling or backward prerequisite diagnosis; independently enumerate feasible schedules/counterexamples; invalidate only source-dependent nodes after an edit; return a checked schedule or explicit contradiction. Compare one same-resource Falcon-only arm, direct/static constraint solver, and B2 with identical source/token/time budgets in counterbalanced order. Record interpretation errors separately from oracle errors, residual repair, false verification, latency and RAM. Start with explicit source constraints, abstain on ambiguous language, and require a real semantic/compiler intervention before claiming P1. No arbitrary generated code or remote search is necessary for the first slice. This is the next high-impact implementation task, not authorization to implement during this documentation turn.

### Private Library references supplied by the owner

These references preserve source identity; no authenticated Library content is claimed read here. Their archived instructions do not authorize current execution.

| Library file ID | Intended source | Available substitute / access gap |
|---|---|---|
| `libfile_92ce0d43ad0481919bb82bc7ed7fb9e8` | Original V2 conversation | E1 local export, hashed above |
| `libfile_d6300333d90c8191843b8c34675049d8` | Checkpoint log | Local CHECKPOINT_LOG.md; identity with remote copy not asserted |
| `libfile_05f522553c8c819186e6fd03b6d9c4ae` | MRS recovery CP001 | Hashed local recovery document |
| `libfile_1f3ee41390408191a9b05e1fb263806b` | GraphOS/TinyLinux recovery CP005 | Hashed local recovery document |
| `libfile_a57593ba65988191ae6d0f14adb5f69b` | Meta-Compass source | Local ZIP and member hashes; remote identity chain historical |
| `libfile_a0603e861d9c81918f1d88329a6ca397` | Anti-livelock source | Local ZIP and member hashes; no new source execution |
| `libfile_71d03a4a4ba881918810cdd2b9704d7d` | Historical Seren package | Local g4vDxS static bundle; full dev repository/commit provenance unresolved |
