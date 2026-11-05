/* CP025 research slice: source-bound dependency repair admission.
 * This guard is an optional, model-agnostic checker. It neither executes
 * generated code nor promotes an unchecked proposal into verified state.
 * Verification is relative to explicit user-supplied ordering constraints. */
import { Sha256 } from './sha256.mjs';
import { interpretDependencyTask, verifyDependencyOrder } from './b2-dependency-task.mjs';
import { interpretSemanticDependencyTask } from './b2-semantic-extraction.mjs';
import { interpretProseDependencyTask, extractProseDependencyRelations,
  replayProseDependencySource } from './b2-semantic-prose-v2.mjs';

export const CORTEX_GUARD_POLICY = 'b2-cortex-source-repair-1';
const encoder = new TextEncoder();
const receiptBrand = new WeakSet();
const hash = source => new Sha256().update(encoder.encode(source)).digest();

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function validOrder(names, value) {
  return Array.isArray(value) && value.length === names.length &&
    value.every(name => typeof name === 'string' && names.includes(name)) &&
    new Set(value).size === names.length;
}

function unmetFacts(facts, order) {
  return facts.filter(fact => order.indexOf(fact.before) >= order.indexOf(fact.after));
}

function factReceipt(fact, index) {
  return { id: `constraint-${index}`, before: fact.before, after: fact.after,
    quote: fact.quote, sourceOffset: fact.sourceOffset,
    provenance: 'observed_source', truthScope: 'relative_to_stated_prerequisites' };
}

/**
 * An immutable-source repair session. `attempt()` accepts only a permutation
 * of the known actions; no tool name, code, or model text can change facts.
 * A candidate must strictly reduce unmet constraints without destroying a
 * relationship the current order already satisfied. Whole-task `verified`
 * requires the independent dependency-position oracle to pass.
 */
export function createCortexDependencyGuard(source, initialOrder, {
  maxAttempts = 4, maxNoProgress = 2, allowSemanticFallback = false, allowProseV2 = false,
} = {}) {
  if (typeof source !== 'string' || source.length > 4000 ||
      !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 8 ||
      !Number.isInteger(maxNoProgress) || maxNoProgress < 1 || maxNoProgress > maxAttempts ||
      typeof allowSemanticFallback !== 'boolean' || typeof allowProseV2 !== 'boolean')
    throw new Error('invalid_cortex_guard_contract');

  const legacy = interpretDependencyTask(source);
  const established = legacy && !legacy.unknowns.length ? legacy :
    (allowSemanticFallback ? interpretSemanticDependencyTask(source) : legacy);
  const parsed = established && !established.unknowns.length ? established :
    (allowProseV2 ? interpretProseDependencyTask(source) : established);
  if (parsed?.interpretationPolicy === 'b2-source-grounded-prose-replay-v2' &&
      !replayProseDependencySource(source, extractProseDependencyRelations(source)).ok) {
    // The proposed problem's graph is not permission to bypass a complete
    // source-clause replay. Treat absent provenance as unsupported.
    throw new Error('unsupported_or_untrusted_source_constraints');
  }
  if (!parsed || parsed.unknowns.length || !parsed.facts.length ||
      parsed.facts.some(f => source.slice(f.sourceOffset, f.sourceOffset + f.quote.length) !== f.quote))
    throw new Error('unsupported_or_untrusted_source_constraints');
  if (!validOrder(parsed.names, initialOrder)) throw new Error('invalid_initial_order');

  // Reject infeasible source graphs: no amount of order editing can repair a
  // real prerequisite cycle. The null verifier enumerates possible orders.
  if (verifyDependencyOrder(parsed, null).ok)
    throw new Error('infeasible_source_constraints');

  const sourceHash = hash(source), sourceRoot = parsed.graph.root;
  const names = Object.freeze([...parsed.names]);
  const facts = Object.freeze(parsed.facts.map((fact, i) => freezeDeep(factReceipt(fact, i))));
  let order = [...initialOrder], attempts = 0, noProgress = 0;
  let completed = verifyDependencyOrder(parsed, order).ok;
  const history = [], seen = new Set();

  function snapshot() {
    return freezeDeep({ schemaVersion: 1, policy: CORTEX_GUARD_POLICY,
      sourceHash, graphRoot: sourceRoot, names: [...names], order: [...order],
      attempts, maxAttempts, noProgress, maxNoProgress, completed,
      braked: completed || attempts >= maxAttempts || noProgress >= maxNoProgress,
      residuals: unmetFacts(facts, order).map(row => ({ ...row })),
      history: history.map(row => ({ ...row })) });
  }

  function record(status, candidate, { checkedOutcome = false, wholeTaskVerified = false,
    reason = null, preserved = [], residuals = [], accepted = false, modelOrigin = 'provisional_model_proposal',
  } = {}) {
    const receipt = freezeDeep({ policy: CORTEX_GUARD_POLICY, sourceHash, graphRoot: sourceRoot,
      attempt: attempts, status, checkedOutcome, wholeTaskVerified,
      verificationMethod: checkedOutcome ? 'independent_position_inequalities' : null,
      truthScope: 'ordering_relative_to_supported_explicit_source_constraints',
      modelOrigin: String(modelOrigin).slice(0, 64),
      proposal: Array.isArray(candidate) && candidate.length <= names.length ? [...candidate] : null,
      accepted, preserved: preserved.map(row => ({ ...row })),
      residuals: residuals.map(row => ({ ...row })), reason,
      noProgress, braked: completed || attempts >= maxAttempts || noProgress >= maxNoProgress });
    receiptBrand.add(receipt);
    // Only budgeted repair attempts enter the persistent session history.
    // Repeated stale-source/after-stop probes cannot grow it without bound.
    if (!['stale_source', 'already_complete', 'braked'].includes(status)) history.push(receipt);
    return { receipt, state: snapshot() };
  }

  function attempt(candidate, { sourceHash: suppliedHash = sourceHash,
    modelOrigin = 'provisional_model_proposal' } = {}) {
    // Authenticity of the underlying source still belongs to the caller's
    // source-acquisition boundary. The hash here only guards local versioning.
    if (suppliedHash !== sourceHash) return record('stale_source', candidate, {
      reason: 'input_version_does_not_match_guard_source', modelOrigin });
    if (completed) return record('already_complete', candidate, { reason: 'whole_task_already_checked', modelOrigin });
    if (attempts >= maxAttempts || noProgress >= maxNoProgress)
      return record('braked', candidate, { reason: 'bounded_no_progress_or_attempt_budget', modelOrigin });

    attempts++;
    if (!validOrder(names, candidate)) {
      noProgress++;
      return record('unverified', candidate, { reason: 'malformed_or_incomplete_model_order', modelOrigin,
        residuals: unmetFacts(facts, order) });
    }

    const key = JSON.stringify(candidate);
    if (seen.has(key)) {
      noProgress++;
      return record('no_progress', candidate, { reason: 'repeated_proposal', modelOrigin,
        residuals: unmetFacts(facts, order) });
    }
    seen.add(key);

    const beforeUnmet = unmetFacts(facts, order);
    const afterUnmet = unmetFacts(facts, candidate);
    const preserved = facts.filter(row => !beforeUnmet.includes(row));
    const broken = preserved.filter(row => afterUnmet.includes(row));
    const independent = verifyDependencyOrder(parsed, candidate);

    if (broken.length) {
      noProgress++;
      return record('rejected', candidate, { checkedOutcome: true,
        reason: 'candidate_corrupts_previously_satisfied_constraints', modelOrigin,
        preserved, residuals: broken });
    }
    if (!independent.ok && afterUnmet.length >= beforeUnmet.length) {
      noProgress++;
      return record('no_progress', candidate, { checkedOutcome: true,
        reason: 'no_independent_residual_reduction', modelOrigin,
        preserved, residuals: afterUnmet });
    }
    order = [...candidate];
    noProgress = 0;
    completed = independent.ok && afterUnmet.length === 0;
    return record(completed ? 'verified' : 'checked_partial', candidate, {
      checkedOutcome: true, wholeTaskVerified: completed, accepted: true,
      reason: completed ? 'independently_verified_entire_order' : 'strict_residual_reduction_only',
      preserved, residuals: afterUnmet, modelOrigin });
  }

  return Object.freeze({ attempt, snapshot, sourceHash, graphRoot: sourceRoot });
}

/** Only branded receipts returned by this guard can create calibration rows.
 * A checked partial repair is not a verified whole-task success. The owner of
 * the overall calibration policy still decides whether runtime data is used. */
export function cortexGuardCalibrationRow(receipt) {
  if (!receiptBrand.has(receipt)) throw new Error('untrusted_cortex_receipt');
  return freezeDeep({ step: 'direction_result', operation: 'cortex_dependency_repair',
    verificationStatus: receipt.wholeTaskVerified ? 'verified' : receipt.checkedOutcome ? 'failed' : 'unverified',
    checkedOutcome: receipt.checkedOutcome, componentVerified: receipt.status === 'checked_partial',
    reused: false, informationGainProxy: receipt.accepted ? 1 : 0,
    sourceHash: receipt.sourceHash, graphRoot: receipt.graphRoot,
    verificationMethod: receipt.verificationMethod });
}
