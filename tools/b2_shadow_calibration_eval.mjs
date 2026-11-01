import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runCheckedShadowTrial, accumulateShadowTrial } from '../app/js/b2-shadow-trials.mjs';
import { SpiralController } from '../app/js/spiral.mjs';

const path = 'evidence/b2-shadow-train-development-fixture-2026-11-01.json';
const bytes = await readFile(path);
const fixture = JSON.parse(bytes);
const training = [];
let profile = {};
for (const item of fixture.train) {
  const trial = runCheckedShadowTrial(item.prompt);
  const correct = trial.results.length === 2 && trial.results.every(row =>
    row.checkedOutcome && row.status === 'verified_arithmetic' && row.answer === item.expected);
  training.push({ id: item.id, correct, trial });
  if (correct) profile = accumulateShadowTrial(profile, trial);
}
// JSON round-trip mirrors a saved/reloaded profile, but this Node receipt is
// NOT a proof of browser IndexedDB persistence or actual online adaptation.
const resumedProfile = JSON.parse(JSON.stringify(profile));
const noModel = async () => { throw Error('Falcon must not run for the bounded exact questions'); };
const later = [];
for (const item of fixture.later) {
  const plain = await new SpiralController().run(item.prompt, { scope: `plain-${item.id}`, generate: noModel });
  const magnetic = await new SpiralController().run(item.prompt, { scope: `shadow-${item.id}`, generate: noModel,
    experimentalMagnetic: true, calibration: { arithmetic: resumedProfile } });
  const baselineChoice = plain.trace.find(row => row.step === 'direction')?.chosen;
  const magneticDecision = magnetic.trace.find(row => row.step === 'direction');
  later.push({ id: item.id, expected: item.expected, plainAnswer: plain.answer, magneticAnswer: magnetic.answer,
    baselineChoice, magneticChoice: magneticDecision?.chosen, magneticStatus: magneticDecision?.magnetic?.status,
    baselineCalls: plain.metrics.calculatorCalls, magneticCalls: magnetic.metrics.calculatorCalls,
    noExtraCallsForEqualCorrectness: magnetic.metrics.calculatorCalls <= plain.metrics.calculatorCalls,
    passed: plain.answer === item.expected && magnetic.answer === item.expected &&
      plain.verification.status === 'verified' && magnetic.verification.status === 'verified' &&
      magneticDecision?.magnetic?.status === 'experimental_measured' &&
      magnetic.metrics.calculatorCalls <= plain.metrics.calculatorCalls });
}
const receipt = { source: 'working tree based on 63c38a6 plus B2 transfer development patch',
  fixturePath: path, fixtureSha256: createHash('sha256').update(bytes).digest('hex'),
  evaluationStatus: 'developer_conditional_arithmetic_only_not_P4',
  note: 'No Falcon model calls, no cross-domain or intrinsic-model gain. Both paths are exact deterministic; no production promotion.',
  training, savedProfile: resumedProfile, later,
  passed: training.every(row => row.correct) && later.every(row => row.passed) };
const output = `evidence/b2-shadow-calibration-development-${new Date().toISOString().replaceAll(':', '-')}.json`;
await writeFile(output, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ output, passed: receipt.passed, training: training.length, later }, null, 2));
if (!receipt.passed) process.exitCode = 1;
