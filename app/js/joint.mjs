/* CP010 magnetic Joint controller. Trials never promote themselves; the
   exact-tool rule below was selected by the release gate recorded in evidence. */
import { exactArithmetic } from './exact-arithmetic.mjs';
export const JOINT_VERSION = 'joint-shadow-1';
export const JOINT_ACTIONS = Object.freeze(['TAP', 'ROTATE', 'EXPAND', 'CONTRACT', 'BRAKE', 'REPAIR', 'VERIFY']);
const MODELS = new Set(['falcon_instruct', 'falcon_reason', 'falcon_coder', 'falcon_tools']);

export const EXACT_TOOL_JOINT = Object.freeze({
  policy_id: 'joint-exact-calculator-1', version: 1, status: 'active',
  relation_kind: 'verified_goal_attraction',
  applicability: 'Auto only, explicit calculator-tool request, bounded exact arithmetic',
  rollback_pointer: 'compass-conservative-1',
  evidence_uri: 'evidence/joint-exact-evaluation-2026-10-28.json',
});
export const BRAKED_MODEL_JOINT = Object.freeze({
  policy_id: 'joint-shadow-1-tool-candidate', version: 1, status: 'braked',
  relation_kind: 'goal_attraction_vs_cost_repulsion',
  applicability: 'Tool specialist on mixed Auto tasks',
  rollback_pointer: 'compass-conservative-1',
  failure_notes: 'Independent AB and BA blocks each regressed on chat-b and code-b and exceeded 1.25x latency.',
  evidence_uri: 'evidence/joint-shadow-2026-10-28.json',
});

export function proposeExactToolJoint(text, { selected = 'auto' } = {}) {
  if (selected !== 'auto' || typeof text !== 'string' || text.length > 320) return null;
  const match = /^use\s+(?:the\s+)?calculator(?:\s+tool)?\s+to\s+(?:compute|calculate)\s+(.+?)(?:\s+exactly)?[?.!]*$/i.exec(text.trim());
  if (!match) return null;
  const expression = match[1].trim().replace(/\\([+*/-])/g, '$1');
  if (expression.length > 256 || !/^[\d.()\s+*/-]+$/.test(expression) || !/[+*/-]/.test(expression.slice(1))) return null;
  try {
    const value = exactArithmetic(expression).text;
    return { answer: value, expression, via: 'verified exact arithmetic', policy_version: EXACT_TOOL_JOINT.policy_id,
      verification: 'two_parser_exact_v1', relation: 'verified_goal_attraction', action: 'TAP' };
  } catch { return null; }
}

export function transitionJoint(state, action, evidence = {}) {
  if (!JOINT_ACTIONS.includes(action)) throw new Error('unknown joint action');
  if (!state || !MODELS.has(state.model_id) || !Number.isInteger(state.step) || state.step < 0 || state.step >= 7)
    throw new Error('invalid joint state or step budget');
  const next = { ...state, step: state.step + 1, last_action: action,
    history: [...(state.history || []), { action, evidence }] };
  if (action === 'TAP') next.focus = String(evidence.family || 'unclassified');
  if (action === 'ROTATE') {
    if (!MODELS.has(evidence.to)) throw new Error('invalid joint rotation');
    next.model_id = evidence.to;
  }
  if (action === 'EXPAND') next.branch_budget = Math.min(8, (state.branch_budget || 1) + 1);
  if (action === 'CONTRACT') next.branch_budget = Math.max(1, (state.branch_budget || 1) - 1);
  if (action === 'BRAKE') {
    next.status = 'braked'; next.rollback_pointer = evidence.rollback_pointer || 'compass-conservative-1';
    next.failure_memory = [...(state.failure_memory || []), evidence];
  }
  if (action === 'REPAIR') {
    if (state.status !== 'braked' || !evidence.correction) throw new Error('repair requires braked state and correction');
    next.status = 'shadow';
  }
  if (action === 'VERIFY') next.status = evidence.passed === true && evidence.independentBlocks >= 2
    ? 'verified_shadow' : 'rejected';
  return next;
}

// Paired outcomes, never model names, define attraction or repulsion. Latency
// acts as a cost field and hinders promotion even when accuracy improves.
export function compareJointRows(baseline, candidate, { maxLatencyRatio = 1.25 } = {}) {
  if (!Array.isArray(baseline) || !Array.isArray(candidate) || baseline.length !== candidate.length || !baseline.length)
    throw new Error('paired nonempty rows required');
  const byId = new Map(candidate.map(row => [row.caseId, row]));
  if (byId.size !== candidate.length) throw new Error('duplicate candidate case');
  let gains = 0, regressions = 0, baseMs = 0, candidateMs = 0;
  let baselineCorrect = 0, candidateCorrect = 0;
  const counterexamples = [];
  for (const left of baseline) {
    const right = byId.get(left.caseId);
    if (!right || typeof left.passed !== 'boolean' || typeof right.passed !== 'boolean' ||
        !Number.isFinite(left.elapsedMs) || !Number.isFinite(right.elapsedMs) ||
        left.elapsedMs < 0 || right.elapsedMs < 0) throw new Error('invalid or unpaired trial row');
    gains += Number(!left.passed && right.passed);
    baselineCorrect += Number(left.passed); candidateCorrect += Number(right.passed);
    if (left.passed && !right.passed) { regressions++; counterexamples.push(left.caseId); }
    baseMs += left.elapsedMs; candidateMs += right.elapsedMs;
  }
  const latencyRatio = baseMs ? candidateMs / baseMs : Infinity;
  return { gains, regressions, counterexamples, baselineCorrect, candidateCorrect, count: baseline.length,
    baselineMs: baseMs, candidateMs,
    latencyRatio, goalAttraction: gains - regressions,
    costRepulsion: Math.max(0, latencyRatio - 1),
    eligible: gains >= 1 && regressions === 0 && latencyRatio <= maxLatencyRatio };
}

export function shadowDecision(calibration, heldout, independentBlocks = []) {
  const development = compareJointRows(calibration.baseline, calibration.candidate);
  const hold = compareJointRows(heldout.baseline, heldout.candidate);
  const blocks = independentBlocks.map(block => compareJointRows(block.baseline, block.candidate));
  const hysteresisPasses = [...blocks].reverse().findIndex(block => !block.eligible);
  const consecutivePasses = hysteresisPasses < 0 ? blocks.length : hysteresisPasses;
  const calibrationDrift = Math.abs(development.candidateCorrect / development.count - hold.candidateCorrect / hold.count);
  const passed = development.eligible && hold.eligible && consecutivePasses >= 2 && calibrationDrift <= 0.25;
  return { development, heldout: hold, independentBlocks: blocks,
    consecutivePasses, calibrationDrift,
    outcome: passed ? 'eligible_for_human_review' : 'retain_conservative_auto',
    autoPromoted: false,
    reason: passed ? 'all shadow gates passed; approval and resource checks still required'
      : 'calibration, held-out, or two independent blocks did not meet the gate' };
}
