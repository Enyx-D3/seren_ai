import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const source = 'evidence/b2-cross-domain-ab-2026-11-01T13-07-32.874Z.json';
const bytes = await readFile(source), prior = JSON.parse(bytes);
const fixture = JSON.parse(await readFile(prior.fixturePath));
const rows = prior.rows.map(row => {
  const corrected = structuredClone(row);
  if (row.category === 'logic' && !row.error) {
    const negative = /^\s*no\b|\bnot contradictory\b|\bno contradiction\b/i.test(row.answer);
    const positive = /^\s*yes\b|\bcontradict(?:s|ory|ion)?\b/i.test(row.answer);
    const observed = negative ? 'No' : positive ? 'Yes' : null;
    const expected = fixture.cases.find(item => item.id === row.id)?.expectedAnswer;
    corrected.check = { status: observed === expected ? 'passed' : 'failed',
      method: 'v2_unambiguous_contradiction_claim', observed, expected };
  }
  if (row.category === 'code') corrected.check = { status: 'pending_human_code',
    method: 'mixed_code_diagnostic_requires_review' };
  return corrected;
});
const totals = Object.fromEntries(['falcon_alone', 'b2'].map(arm => {
  const subset = rows.filter(row => row.arm === arm);
  return [arm, { objectivePassed: subset.filter(row => row.check.status === 'passed').length,
    objectiveTotal: subset.filter(row => ['word_math', 'logic'].includes(row.category)).length,
    pendingHumanCode: subset.filter(row => row.check.status === 'pending_human_code').length,
    pendingHumanPlanningConversation: subset.filter(row => row.check.status === 'pending_blinded_human').length,
    totalElapsedMs: subset.reduce((sum, row) => sum + row.elapsedMs, 0),
    modelCalls: subset.reduce((sum, row) => sum + (row.metrics.modelCalls || 0), 0),
    tokens: subset.reduce((sum, row) => sum + (row.metrics.tokens || 0), 0),
    calculatorCalls: subset.reduce((sum, row) => sum + (row.metrics.calculatorCalls || 0), 0),
    peakProcessTreeRssKiB: Math.max(0, ...subset.map(row => row.peakProcessTreeRssKiB || 0)) || null }];
}));
const out = 'evidence/b2-cross-domain-ab-2026-11-01T13-07-32.874Z-rescore-v2.json';
const report = { source, sourceSha256: createHash('sha256').update(bytes).digest('hex'),
  correction: 'Versioned scorer correction only: recognize a stated contradiction without Yes; code answer has mixed merits and needs human review. Original raw/model outputs and v1 scores remain unchanged.',
  rows, totals };
await writeFile(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ out, totals, corrections: rows.filter(row => row.category === 'logic' || row.category === 'code')
  .map(row => ({ id: row.id, arm: row.arm, prior: prior.rows.find(old => old.id === row.id && old.arm === row.arm).check,
    now: row.check })) }, null, 2));
