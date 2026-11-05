import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SpiralController, planSpiral } from '../app/js/spiral.mjs';

const frozenPath = new URL('./fixtures/b2_v2_parallel_dependency_confirmation_2026_11_05.json', import.meta.url);
const bytes = readFileSync(frozenPath);
assert.equal(createHash('sha256').update(bytes).digest('hex'),
  'fb9cedee175024d2871d0653d2f4e62970be2d79b89674077f71744b0b7933b8');
const { cases } = JSON.parse(bytes.toString('utf8'));
const controller = new SpiralController();
let verified = 0, abstained = 0;
for (const test of cases) {
  const baselinePlan = planSpiral(test.source);
  assert.ok(!baselinePlan.parts.some(part => part.candidateOperations.some(kind => kind.startsWith('dependency_'))),
    `${test.id}: experimental operation leaked into default plan`);
  const result = await controller.run(test.source, {
    scope: `cp025-${test.id}`, experimentalDependency: true,
    // Never call Falcon in this source-to-execution verification harness.
  });
  assert.equal(result.metrics.modelCalls, 0, `${test.id}: unexpected model call`);
  if (test.gold === 'abstain') {
    assert.equal(result.verification.status, 'unverified', `${test.id}: unsafe acceptance`);
    abstained++;
    continue;
  }
  assert.equal(result.verification.status, 'verified', `${test.id}: supported request not checked`);
  if (test.gold === 'infeasible') {
    assert.match(result.answer, /No feasible order/, `${test.id}: cycle not detected`);
  } else {
    const order = JSON.parse(result.answer);
    const names = [...new Set(test.edges.flat())];
    assert.equal(order.length, names.length, `${test.id}: missing or extra actions`);
    assert.deepEqual(new Set(order), new Set(names), `${test.id}: wrong action inventory`);
    assert.ok(test.edges.every(([before, after]) => order.indexOf(before) < order.indexOf(after)),
      `${test.id}: source constraint violated`);
  }
  assert.ok(result.trace.some(step => step.step === 'dependency_joint'), `${test.id}: no joint execution`);
  verified++;
}
assert.equal(verified, 27);
assert.equal(abstained, 13);

// A real controller-loop, model-proposal-shaped failure can make incremental
// guarded progress without promoting a partial component to a whole answer.
const repairSource = '"Unseal vessel" must finish before "Sample water". "Archive reading" depends on "Sample water". Give a valid order.';
let repairCalls = 0;
const guarded = await controller.run(repairSource, {
  scope: 'cp025-cortex-repair', experimentalDependency: true, experimentalCortexGuard: true,
  generate: async () => ({ text: ++repairCalls === 1 ?
    '["Archive reading","Sample water","Unseal vessel"]' :
    (repairCalls === 2 ? 'Unseal vessel' : 'Sample water'), tokens: 3 }),
});
assert.equal(guarded.verification.status, 'verified');
const admissions = guarded.trace.filter(step => step.step === 'cortex_repair_admission').map(step => step.receipt);
assert.deepEqual(admissions.map(row => row.status), ['checked_partial', 'verified']);
assert.deepEqual(admissions.map(row => row.wholeTaskVerified), [false, true]);
assert.equal(repairCalls, 3);

const paraphrasedSource = 'invoice approval is a prerequisite for fund transfer. Give an order for invoice approval and fund transfer.';
let paraphraseCalls = 0;
const paraphrasedRepair = await controller.run(paraphrasedSource, {
  scope: 'cp025-semantic-cortex', experimentalDependency: true, experimentalCortexGuard: true,
  generate: async () => ({ text: ++paraphraseCalls === 1 ?
    '["fund transfer","invoice approval"]' : 'invoice approval', tokens: 2 }),
});
assert.equal(paraphrasedRepair.verification.status, 'verified');
assert.equal(paraphrasedRepair.trace.find(row => row.step === 'dependency_interpretation')?.interpretationPolicy,
  'b2-semantic-dependency-candidate-1');
assert.equal(paraphrasedRepair.trace.find(row => row.step === 'cortex_repair_admission')?.receipt.wholeTaskVerified, true);
assert.equal(paraphrasedRepair.trace.find(row => row.step === 'dependency_operation')?.repairedProposalReused, true);
assert.equal(paraphraseCalls, 2);
console.log('CP025 source -> Spiral -> GraphOS -> joint -> independent whole-task verifier PASS:',
  `${verified}/27 supported, ${abstained}/13 scoped abstentions, 0 model calls in confirmation; Cortex guarded repairs with deterministic model-proposal doubles`);
