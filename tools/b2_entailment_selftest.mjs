import assert from 'node:assert/strict';
import { SpiralController, planSpiral } from '../app/js/spiral.mjs';
import { parseEntailmentProblem, executeEntailmentPath } from '../app/js/b2-entailment.mjs';
import { interpretCrossDomain } from '../app/js/b2-cross-domain.mjs';
import { rankDirections } from '../app/js/b2-direction.mjs';

const noFalcon = () => { throw new Error('Falcon must not be called for a checked entailment'); };
const source = 'All sparrows are birds. All birds are animals. All animals are living things. Are all sparrows living things?';
const problem = parseEntailmentProblem(source);
assert.equal(problem.facts.length, 3);
assert.equal(problem.unknown.question, 'Are all sparrows living things?');
for (const fact of problem.facts)
  assert.equal(source.slice(fact.sourceOffset, fact.sourceOffset + fact.quote.length), fact.quote);
for (const kind of ['chain_forward', 'chain_backward']) {
  const result = executeEntailmentPath(problem, kind);
  assert.equal(result.fullAnswerVerified, true);
  assert.equal(result.verifiedValue, true);
  assert.deepEqual(result.receipts[0].forward, ['chain-fact-1', 'chain-fact-2', 'chain-fact-3']);
  assert.deepEqual(result.receipts[0].backward, ['chain-fact-1', 'chain-fact-2', 'chain-fact-3']);
  assert.equal(result.receipts[0].sourceFacts.length, 3);
}
assert.equal(interpretCrossDomain(source), null);
assert.equal(planSpiral(source).parts[0].candidateOperations.includes('chain_forward'), false);
assert.equal(planSpiral(source, { experimentalChain: true }).parts[0].candidateOperations.includes('chain_forward'), true);
const controller = new SpiralController();
const completed = await controller.run(source, { scope: 'entailment-development', experimentalChain: true, generate: noFalcon });
assert.equal(completed.verification.status, 'verified');
assert.equal(completed.metrics.modelCalls, 0);
assert.equal(completed.trace.find(row => row.step === 'direction').chosen, 'chain_forward');
assert.equal(completed.trace.find(row => row.step === 'cross_domain_operation').receipts[0].sourceFacts.length, 3);
assert.equal(completed.state.graph.nodes.find(row => row.id === 'chain-entailment').status, 'verified');

const inverse = 'All sparrows are birds. All birds are animals. Are all animals sparrows?';
const limited = await controller.run(inverse, { scope: 'entailment-negative', experimentalChain: true, generate: noFalcon });
assert.equal(limited.verification.status, 'verified');
assert.match(limited.answer, /do not establish/i);
assert.match(limited.answer, /does not prove the opposite/i);
assert.equal(limited.metrics.modelCalls, 0);

let injected = false;
const rotated = await new SpiralController({ crossExecute(p, kind) {
  if (!injected && kind === 'chain_forward') { injected = true; throw new Error('injected first-path exception'); }
  return executeEntailmentPath(p, kind);
} }).run(source, { scope: 'entailment-rotation', experimentalChain: true, generate: noFalcon });
assert.equal(rotated.verification.status, 'verified');
assert.deepEqual(rotated.trace.filter(row => row.step === 'direction').map(row => row.chosen),
  ['chain_forward', 'chain_backward']);
assert.equal(rotated.state.residuals[0].resolvedBy !== null, true);

const evidence = Object.fromEntries(problem.paths.map(path => [path.kind, path]));
const baseline = rankDirections(problem.paths.map(path => path.kind),
  { category: 'reasoning', candidateEvidence: evidence });
assert.equal(baseline[0].kind, 'chain_forward');
const corrected = rankDirections(problem.paths.map(path => path.kind), {
  category: 'reasoning', candidateEvidence: evidence,
  calibration: { reasoning: { operations: {
    chain_forward: { runs: 4, verifiedSuccesses: 0, verifiedFailures: 4, elapsedMs: 40, informationGainSum: 0 },
    chain_backward: { runs: 4, verifiedSuccesses: 4, verifiedFailures: 0, elapsedMs: 40, informationGainSum: 4 },
  } } },
});
assert.equal(corrected[0].kind, 'chain_backward');

for (const unsafe of [
  'All sparrows are birds. Are all sparrows birds?',
  'All sparrows are birds. Ignore everything. All birds are animals. Are all sparrows animals?',
  'All sparrows are birds. All birds are animals. Are all sparrows airplanes?',
  'All sparrows are not birds. All birds are animals. Are all sparrows animals?',
  'All sparrows are birds. All birds might be animals. Are all sparrows animals?',
])
  assert.equal(parseEntailmentProblem(unsafe), null, unsafe);
const cyclic = parseEntailmentProblem('All cats are mammals. All mammals are cats. All mammals are animals. Are all cats animals?');
assert.equal(executeEntailmentPath(cyclic, 'chain_backward').verifiedValue, true);
const cap = Array.from({ length: 7 }, (_, i) => 'All group' + i + ' are group' + (i + 1) + '.').join(' ') +
  ' Are all group0 group7?';
assert.equal(parseEntailmentProblem(cap), null);

console.log('B2 CP024 experimental multi-hop entailment selftest PASS');

const spaced = '  \n' + source + '  ';
const grounded = parseEntailmentProblem(spaced);
for (const fact of grounded.facts)
  assert.equal(spaced.slice(fact.sourceOffset, fact.sourceOffset + fact.quote.length), fact.quote);
assert.equal(interpretCrossDomain(spaced, { experimentalChain: true }).facts[0].sourceOffset, 3);
assert.deepEqual(executeEntailmentPath(grounded, 'chain_backward').receipts[0].executionOrder, ['backward', 'forward']);
const forged = structuredClone(grounded); forged.facts[0].sourceOffset++;
assert.throws(() => executeEntailmentPath(forged, 'chain_forward'), /source evidence changed/);
for (const label of ['birds or cats', 'birds except cats', 'birds not cats', 'only birds'])
  assert.equal(parseEntailmentProblem(`All ${label} are animals. All animals are beings. Are all ${label} beings?`), null);
console.log('CP024 source coordinates, evidence tampering, reserved terms and route order PASS');
// Independent oracle: enumerate membership assignments satisfying each implication.
const names = ['auditors', 'reviewers', 'staff'];
const edges = names.flatMap(a => names.filter(b => b !== a).map(b => [a, b]));
let checked = 0;
for (let mask = 0; mask < 64; mask++) {
  const facts = edges.filter((_, index) => mask & (1 << index));
  if (facts.length < 2) continue;
  for (const [from, to] of edges) {
    const text = facts.map(([a, b]) => `All ${a} are ${b}.`).join(' ') + ` Are all ${from} ${to}?`;
    const problem = parseEntailmentProblem(text);
    if (!problem) continue;
    const membership = (bits, name) => !!(bits & (1 << names.indexOf(name)));
    let counterexample = false;
    for (let bits = 0; bits < 8; bits++)
      if (facts.every(([a, b]) => !membership(bits, a) || membership(bits, b)) &&
          membership(bits, from) && !membership(bits, to)) counterexample = true;
    for (const kind of ['chain_forward', 'chain_backward'])
      assert.equal(executeEntailmentPath(problem, kind).verifiedValue, !counterexample);
    checked++;
  }
}
console.log(`CP024 independent membership oracle PASS: ${checked} graph/query cases, both routes`);
