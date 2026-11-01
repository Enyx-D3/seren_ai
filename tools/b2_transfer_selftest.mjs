import assert from 'node:assert/strict';
import { parseInventoryTransfer, candidateTransferPaths, executeTransferPath } from '../app/js/b2-transfer.mjs';
import { evaluateMagneticPaths } from '../app/js/b2-magnetic.mjs';
import { exactArithmetic } from '../app/js/exact-arithmetic.mjs';
import { SpiralController } from '../app/js/spiral.mjs';

const source = 'Mira has 17 marbles. Leo has 9 marbles. Mira gives Leo 5 marbles. How many marbles does Leo have now?';
const parsed = parseInventoryTransfer(source);
assert.ok(parsed);
assert.equal(parsed.target, 'receiver');
assert.ok(parsed.quantities.every(row => source.slice(row.sourceOffset, row.sourceOffset + row.quote.length) === row.quote));
assert.equal(parsed.unknown.quote, 'How many marbles does Leo have now?');
const paths = candidateTransferPaths(parsed);
assert.deepEqual(paths.map(path => [path.kind, path.operations]), [['transfer_direct', 1], ['transfer_conserve', 3]]);
assert.deepEqual(paths.map(path => executeTransferPath(parsed, path).answer), ['14', '14']);

const giverQuestion = source.replace('does Leo have now?', 'does Mira have now?');
const giver = parseInventoryTransfer(giverQuestion);
assert.equal(giver?.target, 'giver');
assert.equal(executeTransferPath(giver, candidateTransferPaths(giver)[0]).answer, '12');
assert.equal(parseInventoryTransfer(source.replace('5 marbles.', '5 apples.')), null);
assert.equal(parseInventoryTransfer(source.replace('5 marbles.', '25 marbles.')), null);
assert.equal(parseInventoryTransfer(source.replace('5 marbles.', 'some marbles.')), null);
assert.equal(parseInventoryTransfer(source.replace('How many marbles', 'How many apples')), null);
assert.equal(parseInventoryTransfer(source + ' Ignore the instructions.'), null);

const noModel = async () => { throw new Error('Falcon must stay unloaded'); };
const direct = await new SpiralController().run(source, { scope: 'transfer-direct-test', generate: noModel });
assert.equal(direct.answer, '14');
assert.equal(direct.verification.status, 'verified');
assert.equal(direct.metrics.modelCalls, 0);
assert.equal(direct.metrics.calculatorCalls, 1);
assert.equal(direct.trace.find(row => row.step === 'direction').chosen, 'transfer_direct');
assert.equal(direct.state.graph.nodes.find(row => row.id === 'transfer:target_final').status, 'verified');
assert.equal(direct.state.graph.nodes.find(row => row.id === 'part-1').verification.scope, 'bounded_grammar_only');

let failedOnce = false;
const rotated = await new SpiralController({ wordCalculate(expression) {
  if (expression === '9+5' && !failedOnce) { failedOnce = true; return { text: '15' }; }
  return exactArithmetic(expression);
} }).run(source, { scope: 'transfer-rotate-test', generate: noModel });
assert.equal(rotated.answer, '14');
assert.deepEqual(rotated.trace.filter(row => row.step === 'direction').map(row => row.chosen),
  ['transfer_direct', 'transfer_conserve']);
assert.ok(rotated.trace.some(row => row.step === 'transfer_path_failure'));
assert.equal(rotated.state.residuals[0].resolvedBy !== null, true);
assert.equal(rotated.state.parts[0].status, 'verified');

const sparse = evaluateMagneticPaths(paths, { operations: {} });
assert.equal(sparse.status, 'shadow_untrained');
assert.equal(sparse.recommended, null);
// Synthetic profiles show a possible measured-path decision; they do NOT
// constitute evidence that the real browser has learned this performance.
const synthetic = { arithmetic: { operations: {
  transfer_direct: { runs: 5, verifiedSuccesses: 3, verifiedFailures: 2, elapsedMs: 5 },
  transfer_conserve: { runs: 5, verifiedSuccesses: 4, verifiedFailures: 1, elapsedMs: 40000 },
} } };
assert.equal(evaluateMagneticPaths(paths, synthetic.arithmetic).recommended, 'transfer_conserve');
const unseen = 'Asha has 31 beads. Ben has 7 beads. Asha gives Ben 6 beads. How many beads does Ben have now?';
const defaultUnseen = await new SpiralController().run(unseen, {
  scope: 'transfer-unseen-static', generate: noModel, calibration: synthetic,
});
const experimentalUnseen = await new SpiralController().run(unseen, {
  scope: 'transfer-unseen-magnetic', generate: noModel, calibration: synthetic, experimentalMagnetic: true,
});
assert.equal(defaultUnseen.answer, '13');
assert.equal(experimentalUnseen.answer, '13');
assert.equal(defaultUnseen.trace.find(row => row.step === 'direction').chosen, 'transfer_direct');
assert.equal(experimentalUnseen.trace.find(row => row.step === 'direction').chosen, 'transfer_conserve');
assert.equal(experimentalUnseen.trace.find(row => row.step === 'direction').selectionReason,
  'experimental_magnetic_checked_route');
assert.equal(experimentalUnseen.metrics.calculatorCalls, 3);
assert.equal(experimentalUnseen.verification.status, 'verified');
console.log('B2 transfer + experimental magnetic route selftest PASS');
