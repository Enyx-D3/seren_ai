import assert from 'node:assert/strict';
import { buildProblemGraph, explicitPartDependencies, readyPartIds, updateGraphTask } from '../app/js/b2-problem-graph.mjs';

assert.deepEqual(explicitPartDependencies(['Calculate 2+2', 'compute 3+4']), [[], []]);
assert.deepEqual(explicitPartDependencies(['Calculate 2+2', 'multiply that result by 3']), [[], ['part-1']]);
const word = 'A shop has 3 boxes. Each box has 4 pens. How many pens are there?';
const wordGraph = buildProblemGraph(word, [{ id: 'part-1', question: word, category: 'arithmetic',
  dependsOn: [], orderAfter: [], candidateOperations: ['falcon'] }]);
assert.ok(wordGraph.knownFacts.some(node => node.value === '3'));
assert.ok(wordGraph.knownFacts.some(node => node.value === '4'));
assert.ok(wordGraph.edges.some(edge => edge.relation === 'stated_input' && edge.to === 'part-1'));
assert.equal(wordGraph.requiredUnknowns[0].status, 'unresolved');
assert.ok(wordGraph.missingKnowledge.some(row => row.requirement === 'grounded_claim_verifier'));
assert.deepEqual(readyPartIds(wordGraph), ['part-1']);

const tasks = [
  { text: 'Complete this Python function. Return code only.\ndef add(a,b): return a+b', category: 'code',
    constraint: 'code_only', missing: 'independent_executable_tests' },
  { text: 'If all cats are mammals, is a cat a mammal? Answer yes or no.', category: 'logic',
    constraint: 'boolean_choice', missing: 'grounded_claim_verifier' },
  { text: 'Plan three steps for a backup and mention one risk.', category: 'planning',
    constraint: 'step_count', missing: 'blinded_semantic_assessment' },
  { text: 'How are you today?', category: 'conversation',
    constraint: null, missing: 'blinded_semantic_assessment' },
];
for (const [index, row] of tasks.entries()) {
  const graph = buildProblemGraph(row.text, [{ id: `part-${index + 1}`, question: row.text,
    category: row.category, dependsOn: [], orderAfter: [], candidateOperations: ['falcon'] }]);
  assert.equal(graph.requiredUnknowns.length, 1, row.category);
  assert.ok(graph.nodes.some(node => node.type === 'task' && node.intent.category === row.category));
  assert.ok(graph.candidateOperations.some(node => node.kind === 'falcon'));
  if (row.constraint) assert.ok(graph.constraints.some(node => node.kind === row.constraint), row.category);
  assert.ok(graph.missingKnowledge.some(node => node.requirement === row.missing), row.category);
}

const source = 'Calculate 2+2; then multiply that result by 3';
const dependencyGraph = buildProblemGraph(source, [
  { id: 'part-1', question: 'Calculate 2+2', category: 'arithmetic', dependsOn: [], orderAfter: [], candidateOperations: ['exact', 'falcon'] },
  { id: 'part-2', question: 'multiply that result by 3', category: 'arithmetic', dependsOn: ['part-1'],
    orderAfter: ['part-1'], candidateOperations: ['falcon'] },
]);
assert.deepEqual(readyPartIds(dependencyGraph), ['part-1']);
assert.ok(dependencyGraph.edges.some(edge => edge.from === 'part-1' && edge.to === 'part-2' && edge.relation === 'requires_verified_result'));
updateGraphTask(dependencyGraph, 'part-1', { status: 'verified', derivationId: 'derivation-1' });
assert.deepEqual(readyPartIds(dependencyGraph), ['part-2']);
assert.equal(dependencyGraph.nodes.find(node => node.id === 'part-1:unknown').verifiedBy, 'derivation-1');
updateGraphTask(dependencyGraph, 'part-2', { status: 'unverified' });
assert.equal(dependencyGraph.nodes.find(node => node.id === 'part-2:unknown').status, 'unresolved');
console.log('B2 graph selftest PASS');
