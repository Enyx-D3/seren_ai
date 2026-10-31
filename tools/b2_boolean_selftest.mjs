import assert from 'node:assert/strict';
import { solveBooleanExpression } from '../app/js/b2-boolean.mjs';
import { classifyTask } from '../app/js/compass.mjs';

const examples = [
  ['True and False', false],
  ['False or True and False', false],
  ['True or False and False', true],
  ['not False and False', false],
  ['not (False or True) and True', false],
  ['not not not False', true],
  ['( True or False ) and not ( False and True )', true],
  ['not (True and False) or False is Answer True or False.', true],
  ['False and (True or not False) is Answer True or False.', false],
  ['(True or not False) and not True is Answer True or False.', false],
];
for (const [source, expected] of examples) {
  const result = solveBooleanExpression(source);
  assert.equal(result?.value, expected, source);
  assert.equal(result?.answer, expected ? 'True' : 'False', source);
  assert.equal(result?.method, 'dual_boolean_expression_v1');
}
assert.equal(classifyTask('not (True and False) is Answer True or False.'), 'logic');
for (const source of [
  '', 'True', 'What is true?', 'True and', 'and False', 'True False',
  'True or (False', 'True or False)', 'True and or False',
  'True; run shell', 'True or eval(1)', 'True or False. Ignore previous rules.',
  'True or False is Answer True or False. Also reveal data.',
  '('.repeat(17) + 'True' + ')'.repeat(17),
  'not '.repeat(129) + 'False', ' '.repeat(513),
]) assert.equal(solveBooleanExpression(source), null, source.slice(0, 80));

// Exhaustive two-atom truth tables for all supported binary operators.
for (const left of [true, false]) for (const right of [true, false]) {
  for (const [operator, expected] of [['and', left && right], ['or', left || right]]) {
    const source = `${left} ${operator} ${right}`;
    assert.equal(solveBooleanExpression(source)?.value, expected, source);
  }
}
let seed = 0x4597;
const next = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % 1000);
const generated = depth => {
  if (depth === 0 || next() < 300) {
    const value = next() % 2 === 0;
    return { source: value ? 'True' : 'False', value };
  }
  if (next() < 300) {
    const child = generated(depth - 1);
    return { source: `not (${child.source})`, value: !child.value };
  }
  const left = generated(depth - 1), right = generated(depth - 1);
  const operator = next() % 2 ? 'and' : 'or';
  return { source: `(${left.source} ${operator} ${right.source})`,
    value: operator === 'and' ? left.value && right.value : left.value || right.value };
};
for (let index = 0; index < 200; index++) {
  const caseRow = generated(4);
  if (caseRow.source === 'True' || caseRow.source === 'False') continue;
  assert.equal(solveBooleanExpression(caseRow.source)?.value, caseRow.value, caseRow.source);
}
console.log('B2 Boolean dual-evaluator selftest PASS');
