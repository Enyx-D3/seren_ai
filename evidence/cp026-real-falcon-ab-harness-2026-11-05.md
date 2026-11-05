# CP026 — real browser Falcon A/B evaluator (harness prepared, model run pending)

- **Source branch:** `agent/cp026-eval`, forked from CP025 `6eb39f8` and fast-forwarded over the existing CP026 integration evidence.
- **Evaluation purpose:** run one pinned real Falcon-H1-Tiny-90M-Instruct Q4_K_M GGUF through the actual `runtime-worker.mjs` in Chromium and compare Falcon-alone with the B2 dependency + Cortex-guarded path on a separately frozen 28-case fixture. Do not represent a mock Worker, synthetic action proposal or oracle unit test as Falcon reasoning.
- **Immutable fixture:** `tools/fixtures/b2_cp026_independent_holdout_2026_11_05.json`, SHA-256 `bec2deb71bbd93f03d1aab7b48ae24a97e396a8e65a488610e937a125d7934a4`, 16 feasible / 3 cyclic / 9 conservative-abstention cases. No tuning on this fixture before evaluating it. The independent verifier's `tools/b2_cp026_independent_oracle.mjs` is the primary gold checker; the separate JSON-only scorer reports disagreement as diagnostics.
- **Prerequisites:** pinned real model in `workspace/parts/`, prepared Wllama WASM files under `app/vendor/wllama/`, installed Playwright with Chromium executable, live `npm run serve` at local port 8799. Optional Chromium executable environment variable: `B2_CHROMIUM_EXECUTABLE_PATH` or `SEREN_CHROMIUM_EXECUTABLE`.
- **Run:** in terminal A, `npm run serve`. In terminal B:

  ```bash
  npm run test:cp026:oracle
  node tools/b2_cp026_real_falcon_ab.mjs --fixture tools/fixtures/b2_cp026_independent_holdout_2026_11_05.json --fixture-sha256 bec2deb71bbd93f03d1aab7b48ae24a97e396a8e65a488610e937a125d7934a4
  ```

- **A/B design:** exactly the same source as user input, shared worker/weights/template/temperature 0.2 and 64 generated tokens per model call, alternating order, isolated B2 scopes and no calibration. Default Falcon-alone uses 1 completion, B2 may use up to 4; explicitly rerun with `--baseline-calls 4` as a separate intervention/cost comparison. Only one model runs in the browser Worker. Component-specific repair is checked by independent constraints. Browser external requests are denied and recorded. Raw rows record output, actual worker completion requests, elapsed time, model/calculator calls, independent gold outcome, false verification, source hashes, sampled process-tree RSS, runtime errors and external attempts.
- **Reporting discipline:** log safe abstentions separately from correct solutions; report task-complete correct rates with denominators. Aggregate latency can be misleading when an arm abstains immediately, so only compare time-to-correct for identical cases solved correctly by *both* arms. Current oracle checks task/edge graph consistency, not the truth of source-world assertions. Test does not establish broad reasoning or release readiness.
- **Execution status from this isolated worker worktree:** `node --check tools/b2_cp026_real_falcon_ab.mjs` PASS; `npm run test:cp026:oracle` PASS; **real-model A/B NOT RUN**. This worktree has no prepared `.wasm` or pinned `.gguf` files; parent integration/runtime agent is separately recovering those assets. No browser/phone/release result is claimed here.
- **Rollback:** revert this opt-in eval tooling commit; no application behavior or protected V1 UI is modified by this evaluator.
