/* CP034 truthful Node Worker experiment for the CP032 exact Flow DAG.
 * This file is both a trusted test-only worker entry and an independent
 * controller harness. The browser application does not import it.
 */
import assert from 'node:assert/strict';
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, threadId, workerData } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { exactArithmetic } from '../app/js/exact-arithmetic.mjs';
import { runB2FlowPlan, verifyB2FlowReceipt } from '../app/js/b2-flow-processor.mjs';

if (!isMainThread) {
  // The worker receives a trusted fixture expression and does only bounded
  // arithmetic. The CPU-work loop is a fixed instrumentation load, not a
  // claimed virtual FLOP count or generated-code execution.
  parentPort.postMessage({ kind: 'started', id: workerData.id, threadId, at: Date.now() });
  let checksum = 1;
  for (let i = 0; i < workerData.iterations; i++)
    checksum = (Math.imul(checksum, 1664525) + i + 1013904223) | 0;
  const text = exactArithmetic(workerData.expression).text;
  parentPort.postMessage({ kind: 'done', id: workerData.id, threadId,
    at: Date.now(), checksum, text });
} else {
  const plan = { version: 1, sourceVersion: 34, requested: ['h'], tasks: [
    { id: 'a', expression: '11', dependsOn: [] },
    { id: 'b', expression: '13', dependsOn: [] },
    { id: 'c', expression: '17', dependsOn: [] },
    { id: 'd', expression: '19', dependsOn: [] },
    { id: 'e', expression: '@a+@b', dependsOn: ['a', 'b'] },
    { id: 'f', expression: '@c+@d', dependsOn: ['c', 'd'] },
    { id: 'g', expression: '@e*@f', dependsOn: ['e', 'f'] },
    { id: 'h', expression: '@g+1', dependsOn: ['g'] },
  ] };
  const independentGold = String((11n + 13n) * (17n + 19n) + 1n);
  const observed = [];

  function workerExecutor({ iterations = 10_000_000, faultyTask = null, perTaskIterations = null } = {}) {
    const active = new Set(), starts = new Map(), finishes = new Map();
    const threadIds = new Set();
    let terminations = 0;
    const execute = ({ id, expression }, { signal }) => new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(Error('cp034_worker_aborted_before_spawn'));
      const worker = new Worker(new URL(import.meta.url), { type: 'module',
        workerData: { id, expression, iterations: perTaskIterations?.[id] ?? iterations } });
      active.add(worker);
      let settled = false;
      const finish = async (error, value = null) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', abort);
        try { await worker.terminate(); } catch { /* the worker may have exited */ }
        active.delete(worker);
        if (error) reject(error);
        else resolve(value);
      };
      const abort = () => {
        terminations++;
        void finish(Error('cp034_worker_aborted'));
      };
      signal?.addEventListener('abort', abort, { once: true });
      worker.on('message', msg => {
        threadIds.add(msg.threadId);
        if (msg.kind === 'started') starts.set(msg.id, msg.at);
        if (msg.kind === 'done') {
          finishes.set(msg.id, msg.at);
          void finish(null, id === faultyTask ? '99999' : msg.text);
        }
      });
      worker.on('error', error => void finish(error));
      worker.on('exit', code => {
        if (!settled) void finish(Error('cp034_worker_exited_' + code));
      });
      if (signal?.aborted) abort();
    });
    return { execute, active, starts, finishes, threadIds, get terminations() { return terminations; } };
  }

  const median = list => [...list].sort((a,b)=>a-b)[Math.floor(list.length/2)];
  const timings = { serial: [], parallel: [] };
  for (let round = 0; round < 3; round++) {
    const order = round === 1 ? ['parallel', 'serial'] : ['serial', 'parallel'];
    for (const mode of order) {
      const adapter = workerExecutor();
      const before = performance.now();
      const receipt = await runB2FlowPlan(plan, {
        maxConcurrent: mode === 'serial' ? 1 : 2, executor: adapter.execute });
      const ms = performance.now() - before;
      assert.equal(receipt.status, 'verified', mode + ' verified receipt');
      assert.equal(receipt.targetValues[0].value, independentGold);
      assert.equal(verifyB2FlowReceipt(receipt, plan).ok, true);
      assert.equal(adapter.active.size, 0, 'no surviving workers');
      assert.ok(adapter.threadIds.size >= 8, 'one real Worker thread per task');
      const spans = [...adapter.starts.keys()].map(id => [id, adapter.starts.get(id), adapter.finishes.get(id)]);
      const overlaps = spans.some(([a, as, af]) => spans.some(([b, bs, bf]) =>
        a !== b && as < bf && bs < af));
      if (mode === 'serial') assert.equal(overlaps, false, 'serial workers do not overlap');
      if (mode === 'parallel') assert.equal(overlaps, true, 'real Worker execution windows overlap');
      assert.equal(receipt.capabilities.physicalParallelismMeasured, false,
        'model-free Flow receipt does not self-certify physical speedup');
      timings[mode].push(Number(ms.toFixed(2)));
      observed.push({ round, mode, ms: Number(ms.toFixed(2)), overlaps,
        threads: adapter.threadIds.size, scheduledTogether: receipt.metrics.maxScheduledTogether });
    }
  }

  const faulty = workerExecutor({ perTaskIterations: { a: 0, b: 40_000_000 }, faultyTask: 'a' });
  const failed = await runB2FlowPlan(plan, { maxConcurrent: 2, executor: faulty.execute });
  assert.equal(failed.status, 'unverified', 'forged answer rejects whole batch');
  assert.match(failed.reason, /flow_independent_mismatch/);
  assert.equal(faulty.active.size, 0, 'failed sibling worker truly terminated');
  assert.ok(faulty.terminations > 0, 'failed batch sent abort to worker adapter');

  const controller = new AbortController();
  const cancelAdapter = workerExecutor({ iterations: 60_000_000 });
  const external = runB2FlowPlan(plan, { maxConcurrent: 2,
    executor: cancelAdapter.execute, signal: controller.signal });
  setTimeout(() => controller.abort(), 85);
  const canceled = await external;
  assert.equal(canceled.status, 'unverified');
  assert.equal(cancelAdapter.active.size, 0, 'aborted workers truly terminated');
  assert.ok(cancelAdapter.terminations > 0, 'external cancellation reached worker adapter');

  const serialMedian = median(timings.serial), parallelMedian = median(timings.parallel);
  console.log(JSON.stringify({
    checkpoint: 'CP034_FLOW_NODE_WORKER_DIAGNOSTIC', status: 'PASS_SCOPED',
    actualNodeWorkers: true, browserWorkers: false, nativeTinyLinux: false,
    physicalCoreParallelismProven: false, availableParallelism: availableParallelism(),
    independentGold, checkedRuns: 6, wholeTaskVerified: 6,
    serialMedianMs: serialMedian, parallelMedianMs: parallelMedian,
    measuredRatioSerialOverParallel: Number((serialMedian / parallelMedian).toFixed(3)),
    abortedBatch: failed.reason, workerAbortAcks: faulty.terminations,
    externalAbort: canceled.reason, externalWorkerAbortAcks: cancelAdapter.terminations,
    observed, note: 'Node worker_threads only. Timing includes worker startup; speed ratio is environment-specific, not a product promotion.',
  }, null, 2));
}
