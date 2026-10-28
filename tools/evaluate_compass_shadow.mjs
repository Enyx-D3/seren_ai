import { readFile, writeFile } from 'node:fs/promises';

const source = 'evidence/competence-browser-v2-2026-10-27.json';
const evidence = JSON.parse(await readFile(source, 'utf8'));
const families = ['chat', 'math', 'code', 'tool'];
const models = ['falcon_instruct', 'falcon_reason', 'falcon_coder', 'falcon_tools'];
const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] || 0; };
const percentile = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.ceil(p * sorted.length) - 1] || 0; };
const find = (modelId, caseId) => evidence.runs.find(run => run.modelId === modelId && run.caseId === caseId);

const candidate = {};
const calibration = {};
for (const family of families) {
  const ranked = models.map(modelId => {
    const rows = evidence.runs.filter(run => run.modelId === modelId && run.family === family && run.split === 'calibration');
    return { modelId, correct: rows.filter(row => row.passed).length,
      format: rows.filter(row => row.formatPass).length, total: rows.length,
      medianElapsedMs: median(rows.map(row => row.elapsedMs)) };
  }).sort((a, b) => b.correct - a.correct || b.format - a.format || a.medianElapsedMs - b.medianElapsedMs);
  candidate[family] = ranked[0].modelId;
  calibration[family] = ranked;
}

const heldout = evidence.cases.filter(item => item.split === 'heldout' && families.includes(item.family)).map(item => {
  const baseline = find('falcon_instruct', item.id);
  const proposed = find(candidate[item.family], item.id);
  const oracleCorrect = models.some(modelId => find(modelId, item.id)?.passed);
  return { caseId: item.id, family: item.family, baselineModel: 'falcon_instruct', candidateModel: candidate[item.family],
    baselineCorrect: baseline.passed, candidateCorrect: proposed.passed, oracleCorrect,
    baselineFormat: baseline.formatPass, candidateFormat: proposed.formatPass,
    baselineElapsedMs: baseline.elapsedMs, candidateElapsedMs: proposed.elapsedMs,
    baselineTtftMs: baseline.ttftMs, candidateTtftMs: proposed.ttftMs };
});
const summarize = prefix => {
  const times = heldout.map(row => row[prefix + 'ElapsedMs']);
  return { correct: heldout.filter(row => row[prefix + 'Correct']).length, total: heldout.length,
    format: heldout.filter(row => row[prefix + 'Format']).length,
    routeRegret: heldout.filter(row => row.oracleCorrect && !row[prefix + 'Correct']).length,
    medianGenerationMs: median(times), p95GenerationMs: percentile(times, 0.95),
    totalGenerationMs: times.reduce((a, b) => a + b, 0) };
};
const calibrationGap = families.map(family => {
  const selected = calibration[family][0];
  const actual = heldout.filter(row => row.family === family && row.candidateCorrect).length / 2;
  return { family, predicted: selected.correct / selected.total, heldout: actual,
    absoluteGap: Math.abs(selected.correct / selected.total - actual) };
});
const denied = evidence.runs.filter(run => run.family === 'negative');
const report = { source, candidate, calibration, heldout, baseline: summarize('baseline'), proposed: summarize('candidate'),
  meanAbsoluteCalibrationGap: calibrationGap.reduce((sum, row) => sum + row.absoluteGap, 0) / families.length,
  calibrationGap, deniedAcceptedToolCalls: denied.reduce((sum, row) => sum + row.acceptedToolCount, 0),
  decision: 'shadow_only',
  caveat: 'Eight held-out task cases (two per family). Generation latency excludes model-load/switch overhead. No production Auto route is changed.' };
const output = `evidence/compass-shadow-${new Date().toISOString().slice(0, 10)}.json`;
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ candidate, baseline: report.baseline, proposed: report.proposed,
  meanAbsoluteCalibrationGap: report.meanAbsoluteCalibrationGap, deniedAcceptedToolCalls: report.deniedAcceptedToolCalls,
  regressions: heldout.filter(row => row.baselineCorrect && !row.candidateCorrect).map(row => row.caseId), output }, null, 2));
