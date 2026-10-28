# Seren 7 full-plan stress audit — 2026-10-28

**Source:** `40b327a` plus the preserved uncommitted CP009–CP011 working tree. **Environment:** macOS arm64 MacBook Air, Node 22.23.2, Playwright 1.64.1 bundled Chromium, localhost `127.0.0.1:8799`, four pinned Falcon-H1-Tiny 90M Q4_K_M GGUFs, CPU WebAssembly. No physical phone was available. This audit did not deploy to public HTTPS or test a real GPU adapter.

## Reproducible procedures and results

| Procedure | Observed result | Scope verdict |
|---|---|---|
| `npm run test:browser` | Exit 0: four real GGUFs emitted tokens; Stop, crash/timeout, corrupted import, offline restart, 62-message history, storage controls, mobile-size viewports, accessibility and stream stability passed. | Desktop browser regression PASS |
| `npm run test:tools` | Exit 0: local tool allowlist/denial, exact `calculator: 323`, receipt deletion, timeout recovery. | Bounded local tools PASS |
| `npm run test:joint` | Exit 0: two current held-out blocks were 4/4 exact each for the deterministic candidate versus 0/4 baseline; no page errors or external requests. Earlier mixed-model candidate remained braked. | Bounded exact-tool Joint PASS |
| `npm run test:spiral` | Exit 1: exact/reuse gate passed (synthetic net ratio 0.958, realistic 0.837), but isolated microbenchmark failed for `mixed-engineering-ratios` (reused/direct ratio 1.280; threshold <1). `node tools/browser_spiral_smoke.mjs` separately passed exact answer, reuse after send/reload, repair and deletion. The negative benchmark receipt is retained. | Correctness/reuse PASS; performance reliability PARTIAL |
| `node tools/browser_specialist_switch_stress.mjs` | 8/8 manual runs completed with the requested exact model ID across two four-model cycles; second cycle was offline; zero page errors and external requests. Reasoning returned “No final answer was emitted within this run’s token budget” in both cycles. Coder output varied and was not independently accepted as correct. | Compatibility/offline switching PASS; answer quality PARTIAL |
| `node tools/browser_specialist_fallback_stress.mjs` | With verified Coder stored and Instruct provisioning blocked, Auto opened model setup and produced no answer. Manual Coder remained callable. | Requested cross-model fallback FAIL / unimplemented |
| `node tools/browser_four_model_crash_stress.mjs` | Synthetic runtime Worker error for each of the four models yielded a persisted `error` reply with its actual model ID. No automatic model substitution happened. | Honest failure recovery PASS; cross-model fallback FAIL / unimplemented |
| `npm run build:web:local-models`; `node tools/browser_subpath_smoke.mjs dist/seren7-web-LJMFPU` | Current 58-asset private bundle included the four verified GGUFs; nested-path first-message auto-provision generated a real local response. | Local static-bundle smoke PASS |

**Interpretation:** “PASS” on a test script means the assertion about observed behavior passed. It does not mean a requested but absent feature passed. In particular, the two fallback stress scripts demonstrate that automatic cross-model failover is absent.

## Plan coverage

| Plan gate | Evidence-backed status now | Missing for the full application vision |
|---|---|---|
| CP001–CP005 | Scoped desktop gates PASS in the checkpoint ledger; this audit reran the integrated browser suite. | Physical memory-pressure/eviction and other browser/device coverage remain under CP011. |
| CP006 | Four exact models are loadable and have a 104-run diagnostic competence matrix. Current switch stress confirmed 8 real runs and offline cycling. | Small scored sets do not establish broad answer quality; Reasoning produced no final answer twice. |
| CP007 | Conservative Instruct fallback and truthful route receipts pass their documented gate. | Competence-aware Auto selection among specialists and cross-model failover are not implemented/promoted. Existing candidates failed correctness or latency gates. |
| CP008 | Bounded exact, compute-only local tools pass. | General tool selection and broader algebra/code tool claims are unverified. |
| CP009 | Bounded exact-arithmetic shared-state Spiral works, including replay/repair. | General model-led Spiral/.ASIF and stable net performance are unverified; one current microbenchmark failed. |
| CP010 | Narrow deterministic calculator Joint rule passes two held-out blocks. | Broader model-policy self-calibration remains braked; no automatic policy promotion. |
| CP011 | Desktop Chromium suite and private localhost static bundle pass. | Physical mobile inference, safe areas, actual screen-reader, battery/thermal, public HTTPS and exact model redistribution review remain open. The <=500 MiB whole-browser target has not been established; prior Instruct loaded sample was 564 MiB. |

**Overall verdict: PARTIAL.** The desktop local browser application runs, but the original full four-specialist Auto/failover and mobile release vision is not fulfilled. Do not describe manual 4/4 model compatibility or exact arithmetic interception as full specialist orchestration. Preserve the failed routing and Spiral timing evidence.

**Rollback:** The three new stress scripts and this report are diagnostic only; deleting them would not alter app behavior. Previous source/build snapshots remain available. Do not auto-promote a specialist policy in response to these stress runs. **Next dependency-ready task:** define explicit fallback semantics (when to retry the same model, use a qualified alternate, or abstain), build fresh task-specific held-out trials, promote only a candidate that passes correctness, total latency and memory gates; then perform physical mobile acceptance when a device is available.
