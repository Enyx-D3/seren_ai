import assert from 'node:assert/strict';
import { SpiralController } from '../app/js/spiral.mjs';

const sources = [
  { id: 'release', version: 'v1', text: '"Inspect cargo" before "Package crate".' },
  { id: 'maintenance', version: 'v1', text: '"Package crate" before "Release crate".' },
];
const controller = new SpiralController();
const run = async documents => controller.run('Find a valid combined order', {
  scope: 'cp025-composition-test', experimentalComposedSources: documents,
  generate: () => { throw Error('no Falcon call authorized for exact source graph'); },
});

const result = await run(sources);
assert.equal(result.verification.status, 'verified');
assert.equal(result.verification.scope, 'ordering_relative_to_two_supported_source_documents');
assert.deepEqual(JSON.parse(result.answer), ['Inspect cargo', 'Package crate', 'Release crate']);
assert.equal(result.metrics.modelCalls, 0);
assert.ok(result.metrics.calculatorCalls >= 1);
assert.ok(result.state.graph.composed?.root);
assert.ok(result.trace.some(row => row.step === 'composed_graph'));
assert.ok(result.trace.some(row => row.step === 'direction' && row.chosen?.startsWith('composed_')));
assert.ok(result.trace.some(row => row.step === 'composed_joint' && row.status === 'verified'));

const reverse = await run([
  { id: 'first', version: 'v1', text: '"Inspect cargo" before "Package crate".' },
  { id: 'second', version: 'v1', text: '"Package crate" before "Inspect cargo".' },
]);
assert.equal(reverse.verification.status, 'verified');
assert.match(reverse.answer, /No feasible order/);
assert.equal(reverse.metrics.modelCalls, 0);

const unknown = await run([
  { id: 'first', version: 'v1', text: '"Inspect cargo" before "Package crate".' },
  { id: 'second', version: 'v1', text: '"Package crate" maybe before "Release crate".' },
]);
assert.equal(unknown.verification.status, 'unverified');
assert.equal(unknown.verification.method, 'composed_source_abstention');
assert.equal(unknown.metrics.calculatorCalls, 0);

const invalid = await run([
  { id: 'same', version: 'v1', text: '"A" before "B".' },
  { id: 'same', version: 'v2', text: '"B" before "C".' },
]);
assert.equal(invalid.verification.status, 'unverified');
assert.equal(invalid.metrics.modelCalls, 0);

console.log('CP025 B2 controller two-source GraphOS opt-in selftest PASS');
