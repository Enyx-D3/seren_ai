/*
 * CP027 frozen-real-model Node A/B evidence auditor.
 * Independently re-scores raw responses; never trusts precomputed check/byArm.
 * No model calls, calibration, fixture rewrite or parser modifications.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreIndependentOutcome, loadIndependentFixture, FIXTURE_SHA256 } from './b2_cp026_independent_oracle.mjs';
import { EXPECTED_SHA256 } from '../app/js/model-receipts.mjs';

const DEFAULT_INPUT = 'evidence/b2-cp027-node-real-ab-2026-11-05T06-21-45.078Z.json';

function numberOrNull(value) { return Number.isFinite(value) && value >= 0 ? value : null; }
function percentile(numbers, fraction) {
  const values = numbers.filter(value => Number.isFinite(value) && value >= 0).sort((a,b) => a-b);
  return values.length ? values[Math.ceil(values.length * fraction) - 1] : null;
}
function stats(rows, targetGold) {
  const selected = targetGold ? rows.filter(row => row.gold === targetGold) : rows;
  return {
    total: selected.length,
    completeCorrect: selected.filter(row => row.audited.correct).length,
    safeAbstentions: selected.filter(row => row.gold === 'abstain' && row.audited.correct).length,
    falseVerifications: selected.filter(row => row.audited.falseVerification).length,
    unscorable: selected.filter(row => !row.audited.coverage).length,
    runtimeErrors: selected.filter(row => row.error).length,
    modelCalls: selected.reduce((total,row) => total + (row.modelCalls || 0), 0),
    generatedTokens: selected.reduce((total,row) => total + (row.generatedTokens || 0), 0),
    calculatorCalls: selected.reduce((total,row) => total + (row.calculatorCalls || 0), 0),
    p50ElapsedMs: percentile(selected.map(row => row.elapsedMs), .50),
    p95ElapsedMs: percentile(selected.map(row => row.elapsedMs), .95),
  };
}

export function auditCp027NodeEvidence(report, fixture, {
  expectedFixtureSha256 = FIXTURE_SHA256,
  expectedModelSha256 = EXPECTED_SHA256.falcon_instruct,
} = {}) {
  const failures = [], warnings = [];
  if (!report || !Array.isArray(report.rows)) throw Error('CP027 report rows[] missing');
  if (!fixture || !Array.isArray(fixture.cases)) throw Error('gold fixture cases[] missing');
  if (report.checkpoint !== 'CP027-NODE-REAL-AB') failures.push('wrong_checkpoint');
  if (report.status !== 'COMPLETE_WITH_RESULTS' || report.fatal) failures.push('incomplete_or_fatal_run');
  if (report.fixtureSha256 !== expectedFixtureSha256) failures.push('frozen_fixture_hash_mismatch');
  if (report.modelSha256 !== expectedModelSha256) failures.push('pinned_model_hash_mismatch');
  if (typeof report.runtime !== 'string' || !/Node Worker/i.test(report.runtime) || !/REAL GGUF/i.test(report.runtime))
    failures.push('real_model_runtime_identity_unproven');
  const gold = new Map(fixture.cases.map(item => [item.id, item]));
  if (gold.size !== fixture.cases.length) failures.push('duplicate_gold_ids');
  if (report.rows.length !== fixture.cases.length * 2) failures.push('expected_two_arms_per_case');
  const index = new Map(), auditedRows = [], mismatches = [], falseVerificationIds = [];
  for (const raw of report.rows) {
    const item = gold.get(raw.id);
    const arm = raw.arm;
    if (!item || !['falcon_alone', 'b2'].includes(arm)) {
      failures.push('unexpected_case_or_arm'); continue;
    }
    const key = `${raw.id}/${arm}`;
    if (index.has(key)) { failures.push(`duplicate_result:${key}`); continue; }
    index.set(key, raw);
    if (raw.gold !== item.gold) failures.push(`gold_metadata_tamper:${key}`);
    const independent = scoreIndependentOutcome(item, { answer: raw.answer, verification: raw.verification });
    const audited = raw.error ? { ...independent, correct: false,
      falseVerification: independent.claimedVerified, outcome: 'runtime_error', coverage: false } : independent;
    if (!raw.check || ['correct','falseVerification','outcome'].some(field => raw.check[field] !== audited[field]))
      mismatches.push({ id: raw.id, arm, expected: {
        correct: audited.correct, falseVerification: audited.falseVerification, outcome: audited.outcome,
      }, stored: raw.check ? {
        correct: raw.check.correct, falseVerification: raw.check.falseVerification,
        outcome: raw.check.outcome,
      } : null });
    if (audited.falseVerification) falseVerificationIds.push(key);
    if (!Number.isInteger(raw.modelCalls) || raw.modelCalls < 0 ||
        (arm === 'falcon_alone' && raw.modelCalls !== 1) || (arm === 'b2' && raw.modelCalls > 4))
      failures.push(`unexplained_model_call_budget:${key}`);
    if (numberOrNull(raw.elapsedMs) === null) failures.push(`missing_or_negative_latency:${key}`);
    auditedRows.push({ id: raw.id, arm, gold: item.gold, audited,
      modelCalls: raw.modelCalls, generatedTokens: raw.generatedTokens,
      calculatorCalls: raw.calculatorCalls, elapsedMs: raw.elapsedMs, error: raw.error });
  }
  for (const [caseIndex, item] of fixture.cases.entries()) {
    if (!index.has(`${item.id}/falcon_alone`) || !index.has(`${item.id}/b2`))
      failures.push(`missing_arm:${item.id}`);
    const expectedOrder = caseIndex % 2 === 0 ? ['falcon_alone','b2'] : ['b2','falcon_alone'];
    for (const arm of expectedOrder) {
      const raw = index.get(`${item.id}/${arm}`);
      if (raw && JSON.stringify(raw.armOrder) !== JSON.stringify(expectedOrder)) failures.push(`order_metadata_mismatch:${item.id}`);
    }
    const matching = report.rows.filter(row => row.id === item.id).map(row => row.arm);
    if (JSON.stringify(matching) !== JSON.stringify(expectedOrder)) failures.push(`order_sequence_mismatch:${item.id}`);
  }
  if (mismatches.length) failures.push('stored_score_disagrees_with_independent_raw_rescore');
  if (falseVerificationIds.length) failures.push('false_verification_detected');

  const byArm = Object.fromEntries(['falcon_alone','b2'].map(arm => {
    const subset = auditedRows.filter(row => row.arm === arm);
    return [arm, { overall: stats(subset),
      byGold: Object.fromEntries(['feasible','infeasible','abstain'].map(goldName =>
        [goldName, stats(subset,goldName)])) }];
  }));
  const comparable = fixture.cases.flatMap(item => {
    const a = auditedRows.find(row => row.id === item.id && row.arm === 'falcon_alone');
    const b = auditedRows.find(row => row.id === item.id && row.arm === 'b2');
    return a?.audited.correct && b?.audited.correct ? [{ id: item.id,
      falconMs: a.elapsedMs, b2Ms: b.elapsedMs }] : [];
  });
  if (!comparable.length) warnings.push('No tasks were completed correctly by both arms; time-to-correct comparison is undefined.');
  warnings.push('The result describes a real pinned Falcon GGUF in a Node Worker, NOT a successful browser or physical-phone runtime.');
  warnings.push('Falcon-only uses one model call; B2 may abstain immediately or use up to four calls. Aggregate latency is not a fair speedup metric.');
  warnings.push('The result is a locally authored frozen dependency fixture, not external broad-language generalization evidence.');
  warnings.push('This audit independently re-scores raw answers, but report metadata alone cannot prove the gold fixture was never passed into a runtime prompt.');
  return {
    checkpoint: 'CP027-NODE-REAL-AB-AUDIT', status: failures.length ? 'FAIL' : 'PASS',
    modelSha256: report.modelSha256, fixtureSha256: report.fixtureSha256,
    evaluatedCases: fixture.cases.length, evaluatedArms: auditedRows.length,
    byArm, comparableTimeToCorrect: { pairCount: comparable.length,
      pairs: comparable, pairedTimingAvailable: comparable.length > 0,
      generalSpeedupClaimPermitted: false },
    falseVerificationIds, mismatchedStoredChecks: mismatches, failures, warnings,
    provenance: { modelRuntime: report.runtime, sourceHash: report.sourceHash || null,
      reportStartedAt: report.startedAt || null },
    // Keep raw answers and prompt/source text OUT of compact audit output.
  };
}

async function main() {
  const argv = process.argv;
  const value = flag => { const index = argv.indexOf(flag); return index < 0 ? null : argv[index + 1] || null; };
  const input = value('--input') || DEFAULT_INPUT;
  const output = value('--out');
  const fixture = loadIndependentFixture(); // verifies pinned bytes, immutable class distribution and gold cycles
  const report = JSON.parse(await readFile(resolve(input), 'utf8'));
  const audit = auditCp027NodeEvidence(report, fixture);
  console.log(JSON.stringify(audit, null, 2));
  if (output) await writeFile(resolve(output), JSON.stringify(audit, null, 2) + '\n');
  if (audit.status !== 'PASS') process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) {
    console.error('CP027 AUDIT BLOCKED: ' + (error?.message || String(error)));
    process.exitCode = 2;
  }
}
