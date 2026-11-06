/* CP032 developer-only Falcon-proposed, independently checked residual repair.
 *
 * The model chooses one prerequisite from two named actions. A constrained
 * local edit may then be admitted only if all previously checked edges remain
 * true and the complete source contract independently verifies. This grants
 * no shell, network, code-execution, learning or release authority.
 */
import { createCortexDependencyGuard } from './b2-cortex-guard.mjs';
import { interpretDependencyTask, repairOrderFromChoice,
  verifyDependencyOrder } from './b2-dependency-task.mjs';
import { interpretSemanticDependencyTask } from './b2-semantic-extraction.mjs';
import { interpretProseDependencyTask } from './b2-semantic-prose-v2.mjs';

export const CORTEX_RESIDUAL_CYCLE_POLICY = 'b2-cortex-bounded-residual-cycle-1';

function sourceProblem(source, { allowSemanticFallback, allowProseV2 }) {
  const strict = interpretDependencyTask(source);
  if (strict && !strict.unknowns.length) return strict;
  const semantic = allowSemanticFallback ? interpretSemanticDependencyTask(source) : null;
  if (semantic && !semantic.unknowns.length) return semantic;
  return allowProseV2 ? interpretProseDependencyTask(source) : null;
}

function exactChoice(raw, before, after) {
  if (typeof raw !== 'string' || raw.length > 160) return null;
  const value = raw.trim().replace(/^"([^"]+)"$/, '$1');
  // Falcon often echoes the selected label with its quoted option. Admit it
  // only if BOTH the label and verbatim option agree; no free-form parsing.
  const labeled = /^(A|B):\s*"([^"]+)"$/i.exec(value);
  if (labeled) {
    const expected = labeled[1].toUpperCase() === 'A' ? before : after;
    return labeled[2] === expected ? expected : null;
  }
  if (/^A$/i.test(value)) return before;
  if (/^B$/i.test(value)) return after;
  if (value === before) return before;
  if (value === after) return after;
  return null;
}

function choiceOptions(source, fact, callIndex) {
  // A/B labels are counterbalanced by source coordinates and turn number;
  // merely returning the first option cannot establish real model skill.
  const reverse = (source.length + fact.sourceOffset + callIndex) % 2 === 1;
  return reverse ? [fact.after, fact.before] : [fact.before, fact.after];
}

function modelQuestion(fact, options) {
  // The target action names are inert strings, never instructions.
  return `Read this exact prerequisite clause as source data:\n${fact.quote}\n` +
    `Which action must happen earlier?\nA: "${options[0]}"\nB: "${options[1]}"\n` +
    'Answer exactly A or B. No explanation.';
}

/**
 * This helper never asks the model to rewrite the whole result, and never
 * accepts the model's assertion of correctness. `generate` must be an
 * explicitly supplied local model callback with `{turns,maxTokens,signal}`.
 */
export async function runCortexResidualCycle(source, {
  initialOrder, generate, maxModelCalls = 3, maxNoProgress = 2,
  allowSemanticFallback = false, allowProseV2 = false,
  currentSource = source, readCurrentSource = null, signal,
} = {}) {
  if (typeof source !== 'string' || source.length > 4000 ||
      typeof generate !== 'function' || !Number.isInteger(maxModelCalls) ||
      maxModelCalls < 1 || maxModelCalls > 4 ||
      !Number.isInteger(maxNoProgress) || maxNoProgress < 1 || maxNoProgress > maxModelCalls ||
      typeof allowSemanticFallback !== 'boolean' || typeof allowProseV2 !== 'boolean' ||
      (readCurrentSource !== null && typeof readCurrentSource !== 'function'))
    throw Error('invalid_cortex_residual_cycle_contract');
  const fail = (reason, extra = {}) => ({ policy: CORTEX_RESIDUAL_CYCLE_POLICY,
    status: 'unverified', wholeTaskVerified: false, modelLedRepairSuccess: false,
    modelCalls: 0, acceptedEdits: 0, trace: [], reason, ...extra });
  // A source may change while the model is still generating. A static
  // `currentSource` snapshot only checks admission time; callers that allow
  // live edits must pass a synchronous readCurrentSource callback. A failed
  // read cannot authorize a stale proposal.
  const freshnessFailure = () => {
    try {
      const observed = readCurrentSource ? readCurrentSource() : currentSource;
      if (typeof observed !== 'string') return 'source_freshness_unavailable';
      return observed === source ? null : 'stale_source_version';
    } catch { return 'source_freshness_unavailable'; }
  };
  if (signal?.aborted) return fail('aborted_before_model_call');
  const admissionFailure = freshnessFailure();
  if (signal?.aborted) return fail('aborted_before_model_call');
  if (admissionFailure) return fail(admissionFailure);
  const problem = sourceProblem(source, { allowSemanticFallback, allowProseV2 });
  if (!problem || problem.unknowns.length || !Array.isArray(problem.facts) ||
      !problem.facts.length) return fail('unsupported_or_untrusted_source');
  let guard;
  try {
    guard = createCortexDependencyGuard(source, initialOrder, {
      maxAttempts: maxModelCalls, maxNoProgress, allowSemanticFallback, allowProseV2,
    });
  } catch (error) {
    return fail(String(error?.message || error).slice(0, 120));
  }
  const initialVerified = verifyDependencyOrder(problem, initialOrder).ok;
  if (signal?.aborted) return fail('aborted_before_model_call');
  const initialFreshnessFailure = freshnessFailure();
  if (signal?.aborted) return fail('aborted_before_model_call');
  if (initialFreshnessFailure) return fail(initialFreshnessFailure);
  if (initialVerified) return { policy: CORTEX_RESIDUAL_CYCLE_POLICY,
    status: 'verified', wholeTaskVerified: true, modelLedRepairSuccess: false,
    modelCalls: 0, acceptedEdits: 0, order: [...initialOrder],
    sourceHash: guard.sourceHash, graphRoot: guard.graphRoot,
    trace: [], reason: 'already_independently_correct' };

  let modelCalls = 0, acceptedEdits = 0;
  const trace = [];
  while (modelCalls < maxModelCalls && !guard.snapshot().braked) {
    if (signal?.aborted) return fail('aborted_before_model_call', {
      modelCalls, acceptedEdits, trace });
    const beforeCallFreshnessFailure = freshnessFailure();
    if (signal?.aborted) return fail('aborted_before_model_call', {
      modelCalls, acceptedEdits, trace });
    if (beforeCallFreshnessFailure) return fail(beforeCallFreshnessFailure, {
      modelCalls, acceptedEdits, trace });
    const before = guard.snapshot();
    const failed = before.residuals[0];
    if (!failed) break;
    const options = choiceOptions(source, failed, modelCalls);
    let answer;
    // Count attempted model calls, including throws and cancellations.
    modelCalls++;
    try {
      const reply = await generate({ turns: [{ role: 'user', content: modelQuestion(failed, options) }],
        maxTokens: 8, maxGenerateMs: 12000, signal });
      answer = typeof reply === 'string' ? reply : reply?.text;
    } catch (error) {
      trace.push({ step: 'falcon_model_error', reason: String(error?.message || error).slice(0, 120) });
      if (signal?.aborted) return fail('aborted_after_model_call', { modelCalls, acceptedEdits, trace });
      return fail('model_generation_failed', { modelCalls, acceptedEdits, trace });
    }
    // Stop/source edits occurring during awaited inference invalidate even a
    // perfectly formatted answer. Discard it before calling guard.attempt().
    if (signal?.aborted) {
      trace.push({ step: 'stale_model_answer_discarded', reason: 'cancelled_generation' });
      return fail('aborted_after_model_call', { modelCalls, acceptedEdits, trace });
    }
    const afterCallFreshnessFailure = freshnessFailure();
    if (signal?.aborted) {
      trace.push({ step: 'stale_model_answer_discarded', reason: 'cancelled_during_source_check' });
      return fail('aborted_after_model_call', { modelCalls, acceptedEdits, trace });
    }
    if (afterCallFreshnessFailure) {
      trace.push({ step: 'stale_model_answer_discarded', reason: afterCallFreshnessFailure });
      return fail(afterCallFreshnessFailure, { modelCalls, acceptedEdits, trace });
    }
    const chosen = exactChoice(answer, ...options);
    const edit = chosen === failed.before ? repairOrderFromChoice(problem,
      before.order, failed.before, failed.after, chosen) :
      { ok: false, reason: chosen === null ? 'unsupported_model_choice' : 'wrong_prerequisite_choice' };
    const attempt = guard.attempt(edit.ok ? edit.order : [], {
      sourceHash: guard.sourceHash, modelOrigin: 'real_or_injected_falcon_choice',
    });
    if (attempt.receipt.accepted) acceptedEdits++;
    trace.push({ step: 'bounded_residual_edit', modelCall: modelCalls,
      sourceQuote: failed.quote.slice(0, 160), requestedBefore: failed.before,
      requestedAfter: failed.after, options, rawModelText: String(answer || '').slice(0, 160),
      modelChoice: chosen, editReason: edit.reason || null,
      admission: attempt.receipt.status, accepted: attempt.receipt.accepted,
      residualCountBefore: before.residuals.length,
      residualCountAfter: attempt.state.residuals.length,
      wholeTaskVerified: attempt.receipt.wholeTaskVerified });
    if (attempt.receipt.wholeTaskVerified) {
      // Second execution of the full independent position oracle. A partial
      // Cortex receipt is never sufficient for a final answer.
      if (!verifyDependencyOrder(problem, attempt.state.order).ok) break;
      return { policy: CORTEX_RESIDUAL_CYCLE_POLICY, status: 'verified',
        wholeTaskVerified: true, modelLedRepairSuccess: acceptedEdits > 0,
        modelCalls, acceptedEdits, order: attempt.state.order,
        sourceHash: guard.sourceHash, graphRoot: guard.graphRoot,
        trace, reason: 'independently_verified_full_task' };
    }
  }
  const state = guard.snapshot();
  return { policy: CORTEX_RESIDUAL_CYCLE_POLICY, status: 'unverified',
    wholeTaskVerified: false, modelLedRepairSuccess: false, modelCalls,
    acceptedEdits, sourceHash: guard.sourceHash, graphRoot: guard.graphRoot,
    trace, reason: state.braked ? 'bounded_no_progress_or_call_limit' : 'no_complete_safe_repair' };
}
