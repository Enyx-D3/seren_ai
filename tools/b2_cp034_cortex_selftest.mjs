/* CP034: adversarial asynchronous Cortex cancellation and source freshness.
 * All model callbacks here are test doubles; no real Falcon, browser or
 * native TinyLinux is invoked. This is a safety regression, not a quality win.
 */
import assert from 'node:assert/strict';
import { runCortexResidualCycle } from '../app/js/b2-cortex-residual-cycle.mjs';

const source = '"Cool pan" must finish before "Plate meal". "Plate meal" must finish before "Serve meal". Give a valid order.';
const initialOrder = ['Serve meal', 'Plate meal', 'Cool pan'];
const verifiedOrder = ['Cool pan', 'Plate meal', 'Serve meal'];

function deferredModel() {
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const releasePromise = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const generate = async ({ turns, maxTokens }) => {
    calls++;
    assert.equal(maxTokens, 8);
    const prompt = turns[0].content;
    const options = [...prompt.matchAll(/(?:^|\n)(A|B): "([^"\n]+)"/g)];
    assert.equal(options.length, 2);
    const correct = options.find(row => row[2] === 'Cool pan');
    assert.ok(correct);
    entered();
    await releasePromise;
    return { text: correct[1] };
  };
  return { generate, started, release, get calls() { return calls; } };
}

// The same model response is admitted when the request has not been cancelled
// or source-mutated, so the negatives below test the actual authority edge.
const clean = deferredModel();
const cleanRun = runCortexResidualCycle(source, {
  initialOrder, generate: clean.generate, readCurrentSource: () => source,
  maxModelCalls: 1, maxNoProgress: 1,
});
await clean.started;
clean.release();
const cleanResult = await cleanRun;
assert.equal(cleanResult.modelCalls, 1);
assert.equal(cleanResult.acceptedEdits, 1);
assert.equal(cleanResult.wholeTaskVerified, false, 'first repair is only partial');

// Cancellation while Falcon is in flight must discard the correct but stale
// answer. It must not send any candidate to the Cortex admission guard.
const controller = new AbortController();
const cancelled = deferredModel();
const cancelledRun = runCortexResidualCycle(source, {
  initialOrder, generate: cancelled.generate, signal: controller.signal,
  readCurrentSource: () => source,
});
await cancelled.started;
controller.abort();
cancelled.release();
const cancelledResult = await cancelledRun;
assert.equal(cancelledResult.reason, 'aborted_after_model_call');
assert.equal(cancelledResult.modelCalls, 1);
assert.equal(cancelledResult.acceptedEdits, 0);
assert.equal(cancelledResult.modelLedRepairSuccess, false);
assert.equal(cancelledResult.wholeTaskVerified, false);
assert.equal(cancelledResult.trace.at(-1).step, 'stale_model_answer_discarded');

// A source revision during the same await likewise prevents any repair.
let liveSource = source;
const sourceEdit = deferredModel();
const changedRun = runCortexResidualCycle(source, {
  initialOrder, generate: sourceEdit.generate,
  readCurrentSource: () => liveSource,
});
await sourceEdit.started;
liveSource += ' New prerequisite attached.';
sourceEdit.release();
const changedResult = await changedRun;
assert.equal(changedResult.reason, 'stale_source_version');
assert.equal(changedResult.modelCalls, 1);
assert.equal(changedResult.acceptedEdits, 0);
assert.equal(changedResult.wholeTaskVerified, false);

// Previously valid answers must not escape a changed/unavailable live source
// snapshot or an already-aborted request.
for (const [name, extra, reason] of [
  ['already stale', { readCurrentSource: () => source + ' mutation' }, 'stale_source_version'],
  ['source read failure', { readCurrentSource: () => { throw Error('unreadable'); } }, 'source_freshness_unavailable'],
  ['source wrong type', { readCurrentSource: () => undefined }, 'source_freshness_unavailable'],
]) {
  const result = await runCortexResidualCycle(source, {
    initialOrder: verifiedOrder,
    generate: () => { throw Error(name + ' unexpectedly generated'); }, ...extra,
  });
  assert.equal(result.reason, reason, name);
  assert.equal(result.wholeTaskVerified, false);
  assert.equal(result.modelCalls, 0);
}

const before = new AbortController();
before.abort();
const abortedBefore = await runCortexResidualCycle(source, {
  initialOrder: verifiedOrder, signal: before.signal,
  generate: () => { throw Error('called despite cancelled request'); },
});
assert.equal(abortedBefore.reason, 'aborted_before_model_call');
assert.equal(abortedBefore.modelCalls, 0);

const abortAndReject = new AbortController();
const cancelledException = await runCortexResidualCycle(source, {
  initialOrder, signal: abortAndReject.signal,
  generate: async () => {
    abortAndReject.abort();
    throw Error('worker rejected after stop');
  },
});
assert.equal(cancelledException.reason, 'aborted_after_model_call');
assert.equal(cancelledException.modelCalls, 1);
assert.equal(cancelledException.acceptedEdits, 0);

// Even a hostile/reentrant freshness provider cannot cancel the request and
// still get a candidate admitted during that same synchronous check.
let reads = 0;
const reentrantStop = new AbortController();
const reentrant = await runCortexResidualCycle(source, {
  initialOrder, signal: reentrantStop.signal,
  readCurrentSource: () => {
    reads++;
    if (reads === 4) reentrantStop.abort();
    return source;
  },
  generate: async () => ({ text: 'A' }),
});
assert.equal(reentrant.reason, 'aborted_after_model_call');
assert.equal(reentrant.modelCalls, 1);
assert.equal(reentrant.acceptedEdits, 0);

// Generation exceptions count as attempted model calls; no partial result is
// used to self-certify an answer.
const failed = await runCortexResidualCycle(source, {
  initialOrder, generate: async () => { throw Error('isolated model crashed'); },
});
assert.equal(failed.reason, 'model_generation_failed');
assert.equal(failed.modelCalls, 1);
assert.equal(failed.acceptedEdits, 0);
assert.equal(failed.wholeTaskVerified, false);

await assert.rejects(runCortexResidualCycle(source, {
  initialOrder, generate: async () => ({ text: 'A' }), readCurrentSource: 123,
}), /invalid_cortex_residual_cycle_contract/);

console.log(JSON.stringify({ checkpoint: 'CP034', status: 'PASS_MODELFREE_CORTEX_ASYNC_SAFETY',
  acceptedPartialControl: 1, discardedCancelledModelAnswers: 1,
  discardedStaleModelAnswers: 1, staleOrUnavailableInitialSources: 3,
  abortedBeforeModel: 1, cancellationExceptionDiscarded: 1,
  reentrantCancellationDiscarded: 1, countedModelFailures: 1,
  modelDoubleCalls: clean.calls + cancelled.calls + sourceEdit.calls + 3,
  realFalconCalls: 0, browserRuns: 0, nativeTinyLinuxRuns: 0 }));
