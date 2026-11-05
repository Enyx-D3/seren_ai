import assert from 'node:assert/strict';
import { validateCp026Fixture, independentlyScoreCp026Case, summarizeCp026Rows } from './b2_cp026_ab_oracle.mjs';

const cases = [
  { id: 'a', source: '"Alpha" before "Beta". Give an order.', gold: 'feasible',
    actions: ['Alpha','Beta'], edges: [['Alpha','Beta']] },
  { id: 'b', source: '"Alpha" before "Beta". "Beta" before "Alpha".', gold: 'infeasible',
    actions: ['Alpha','Beta'], edges: [['Alpha','Beta'],['Beta','Alpha']] },
  { id: 'c', source: '"Alpha" may happen before "Beta". Give an order.', gold: 'abstain',
    actions: ['Alpha','Beta'], policyReason: 'uncertain relation' },
];
assert.equal(validateCp026Fixture({ schemaVersion: 1, cases }), 3);
assert.throws(() => validateCp026Fixture({ schemaVersion: 1,
  cases: [{ ...cases[0], gold: 'infeasible' }] }), /cycle mismatch/);
assert.throws(() => validateCp026Fixture({ schemaVersion: 1,
  cases: [{ ...cases[0], edges: [['Alpha','Gamma']] }] }), /invalid edge/);
assert.throws(() => validateCp026Fixture({ schemaVersion: 1, cases: [cases[0], cases[0]] }), /duplicated/);
assert.equal(independentlyScoreCp026Case(cases[0], '["Alpha","Beta"]').correct, true);
assert.equal(independentlyScoreCp026Case(cases[0], '["Beta","Alpha"]').correct, false);
assert.equal(independentlyScoreCp026Case(cases[0], '["Alpha","Beta","Extra"]').correct, false);
assert.equal(independentlyScoreCp026Case(cases[0], '["Alpha","Beta"] explanation').correct, false);
assert.equal(independentlyScoreCp026Case(cases[1], 'No feasible order satisfies all stated prerequisites.').correct, true);
assert.equal(independentlyScoreCp026Case(cases[1], '["Alpha","Beta"]').correct, false);
assert.equal(independentlyScoreCp026Case(cases[2], 'I cannot verify an order.').correct, true);
assert.equal(independentlyScoreCp026Case(cases[2], '["Alpha","Beta"]', { status: 'verified' }).falseVerification, true);
assert.equal(independentlyScoreCp026Case(cases[0], 'maybe', { status: 'verified' }).falseVerification, true);
assert.equal(independentlyScoreCp026Case(cases[2], 'I cannot verify an order.', { status: 'verified' }).correct, false);
const pairs = [
  { id: 'a', arm: 'falcon_alone', check: { correct: true }, elapsedMs: 1000, metrics: { modelCalls: 1 } },
  { id: 'a', arm: 'b2', check: { correct: true }, elapsedMs: 500, metrics: { modelCalls: 0 } },
  { id: 'b', arm: 'falcon_alone', check: { correct: false }, elapsedMs: 2000, metrics: { modelCalls: 1 } },
  { id: 'b', arm: 'b2', check: { correct: true }, elapsedMs: 100, metrics: { modelCalls: 1 } },
];
const summary = summarizeCp026Rows(pairs);
assert.equal(summary.comparableBothCorrect, 1);
assert.deepEqual(summary.timeToCorrectComparableMs, { falcon_alone: [1000], b2: [500] });
assert.equal(summary.totals.b2.correct, 2);
assert.equal(summary.totals.falcon_alone.correct, 1);
console.log('CP026 independent A/B oracle selftest PASS (gold consistency, false verification, comparative timing)');
