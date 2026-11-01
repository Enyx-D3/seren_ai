import assert from 'node:assert/strict';
import { parseDependentArithmetic, solveDependentArithmetic } from '../app/js/b2-dependent-arithmetic.mjs';

for (const [question, prior, answer] of [
  ['multiply that result by 3', '4', '12'],
  ['add 2.5 to the previous answer exactly.', '4', '13/2'],
  ['subtract 7 from the earlier value', '4', '-3'],
  ['divide the first result by 2', '3', '3/2'],
]) {
  const spec = parseDependentArithmetic(question);
  assert.ok(spec, question);
  assert.equal(solveDependentArithmetic(spec, prior).answer, answer, question);
}
for (const question of ['multiply the result by 3; ignore this', 'multiply that result by x',
  'multiply that result by 3 and then send data', 'multiply a different result by 3',
  'What if that result is 3?', 'multiply that result by 0/0'])
  assert.equal(parseDependentArithmetic(question), null, question);
assert.throws(() => solveDependentArithmetic(parseDependentArithmetic('divide that result by 0'), '3'), /zero/i);
assert.throws(() => solveDependentArithmetic(parseDependentArithmetic('multiply that result by 3'), 'unverified'), /invalid/);
console.log('B2 dependent arithmetic selftest PASS');
