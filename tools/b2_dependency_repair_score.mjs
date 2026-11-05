import { readFile, writeFile } from 'node:fs/promises';
const path = process.argv[2];
if (!path) throw Error('raw evaluation path required');
const report = JSON.parse(await readFile(path));
const fixture = JSON.parse(await readFile(report.fixturePath));
const byId = new Map(fixture.cases.map(c => [c.id,c]));
const rows = report.rows.map(row => {
  const test = byId.get(row.id);
  if (!test) throw Error('unknown evaluation case');
  const passed = row.check.status === 'passed';
  const repairs = row.trace.filter(t => t.step === 'dependency_model_repair');
  return { ...row, complete: !test.expectedAbstain && passed, correctAbstention: !!test.expectedAbstain && passed,
    falseVerification: row.verification?.status === 'verified' && (!passed || !!test.expectedAbstain),
    fullRepairs: repairs.filter(t => t.repair.checked.ok).length,
    partialRepairs: repairs.filter(t => t.repair.componentChecked && !t.repair.checked.ok).length,
    rejectedRepairs: repairs.filter(t => !t.repair.componentChecked).length };
});
const comparable = fixture.cases.filter(test => ['falcon_alone','b2'].every(arm => rows.some(r => r.id === test.id && r.arm === arm && r.complete))).map(test => test.id);
const summary = Object.fromEntries(['falcon_alone','b2'].map(arm => {
  const group = rows.filter(r => r.arm === arm);
  return [arm,{ completeCorrect: group.filter(r=>r.complete).length,
    answerable: fixture.cases.filter(c=>!c.expectedAbstain).length,
    correctAbstentions: group.filter(r=>r.correctAbstention).length,
    ambiguousOrNegative: fixture.cases.filter(c=>c.expectedAbstain).length,
    falseVerification: group.filter(r=>r.falseVerification).length,
    fullFalconLedRepairs: group.reduce((n,r)=>n+r.fullRepairs,0),
    partialRepairs: group.reduce((n,r)=>n+r.partialRepairs,0),
    rejectedRepairs: group.reduce((n,r)=>n+r.rejectedRepairs,0),
    totalLatencyMs: group.reduce((n,r)=>n+r.elapsedMs,0),
    comparableCompletedTaskLatencyMs: comparable.length ? group.filter(r=>comparable.includes(r.id)).reduce((n,r)=>n+r.elapsedMs,0) : null,
    modelCalls: group.reduce((n,r)=>n+r.metrics.modelCalls,0),
    simulatorCalls: group.reduce((n,r)=>n+r.metrics.calculatorCalls,0),
    peakProcessTreeRssKiB: Math.max(...group.map(r=>r.peakProcessTreeRssKiB || 0)) }];
}));
const out = path.replace(/\.json$/, '-outcomes-v1.json');
await writeFile(out,JSON.stringify({ original:path, fixtureSha256:report.fixtureSha256, comparableCompletedCases:comparable, summary,
  caveats:['Local scheduling cases are developer-authored; BBH cases are externally authored and unsupported.',
    'A full model-led repair means model selected the prerequisite, a constrained local edit preserved checked relationships, and the whole task passed. It is not unrestricted generated-code repair.',
    'Total latency includes abstentions; no co-completed tasks means no supported comparative time-to-correct claim.'] },null,2));
console.log(JSON.stringify({out,comparable,summary},null,2));
