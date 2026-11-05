import assert from 'node:assert/strict';
import { extractDependencyRelations, interpretSemanticDependencyTask,
  verifyExtractedDependencyFacts } from '../app/js/b2-semantic-extraction.mjs';
import { interpretDependencyTask, verifyDependencyOrder } from '../app/js/b2-dependency-task.mjs';
import { SpiralController } from '../app/js/spiral.mjs';

// Independently authored adversarial variants; not taken from or added to
// frozen held-out evaluation material. Each names a closed set of requested
// actions yet supplies an external prerequisite that must not be auto-added.
const negatives = [
  '"Deliver report" follows "Approve budget". Give a valid order for Deliver report and File report.',
  '"Approve budget" must precede "Deliver report". Give a valid order for Deliver report and File report.',
  'Approve budget precedes Deliver report. Give a valid order for Deliver report and File report.',
  'Deliver report follows Approve budget. Give a valid order for deliver report and File report.',
  'Before "Deliver report" starts, "Approve budget" must finish. Give a valid order for Deliver report and File report.',
];

for (const [i, source] of negatives.entries()) {
  const extraction = extractDependencyRelations(source);
  assert.equal(extraction.status, 'abstain', `semantic extraction ${i}`);
  assert.ok(extraction.unknowns.some(item => ['prerequisite_outside_requested_inventory',
    'unsupported_or_ambiguous_clause'].includes(item.reason)),
    `semantic missing explicit inventory/coverage residual ${i}`);
  assert.equal(verifyExtractedDependencyFacts(source, extraction).ok, false,
    `independent source check ${i}`);
  assert.equal(interpretSemanticDependencyTask(source), null, `semantic admission ${i}`);
  const legacy = interpretDependencyTask(source);
  assert.ok(!legacy || legacy.unknowns.some(item => item.reason === 'prerequisite_outside_requested_inventory'),
    `legacy admission ${i}`);
  if (legacy) assert.equal(verifyDependencyOrder(legacy, legacy.names).ok, false,
    `verifier must not certify a known-unsupported source contract ${i}`);
  const answer = await new SpiralController().run(source, { experimentalDependency: true,
    scope: `cp027-inventory-adversarial-${i}` });
  assert.equal(answer.verification.status, 'unverified', `end-to-end false verification ${i}`);
  assert.equal(answer.metrics.modelCalls, 0, `unexpected model call ${i}`);
}

const positives = [
  '"Approve budget" must precede "Deliver report". Give a valid order for Approve budget and Deliver report.',
  'Approve budget precedes Deliver report. Give a valid order for Approve budget and Deliver report.',
];
for (const [i, source] of positives.entries()) {
  const extraction = extractDependencyRelations(source);
  assert.equal(extraction.status, 'parsed', `valid inventory unexpectedly rejected ${i}`);
  assert.equal(verifyExtractedDependencyFacts(source, extraction).ok, true,
    `valid inventory independent source check ${i}`);
  const result = await new SpiralController().run(source, { experimentalDependency: true,
    scope: `cp027-inventory-positive-${i}` });
  assert.equal(result.verification.status, 'verified', `valid inventory not solved ${i}`);
  assert.deepEqual(JSON.parse(result.answer), ['Approve budget', 'Deliver report']);
}

// Force a tamper-like state even when source spans, relations, and covered
// spans are internally consistent: an excluded requested-inventory member
// still must defeat the independent verifier.
const forgedSource = negatives[0];
const forgedExtraction = extractDependencyRelations(forgedSource);
const tampered = { ...forgedExtraction, unknowns: [], status: 'parsed' };
assert.ok(verifyExtractedDependencyFacts(forgedSource, tampered).residuals.includes('prerequisite_outside_requested_inventory'));

console.log(`CP027 source-inventory fail-closed PASS: ${negatives.length} adversarial, ${positives.length} positive, 1 forged-status check`);
