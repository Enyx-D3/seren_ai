import { readFile, writeFile } from 'node:fs/promises';
const path = process.argv[2];
if (!path) throw Error('raw evidence path required');
const raw = JSON.parse(await readFile(path, 'utf8'));
const rows = raw.rows.map(row => {
  const cycleConclusion = row.id === 'cycle' && /cannot all be satisfied|no feasible order/i.test(row.answer);
  return { id: row.id, arm: row.arm, strictPassed: row.check.status === 'passed',
    conclusionPassed: row.check.status === 'passed' || cycleConclusion,
    wholeAnswer: row.check.status === 'passed' ? 'checked_order_or_infeasibility' :
      cycleConclusion ? 'pending_semantic_explanation_review' : 'failed_or_abstained' };
});
const summary = Object.fromEntries(['falcon_alone', 'b2'].map(arm => {
  const group = rows.filter(row => row.arm === arm), original = raw.rows.filter(row => row.arm === arm);
  const repairs = original.flatMap(row => row.trace.filter(step => step.step === 'dependency_model_repair'));
  return [arm, { ...raw.totals[arm], strictPassed: group.filter(row => row.strictPassed).length,
    conclusionPassed: group.filter(row => row.conclusionPassed).length,
    semanticReviewRequired: group.filter(row => row.wholeAnswer === 'pending_semantic_explanation_review').length,
    modelRepairAttempts: repairs.length, modelRepairsPassed: repairs.filter(step => step.repair.checked.ok).length,
    falseVerification: original.filter(row => row.check.falseVerification).length }];
}));
const output = path.replace(/\.json$/, '-rescore-v1.json');
await writeFile(output, JSON.stringify({ original: path, rows, summary,
  caveat: 'Cycle feasibility conclusion recognized independent of fixed wording; explanatory correctness remains ungraded. All data are developer-authored, repeated local tests, not external validation.' }, null, 2));
console.log(JSON.stringify({ output, summary }, null, 2));
