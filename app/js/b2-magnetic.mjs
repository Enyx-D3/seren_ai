/* Level-3 magnetic-path hypothesis, opt-in only. This is a software route
   policy using independently checked evidence; it is NOT a neural model or
   physical magnetism. No success is inferred from fluent model output. */
export const MAGNETIC_POLICY = 'magnetic-path-shadow-1';

const finite = value => Number.isFinite(value) && value >= 0;

export function evaluateMagneticPaths(paths, calibration = {}, { minChecked = 3, costWeight = 0.05 } = {}) {
  const rows = paths.map(path => {
    const profile = calibration?.operations?.[path.kind];
    const successes = profile?.verifiedSuccesses || 0;
    const failures = profile?.verifiedFailures || 0;
    const checked = successes + failures;
    const runs = profile?.runs || 0;
    const costMs = runs > 0 ? (profile.elapsedMs || 0) / runs : null;
    const valid = finite(successes) && finite(failures) && finite(runs) && checked <= runs &&
      finite(costMs) && checked >= minChecked && Number.isFinite(path.operations) && path.operations > 0;
    // The prior is deliberately neutral. Failure risk dominates a modest
    // verified computational cost difference; neither guarantees a win.
    const successRate = valid ? (successes + 1) / (checked + 2) : null;
    const costPenalty = valid ? costWeight * Math.min(1, costMs / 1000) : null;
    return { kind: path.kind, checked, successRate, costMs, costPenalty,
      score: valid ? Number((successRate - costPenalty).toFixed(6)) : null,
      evidence: valid ? 'independent_checked_outcomes_and_elapsed_ms' : 'insufficient_checked_evidence' };
  });
  const ready = rows.length >= 2 && rows.every(row => row.score !== null);
  const ranked = ready ? [...rows].sort((a, b) => b.score - a.score || a.costMs - b.costMs || a.kind.localeCompare(b.kind)) : rows;
  return { policy: MAGNETIC_POLICY, status: ready ? 'experimental_measured' : 'shadow_untrained',
    recommended: ready ? ranked[0].kind : null, ranked, reason: ready
      ? 'verified_success_rate_minus_measured_cost' : 'requires_checked_outcomes_for_every_candidate' };
}
