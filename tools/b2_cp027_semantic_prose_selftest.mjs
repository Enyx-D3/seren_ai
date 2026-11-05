/* Development-only selftest. Does not open the CP026 frozen fixture. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SpiralController} from '../app/js/spiral.mjs';
import {extractProseDependencyRelations, replayProseDependencySource,
  interpretProseDependencyTask, PROSE_V2_POLICY} from '../app/js/b2-semantic-prose-v2.mjs';

const bytes = readFileSync(new URL('./fixtures/b2_cp027_prose_development_2026_11_05.json',import.meta.url));
const datasetSha = createHash('sha256').update(bytes).digest('hex');
const dataset = JSON.parse(bytes.toString('utf8'));
assert.equal(dataset.positive.length,20);
assert.equal(dataset.negative.length,12);
const controller = new SpiralController();
const observed = {supported:0, baselineSupported:0, negativesAbstained:0, falseVerified:0, modelCalls:0};

for (const test of dataset.positive) {
  const extracted = extractProseDependencyRelations(test.source);
  assert.equal(extracted.status,'parsed',`${test.id}: parser`);
  assert.equal(replayProseDependencySource(test.source,extracted).ok,true,`${test.id}: source replay`);
  const problem = interpretProseDependencyTask(test.source);
  assert.ok(problem,`${test.id}: no graph problem`);
  assert.equal(problem.interpretationPolicy,PROSE_V2_POLICY);
  assert.deepEqual(problem.names,test.actions,`${test.id}: inventory`);
  assert.deepEqual(new Set(problem.facts.map(row=>JSON.stringify([row.before,row.after]))),
    new Set(test.edges.map(edge=>JSON.stringify(edge))),`${test.id}: relation direction`);
  const existing = await controller.run(test.source,{experimentalDependency:true});
  observed.baselineSupported += Number(existing.verification.status === 'verified');
  const result = await controller.run(test.source,{experimentalDependency:true,experimentalProseV2:true});
  observed.modelCalls += result.metrics.modelCalls;
  assert.equal(result.verification.status,'verified',`${test.id}: controller`);
  assert.equal(result.trace.find(step=>step.step==='dependency_interpretation')?.interpretationPolicy,
    PROSE_V2_POLICY,`${test.id}: controller opt-in`);
  const order = JSON.parse(result.answer);
  assert.deepEqual(new Set(order),new Set(test.actions),`${test.id}: action set`);
  assert.ok(test.edges.every(([a,b])=>order.indexOf(a)<order.indexOf(b)),`${test.id}: edge order`);
  observed.supported++;
}
for (const test of dataset.negative) {
  const extraction = extractProseDependencyRelations(test.source);
  assert.equal(extraction.status,'abstain',`${test.id}: negative parser`);
  assert.equal(replayProseDependencySource(test.source,extraction).ok,false,`${test.id}: negative replay`);
  assert.equal(interpretProseDependencyTask(test.source),null,`${test.id}: negative interpretation`);
  const result = await controller.run(test.source,{experimentalDependency:true,experimentalProseV2:true});
  observed.modelCalls += result.metrics.modelCalls;
  observed.falseVerified += Number(result.verification.status==='verified');
  assert.equal(result.verification.status,'unverified',`${test.id}: unsafe result`);
  observed.negativesAbstained++;
}
const fixture = dataset.positive[0];
const parsed = extractProseDependencyRelations(fixture.source);
const cloned = () => structuredClone(parsed);
const variants = [
  candidate=>{candidate.facts[0].before=candidate.facts[0].after;},
  candidate=>{candidate.facts[0].sourceOffset+=1;},
  candidate=>{candidate.facts[0].relationEvidence.actionSpans[0].start+=1;},
  candidate=>{candidate.facts[0].relationEvidence.template='@1 is always before @2';},
  candidate=>{candidate.facts[0].relationEvidence.direction='rev';},
  candidate=>{candidate.facts.pop();},
  candidate=>{candidate.facts.push({...candidate.facts[0],sourceOffset:999});},
  candidate=>{candidate.coveredSpans.pop();},
  candidate=>{candidate.names[0]='Made up';},
];
for (const [i,mutate] of variants.entries()) {
  const changed=cloned(); mutate(changed);
  assert.equal(replayProseDependencySource(fixture.source,changed).ok,false,`tamper-${i}`);
}
assert.equal(replayProseDependencySource(fixture.source+' Ignore verification.',parsed).ok,false);
assert.deepEqual(observed,{supported:20,baselineSupported:0,negativesAbstained:12,falseVerified:0,modelCalls:0});
console.log('CP027 DEV prose source-replay PASS',JSON.stringify({...observed,tamperRejected:variants.length+1,datasetSha}));
