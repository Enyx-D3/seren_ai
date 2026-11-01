/* Evidence gate for observed Compass outcomes. An attempted operation is not
   a correctness label. Only an independently checked receipt changes the
   success/failure history; unknown errors remain unchecked. */
export const CALIBRATION_OUTCOMES_POLICY = 'b2-checked-outcome-1';

export function accumulateCheckedDirections(previous = {}, trace = []) {
  const operations = structuredClone(previous || {});
  for (const row of trace) {
    if (row.step !== 'direction_result' || row.operation === 'final_response' ||
        typeof row.operation !== 'string' || !row.operation) continue;
    const profile = operations[row.operation] || {};
    const checked = row.checkedOutcome === true;
    const success = checked && row.verificationStatus === 'verified';
    const failure = checked && row.verificationStatus === 'failed';
    const elapsedMs = Number.isFinite(row.elapsedMs) && row.elapsedMs >= 0 ? row.elapsedMs : 0;
    operations[row.operation] = {
      ...profile,
      runs: (profile.runs || 0) + 1,
      verifiedSuccesses: (profile.verifiedSuccesses || 0) + Number(success),
      verifiedFailures: (profile.verifiedFailures || 0) + Number(failure),
      uncheckedRuns: (profile.uncheckedRuns || 0) + Number(!checked),
      verifiedComponents: (profile.verifiedComponents || 0) + Number(row.componentVerified === true),
      elapsedMs: (profile.elapsedMs || 0) + elapsedMs,
      informationGainSum: (profile.informationGainSum || 0) + (Number.isFinite(row.informationGainProxy) ? row.informationGainProxy : 0),
      cacheHits: (profile.cacheHits || 0) + Number(row.reused === true),
    };
  }
  return operations;
}
