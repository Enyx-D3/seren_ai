import assert from 'node:assert/strict';
import { exactArithmetic } from '../app/js/exact-arithmetic.mjs';
import { parseGroupedWordMath, candidateWordPaths, executeWordPath } from '../app/js/b2-word-math.mjs';
import { SpiralController } from '../app/js/spiral.mjs';
import { rankDirections } from '../app/js/b2-direction.mjs';

const question = 'There are 5 trays. Each tray holds 12 muffins. 7 muffins are sold. How many muffins remain?';
const parsed = parseGroupedWordMath(question);
assert.ok(parsed);
assert.deepEqual(parsed.quantities.map(row => [row.role, row.value]),
  [['group_count', '5'], ['items_per_group', '12'], ['change_count', '7']]);
assert.ok(parsed.quantities.every(row => question.slice(row.sourceOffset, row.sourceOffset + row.quote.length) === row.quote));
assert.equal(parsed.unknown.quote, 'How many muffins remain?');
assert.equal(candidateWordPaths(parsed).length, 2);
const candidateEvidence = Object.fromEntries(candidateWordPaths(parsed).map(row => [row.kind, row]));
const priorWins = rankDirections(['word_repeated', 'word_multiply'], { category: 'arithmetic', candidateEvidence,
  calibration: { arithmetic: { operations: { word_multiply: { runs: 3, verifiedSuccesses: 3,
    verifiedFailures: 0, elapsedMs: 1, informationGainSum: 3, cacheHits: 0 } } } } });
assert.equal(priorWins[0].kind, 'word_multiply');
assert.equal(executeWordPath(parsed, candidateWordPaths(parsed)[0]).answer, '53');
assert.equal(executeWordPath(parsed, candidateWordPaths(parsed)[1]).answer, '53');
assert.equal(parseGroupedWordMath(question.replace('Each tray', 'Each crate')), null);
assert.equal(parseGroupedWordMath(question.replace('7 muffins', '7 apples')), null);
assert.equal(parseGroupedWordMath(question.replace('7 muffins are sold.', '7 muffins are sold. 2 muffins return.')), null);

const direct = await new SpiralController().run(question, {
  scope: 'word-selftest', generate: async () => { throw new Error('Falcon must not load'); },
});
assert.equal(direct.answer, '53');
assert.equal(direct.verification.status, 'verified');
assert.equal(direct.metrics.modelCalls, 0);
assert.equal(direct.metrics.calculatorCalls, 2);
assert.equal(direct.trace.find(row => row.step === 'direction').chosen, 'word_multiply');
assert.equal(direct.trace.find(row => row.step === 'direction_result').goalProgress.verifiedDelta, 1);
assert.equal(direct.state.graph.nodes.find(row => row.id === 'word:initial_total').value, '60');
assert.equal(direct.state.graph.nodes.find(row => row.id === 'word:final_item_count').status, 'verified');

let injected = 0;
const fallback = await new SpiralController({ wordCalculate(expression) {
  if (expression === '5*12' && injected++ === 0) return { text: '61' };
  return exactArithmetic(expression);
} }).run(question, { scope: 'word-fallback-selftest', generate: async () => { throw new Error('Falcon must not load'); } });
assert.equal(fallback.answer, '53');
assert.equal(fallback.verification.status, 'verified');
assert.deepEqual(fallback.trace.filter(row => row.step === 'direction').map(row => row.chosen),
  ['word_multiply', 'word_repeated']);
assert.match(fallback.trace.find(row => row.step === 'word_path_failure').residual, /independent mismatch/);
assert.equal(fallback.trace.find(row => row.step === 'direction_result' && row.operation === 'word_multiply').goalProgress.verifiedDelta, 0);
assert.equal(fallback.trace.find(row => row.step === 'direction_result' && row.operation === 'word_repeated').goalProgress.verifiedDelta, 1);
assert.equal(fallback.metrics.calculatorCalls, 6);
assert.equal(fallback.state.residuals[0].resolvedBy !== null, true);
let finalFault = false;
const retained = await new SpiralController({ wordCalculate(expression) {
  if (expression === '60-7' && !finalFault) { finalFault = true; return { text: '54' }; }
  return exactArithmetic(expression);
} }).run(question, { scope: 'word-retained-selftest', generate: async () => { throw new Error('Falcon must not load'); } });
assert.equal(retained.answer, '53');
assert.equal(retained.verification.status, 'verified');
assert.ok(retained.trace.some(row => row.step === 'verified_component' && row.component === 'initial_total' && row.answer === '60'));
assert.ok(retained.trace.some(row => row.step === 'word_path_result' && row.reusedInitial === true));
assert.equal(retained.metrics.calculatorCalls, 3);
console.log('B2 word math selftest PASS');
