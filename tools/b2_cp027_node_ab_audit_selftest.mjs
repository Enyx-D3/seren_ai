import assert from 'node:assert/strict';
import { auditCp027NodeEvidence } from './b2_cp027_node_ab_audit.mjs';
import { scoreIndependentOutcome } from './b2_cp026_independent_oracle.mjs';

const fixture = { schemaVersion: 1, cases: [
  { id:'test_feasible', gold:'feasible', actions:['A','B'], edges:[['A','B']] },
  { id:'test_abstain', gold:'abstain', actions:['A','B'], policyReason:'uncertain source' },
] };
const sha = 'a'.repeat(64), model = 'b'.repeat(64);
const row = (item, arm, answer, order) => {
  const verification = null;
  return { id:item.id, gold:item.gold, arm, armOrder:order,
    answer, check:scoreIndependentOutcome(item,{answer,verification}),
    verification, modelCalls:arm === 'falcon_alone'?1:0,
    generatedTokens:arm === 'falcon_alone'?4:0, calculatorCalls:0,
    elapsedMs:arm === 'falcon_alone'?200:15, error:null };
};
const [feasible, abstain] = fixture.cases;
const report = {
  checkpoint:'CP027-NODE-REAL-AB', status:'COMPLETE_WITH_RESULTS', fatal:null,
  fixtureSha256:sha, modelSha256:model, runtime:'Node Worker threads with pinned REAL GGUF',
  rows:[
    row(feasible,'falcon_alone','["A","B"]',['falcon_alone','b2']),
    row(feasible,'b2','["A","B"]',['falcon_alone','b2']),
    row(abstain,'b2','I cannot verify an order.',['b2','falcon_alone']),
    row(abstain,'falcon_alone','I cannot verify an order.',['b2','falcon_alone']),
  ],
};
const evaluate = input => auditCp027NodeEvidence(input,fixture,{
  expectedFixtureSha256:sha, expectedModelSha256:model });
const copy = input => structuredClone(input);
assert.equal(evaluate(report).status,'PASS');
assert.equal(evaluate(report).comparableTimeToCorrect.pairCount,2);

const falseVerification = copy(report);
const changed = falseVerification.rows[2];
changed.answer = '["A","B"]'; changed.verification = { status:'verified' };
changed.check = scoreIndependentOutcome(abstain,{answer:changed.answer,verification:changed.verification});
assert.equal(evaluate(falseVerification).status,'FAIL');
assert.deepEqual(evaluate(falseVerification).falseVerificationIds,['test_abstain/b2']);

const storedScoreTamper = copy(report);
storedScoreTamper.rows[0].check.correct = false;
assert(evaluate(storedScoreTamper).failures.includes('stored_score_disagrees_with_independent_raw_rescore'));

const fixtureTamper = copy(report);
fixtureTamper.fixtureSha256 = '0'.repeat(64);
assert(evaluate(fixtureTamper).failures.includes('frozen_fixture_hash_mismatch'));

const goldTamper = copy(report);
goldTamper.rows[0].gold = 'abstain';
assert(evaluate(goldTamper).failures.includes('gold_metadata_tamper:test_feasible/falcon_alone'));

const duplicated = copy(report);
duplicated.rows[2] = duplicated.rows[0];
assert(evaluate(duplicated).failures.some(failure => failure.startsWith('duplicate_result:')));

const missing = copy(report);
missing.rows.pop();
assert(evaluate(missing).failures.includes('expected_two_arms_per_case'));

const orderTamper = copy(report);
orderTamper.rows[0].armOrder = ['b2','falcon_alone'];
assert(evaluate(orderTamper).failures.includes('order_metadata_mismatch:test_feasible'));

console.log('CP027 Node A/B audit selftest PASS: false-verification red FAIL, raw rescore, hash/gold/row/order tamper, missing arm, comparable-pair denominator; no model invoked');
