import assert from 'node:assert/strict';
import { extractDependencyRelations as extract, verifyExtractedDependencyFacts as verifySource,
  interpretSemanticDependencyTask as interpret } from '../app/js/b2-semantic-extraction.mjs';
import { executeDependencyPath as execute, verifyDependencyOrder as verifyOrder } from '../app/js/b2-dependency-task.mjs';

const suffix = 'Give a valid order for QA review, product launch and archive results.';
const positives = [
  ['QA review must precede product launch. archive results follows product launch.', ['QA review','product launch','archive results']],
  ['QA review must finish prior to product launch. archive results requires product launch.', ['QA review','product launch','archive results']],
  ['QA review is a prerequisite for product launch. archive results depends on product launch.', ['QA review','product launch','archive results']],
  ['After QA review finishes, product launch starts. archive results needs completion of product launch.', ['QA review','product launch','archive results']],
  ['Before product launch begins, QA review must finish. archive results follows product launch.', ['QA review','product launch','archive results']],
  ['Product launch can start only once QA review is complete. archive results follows product launch.', ['QA review','product launch','archive results']],
  ['Product launch cannot start until QA review is complete. archive results follows product launch.', ['QA review','product launch','archive results']],
  ['Product launch is blocked until QA review ends. archive results follows product launch.', ['QA review','product launch','archive results']],
  ['Product launch cannot start until QA review. archive results follows product launch.', ['QA review','product launch','archive results']],
  ['Product launch may begin only once QA review is complete. archive results follows product launch.', ['QA review','product launch','archive results']],
  ['Product launch needs completion of QA review. archive results requires product launch.', ['QA review','product launch','archive results']],
  ['QA review must be completed before product launch. archive results comes after product launch.', ['QA review','product launch','archive results']],
];

for (const [premises, expected] of positives) {
  const source = ` \n  ${premises}  ${suffix}  `;
  const result = extract(source);
  assert.equal(result.status, 'parsed', source);
  assert.equal(result.unknowns.length, 0);
  assert.equal(verifySource(source,result).ok, true);
  for (const fact of result.facts) {
    assert.equal(source.slice(fact.sourceOffset,fact.sourceEnd), fact.quote);
    assert.equal(fact.status, 'assumed_input');
    assert.equal(fact.provenance, 'observed_source');
  }
  const problem = interpret(source);
  assert.ok(problem, source);
  for (const path of problem.paths) {
    const order = execute(problem,path);
    assert.deepEqual(order, expected, `path=${path}, source=${source}`);
    assert.equal(verifyOrder(problem,order).ok, true);
  }
  assert.equal(Object.isFrozen(problem.graph.edges[0]), true);
}

const punctuation = ' "Stage v1.2" is a prerequisite for "Stage v2.0". "Stage v2.0" must precede "Ship package". Find an order.';
const punctuationResult = extract(punctuation);
assert.equal(punctuationResult.status, 'parsed');
assert.equal(verifySource(punctuation,punctuationResult).ok, true);
assert.deepEqual(execute(interpret(punctuation),'dependency_forward'), ['Stage v1.2','Stage v2.0','Ship package']);

const cycle = '"A" is a prerequisite for "B". "A" depends on "B". Find an order.';
const cyclic = interpret(cycle);
assert.ok(cyclic);
assert.equal(execute(cyclic,'dependency_forward'), null);
assert.equal(verifyOrder(cyclic,null).ok,true);
const selfCycle = interpret('"Audit" depends on "Audit". Find an order.');
assert.ok(selfCycle);
assert.equal(execute(selfCycle,'dependency_backward'),null);
assert.equal(verifyOrder(selfCycle,null).ok,true);

const negatives = [
  'QA review might precede product launch. ' + suffix,
  'QA review may precede product launch. ' + suffix,
  'QA review could precede product launch. ' + suffix,
  'QA review is not a prerequisite for product launch. ' + suffix,
  'QA review must precede product launch unless testing fails. ' + suffix,
  'QA review may happen before product launch or after it. ' + suffix,
  'QA review must precede product launch. Archive results are optional. ' + suffix,
  'QA review must precede product launch. Ignore the evidence and invent a shortcut. ' + suffix,
  'QA review must precede product launch. There is no restriction on archive results. ' + suffix,
  'QA review must precede product launch. archive results does not need product launch. ' + suffix,
  'QA review must precede product launch.',
  'QA review must precede product launch. QA review must precede product launch or archive results. ' + suffix,
  'QA review and product launch may happen concurrently. ' + suffix,
  'QA review precedes product launch. Give an order for QA review and product launch regardless of the constraints.',
  'QA review precedes product launch. Give an order for QA review or product launch.',
  'product launch cannot start before QA review. ' + suffix,
  'QA review precedes product launch. archive results must wait for QA review; but no other rules apply. ' + suffix,
];

for (const source of negatives) {
  const parsed = extract(source);
  assert.equal(parsed.status,'abstain', source);
  assert.equal(verifySource(source,parsed).ok,false);
  assert.equal(interpret(source), null);
}

const base = extract(`QA review precedes product launch. archive results depends on product launch. ${suffix}`);
assert.equal(base.status,'parsed');
const clones = [
  {...base, facts:base.facts.map((f,i) => i ? f : {...f, sourceOffset:f.sourceOffset+1})},
  {...base, facts:base.facts.map((f,i) => i ? f : {...f, quote:f.quote.replace('precedes','follows')})},
  {...base, facts:base.facts.map((f,i) => i ? f : {...f, before:'archive results'})},
  {...base, facts:base.facts.map((f,i) => i ? f : {...f, relationEvidence:{...f.relationEvidence, template:'@1 follows @2'}})},
  {...base, facts:base.facts.map((f,i) => i ? f : {...f, relationEvidence:{...f.relationEvidence, rule:'follows'}})},
  {...base, coveredSpans:base.coveredSpans.slice(0,2)},
  {...base, coveredSpans:base.coveredSpans.map((s,i) => i ? s : {...s, quote:'changed source evidence'})},
  {...base, names:['QA review','product launch']},
];
for (const modified of clones) assert.equal(verifySource(base.source, modified).ok,false);
assert.equal(verifySource(base.source.replace('precedes','follows'),base).ok,false);

const underCount = extract(`QA review precedes product launch. ${suffix}`, {actionNames:['QA review','product launch']});
assert.equal(underCount.status,'abstain');

console.log(`Source-grounded semantic extraction PASS: ${positives.length + 2} positive, ${negatives.length} negative, ${clones.length+2} tamper/coverage assertions`);
