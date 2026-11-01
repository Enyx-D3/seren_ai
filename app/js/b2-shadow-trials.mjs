/* Developer-only Level 3 research. Executes both *eligible* deterministic
   paths to obtain checked route outcomes without changing a user answer.
   It never runs automatically in production or verifies the semantic premise. */
import { exactArithmetic } from './exact-arithmetic.mjs';
import { parseGroupedWordMath, candidateWordPaths, executeWordPath } from './b2-word-math.mjs';
import { parseInventoryTransfer, candidateTransferPaths, executeTransferPath } from './b2-transfer.mjs';

export const SHADOW_TRIAL_POLICY = 'b2-shadow-conditional-arithmetic-1';

export function runCheckedShadowTrial(text, { calculate = exactArithmetic,
  clock = () => performance.now(), injectedFault = false } = {}) {
  const transfer = parseInventoryTransfer(text);
  const word = transfer ? null : parseGroupedWordMath(text);
  const problem = transfer || word;
  const paths = transfer ? candidateTransferPaths(transfer) : candidateWordPaths(word);
  if (!problem || paths.length !== 2) return { policy: SHADOW_TRIAL_POLICY, status: 'unsupported', results: [] };
  const results = paths.map(path => {
    const began = clock();
    try {
      const result = transfer ? executeTransferPath(problem, path, calculate) : executeWordPath(problem, path, calculate);
      return { operation: path.kind, status: 'verified_arithmetic', checkedOutcome: true,
        answer: result.answer, operations: result.receipts.length, elapsedMs: Math.max(0, clock() - began),
        checker: 'independent_exact_expression_comparison' };
    } catch (error) {
      return { operation: path.kind, status: error.independentCheckFailed ? 'checked_failure' : 'unchecked_error',
        checkedOutcome: error.independentCheckFailed === true, operations: error.operationsAttempted || 0,
        elapsedMs: Math.max(0, clock() - began), checker: error.independentCheckFailed
          ? 'independent_exact_expression_comparison' : 'none', error: String(error.message).slice(0, 160) };
    }
  });
  return { policy: SHADOW_TRIAL_POLICY, status: 'conditional_arithmetic_only',
    researchOnly: true, simulatedFault: injectedFault === true || calculate !== exactArithmetic,
    inputKind: transfer ? 'inventory_transfer' : 'grouped_count',
    results, semanticInterpretationVerified: false };
}

export function accumulateShadowTrial(categoryProfile = {}, trial) {
  if (trial?.policy !== SHADOW_TRIAL_POLICY || trial.status !== 'conditional_arithmetic_only' ||
      trial.simulatedFault || trial.results?.length !== 2 ||
      trial.results.some(row => !['verified_arithmetic', 'checked_failure', 'unchecked_error'].includes(row.status)))
    return structuredClone(categoryProfile);
  const next = structuredClone(categoryProfile);
  const operations = { ...(next.shadowOperations || {}) };
  for (const row of trial.results) {
    if (typeof row.operation !== 'string' || !/^(?:word_|transfer_)/.test(row.operation) ||
        !Number.isFinite(row.elapsedMs) || row.elapsedMs < 0) return structuredClone(categoryProfile);
    const previous = operations[row.operation] || {};
    const checked = row.checkedOutcome === true;
    operations[row.operation] = { ...previous,
      runs: (previous.runs || 0) + 1,
      verifiedSuccesses: (previous.verifiedSuccesses || 0) + Number(checked && row.status === 'verified_arithmetic'),
      verifiedFailures: (previous.verifiedFailures || 0) + Number(checked && row.status === 'checked_failure'),
      uncheckedRuns: (previous.uncheckedRuns || 0) + Number(!checked),
      elapsedMs: (previous.elapsedMs || 0) + row.elapsedMs,
      evidenceScope: 'conditional_exact_arithmetic_shadow_only',
    };
  }
  return { ...next, shadowOperations: operations,
    shadowTrials: (next.shadowTrials || 0) + 1, shadowPolicy: SHADOW_TRIAL_POLICY };
}
