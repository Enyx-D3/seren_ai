# CP032 — Flow Processor exact DAG scheduling research

**Date:** 2026-11-05. **Branch:** local `agent/integration-v2`. **Status:** `PASS_SCOPED`, `NOT_RELEASE_ACCEPTED`.

## Contract

- New `app/js/b2-flow-processor.mjs` is a developer-only, typed exact-integer DAG scheduler; it is not automatically enabled in chat.
- It admits 2–8 source-versioned named computations, checks every declared reference against a prerequisite, rejects unused work, and only schedules dependent computations after checked predecessors.
- A bounded `maxConcurrent` of 1–3 controls eligible Promise batches. This is **not** proof of hardware parallelism, actual CPU speedup or correct GPU/virtual FLOPS.
- The default executor is the local exact-arithmetic parser. Trusted caller-provided asynchronous executors are possible, but a returned value cannot become checked unless it exactly matches a fresh independent calculation.
- The full result receipt is immutable and source-rooted. `verifyB2FlowReceipt` replays the entire DAG, reference order, values, requested targets and receipt root. A source version/content change invalidates it.
- It does not request network, filesystem, native TinyLinux, shell, additional LLM or arbitrary model-generated executable code. Tools with separate OS-level cancellation requirements must use their own capability adapter.

## Test receipt

Command: `npm run test:cp032:flow`.

Observed result: `PASS_SCOPED` with **381 assertions**, including **120 independent BigInt random-oracle DAGs**, serial versus 2-lane scheduling equivalence, immutable receipt replay, new-version/tamper invalidation, six invalid-plan denials, cycle brake, fractional-result abstention, falsified-executor-output rejection and cancellation. A trusted delay-injection exercise observed two overlapping promises, not two simultaneous CPU calculations.

This does **not** satisfy the full MRS Flow requirement for measured per-device resource routing, killable browser Workers, WebGPU/WebNN hardware, native TinyLinux guest, adaptive model residency or production-calibrated parallel performance. Those require separate current-branch browser/device evidence.

## Rollback and next gate

No default UI wiring or production routing changed. Remove the opt-in module, selftest and npm script to roll back. Next gate: integrate explicit permissioned Worker execution, compare complete serial/parallel **time-to-correct** on real browser workloads, check cancellation of actual underlying workers, and measure RAM/CPU/energy with the full Falcon + B2 path.
