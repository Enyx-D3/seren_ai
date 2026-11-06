# CP034 — real Node Worker Flow batches and termination

- Baseline: GitHub `Enyx-D3/seren_ai` at `ac763ad`, developer-only
  `app/js/b2-flow-processor.mjs`. No change to default UI, model routing,
  model weights, browser permissions, or remote services.
- Scope: `PASS_SCOPED`, not `PASS_RELEASE`. Real `node:worker_threads`
  were spawned and terminated by a trusted local test adapter. This does
  **not** demonstrate browser Worker, TinyLinux guest, WebGPU, V-FLOPS
  capacity, or physically dedicated CPU cores.
- Change: a failure or outer cancellation now aborts the entire eligible
  batch; the Flow Processor awaits every executor's termination acknowledgment
  through `Promise.allSettled` before returning an unverified receipt. No
  member of a partly failed batch becomes verified. An adapter that ignores
  its signal may still stall; OS/process hard-kill is the adapter's separate
  obligation. Node Worker test adapter actually calls `worker.terminate()`.
- Test: `node tools/b2_cp034_flow_selftest.mjs`.
- Environment: Linux x64, Node v24.22.1, `availableParallelism()=9`.
- Fixture: caller-defined exact integer DAG, eight typed tasks, target
  `h=865`, independently evaluated with BigInt and whole-task DAG replay.
  Three serial/two-lane paired trials (AB/BA/AB) used the same trusted
  worker CPU-work function, each run spawning eight true Node Workers.
- Actual result: six of six whole-task receipts checked. Serial whole-task
  medians 1661.88 ms, two-lane median 924.81 ms, observed
  serial/parallel median ratio **1.797× on this fixture and host**.
  Three serial trials had no overlapping execution windows; three two-lane
  trials overlapped distinct Node Worker thread lifetimes. These include
  Worker startup overhead and do not prove generic task speedup.
- Negative controls: one worker returned forged `99999` for task `a`;
  the whole batch failed with `flow_independent_mismatch:a`, a sibling
  received an abort, and no worker survived. External AbortController
  canceled another in-flight batch: `flow_aborted`, two worker terminations,
  zero surviving workers.
- Regression: `node tools/b2_cp032_flow_selftest.mjs` retained its
  381 independently checked assertions and the previous policy/receipt
  identities. Model calls = 0, network calls = 0, native guest executions = 0.
- Rollback: restore the previous Promise batch code and remove this CP034
  selftest/receipt; prior CP032 Flow behavior is preserved independently.
- Next gate: run an equivalent cancellation/cleanup/serial-vs-parallel
  experiment using actual browser Web Workers within Seren UI, then
  physical mobile CPU/RAM/thermal acceptance. Native TinyLinux is a
  separate optional isolation workload.
