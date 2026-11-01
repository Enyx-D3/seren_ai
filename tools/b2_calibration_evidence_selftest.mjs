import assert from 'node:assert/strict';
import { SpiralController } from '../app/js/spiral.mjs';
import { exactArithmetic } from '../app/js/exact-arithmetic.mjs';
import { accumulateCheckedDirections } from '../app/js/b2-calibration-outcomes.mjs';
import { runCheckedShadowTrial, accumulateShadowTrial } from '../app/js/b2-shadow-trials.mjs';
import { evaluateMagneticPaths } from '../app/js/b2-magnetic.mjs';
import { parseInventoryTransfer, candidateTransferPaths } from '../app/js/b2-transfer.mjs';

const prompt = 'Nora has 18 coins. Eli has 7 coins. Nora gives Eli 4 coins. How many coins does Eli have now?';
const noModel = async () => { throw Error('one-Falcon runtime must not be called for exact transfer grammar'); };
const clean = await new SpiralController().run(prompt, { scope: 'calibration-clean', generate: noModel });
let operations = accumulateCheckedDirections({}, clean.trace);
assert.equal(operations.transfer_direct.verifiedSuccesses, 1);
assert.equal(operations.transfer_direct.verifiedFailures, 0);

let corruptOnce = true;
const faulted = await new SpiralController({ wordCalculate(expression) {
  if (corruptOnce) { corruptOnce = false; return { text: '-999' }; }
  return exactArithmetic(expression);
} }).run(prompt, { scope: 'calibration-checked-fault', generate: noModel });
assert.equal(faulted.answer, '11');
const checkedFault = faulted.trace.find(row => row.step === 'direction_result' && row.operation === 'transfer_direct');
assert.equal(checkedFault.verificationStatus, 'failed');
assert.equal(checkedFault.checkedOutcome, true);
operations = accumulateCheckedDirections(operations, faulted.trace);
assert.equal(operations.transfer_direct.verifiedFailures, 1);
assert.equal(operations.transfer_conserve.verifiedSuccesses, 1);

let thrownOnce = true;
const unavailable = await new SpiralController({ wordCalculate(expression) {
  if (thrownOnce) { thrownOnce = false; throw new Error('backend unavailable'); }
  return exactArithmetic(expression);
} }).run(prompt, { scope: 'calibration-unchecked-error', generate: noModel });
const uncheckedFault = unavailable.trace.find(row => row.step === 'direction_result' && row.operation === 'transfer_direct');
assert.equal(uncheckedFault.checkedOutcome, false);
operations = accumulateCheckedDirections(operations, unavailable.trace);
assert.equal(operations.transfer_direct.verifiedFailures, 1);
assert.equal(operations.transfer_direct.uncheckedRuns, 1);
assert.equal(operations.transfer_direct.runs, 3);

// A second real calculation path is observed by developer shadow trial,
// never by assigning an invented score or changing a production answer.
let shadow = {};
for (const text of [prompt,
  'Maya has 20 beads. Omar has 5 beads. Maya gives Omar 3 beads. How many beads does Omar have now?',
  'Tara has 26 cards. Finn has 9 cards. Tara gives Finn 7 cards. How many cards does Tara have now?']) {
  const trial = runCheckedShadowTrial(text);
  assert.equal(trial.status, 'conditional_arithmetic_only');
  assert.equal(trial.results.length, 2);
  assert.ok(trial.results.every(row => row.status === 'verified_arithmetic' && row.checkedOutcome));
  shadow = accumulateShadowTrial(shadow, trial);
}
const saved = JSON.parse(JSON.stringify(shadow));
assert.equal(saved.shadowTrials, 3);
assert.equal(saved.shadowOperations.transfer_direct.verifiedSuccesses, 3);
assert.equal(saved.shadowOperations.transfer_conserve.verifiedSuccesses, 3);
const paths = candidateTransferPaths(parseInventoryTransfer(prompt));
assert.equal(evaluateMagneticPaths(paths, { operations: saved.shadowOperations }).status, 'experimental_measured');
const simulated = runCheckedShadowTrial(prompt, { injectedFault: true });
assert.deepEqual(accumulateShadowTrial(saved, simulated), saved);
const customCalculator = runCheckedShadowTrial(prompt, { calculate: expression => exactArithmetic(expression) });
assert.equal(customCalculator.simulatedFault, true);
assert.deepEqual(accumulateShadowTrial(saved, customCalculator), saved);

const newPrompt = 'Asha has 29 shells. Ben has 6 shells. Asha gives Ben 8 shells. How many shells does Ben have now?';
const resumed = await new SpiralController().run(newPrompt, { scope: 'calibration-new-unseen', generate: noModel,
  calibration: { arithmetic: saved }, experimentalMagnetic: true });
assert.equal(resumed.answer, '14');
assert.equal(resumed.verification.status, 'verified');
assert.equal(resumed.trace.find(row => row.step === 'direction')?.magnetic?.status, 'experimental_measured');

// A production Compass must not chase an unmeasured 3-operation alternative
// after three correct 1-operation trials have reduced the direct path's
// Laplace-smoothed score.
const sparse = { arithmetic: { operations: { transfer_direct: {
  runs: 5, verifiedSuccesses: 5, verifiedFailures: 0, elapsedMs: 5,
  informationGainSum: 5, cacheHits: 0,
} } } };
const conservative = await new SpiralController().run(newPrompt, {
  scope: 'calibration-production-sparse', generate: noModel, calibration: sparse,
});
assert.equal(conservative.trace.find(row => row.step === 'direction').chosen, 'transfer_direct');
assert.equal(conservative.metrics.calculatorCalls, 1);
console.log('B2 independent outcome accounting + real arithmetic shadow profiles PASS');
