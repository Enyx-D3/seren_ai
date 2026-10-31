/* B2 directional control. Scores are explicit engineering priors until enough
   independently checked local outcomes exist; they are not learned weights. */
export const DIRECTION_POLICY = 'b2-direction-1-conservative';

export const OPERATION_CAPABILITIES = Object.freeze({
  exact: 'verified',
  structured: 'verified_narrow',
  local: 'bounded',
  calculator_component: 'verified_partial',
  falcon: 'provisional',
  falcon_repair: 'provisional',
  matrix: 'unavailable',
  psychological: 'unavailable',
  virtual: 'unavailable',
  b2ccp: 'unavailable',
});

const PRIOR = Object.freeze({
  exact: { goalAttraction: 1, expectedProgress: 1, informationGain: 1, computationalCost: 0.1, errorRisk: 0.02, memoryReuse: 0.7 },
  structured: { goalAttraction: 1, expectedProgress: 0.95, informationGain: 0.95, computationalCost: 0.05, errorRisk: 0.04, memoryReuse: 0 },
  local: { goalAttraction: 0.85, expectedProgress: 0.8, informationGain: 0.75, computationalCost: 0.08, errorRisk: 0.2, memoryReuse: 0 },
  calculator_component: { goalAttraction: 0.8, expectedProgress: 1, informationGain: 1, computationalCost: 0.1, errorRisk: 0.02, memoryReuse: 0.2 },
  falcon: { goalAttraction: 0.65, expectedProgress: 0.5, informationGain: 0.55, computationalCost: 0.8, errorRisk: 0.7, memoryReuse: 0 },
  falcon_repair: { goalAttraction: 0.6, expectedProgress: 0.35, informationGain: 0.45, computationalCost: 0.8, errorRisk: 0.75, memoryReuse: 0 },
});
const ORDER = ['exact', 'structured', 'calculator_component', 'local', 'falcon', 'falcon_repair'];
const clamp = value => Math.max(0, Math.min(1, value));

export function createSpiralState(goal, parts, maxModelCalls) {
  return {
    schemaVersion: 1,
    goal: String(goal || ''),
    givens: [...String(goal || '').matchAll(/(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])/g)].map(match => match[0]).slice(0, 32),
    parts: parts.map(part => ({ id: part.id, question: part.question, dependsOn: [...part.dependsOn], status: 'unresolved' })),
    verifiedFacts: [],
    unresolved: parts.map(part => part.id),
    residuals: [],
    visitedDirections: [],
    budget: { maxModelCalls, usedModelCalls: 0 },
  };
}

export function rankDirections(eligible, { calibration = null, category = null, visited = [] } = {}) {
  const seen = new Set(visited);
  return eligible.filter(kind => PRIOR[kind] && !seen.has(kind)).map(kind => {
    const profile = calibration?.[category]?.operations?.[kind];
    const checked = (profile?.verifiedSuccesses || 0) + (profile?.verifiedFailures || 0);
    const scores = { ...PRIOR[kind] };
    let scoreEvidence = 'uncalibrated_prior';
    if (checked >= 3) {
      scores.expectedProgress = clamp(((profile.verifiedSuccesses || 0) + 1) / (checked + 2));
      scoreEvidence = `local_checked_outcomes:${checked}`;
    }
    // Trusted direct checks keep priority over provisional language output.
    // This safety tier is a constraint, not a claim of measured superiority.
    const safetyTier = kind.startsWith('falcon') ? 0 : 1;
    const score = 3 * scores.goalAttraction + 2 * scores.expectedProgress + scores.informationGain +
      scores.memoryReuse - scores.computationalCost - 2 * scores.errorRisk;
    return { kind, status: OPERATION_CAPABILITIES[kind], scores, scoreEvidence,
      score: Number(score.toFixed(3)), safetyTier, policy: DIRECTION_POLICY };
  }).sort((a, b) => b.safetyTier - a.safetyTier || b.score - a.score || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

export function recordVerifiedComponent(state, partId, component, answer, method) {
  if (!state.parts.some(part => part.id === partId)) throw new Error(`unknown spiral part: ${partId}`);
  const id = `${partId}:${component}`;
  const prior = state.verifiedFacts.find(row => row.partId === id);
  if (prior && prior.answer !== String(answer)) throw new Error('conflicting verified component');
  if (!prior) state.verifiedFacts.push({ partId: id, answer: String(answer), method, operation: 'calculator_component' });
  return { partId, component, answer: String(answer), method, newFact: !prior };
}

export function selectDirection(state, partId, eligible, options = {}) {
  const visited = state.visitedDirections.filter(row => row.partId === partId).map(row => row.kind);
  const candidates = rankDirections(eligible, { ...options, visited });
  const chosen = candidates[0] || null;
  if (chosen) state.visitedDirections.push({ partId, kind: chosen.kind, policy: DIRECTION_POLICY });
  return { chosen, candidates };
}

export function recordSpiralOutcome(state, partId, { kind, answer, verification, residual = null, elapsedMs = 0 } = {}) {
  const part = state.parts.find(row => row.id === partId);
  if (!part) throw new Error(`unknown spiral part: ${partId}`);
  const checked = verification?.status === 'verified';
  const prior = state.verifiedFacts.find(row => row.partId === partId);
  if (prior && (!checked || prior.answer !== String(answer))) throw new Error('verified state cannot be overwritten by an unverified direction');
  if (checked && !prior) state.verifiedFacts.push({ partId, answer: String(answer), method: verification.method, operation: kind });
  part.status = checked ? 'verified' : 'unresolved';
  if (checked) state.unresolved = state.unresolved.filter(id => id !== partId);
  if (!checked) state.residuals.push({ partId, operation: kind, reason: residual || verification?.residual || 'not independently verified' });
  return { partId, operation: kind, status: part.status, verificationStatus: verification?.status || 'unverified', verifiedProgress: checked && !prior,
    residual: checked ? null : state.residuals.at(-1).reason, elapsedMs };
}
