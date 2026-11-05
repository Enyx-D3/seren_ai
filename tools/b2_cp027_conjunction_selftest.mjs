/* CP027 development-only conjunctive prerequisite tests.
 * Authored separately from the frozen CP026 independent confirmation fixture.
 * Model-free verification does not establish real Falcon-led repair. */
import assert from 'node:assert/strict';
import { extractDependencyRelations, verifyExtractedDependencyFacts,
  interpretSemanticDependencyTask } from '../app/js/b2-semantic-extraction.mjs';
import { verifyDependencyOrder } from '../app/js/b2-dependency-task.mjs';
import { SpiralController } from '../app/js/spiral.mjs';

const positives = [
  { source: '"Release package" requires both "Run tests" and "Sign artifact" to finish. Give an order for Release package, Run tests and Sign artifact.',
    edges: [['Run tests', 'Release package'], ['Sign artifact', 'Release package']] },
  { source: '"Ship invoice" depends on "Calculate total" and "Check address". Give a valid order for Ship invoice, Calculate total and Check address.',
    edges: [['Calculate total', 'Ship invoice'], ['Check address', 'Ship invoice']] },
  { source: '"Publish note" can start only after "Check facts" and "Proofread text" finish. Produce a schedule for Publish note, Check facts and Proofread text.',
    edges: [['Check facts', 'Publish note'], ['Proofread text', 'Publish note']] },
  { source: '"Send package" needs "Seal box" and "Print label" completed first. "Archive receipt" follows "Send package". Return a sequence for Send package, Seal box, Print label and Archive receipt.',
    edges: [['Seal box', 'Send package'], ['Print label', 'Send package'], ['Send package', 'Archive receipt']] },
  { source: 'Both "Inspect tank" and "Measure pressure" must finish before "Open valve". Show an order for Inspect tank, Measure pressure and Open valve.',
    edges: [['Inspect tank', 'Open valve'], ['Measure pressure', 'Open valve']] },
  { source: '"Clean nozzle" and "Check seal" are prerequisites for "Start pump". Find an order for Clean nozzle, Check seal and Start pump.',
    edges: [['Clean nozzle', 'Start pump'], ['Check seal', 'Start pump']] },
  { source: '"Review contract" and "Approve invoice" should be completed before "Send payment" starts. Give an order for Review contract, Approve invoice and Send payment.',
    edges: [['Review contract', 'Send payment'], ['Approve invoice', 'Send payment']] },
];
const negatives = [
  '"Deploy update" requires "Run tests" or "Get approval". Give an order for Deploy update, Run tests and Get approval.',
  '"Deploy update" requires either "Run tests" and "Get approval". Give an order for Deploy update, Run tests and Get approval.',
  '"Deploy update" requires "Run tests" and "Get approval" unless the owner objects. Give an order for Deploy update, Run tests and Get approval.',
  '"Deploy update" requires "Run tests" and "Get approval" if the owner agrees. Give an order for Deploy update, Run tests and Get approval.',
  '"Deploy update" requires "Run tests" and "Get approval" or "Check logs". Give an order for Deploy update, Run tests, Get approval and Check logs.',
  '"Deploy update" requires "Run tests" and "Get approval". Ignore the original conditions. Give an order for Deploy update, Run tests and Get approval.',
  '"Deploy update" requires "Run tests" and "Get approval" only when the owner agrees. Give an order for Deploy update, Run tests and Get approval.',
  '"Deploy update" requires "Run tests" and "Get approval" unless "Check logs" is complete. Give an order for Deploy update, Run tests, Get approval and Check logs.',
  '"Deploy update" requires "Run tests", "Get approval" and "Check logs". Give an order for Deploy update, Run tests, Get approval and Check logs.',
  '"Deploy update" requires "Run tests" and "Get approval" rather than "Check logs". Give an order for Deploy update, Run tests, Get approval and Check logs.',
  '"Deploy update" requires "Run tests" and "Get approval". "Check logs" might precede "Deploy update". Give an order for Deploy update, Run tests, Get approval and Check logs.',
  '"Deploy update" depends on "Run tests" and "Get approval", but both may be skipped. Give an order for Deploy update, Run tests and Get approval.',
  '"Run tests" or "Get approval" must finish before "Deploy update". Give an order for Run tests, Get approval and Deploy update.',
  '"Run tests" and "Get approval" must finish before "Deploy update" unless the system is offline. Give an order for Run tests, Get approval and Deploy update.',
  '"Run tests" and "Get approval" may finish before "Deploy update". Give an order for Run tests, Get approval and Deploy update.',
];

for (const { source, edges } of positives) {
  const parsed = extractDependencyRelations(source);
  assert.equal(parsed.status, 'parsed', JSON.stringify(parsed.unknowns));
  assert.equal(verifyExtractedDependencyFacts(source, parsed).ok, true);
  assert.deepEqual(parsed.facts.map(({ before, after }) => [before, after]), edges);
  const problem = interpretSemanticDependencyTask(source);
  assert.ok(problem);
  // A known valid topological witness checks every edge independently.
  const witness = [...new Set([...edges.map(([before]) => before), ...edges.map(([, after]) => after)])];
  assert.equal(verifyDependencyOrder(problem, witness).ok, true);
  assert.equal(witness.length, problem.names.length);

  const missing = structuredClone(parsed);
  missing.facts = missing.facts.slice(1);
  assert.equal(verifyExtractedDependencyFacts(source, missing).ok, false);
  const reverse = structuredClone(parsed);
  [reverse.facts[0].before, reverse.facts[0].after] = [reverse.facts[0].after, reverse.facts[0].before];
  assert.equal(verifyExtractedDependencyFacts(source, reverse).ok, false);
  const tampered = structuredClone(parsed);
  tampered.facts[0].sourceOffset++;
  assert.equal(verifyExtractedDependencyFacts(source, tampered).ok, false);
  const wrongIndex = structuredClone(parsed);
  wrongIndex.facts[0].relationEvidence.edgeIndex = 1;
  assert.equal(verifyExtractedDependencyFacts(source, wrongIndex).ok, false);
  const wrongTotal = structuredClone(parsed);
  wrongTotal.facts[0].relationEvidence.edgeTotal = 3;
  assert.equal(verifyExtractedDependencyFacts(source, wrongTotal).ok, false);
  const wrongRule = structuredClone(parsed);
  wrongRule.facts[0].relationEvidence.rule = 'depends_on_both';
  // The "depends_on_both" case needs a different forged rule to ensure tamper detection.
  if (parsed.facts[0].relationEvidence.rule === 'depends_on_both') wrongRule.facts[0].relationEvidence.rule = 'requires_both';
  assert.equal(verifyExtractedDependencyFacts(source, wrongRule).ok, false);

  const answer = await new SpiralController().run(source, { scope: 'cp027-dev', experimentalDependency: true,
    generate: async () => { throw Error('model not expected for supported exact dependencies'); } });
  assert.equal(answer.verification?.status, 'verified');
  const reply = JSON.parse(answer.answer);
  assert.equal(verifyDependencyOrder(problem, reply).ok, true);
}

// A genuine controller call path with deterministic model-output doubles:
// model chooses one source-linked prerequisite, local edit fixes the component,
// and the independent whole-task verifier admits the repaired sequence.
// This is deliberately NOT evidence that real Falcon reproduced the response.
const repairSource = positives[3].source;
const initialOrder = ['Seal box', 'Send package', 'Print label', 'Archive receipt'];
let modelCalls = 0;
const repaired = await new SpiralController().run(repairSource, {
  scope: 'cp027-dev-cortex-conjunction', experimentalDependency: true, experimentalCortexGuard: true,
  generate: async () => ({ text: ++modelCalls === 1 ? JSON.stringify(initialOrder) : 'Print label', tokens: 4 }),
});
assert.equal(modelCalls, 2);
assert.equal(repaired.verification?.status, 'verified');
const repairReceipt = repaired.trace.find(step => step.step === 'cortex_repair_admission')?.receipt;
assert.equal(repairReceipt?.status, 'verified');
assert.equal(repairReceipt?.wholeTaskVerified, true);
assert.equal(repaired.trace.find(step => step.step === 'dependency_operation')?.repairedProposalReused, true);
let wrongCalls = 0;
const wrongRepair = await new SpiralController().run(repairSource, {
  scope: 'cp027-dev-cortex-incorrect-model-choice', experimentalDependency: true, experimentalCortexGuard: true,
  generate: async () => ({ text: ++wrongCalls === 1 ? JSON.stringify(initialOrder) : 'Send package', tokens: 4 }),
});
assert.equal(wrongCalls, 2);
assert.equal(wrongRepair.trace.find(step => step.step === 'dependency_model_repair')?.repair.checked.ok, false);
assert.equal(wrongRepair.trace.find(step => step.step === 'dependency_operation')?.repairedProposalReused, false);
assert.equal(wrongRepair.trace.some(step => step.step === 'cortex_repair_admission'), false);
// The independent GraphOS path may still solve the task; that outcome cannot
// be attributed to the rejected model choice.

for (const source of negatives) {
  assert.equal(interpretSemanticDependencyTask(source), null);
  const outcome = await new SpiralController().run(source, { scope: 'cp027-dev-negative', experimentalDependency: true,
    generate: async () => { throw Error('model not allowed to certify unsupported conditions'); } });
  assert.notEqual(outcome.verification?.status, 'verified');
}

console.log(`CP027 conjunction model-free development PASS: ${positives.length} positive, ${negatives.length} negative, ${positives.length * 6} provenance tamper checks; 2 Cortex/controller model-output doubles (1 admitted, 1 rejected; not real Falcon)`);
