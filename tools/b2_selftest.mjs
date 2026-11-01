import assert from 'node:assert/strict';
import { SpiralController, planSpiral, planningCoverage, verifySpiralCandidate, modelCalibrationOutcome } from '../app/js/spiral.mjs';

const storage = { async find() { return []; }, async byScope() { return []; }, async put(x) { return x; }, async incrementReuse() {}, async linkEquivalent() {} };
const { ExactSpiral } = await import('../app/js/spiral.mjs');
const controller = new SpiralController({ exact: new ExactSpiral({ storage }) });
const simple = planSpiral('Hello');
assert.equal(simple.complexity, 'simple');
assert.equal(simple.parts.length, 1);
const complex = planSpiral('Explain why ice melts; then describe the result', { deeper: true });
assert.equal(complex.complexity, 'complex');
assert.deepEqual(complex.parts[1].dependsOn, ['part-1']);
assert.ok(complex.maxModelCalls <= 4);
assert.equal(planSpiral('Complete this Python function. Return code only.\n\ndef add(a, b):\n    return a+b').parts.length, 1);
assert.equal(planSpiral('Alice has 3 books.\nHow many after buying 4?\nGive the final numeric answer.').parts.length, 1);
assert.equal(planSpiral('Use calculator for something', { calibration: { tool: { verifiedModelFailures: 2, verifiedModelSuccesses: 0 } } }).repairBudget, 1);
assert.equal(planSpiral('Use calculator for something', { calibration: { tool: { verifiedModelFailures: 3, verifiedModelSuccesses: 0 } } }).repairBudget, 2);
assert.equal(planSpiral('Use calculator for something', { calibration: { tool: { verifiedFailures: 20, verifiedSuccesses: 0 } } }).repairBudget, 1);
assert.equal(modelCalibrationOutcome({ metrics: { modelCalls: 0 }, verification: { status: 'verified' }, trace: [] }), null);
assert.equal(modelCalibrationOutcome({ metrics: { modelCalls: 1 }, verification: { status: 'verified' }, trace: [] }), 'success');
assert.equal(modelCalibrationOutcome({ metrics: { modelCalls: 1 }, verification: { status: 'verified' },
  outcomes: [{ verification: { status: 'verified', repairedByCalculator: true } }], trace: [] }), 'failure');
assert.equal(modelCalibrationOutcome({ metrics: { modelCalls: 2 }, verification: { status: 'unverified' },
  trace: [{ step: 'brake', method: 'partial_exact_component' }] }), 'failure');
assert.equal(verifySpiralCandidate('17*19', '323').status, 'verified');
assert.equal(verifySpiralCandidate('Use an approved local calculator tool to find the exact value of (3*7)+(4*5). Show the tool result.', '41').status, 'verified');
assert.equal(verifySpiralCandidate('Find the exact value of 3*4. Also explain why this matters.', '12').status, 'unverified');
assert.equal(verifySpiralCandidate('17*19', '664').status, 'failed');
assert.equal(verifySpiralCandidate('17*19', 'The result is 664, not 323.').status, 'failed');
assert.equal(verifySpiralCandidate('17*19', 'The result is not 323.').status, 'failed');
assert.equal(verifySpiralCandidate('Explain a concept', 'A guess').status, 'unverified');
assert.equal(verifySpiralCandidate('Explain step by step how to compute 37*46 exactly, and give the final number.', '37*46=1700').status, 'failed');
assert.equal(verifySpiralCandidate('Explain step by step how to compute 37*46 exactly, and give the final number.', '37*46=1702').method, 'partial_exact_component');
assert.equal(verifySpiralCandidate('Explain why computing 28 * 14 exactly matters.',
  '28 * 14 = 376. The correct answer is 376. The candidate answer is 392, which is incorrect.').status, 'failed');
assert.equal(verifySpiralCandidate('Explain why computing 13 * 17 exactly matters.',
  'The correct result is 221.').componentVerified, true);
const booleanExplanation = 'Boolean expression: (True and False) or True. Why? End with Final choice: True or False.';
assert.equal(verifySpiralCandidate(booleanExplanation, 'Final choice: False').status, 'failed');
assert.equal(verifySpiralCandidate(booleanExplanation, 'Final choice: True').componentVerified, true);
assert.equal(verifySpiralCandidate(booleanExplanation, 'True').status, 'failed');
assert.deepEqual(planningCoverage('Plan two steps for a backup and mention one risk.', '1. Copy files.\n2. Test restore.\nRisk: storage fails.').unmet, []);
assert.deepEqual(planningCoverage('Plan two numbered steps and mention one risk.', '**Step 1:** Sort photos.\n- Check dates.\n**Step 2:** Copy photos.\nRisk: disk loss.').unmet, []);
assert.deepEqual(planningCoverage('Plan exactly three numbered steps and mention one risk.',
  'Step 1: Prepare.\nStep 2: Check.\nRisk: delay.').unmet, ['step_count']);
assert.deepEqual(planningCoverage('Plan exactly 4 numbered steps and mention one risk.',
  '1. **Step 1:** Gather books.\n2. **Step 2:** Sort books.\n3. **Step 3:** Label books.\n4. **Risk:** Books may be lost.').unmet, ['step_count']);

let calls = 0;
const exact = await controller.run('Calculate 17 * 19', { scope: 'test', generate: async () => { calls++; return { text: 'bad', tokens: 2 }; } });
assert.equal(exact.answer, '323'); assert.equal(exact.verification.status, 'verified'); assert.equal(calls, 0);
const embeddedExact = await controller.run('Use an approved local calculator tool to find the exact value of (3*7)+(4*5). Show the tool result.', {
  scope: 'test', generate: async () => { calls++; return { text: 'bad', tokens: 2 }; } });
assert.equal(embeddedExact.answer, '41'); assert.equal(embeddedExact.metrics.modelCalls, 0);
const twoPartMath = await controller.run('Calculate 2+2; then calculate 3*4 exactly.', { scope: 'test',
  generate: async () => { calls++; return { text: 'bad', tokens: 2 }; } });
assert.match(twoPartMath.answer, /1\. 4/);
assert.match(twoPartMath.answer, /2\. 12/);
assert.equal(twoPartMath.verification.status, 'verified');
assert.equal(calls, 0);
const fourPartMath = await controller.run('Calculate 2+2; then calculate 3*4; then calculate 5+6; then calculate 7+8', {
  scope: 'test', generate: async () => { calls++; return { text: 'bad', tokens: 2 }; } });
assert.equal(fourPartMath.verification.status, 'unverified');
assert.equal(fourPartMath.verification.residual.unprocessed, 1);
assert.match(fourPartMath.answer, /could not complete all requested parts/);
let mathHypotheses = 0;
const explainedMath = await controller.run('Explain step by step how to compute 37*46 exactly, and give the final number.', {
  scope: 'test', generate: async () => ({ text: ++mathHypotheses === 1 ? '37*46=1700' : '37*46=1702', tokens: 8 }) });
assert.equal(mathHypotheses, 2);
assert.ok(explainedMath.trace.some(step => step.step === 'residual' && /1702/.test(step.residual)));
assert.ok(explainedMath.trace.some(step => step.step === 'repair' && !step.residualResolved && step.numericAligned));
assert.equal(explainedMath.verification.status, 'unverified');
let mathFailures = 0;
const failedExplainedMath = await controller.run('Explain step by step how to compute 37*46 exactly, and give the final number.', {
  scope: 'test', generate: async () => ({ text: ++mathFailures === 1 ? '37*46=37' : '37*46=36', tokens: 8 }) });
assert.match(failedExplainedMath.answer, /exact numeric result is 1702/);
assert.equal(failedExplainedMath.verification.status, 'unverified');
assert.ok(failedExplainedMath.trace.some(step => step.step === 'repair' && !step.residualResolved));
let booleanHypotheses = 0, booleanRepairPrompt = '';
const repairedBoolean = await controller.run(booleanExplanation, { scope: 'test',
  generate: async ({ turns }) => {
    booleanHypotheses++;
    if (booleanHypotheses === 2) booleanRepairPrompt = turns.at(-1).content;
    return { text: booleanHypotheses === 1 ? 'Final choice: False' : 'Final choice: True', tokens: 5 };
  } });
assert.equal(booleanHypotheses, 2);
assert.ok(repairedBoolean.trace.some(step => step.step === 'repair' && step.booleanAligned));
assert.equal(repairedBoolean.verification.status, 'unverified');
assert.doesNotMatch(booleanRepairPrompt, /correct choice is True|expected.*True/i);
const ordinary = await controller.run('Hello', { scope: 'test', generate: async ({ onToken }) => {
  calls++; onToken?.('Hi'); return { text: 'Hi', tokens: 2 };
} });
assert.equal(ordinary.answer, 'Hi'); assert.equal(ordinary.metrics.modelCalls, 1);
assert.equal(ordinary.verification.status, 'unverified');
const planned = await controller.run('Explain why ice melts; then describe the result', { scope: 'test', deeper: true,
  generate: async () => { calls++; return { text: `part ${calls}`, tokens: 3 }; } });
assert.equal(planned.outcomes.length, 2); assert.equal(planned.metrics.modelCalls, 1);
assert.equal(planned.trace.filter(s => s.step === 'hypothesis').length, 1);
assert.ok(planned.trace.some(s => s.step === 'dependency_blocked' && s.part === 'part-2'));
const tool = await controller.run('Use local calculator for a nonstandard task', { scope: 'test',
  generate: async () => ({ text: '<tool_call>{"name":"exact_arithmetic","arguments":{"expression":"3*7"}}</tool_call>', tokens: 12 }),
  runTool: async call => ({ ok: true, value: call.arguments.expression === '3*7' ? '21' : 'bad', verification: 'independently_verified_exact' }) });
assert.equal(tool.answer, 'exact_arithmetic: 21'); assert.equal(tool.verification.status, 'unverified');
assert.equal(tool.outcomes[0].verification.method, 'tool_result_only');
const denied = await controller.run('Use local calculator for a nonstandard task', { scope: 'test',
  generate: async () => ({ text: '<tool_call>{"name":"shell","arguments":{}}</tool_call>', tokens: 9 }),
  runTool: async () => ({ ok: false, error: 'unknown tool', verification: 'none' }) });
assert.equal(denied.verification.status, 'unverified');
assert.match(denied.answer, /unknown tool/);
let proposal = 0;
const repaired = await controller.run('Use local calculator for a nonstandard task', { scope: 'test',
  generate: async () => ({ text: ++proposal === 1
    ? '<tool_call>{"name":"shell","arguments":{}}</tool_call>'
    : '<tool_call>{"name":"exact_arithmetic","arguments":{"expression":"3*7"}}</tool_call>', tokens: 9 }),
  runTool: async call => call.name === 'exact_arithmetic'
    ? { ok: true, value: '21', verification: 'independently_verified_exact' }
    : { ok: false, error: 'unknown tool', verification: 'none' } });
assert.match(repaired.answer, /exact_arithmetic: 21/);
assert.equal(repaired.metrics.modelCalls, 2);
assert.ok(repaired.trace.some(step => step.step === 'residual'));
assert.ok(repaired.trace.some(step => step.step === 'repair'));
assert.equal(repaired.verification.status, 'unverified');
assert.match(repaired.answer, /shell: failed \(unknown tool\)/);
assert.equal(repaired.outcomes[0].verification.method, 'mixed_tool_results');
const mixed = await controller.run('Use local calculator for a nonstandard task', { scope: 'test',
  generate: async () => ({ text: '<tool_call>{"name":"shell","arguments":{}}</tool_call><tool_call>{"name":"exact_arithmetic","arguments":{"expression":"3*7"}}</tool_call>', tokens: 21 }),
  runTool: async call => call.name === 'exact_arithmetic'
    ? { ok: true, value: '21', verification: 'independently_verified_exact' }
    : { ok: false, error: 'unknown tool', verification: 'none' } });
assert.equal(mixed.verification.status, 'unverified');
assert.match(mixed.answer, /shell: failed/);
let attempts = 0;
const recursivelyRepaired = await controller.run('Plan a backup for my notes', { scope: 'test',
  calibration: { planning: { verifiedModelFailures: 3, verifiedModelSuccesses: 0 } },
  generate: async () => ({ text: ++attempts === 1 ? 'Do a morning exercise routine.'
    : attempts === 2 ? 'Take a walk in the afternoon.' : 'Copy the notes data to another drive.', tokens: 6 }) });
assert.equal(recursivelyRepaired.metrics.modelCalls, 3);
assert.equal(recursivelyRepaired.trace.filter(step => step.step === 'repair').length, 2);
assert.match(recursivelyRepaired.answer, /Copy the notes data/);
assert.equal(recursivelyRepaired.verification.status, 'unverified');
let repeatCalls = 0;
const repeated = await controller.run('Plan a backup for my notes', { scope: 'test',
  calibration: { planning: { verifiedModelFailures: 3, verifiedModelSuccesses: 0 } },
  generate: async () => { repeatCalls++; return { text: 'Do a morning exercise routine.', tokens: 6 }; } });
assert.equal(repeatCalls, 2);
assert.ok(repeated.trace.some(step => step.step === 'no_progress'));
assert.equal(repeated.verification.status, 'unverified');
let candidates = 0;
let repairPrompt = '';
const alternative = await controller.run('Plan two steps for a backup and mention one risk.', { scope: 'test', deeper: true,
  generate: async ({ turns }) => { if (candidates) repairPrompt = turns.at(-1).content;
    return { text: ++candidates === 1 ? 'Copy some files.'
    : '1. Copy files to a second drive.\n2. Test a restore.\nRisk: the drive may fail.', tokens: 12 }; } });
assert.equal(candidates, 2);
assert.match(alternative.answer, /Test a restore/);
assert.equal(alternative.verification.status, 'unverified');
assert.ok(alternative.trace.some(step => step.step === 'residual' && /step_count/.test(step.residual)));
assert.ok(alternative.trace.some(step => step.step === 'repair' && !step.residualResolved && step.surfaceAligned));
assert.ok(alternative.trace.some(step => step.step === 'verified_component' && step.component === 'step_count' && step.answer === '2'));
assert.ok(alternative.trace.some(step => step.step === 'direction_result' && step.operation === 'falcon_repair' && step.componentVerified));
assert.ok(alternative.state.verifiedFacts.some(fact => fact.component === 'step_count' && fact.operation === 'surface_check'));
assert.equal(alternative.state.parts[0].status, 'unresolved');
assert.match(repairPrompt, /requested number of numbered steps/);
assert.doesNotMatch(repairPrompt, /step_count|risk_mention/);
let mixedCandidate = 0;
const mixedSurface = await controller.run('Plan exactly 4 numbered steps and mention one risk.', { scope: 'test', deeper: true,
  generate: async () => ({ text: ++mixedCandidate === 1
    ? 'Step 1: Gather books.\nStep 2: Sort books.\nRisk: books may be lost.'
    : 'Step 1: Gather books.\nStep 2: Sort books.\nStep 3: Label books.\nStep 4: Store books.', tokens: 20 }) });
assert.equal(mixedSurface.metrics.modelCalls, 2);
assert.ok(mixedSurface.trace.some(step => step.step === 'checked_surface_component' && step.candidate === 2 && step.component === 'step_count'));
assert.ok(!mixedSurface.state.verifiedFacts.some(fact => fact.component === 'step_count'));
assert.ok(mixedSurface.state.verifiedFacts.some(fact => fact.component === 'risk_mention'));
assert.deepEqual(planningCoverage('Plan exactly 4 numbered steps and mention one risk.', mixedSurface.answer).unmet, ['step_count']);
let appendCalls = 0;
const appended = await controller.run('Plan exactly 4 numbered steps for a local book drive and mention one risk.', {
  scope: 'test', deeper: true, generate: async () => ({ text: ++appendCalls === 1
    ? 'Step 1: Collect books.\nStep 2: Sort books.\nStep 3: Label boxes.\nRisk: books may be lost.'
    : 'Step 4: Store the labeled boxes in a dry room.', tokens: 24 }) });
assert.equal(appended.metrics.modelCalls, 2);
assert.equal(appended.metrics.calculatorCalls, 0);
assert.ok(appended.trace.some(step => step.step === 'repair_patch' && step.accepted && step.preservedDraft));
assert.deepEqual(planningCoverage('Plan exactly 4 numbered steps for a local book drive and mention one risk.', appended.answer).unmet, []);
assert.ok(appended.answer.includes('Risk: books may be lost.'));
assert.ok(appended.state.verifiedFacts.some(fact => fact.component === 'step_count' && fact.answer === '4'));
assert.equal(appended.verification.status, 'unverified');
console.log('B2 controller selftest PASS');
