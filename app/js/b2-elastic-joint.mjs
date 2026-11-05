/* Stage 3: bounded, operation-agnostic joint execution. The joint can connect
 * calculators, simulators or permissioned tools, but cannot bless an output.
 * A separate verifier must admit each result; failures retain residuals and
 * never re-enter a visited direction. No self-trained policy is implied. */
export const ELASTIC_JOINT_POLICY = 'b2-elastic-joint-1';

export async function executeElasticJoint({ directions, initial, chooseNext, execute,
  verify, onFailure = () => {}, onVerified = () => {}, clock = () => performance.now(),
  signal = null, maxAttempts = 4 } = {}) {
  if (!Array.isArray(directions) || directions.length < 1 || directions.length > 8 ||
      new Set(directions).size !== directions.length ||
      directions.some(value => typeof value !== 'string' || !value) ||
      !directions.includes(initial) || typeof chooseNext !== 'function' ||
      typeof execute !== 'function' || typeof verify !== 'function' ||
      !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 8)
    throw new Error('invalid bounded elastic joint contract');
  const visited = new Set();
  const history = [];
  let direction = initial;
  const bound = Math.min(maxAttempts, directions.length);
  for (let cycle = 0; cycle < bound && direction; cycle++) {
    if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
    if (!directions.includes(direction) || visited.has(direction))
      throw new Error('joint selected an unknown or previously failed direction');
    visited.add(direction);
    const began = clock();
    history.push({ action: 'TAP', direction, cycle: cycle + 1 });
    let candidate, receipt;
    try {
      candidate = await execute(direction, { cycle: cycle + 1, visited: [...visited] });
      if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
      // Verification is independently computed from the original problem,
      // not a `verified` label supplied by the candidate executor.
      receipt = await verify(candidate, direction);
      if (!receipt || receipt.status !== 'verified' || typeof receipt.method !== 'string')
        throw new Error('joint candidate lacked an independent verification receipt');
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw error;
      const measuredMs = Math.max(0, clock() - began);
      const residual = String(error?.message || error).slice(0, 256);
      history.push({ action: 'BRAKE', direction, residual, measuredMs,
        independentCheckFailed: error?.independentCheckFailed === true });
      await onFailure({ direction, error, residual, measuredMs, history });
      const remaining = directions.filter(candidate => !visited.has(candidate));
      if (remaining.length === 0 || cycle + 1 >= bound) break;
      const next = await chooseNext(remaining, { visited: [...visited], residual });
      if (next === null || next === undefined) break;
      if (!remaining.includes(next)) throw new Error('joint rotated to an ineligible direction');
      history.push({ action: 'ROTATE', from: direction, to: next, reason: 'checked_residual_or_runtime_failure' });
      direction = next;
      continue;
    }
    // Commit the already-proved result outside the catch. An application
    // persistence/commit failure must not be misclassified as a bad calculator
    // and retried after partially mutating established state.
    const measuredMs = Math.max(0, clock() - began);
    history.push({ action: 'VERIFY', direction, method: receipt.method, measuredMs });
    await onVerified({ direction, candidate, receipt, measuredMs, history });
    return { status: 'verified', direction, candidate, receipt,
      visited: [...visited], history, stopReason: 'independently_verified' };
  }
  return { status: 'unresolved', direction: null, candidate: null, receipt: null,
    visited: [...visited], history, stopReason: 'budget_or_unvisited_directions_exhausted' };
}
