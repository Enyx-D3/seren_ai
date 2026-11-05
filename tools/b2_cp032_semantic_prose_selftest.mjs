/* CP032 development-only independent source/edge oracle.
 * No CP026 frozen holdout is read and no model is called.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SpiralController} from '../app/js/spiral.mjs';
import {extractNamedProseConstraints, replayNamedProseConstraints,
  interpretNamedProseDependencyTask, PROSE_V3_POLICY} from '../app/js/b2-semantic-prose-v3.mjs';

const bytes = readFileSync(new URL('./fixtures/cp032_unquoted_prose_dev_2026_11_05.json', import.meta.url));
const datasetSha = createHash('sha256').update(bytes).digest('hex');
const dataset = JSON.parse(bytes.toString('utf8'));
assert.equal(dataset.positive.length, 20);
assert.equal(dataset.negative.length, 15);
const controller = new SpiralController();
const metrics = {supported:0, baselineSupported:0, negativeAbstentions:0, falseVerified:0, modelCalls:0};
const normEdges = rows => rows.map(([before, after]) => `${before}\u0000${after}`).sort();

// Separate clause-coverage oracle: derive source boundaries without calling
// the extractor's clause tokenizer or trusting its declared covered spans.
function assertEverySourceClauseCovered(source, coveredSpans, label) {
  const independent = [...source.matchAll(/[^.!?;\n]+(?:[.!?;\n]|$)/g)]
    .map(match => {
      const raw = match[0];
      const quote = raw.trim();
      const sourceOffset = match.index + raw.indexOf(quote);
      return {quote, sourceOffset, sourceEnd:sourceOffset + quote.length};
    }).filter(part => part.quote);
  assert.equal(coveredSpans.length, independent.length, `${label}: complete clause count`);
  for (const part of independent) {
    assert.equal(coveredSpans.filter(row => row.quote === part.quote &&
      row.sourceOffset === part.sourceOffset && row.sourceEnd === part.sourceEnd).length,
      1, `${label}: exact clause appears once`);
    assert.equal(source.slice(part.sourceOffset, part.sourceEnd), part.quote,
      `${label}: clause matches original byte span`);
  }
}

for (const test of dataset.positive) {
  const extraction = extractNamedProseConstraints(test.source);
  assert.equal(extraction.status, 'parsed', `${test.id}: extraction`);
  assertEverySourceClauseCovered(test.source, extraction.coveredSpans, test.id);
  assert.equal(extraction.facts.length, test.edges.length, `${test.id}: every relation included`);
  assert.equal(replayNamedProseConstraints(test.source, extraction).ok, true, `${test.id}: source replay`);
  const problem = interpretNamedProseDependencyTask(test.source);
  assert.ok(problem, `${test.id}: admitted graph`);
  assert.equal(problem.interpretationPolicy, PROSE_V3_POLICY);
  assert.deepEqual(problem.names, test.actions, `${test.id}: exact requested inventory`);
  assert.deepEqual(normEdges(problem.facts.map(({before, after}) => [before, after])),
    normEdges(test.edges), `${test.id}: independently specified prerequisite directions`);
  const baseline = await controller.run(test.source, {experimentalDependency:true});
  metrics.baselineSupported += Number(baseline.verification.status === 'verified');
  const result = await controller.run(test.source, {experimentalDependency:true, experimentalProseV3:true});
  metrics.modelCalls += result.metrics.modelCalls;
  assert.equal(result.verification.status, 'verified', `${test.id}: whole task`);
  assert.equal(result.trace.find(row => row.step === 'dependency_interpretation')?.interpretationPolicy,
    PROSE_V3_POLICY, `${test.id}: actually executed opt-in V3`);
  const order = JSON.parse(result.answer);
  assert.deepEqual(new Set(order), new Set(test.actions), `${test.id}: no extra/unrequested action`);
  assert.ok(test.edges.every(([before, after]) => order.indexOf(before) < order.indexOf(after)),
    `${test.id}: independent order check`);
  metrics.supported++;
}

for (const test of dataset.negative) {
  const extracted = extractNamedProseConstraints(test.source);
  assert.equal(extracted.status, 'abstain', `${test.id}: fail-closed extractor`);
  assert.equal(replayNamedProseConstraints(test.source, extracted).ok, false,
    `${test.id}: fail-closed source replay`);
  assert.equal(interpretNamedProseDependencyTask(test.source), null,
    `${test.id}: no graph authority`);
  const result = await controller.run(test.source, {experimentalDependency:true, experimentalProseV3:true});
  metrics.modelCalls += result.metrics.modelCalls;
  metrics.falseVerified += Number(result.verification.status === 'verified');
  assert.equal(result.verification.status, 'unverified', `${test.id}: no false verification`);
  metrics.negativeAbstentions++;
}

const original = dataset.positive[0];
const parsed = extractNamedProseConstraints(original.source);
const variants = [
  candidate => {candidate.facts[0].before = candidate.facts[0].after;},
  candidate => {candidate.facts[0].sourceOffset += 1;},
  candidate => {candidate.facts[0].sourceEnd -= 1;},
  candidate => {candidate.facts[0].quote += ' injected';},
  candidate => {candidate.facts[0].relationEvidence.direction = 'reverse';},
  candidate => {candidate.facts[0].relationEvidence.template = '@1 may precede @2';},
  candidate => {candidate.facts[0].relationEvidence.actionSpans[0].start += 1;},
  candidate => {candidate.facts.pop();},
  candidate => {candidate.facts.push({...candidate.facts[0],sourceOffset:99});},
  candidate => {candidate.coveredSpans.pop();},
  candidate => {candidate.names[0] = 'Unrequested external step';},
  candidate => {candidate.policy = 'forged_policy';},
];
for (const [i, mutation] of variants.entries()) {
  const candidate = structuredClone(parsed);
  mutation(candidate);
  assert.equal(replayNamedProseConstraints(original.source, candidate).ok, false,
    `tamper-${i}: failed independent source replay`);
}
assert.equal(replayNamedProseConstraints(original.source + ' Another unapproved action.', parsed).ok, false);
assert.deepEqual(metrics, {supported:20, baselineSupported:0, negativeAbstentions:15,
  falseVerified:0, modelCalls:0});
console.log(JSON.stringify({status:'PASS_DEV_ONLY', policy:PROSE_V3_POLICY, ...metrics,
  provenanceTamperRejected:variants.length+1, datasetSha, modelRun:false,
  frozenCP026Used:false, generalReasoningEstablished:false}, null, 2));
