/* B2 directional control. Scores are explicit engineering priors until enough
   independently checked local outcomes exist; they are not learned weights. */
import { buildProblemGraph, updateGraphTask } from './b2-problem-graph.mjs';
import { evaluateMagneticPaths } from './b2-magnetic.mjs';
export const DIRECTION_POLICY = 'b2-direction-3-calibrated-repair';

export const OPERATION_CAPABILITIES = Object.freeze({
  exact: 'verified',
  dependent_exact: 'verified_narrow',
  word_multiply: 'verified_narrow',
  word_repeated: 'verified_narrow',
  transfer_direct: 'verified_narrow',
  transfer_conserve: 'verified_narrow',
  boolean: 'verified_narrow',
  structured: 'verified_narrow',
  local: 'bounded',
  calculator_component: 'verified_partial',
  approved_tool: 'bounded',
  structured_interpretation: 'provisional',
  falcon: 'provisional',
  falcon_repair: 'provisional',
  brake_partial: 'bounded_stop',
  matrix: 'unavailable',
  psychological: 'shadow_experimental',
  virtual: 'unavailable',
  b2ccp: 'unavailable',
});

const PRIOR = Object.freeze({
  exact: { goalAttraction: 1, expectedProgress: 1, informationGain: 1, computationalCost: 0.1, errorRisk: 0.02, memoryReuse: 0.7 },
  dependent_exact: { goalAttraction: 1, expectedProgress: 1, informationGain: 1, computationalCost: 0.1, errorRisk: 0.02, memoryReuse: 0 },
  word_multiply: { goalAttraction: 1, expectedProgress: 1, informationGain: 1, computationalCost: 0.1, errorRisk: 0.02, memoryReuse: 0 },
  word_repeated: { goalAttraction: 1, expectedProgress: 1, informationGain: 1, computationalCost: 0.1, errorRisk: 0.02, memoryReuse: 0 },
  transfer_direct: { goalAttraction: 1, expectedProgress: 1, informationGain: 1, computationalCost: 0.1, errorRisk: 0.02, memoryReuse: 0 },
  transfer_conserve: { goalAttraction: 1, expectedProgress: 1, informationGain: 1, computationalCost: 0.1, errorRisk: 0.02, memoryReuse: 0 },
  boolean: { goalAttraction: 1, expectedProgress: 1, informationGain: 1, computationalCost: 0.05, errorRisk: 0.02, memoryReuse: 0 },
  structured: { goalAttraction: 1, expectedProgress: 0.95, informationGain: 0.95, computationalCost: 0.05, errorRisk: 0.04, memoryReuse: 0 },
  local: { goalAttraction: 0.85, expectedProgress: 0.8, informationGain: 0.75, computationalCost: 0.08, errorRisk: 0.2, memoryReuse: 0 },
  calculator_component: { goalAttraction: 0.8, expectedProgress: 1, informationGain: 1, computationalCost: 0.1, errorRisk: 0.02, memoryReuse: 0.2 },
  approved_tool: { goalAttraction: 0.8, expectedProgress: 0.75, informationGain: 0.8, computationalCost: 0.2, errorRisk: 0.15, memoryReuse: 0 },
  structured_interpretation: { goalAttraction: 0.55, expectedProgress: 0.35, informationGain: 0.4, computationalCost: 0.8, errorRisk: 0.75, memoryReuse: 0 },
  falcon: { goalAttraction: 0.65, expectedProgress: 0.5, informationGain: 0.55, computationalCost: 0.8, errorRisk: 0.7, memoryReuse: 0 },
  falcon_repair: { goalAttraction: 0.6, expectedProgress: 0.35, informationGain: 0.45, computationalCost: 0.8, errorRisk: 0.75, memoryReuse: 0 },
  brake_partial: { goalAttraction: 0.1, expectedProgress: 0, informationGain: 0, computationalCost: 0, errorRisk: 0, memoryReuse: 0 },
});
const ORDER = ['exact', 'dependent_exact', 'word_multiply', 'word_repeated', 'transfer_direct', 'transfer_conserve', 'boolean', 'structured', 'calculator_component', 'approved_tool', 'local', 'structured_interpretation', 'falcon', 'falcon_repair', 'brake_partial'];
const clamp = value => Math.max(0, Math.min(1, value));

export function createSpiralState(goal, parts, maxModelCalls) {
  const source = String(goal || '');
  const graph = buildProblemGraph(source, parts);
  return {
    schemaVersion: 2,
    goal: source,
    graph,
    intent: parts.map(part => graph.nodes.find(node => node.id === part.id)?.intent),
    givens: graph.knownFacts,
    parts: parts.map(part => ({ id: part.id, question: part.question, dependsOn: [...part.dependsOn], status: 'unresolved' })),
    dependencies: parts.flatMap(part => part.dependsOn.map(parentId => ({ from: parentId, to: part.id }))),
    requiredUnknowns: graph.requiredUnknowns,
    constraints: graph.constraints,
    availableKnowledge: graph.availableKnowledge,
    missingKnowledge: graph.missingKnowledge,
    derivations: [],
    verifiedFacts: [],
    unresolved: parts.map(part => part.id),
    residuals: [],
    visitedDirections: [],
    budget: { maxModelCalls, usedModelCalls: 0 },
  };
}

// Counts only independently checked task results. A verified component is
// retained as useful partial work, but cannot satisfy its parent task.
export function measureGoalProgress(state) {
  const required = state.parts.length;
  const verified = state.parts.filter(part => part.status === 'verified').length;
  const verifiedComponents = state.verifiedFacts.filter(fact => fact.component).length;
  const openResiduals = state.residuals.filter(row => !row.resolvedBy).length;
  return { required, verified, unresolved: required - verified, verifiedComponents,
    openResiduals, completion: required > 0 ? verified / required : 0,
    complete: required > 0 && verified === required };
}

export function rankDirections(eligible, { calibration = null, category = null, visited = [], candidateEvidence = {} } = {}) {
  const seen = new Set(visited);
  return eligible.filter(kind => PRIOR[kind] && !seen.has(kind)).map(kind => {
    const profile = calibration?.[category]?.operations?.[kind];
    const checked = (profile?.verifiedSuccesses || 0) + (profile?.verifiedFailures || 0);
    const scores = { ...PRIOR[kind] };
    const scoreEvidence = { expectedProgress: 'engineering_prior', informationGain: 'engineering_prior',
      computationalCost: 'engineering_prior', errorRisk: 'engineering_prior', memoryReuse: 'engineering_prior' };
    const path = candidateEvidence[kind];
    if (path?.verification === 'dual_exact_each_step' && Number.isInteger(path.operations) && path.operations > 0) {
      scores.expectedProgress = 1;
      scores.computationalCost = clamp(path.operations / 12);
      scoreEvidence.expectedProgress = 'eligible_path_checked_contract';
      scoreEvidence.computationalCost = `predicted_exact_operations:${path.operations}`;
    }
    if (checked >= 3) {
      scores.expectedProgress = clamp(((profile.verifiedSuccesses || 0) + 1) / (checked + 2));
      scores.errorRisk = clamp(((profile.verifiedFailures || 0) + 1) / (checked + 2));
      scoreEvidence.expectedProgress = `local_checked_outcomes:${checked}`;
      scoreEvidence.errorRisk = `local_checked_outcomes:${checked}`;
    }
    if ((profile?.runs || 0) >= 3) {
      scores.informationGain = clamp((profile.informationGainSum || 0) / profile.runs);
      scores.computationalCost = clamp((profile.elapsedMs || 0) / profile.runs / 10000);
      scores.memoryReuse = clamp((profile.cacheHits || 0) / profile.runs);
      scoreEvidence.informationGain = `local_outcome_proxy:${profile.runs}`;
      scoreEvidence.computationalCost = `local_elapsed_ms:${profile.runs}`;
      scoreEvidence.memoryReuse = `local_cache_hits:${profile.runs}`;
    }
    // Trusted direct checks keep priority over provisional language output.
    // This safety tier is a constraint, not a claim of measured superiority.
    const safetyTier = kind.startsWith('falcon') || kind === 'structured_interpretation' || kind === 'brake_partial' ? 0 : 1;
    const score = 3 * scores.goalAttraction + 2 * scores.expectedProgress + scores.informationGain +
      scores.memoryReuse - scores.computationalCost - 2 * scores.errorRisk;
    return { kind, status: OPERATION_CAPABILITIES[kind], scores, scoreEvidence,
      pathOperations: path?.operations || null, score: Number(score.toFixed(3)), safetyTier, policy: DIRECTION_POLICY };
  }).sort((a, b) => {
    if (a.kind.startsWith('word_') && b.kind.startsWith('word_') && a.pathOperations && b.pathOperations) {
      const aRuns = calibration?.[category]?.operations?.[a.kind]?.runs || 0;
      const bRuns = calibration?.[category]?.operations?.[b.kind]?.runs || 0;
      // Until both alternatives have measured costs, exact-operation count is
      // the comparable resource estimate. A smoothed success rate must not
      // make an unmeasured, more expensive path appear cheaper.
      if (aRuns < 3 || bRuns < 3) return a.pathOperations - b.pathOperations || b.score - a.score;
    }
    return b.safetyTier - a.safetyTier || b.score - a.score || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind);
  });
}

export function recordVerifiedComponent(state, partId, component, answer, method, operation = 'calculator_component') {
  const before = measureGoalProgress(state);
  if (!state.parts.some(part => part.id === partId)) throw new Error(`unknown spiral part: ${partId}`);
  const id = `${partId}:${component}`;
  const prior = state.verifiedFacts.find(row => row.partId === id);
  if (prior && prior.answer !== String(answer)) throw new Error('conflicting verified component');
  if (!prior) {
    state.verifiedFacts.push({ partId: id, component, answer: String(answer), method, operation });
    state.derivations.push({ id: `derivation-${state.derivations.length + 1}`, partId, operation,
      component, dependsOn: [...state.parts.find(part => part.id === partId).dependsOn], output: String(answer),
      status: 'verified_component', method });
    const node = { id, type: 'verified_component', partId, component, value: String(answer), method,
      status: 'verified' };
    state.graph.nodes.push(node);
    state.graph.edges.push({ from: id, to: partId, relation: 'verified_partial_input' });
  }
  const after = measureGoalProgress(state);
  return { partId, component, answer: String(answer), method, newFact: !prior,
    goalProgress: { before, after, verifiedDelta: 0,
      componentDelta: after.verifiedComponents - before.verifiedComponents,
      residualDelta: 0, outcome: 'no_verified_advance' } };
}

export function selectDirection(state, partId, eligible, options = {}) {
  if (!state.graph.nodes.some(node => node.id === partId)) {
    state.graph.nodes.push({ id: partId, type: 'residual', status: 'unresolved' });
    const parentId = partId.split(':')[0];
    if (state.parts.some(part => part.id === parentId))
      state.graph.edges.push({ from: parentId, to: partId, relation: 'has_residual' });
  }
  const visited = state.visitedDirections.filter(row => row.partId === partId).map(row => row.kind);
  const candidates = rankDirections(eligible, { ...options, visited });
  const experimentalPaths = candidates.filter(row => /^(?:word_|transfer_)/.test(row.kind))
    .map(row => options.candidateEvidence?.[row.kind]).filter(Boolean);
  const magnetic = options.experimentalMagnetic && experimentalPaths.length === 2
    ? evaluateMagneticPaths(experimentalPaths, options.calibration?.[options.category]) : null;
  if (magnetic?.recommended) {
    const index = candidates.findIndex(row => row.kind === magnetic.recommended);
    if (index > 0) candidates.unshift(candidates.splice(index, 1)[0]);
  }
  const chosen = candidates[0] || null;
  for (const candidate of candidates) {
    const id = `${partId}:operation-${candidate.kind}`;
    let node = state.graph.candidateOperations.find(row => row.id === id);
    if (!node) {
      node = { id, type: 'candidate_operation', kind: candidate.kind, status: 'eligible_unselected' };
      state.graph.candidateOperations.push(node); state.graph.nodes.push(node);
      state.graph.edges.push({ from: partId, to: id, relation: 'may_execute' });
    }
    node.score = candidate.score;
    node.scoreEvidence = candidate.scoreEvidence;
  }
  if (chosen) {
    state.visitedDirections.push({ partId, kind: chosen.kind, policy: DIRECTION_POLICY });
    const node = state.graph.candidateOperations.find(row => row.id === `${partId}:operation-${chosen.kind}`);
    node.status = 'selected'; node.selections = (node.selections || 0) + 1;
  }
  const wordCandidates = candidates.filter(row => row.kind.startsWith('word_'));
  const bothMeasured = wordCandidates.length > 1 && wordCandidates.every(row =>
    (options.calibration?.[options.category]?.operations?.[row.kind]?.runs || 0) >= 3);
  return { chosen, candidates, magnetic, selectionReason: magnetic?.recommended
    ? 'experimental_magnetic_checked_route' : chosen && wordCandidates.length > 1 && !bothMeasured
      ? 'lower_predicted_exact_operations_until_both_paths_measured' : chosen ? 'evidence_rank' : 'no_eligible_unvisited_operation' };
}

export function recordSpiralOutcome(state, partId, { kind, answer, verification, residual = null, elapsedMs = 0, reused = false } = {}) {
  const before = measureGoalProgress(state);
  const part = state.parts.find(row => row.id === partId);
  if (!part) throw new Error(`unknown spiral part: ${partId}`);
  const checked = verification?.status === 'verified';
  const prior = state.verifiedFacts.find(row => row.partId === partId);
  if (prior && (!checked || prior.answer !== String(answer))) throw new Error('verified state cannot be overwritten by an unverified direction');
  const derivationId = `derivation-${state.derivations.length + 1}`;
  state.derivations.push({ id: derivationId, partId, operation: kind, dependsOn: [...part.dependsOn],
    output: String(answer).slice(0, 512), status: verification?.status || 'unverified',
    method: verification?.method || 'none' });
  if (checked && !prior) state.verifiedFacts.push({ partId, answer: String(answer), method: verification.method, operation: kind });
  part.status = checked ? 'verified' : 'unresolved';
  updateGraphTask(state.graph, partId, { status: part.status, derivationId });
  state.graph.nodes.push({ id: derivationId, type: 'derivation', partId, operation: kind,
    status: verification?.status || 'unverified', verificationMethod: verification?.method || 'none' });
  state.graph.edges.push({ from: derivationId, to: `${partId}:unknown`, relation: checked ? 'verifies' : 'proposes' });
  if (checked) state.unresolved = state.unresolved.filter(id => id !== partId);
  if (checked) for (const row of state.residuals) if (row.partId === partId && !row.resolvedBy) row.resolvedBy = derivationId;
  if (!checked) state.residuals.push({ partId, operation: kind, reason: residual || verification?.residual || 'not independently verified',
    fromDerivation: derivationId, resolvedBy: null });
  const informationGainProxy = checked && !prior ? 1 : verification?.status === 'failed' && verification?.method !== 'none' ? 0.5 : 0;
  const checkedOutcome = checked || (verification?.status === 'failed' &&
    ['two_parser_exact_v1', 'partial_exact_component', 'dual_boolean_expression_v1', 'two_parser_exact_dependency_v1'].includes(verification.method));
  const after = measureGoalProgress(state);
  return { partId, operation: kind, status: part.status, verificationStatus: verification?.status || 'unverified', verifiedProgress: checked && !prior,
    verificationMethod: verification?.method || 'none',
    derivationId, residual: checked ? null : state.residuals.at(-1).reason,
    informationGainProxy, checkedOutcome, reused: !!reused, elapsedMs,
    goalProgress: { before, after, verifiedDelta: after.verified - before.verified,
      componentDelta: after.verifiedComponents - before.verifiedComponents,
      residualDelta: after.openResiduals - before.openResiduals,
      outcome: after.verified > before.verified ? 'verified_advance' : 'no_verified_advance' } };
}
