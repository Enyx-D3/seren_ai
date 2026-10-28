import { readFile, writeFile } from 'node:fs/promises';

const baseline = JSON.parse(await readFile('evidence/joint-exact-baseline-2026-10-28.json'));
const candidate = JSON.parse(await readFile('evidence/joint-exact-candidate-2026-10-28.json'));
const threshold = { minAdditionalCorrectPerBlock: 1, maxCorrectnessRegressions: 0,
  maxTotalLatencyRatio: 1.25, maxP95LatencyRatio: 1.25, maxPeakSummedRssRatio: 1.25,
  maxObservedAccuracyDrift: 0.25,
  requiredIndependentBlocks: 2 };
if (baseline.fixture_version !== candidate.fixture_version || JSON.stringify(baseline.blocks) !== JSON.stringify(candidate.blocks))
  throw new Error('held-out fixtures differ');
const blocks = baseline.summary.map((base, i) => {
  const proposed = candidate.summary[i];
  const left = baseline.trials.filter(row => row.block === base.block);
  const right = candidate.trials.filter(row => row.block === base.block);
  const paired = left.map(row => ({ baseline: row, candidate: right.find(other => other.caseId === row.caseId) }));
  if (paired.some(pair => !pair.candidate)) throw new Error('unpaired held-out case');
  const regressions = paired.filter(pair => pair.baseline.passed && !pair.candidate.passed).map(pair => pair.baseline.caseId);
  const gains = paired.filter(pair => !pair.baseline.passed && pair.candidate.passed).map(pair => pair.baseline.caseId);
  const totalLatencyRatio = proposed.totalMs / base.totalMs;
  const p95LatencyRatio = proposed.p95Ms / base.p95Ms;
  const peakSummedRssRatio = proposed.peakSummedRssKiB / base.peakSummedRssKiB;
  return { block: base.block, baseline: base, candidate: proposed, gains, regressions,
    totalLatencyRatio, p95LatencyRatio, peakSummedRssRatio,
    eligible: gains.length >= threshold.minAdditionalCorrectPerBlock &&
      regressions.length <= threshold.maxCorrectnessRegressions &&
      totalLatencyRatio <= threshold.maxTotalLatencyRatio && p95LatencyRatio <= threshold.maxP95LatencyRatio &&
      peakSummedRssRatio <= threshold.maxPeakSummedRssRatio };
});
const allCandidateReceipts = candidate.trials.every(row => row.receipt?.meta?.policy_version === 'joint-exact-calculator-1' &&
  row.receipt?.meta?.verification_id === 'two_parser_exact_v1' && row.receipt?.model_id === null);
const noExternal = !baseline.external.length && !candidate.external.length;
const noErrors = !baseline.errors.length && !candidate.errors.length;
const candidateAccuracyDrift = Math.abs(blocks[0].candidate.correct / blocks[0].candidate.count -
  blocks.at(-1).candidate.correct / blocks.at(-1).candidate.count);
const eligible = blocks.length >= threshold.requiredIndependentBlocks && blocks.every(block => block.eligible) &&
  candidateAccuracyDrift <= threshold.maxObservedAccuracyDrift && allCandidateReceipts && noExternal && noErrors;
const report = { schema_version: 1, checkpoint: 'CP010', candidate: 'joint-exact-calculator-1',
  generated_at: new Date().toISOString(), threshold, blocks, allCandidateReceipts, noExternal, noErrors,
  candidateAccuracyDrift, consecutivePassingBlocks: blocks.length,
  eligible_for_manual_promotion: eligible, auto_promoted: false,
  applicability: 'Auto mode, explicit bounded calculator-tool arithmetic only',
  rejectedCandidateRetained: 'evidence/joint-shadow-2026-10-28.json',
  limitations: 'Eight distinct exact requests in two blocks on one desktop Chromium host. UI wall times include local model generation for baseline. No physical mobile or direct battery/thermal measurement.' };
await writeFile('evidence/joint-exact-evaluation-2026-10-28.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ eligible, blocks: blocks.map(({ block, gains, regressions, totalLatencyRatio, p95LatencyRatio, peakSummedRssRatio }) =>
  ({ block, gains: gains.length, regressions, totalLatencyRatio, p95LatencyRatio, peakSummedRssRatio })),
  allCandidateReceipts, noExternal, noErrors }));
if (!eligible) process.exitCode = 1;
