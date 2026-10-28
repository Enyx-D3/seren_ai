import { readFile, writeFile } from 'node:fs/promises';
import { JOINT_VERSION, shadowDecision, transitionJoint } from '../app/js/joint.mjs';

const competence = JSON.parse(await readFile('evidence/competence-browser-v2-2026-10-27.json'));
const counterbalanced = JSON.parse(await readFile('evidence/compass-counterbalanced-2026-10-28.json'));
const family = 'tool', candidateModel = 'falcon_tools', baselineModel = 'falcon_instruct';
const rows = (split, model) => competence.runs.filter(row => row.split === split && row.family === family && row.modelId === model)
  .map(({ caseId, passed, elapsedMs }) => ({ caseId, passed, elapsedMs }));
const calibration = { baseline: rows('calibration', baselineModel), candidate: rows('calibration', candidateModel) };
const heldout = { baseline: rows('heldout', baselineModel), candidate: rows('heldout', candidateModel) };
const independentBlocks = counterbalanced.blocks.map(block => ({
  baseline: block.baseline.rows.map(({ caseId, passed, elapsedMs }) => ({ caseId, passed, elapsedMs })),
  candidate: block.candidate.rows.map(({ caseId, passed, elapsedMs }) => ({ caseId, passed, elapsedMs })),
}));
const decision = shadowDecision(calibration, heldout, independentBlocks);
let state = { model_id: candidateModel, step: 0, status: 'shadow', history: [] };
state = transitionJoint(state, 'TAP', { family, source: 'calibration' });
state = transitionJoint(state, 'ROTATE', { from: baselineModel, to: candidateModel });
state = transitionJoint(state, 'VERIFY', { passed: decision.outcome === 'eligible_for_human_review' });
if (decision.outcome !== 'eligible_for_human_review') state = transitionJoint(state, 'BRAKE', { counterexamples: decision.independentBlocks.flatMap(block => block.counterexamples) });
const report = { schema_version: 1, checkpoint: 'CP010', policy_id: JOINT_VERSION + '-tool-candidate',
  policy_version: JOINT_VERSION, status: state.status, family, baselineModel, candidateModel,
  sourceEvidence: ['evidence/competence-browser-v2-2026-10-27.json', 'evidence/compass-counterbalanced-2026-10-28.json'],
  developmentSplit: 'calibration', evaluationSplit: 'heldout', decision, state,
  constraints: { maxLatencyRatio: 1.25, independentBlocksRequired: 2, autoPromotion: false },
  limitations: 'Small prior task sets; independent blocks include non-tool tasks and model generation variability. No new model run, RAM, battery or physical-device measurement.' };
await writeFile('evidence/joint-shadow-2026-10-28.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ outcome: decision.outcome, calibration: decision.development,
  heldout: decision.heldout, independentBlocks: decision.independentBlocks, status: state.status }));
