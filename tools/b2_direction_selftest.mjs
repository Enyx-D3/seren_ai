import assert from 'node:assert/strict';
import { createSpiralState, rankDirections, selectDirection, recordSpiralOutcome, recordVerifiedComponent,
  OPERATION_CAPABILITIES } from '../app/js/b2-direction.mjs';
import { SpiralController, ExactSpiral, planSpiral } from '../app/js/spiral.mjs';

const plan = planSpiral('Calculate 2+2; then explain how to compute 37*46 exactly.');
const state = createSpiralState('Calculate 2+2; then explain how to compute 37*46 exactly.', plan.parts, 3);
assert.equal(state.parts.length, 2);
assert.deepEqual(state.unresolved, ['part-1', 'part-2']);
assert.ok(state.givens.some(given => given.kind === 'source_statement' && given.trust === 'user_provided_unverified'));
assert.deepEqual(state.dependencies, [{ from: 'part-1', to: 'part-2' }]);
const ranked = rankDirections(['falcon', 'exact', 'matrix']);
assert.deepEqual(ranked.map(row => row.kind), ['exact', 'falcon']);
assert.equal(OPERATION_CAPABILITIES.matrix, 'unavailable');
assert.ok(ranked[0].scores.informationGain > 0);
assert.equal(ranked[0].scoreEvidence.expectedProgress, 'engineering_prior');
const calibrated = rankDirections(['falcon'], { category: 'arithmetic', calibration: {
  arithmetic: { operations: { falcon: { runs: 3, verifiedSuccesses: 0, verifiedFailures: 3,
    elapsedMs: 30000, informationGainSum: 1.5, cacheHits: 0 } } } } });
assert.equal(calibrated[0].scoreEvidence.expectedProgress, 'local_checked_outcomes:3');
assert.equal(calibrated[0].scoreEvidence.computationalCost, 'local_elapsed_ms:3');
assert.ok(calibrated[0].scores.expectedProgress < ranked[1].scores.expectedProgress);
assert.ok(calibrated[0].scores.errorRisk > ranked[1].scores.errorRisk);
assert.equal(calibrated[0].scores.informationGain, 0.5);
assert.equal(selectDirection(state, 'part-1', ['exact', 'falcon']).chosen.kind, 'exact');
assert.equal(selectDirection(state, 'part-1', ['exact', 'falcon']).chosen.kind, 'falcon');
assert.equal(selectDirection(state, 'part-1', ['exact', 'falcon']).chosen, null);
recordSpiralOutcome(state, 'part-1', { kind: 'exact', answer: '4', verification: { status: 'verified', method: 'two_parser_exact_v1' } });
assert.deepEqual(state.unresolved, ['part-2']);
assert.equal(state.derivations[0].status, 'verified');
recordSpiralOutcome(state, 'part-2', { kind: 'falcon', answer: 'wrong',
  verification: { status: 'failed', method: 'partial_exact_component', residual: 'numeric mismatch' } });
assert.equal(state.residuals.at(-1).resolvedBy, null);
recordVerifiedComponent(state, 'part-2', 'numeric_result', '1702', 'two_parser_exact_v1');
assert.equal(state.verifiedFacts.at(-1).component, 'numeric_result');
assert.throws(() => recordVerifiedComponent(state, 'part-2', 'numeric_result', '1700', 'two_parser_exact_v1'), /conflicting/);
recordSpiralOutcome(state, 'part-2', { kind: 'falcon_repair', answer: '1702',
  verification: { status: 'verified', method: 'two_parser_exact_v1' } });
assert.ok(state.residuals.at(-1).resolvedBy);
assert.deepEqual(state.unresolved, []);
assert.throws(() => recordSpiralOutcome(state, 'part-1', { kind: 'falcon', answer: '5',
  verification: { status: 'unverified' } }), /cannot be overwritten/);

const storage = { async find() { return []; }, async byScope() { return []; }, async put(row) { return row; },
  async incrementReuse() {}, async linkEquivalent() {} };
const controller = new SpiralController({ exact: new ExactSpiral({ storage }) });
let generated = 0;
const run = await controller.run('Calculate 2+2; then explain how to compute 37*46 exactly.', {
  scope: 'direction-selftest', generate: async () => ({ text: ++generated === 1 ? '37*46=3' : '37*46=5', tokens: 5 }) });
assert.equal(generated, 2);
assert.equal(run.outcomes[0].answer, '4');
assert.deepEqual(run.state.verifiedFacts.map(fact => fact.partId), ['part-1', 'part-2:numeric_result']);
assert.deepEqual(run.state.unresolved, ['part-2']);
assert.ok(run.trace.some(row => row.step === 'direction' && row.chosen === 'exact'));
assert.ok(run.trace.some(row => row.step === 'direction' && row.chosen === 'falcon'));
assert.equal(run.trace.filter(row => row.step === 'calculate' && row.part === 'part-1').length, 1);
assert.ok(run.trace.some(row => row.step === 'direction_result' && row.operation === 'exact' && row.verifiedProgress));
assert.equal(run.verification.status, 'unverified');
const booleanRun = await controller.run('not (True and False) or False is Answer True or False.', {
  scope: 'direction-boolean-selftest', generate: async () => { throw new Error('Falcon should stay unloaded'); } });
assert.equal(booleanRun.answer, 'True');
assert.equal(booleanRun.verification.status, 'verified');
assert.equal(booleanRun.verification.method, 'dual_boolean_expression_v1');
assert.equal(booleanRun.plan.category, 'logic');
assert.equal(booleanRun.metrics.modelCalls, 0);
assert.equal(booleanRun.metrics.calculatorCalls, 1);
assert.ok(booleanRun.trace.some(row => row.step === 'direction' && row.chosen === 'boolean'));
console.log('B2 direction selftest PASS');
