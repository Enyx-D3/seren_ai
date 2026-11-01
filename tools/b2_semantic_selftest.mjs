import assert from 'node:assert/strict';
import { extractGroundedSemantics } from '../app/js/b2-grounded-semantics.mjs';
import { buildProblemGraph } from '../app/js/b2-problem-graph.mjs';
import { classifyTask } from '../app/js/compass.mjs';

const word = 'Mira has 14 coins. She gives 6 coins to Leo, then receives 3 coins. How many coins does Mira have now?';
const interpretation = extractGroundedSemantics(word, 'arithmetic');
assert.deepEqual(interpretation.quantities.map(row => row.quote), ['14 coins', '6 coins', '3 coins']);
assert.deepEqual(interpretation.relations.filter(row => ['decrease', 'increase'].includes(row.kind))
  .map(row => row.operationHint), ['subtract', 'add']);
assert.equal(interpretation.unknown.quote, 'How many coins does Mira have now');
for (const row of [...interpretation.quantities, ...interpretation.relations, interpretation.unknown])
  assert.equal(word.slice(row.sourceOffset, row.sourceOffset + row.quote.length), row.quote);
assert.ok(interpretation.relations.every(row => row.status === 'proposed_from_wording'));

const code = 'Complete this Python function: def total_even(items): Return the sum of even integers in items.';
const coding = extractGroundedSemantics(code, 'code');
assert.equal(coding.signatures[0].functionName, 'total_even');
assert.deepEqual(coding.signatures[0].parameters, ['items']);
assert.ok(coding.relations.some(row => row.operationHint === 'filter'));
assert.ok(coding.relations.some(row => row.operationHint === 'aggregate'));
assert.ok(coding.unknown.quote.startsWith('Return the sum'));
assert.equal(extractGroundedSemantics('Invent missing facts', 'conversation').relations.length, 0);
assert.equal(classifyTask(word), 'arithmetic');
assert.equal(classifyTask(code), 'code');

const graph = buildProblemGraph(word, [{ id: 'part-1', question: word, category: 'arithmetic',
  dependsOn: [], orderAfter: [], candidateOperations: ['falcon'] }]);
assert.equal(graph.semantic.schemaVersion, 1);
assert.ok(graph.edges.some(row => row.relation === 'proposes_operation_hint'));
assert.ok(graph.missingKnowledge.some(row => row.requirement === 'grounded_claim_verifier'));
console.log('B2 grounded semantic selftest PASS');
