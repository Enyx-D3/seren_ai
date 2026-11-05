/* CP032 gold/scorer adversarial selftest. Does not call a model. */
import assert from 'node:assert/strict';
import { loadIndependentCp032Fixture, validateIndependentFixture,
  firstValidPermutation, independentlyScoreCp032, runIndependentCp032Evaluation,
  CP032_FIXTURE_SHA256 } from './b2_cp032_independent_eval.mjs';

const { fixture, validated } = await loadIndependentCp032Fixture();
assert.equal(validated.total, 42);
assert.equal(validated.feasible, 24);
assert.equal(validated.infeasible, 6);
assert.equal(validated.abstain, 12);
assert.ok(validated.domains >= 8);
assert.equal(validated.fixtureSha256, CP032_FIXTURE_SHA256);

const copy = () => structuredClone(fixture);
let tamperChecks = 0;
const rejects = (change, message) => {
  const variant = copy();
  change(variant);
  assert.throws(() => validateIndependentFixture(variant), undefined, message);
  tamperChecks++;
};
rejects(data => { data.cases[1].id = data.cases[0].id; }, 'duplicate case');
rejects(data => { data.cases[0].gold = 'infeasible'; }, 'mislabel feasible as cycle');
rejects(data => { data.cases[24].gold = 'feasible'; }, 'mislabel cycle as feasible');
rejects(data => { data.cases[0].edges[0][0] = 'Fake action'; }, 'out-of-inventory source edge');
rejects(data => { data.cases[0].edges[0][2] = 'Invented source quotation'; }, 'forged source edge');
rejects(data => { data.cases[0].edges[0][1] = data.cases[0].edges[0][0]; }, 'self precedence');
rejects(data => { data.cases[0].edges.push([...data.cases[0].edges[0]]); }, 'duplicate edge');
rejects(data => { data.cases[0].actions[1] = data.cases[0].actions[0]; }, 'duplicate inventory');
rejects(data => { data.cases[0].actions[1] = 'Invisible action'; }, 'absent inventory');
rejects(data => { data.cases[30].unsafeQuote = 'Unseen danger statement'; }, 'fake unsafe anchor');
rejects(data => { data.cases[30].reason = 'unknown'; }, 'unsupported negative reason');
rejects(data => { data.cases.splice(0, 20); }, 'insufficient category diversity');
rejects(data => { data.cases[0].source = 'tiny'; }, 'implausible short source');
assert.throws(() => validateIndependentFixture(fixture, {
  expectedSha256: '0'.repeat(64), bytes: new TextEncoder().encode('changed'),
}), /fixture_hash_mismatch/);
tamperChecks++;

const ordered = firstValidPermutation(['A', 'B', 'C'], [['A','B'], ['B','C']]);
assert.deepEqual(ordered, ['A','B','C']);
assert.equal(firstValidPermutation(['A','B'], [['A','B'], ['B','A']]), null);
assert.deepEqual(firstValidPermutation(['A','B','C'], [['A','C']]), ['A','B','C']);

const feasible = fixture.cases.find(item => item.gold === 'feasible');
const feasibleGoldOrder = firstValidPermutation(feasible.actions, feasible.edges);
const checkedValid = independentlyScoreCp032(feasible, {
  answer: JSON.stringify(feasibleGoldOrder), verification: {status:'verified'},
});
assert.equal(checkedValid.correct, true);
assert.equal(checkedValid.falseVerification, false);
const checkedFake = independentlyScoreCp032(feasible, {
  answer: JSON.stringify(feasibleGoldOrder.slice(0, -1)),
  verification: {status:'verified'},
});
assert.equal(checkedFake.correct, false);
assert.equal(checkedFake.falseVerification, true);
const checkedWrong = independentlyScoreCp032(feasible, {
  answer: JSON.stringify(feasibleGoldOrder.slice().reverse()),
  verification: {status:'verified'},
});
assert.equal(checkedWrong.falseVerification, true);
const unverified = independentlyScoreCp032(feasible, {
  answer: JSON.stringify(feasibleGoldOrder), verification: {status:'unverified'},
});
assert.equal(unverified.correct, false);
assert.equal(unverified.falseVerification, false);
const cycle = fixture.cases.find(item => item.gold === 'infeasible');
assert.equal(independentlyScoreCp032(cycle, {
  answer: 'No feasible order satisfies the constraints.',
  verification: {status:'verified'},
}).correct, true);
assert.equal(independentlyScoreCp032(cycle, {
  answer: 'No feasible order satisfies the constraints.',
  verification: {status:'unverified'},
}).correct, false);
const abstain = fixture.cases.find(item => item.gold === 'abstain');
assert.equal(independentlyScoreCp032(abstain, {
  answer: 'I cannot verify an order from unknown evidence.',
  verification: {status:'unverified'},
}).correct, true);
assert.equal(independentlyScoreCp032(abstain, {
  answer: JSON.stringify(['A','B']), verification: {status:'verified'},
}).falseVerification, true);

const report = await runIndependentCp032Evaluation(fixture);
assert.equal(report.rows.length, fixture.cases.length * 2);
assert.equal(report.byArm.existing.cases, fixture.cases.length);
assert.equal(report.byArm.prose_v2.cases, fixture.cases.length);
assert.equal(report.byArm.existing.modelCalls, 0);
assert.equal(report.byArm.prose_v2.modelCalls, 0);
assert.equal(report.byArm.existing.runtimeErrors, 0);
assert.equal(report.byArm.prose_v2.runtimeErrors, 0);
assert.equal(report.byArm.existing.falseVerifications, 0);
assert.equal(report.byArm.prose_v2.falseVerifications, 0);
assert.equal(report.strictQualityGate, 'NO_FALSE_VERIFICATION_IN_THIS_DEV_SET');

for (const item of fixture.cases) {
  const matched = report.rows.filter(row => row.id === item.id);
  assert.equal(matched.length, 2);
  for (const row of matched) {
    assert.deepEqual(row.score, independentlyScoreCp032(item, row));
    assert.equal(row.gold, item.gold);
    assert.equal(row.error, null);
    assert.equal(row.modelCalls, 0);
  }
}
console.log(JSON.stringify({
  status: 'PASS_INDEPENDENT_DEV_ORACLE', cases: validated.total, domains: validated.domains,
  categoryCounts: { feasible: validated.feasible, infeasible: validated.infeasible,
    abstain: validated.abstain }, tamperChecks, selftestSource: 'fixed source-gold graph',
  candidate: report.byArm.prose_v2, baseline: report.byArm.existing,
  browserRuns: 0, realModelRuns: 0,
}, null, 2));
