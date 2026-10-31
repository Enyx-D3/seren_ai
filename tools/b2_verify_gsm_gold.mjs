import { readFile, writeFile } from 'node:fs/promises';
import { exactArithmetic } from '../app/js/exact-arithmetic.mjs';

const fixture = JSON.parse(await readFile('evidence/b2-v2-public-fixture-2026-10-31.json', 'utf8'));
const source = (await readFile('/tmp/seren-gsm8k-test.jsonl', 'utf8')).trim().split('\n').map(JSON.parse);
const rows = [];
for (const task of fixture.fixtures.filter(item => item.category === 'mathematics')) {
  const index = Number(task.id.split('-').at(-1));
  const annotations = [...source[index].answer.matchAll(/<<([^=]+)=([^>]+)>>/g)];
  const checks = annotations.map(([, expression, written]) => {
    try {
      const calculated = exactArithmetic(expression.replaceAll(',', '').trim());
      const claimed = exactArithmetic(written.replaceAll(',', '').trim());
      return { expression, written, calculated: calculated.text,
        matches: calculated.numerator === claimed.numerator && calculated.denominator === claimed.denominator };
    } catch (error) { return { expression, written, unsupported: error.message }; }
  });
  let finalMatchesLastStep = null;
  try {
    const last = exactArithmetic(checks.at(-1).written.replaceAll(',', '').trim());
    const published = exactArithmetic(task.checker.expected.replaceAll(',', '').trim());
    finalMatchesLastStep = last.numerator === published.numerator && last.denominator === published.denominator;
  } catch { /* some word problems have an unannotated final step */ }
  rows.push({ id: task.id, publishedFinal: task.checker.expected,
    finalMatchesLastStep,
    checkedSteps: checks.filter(check => check.matches).length,
    mismatchedSteps: checks.filter(check => check.matches === false),
    unsupportedSteps: checks.filter(check => check.unsupported),
    checks });
}
const path = 'evidence/b2-v2-gsm-gold-check-2026-10-31.json';
await writeFile(path, JSON.stringify({ sourceSha256: fixture.sourceSha256.gsm8k, rows }, null, 2) + '\n');
console.log(JSON.stringify({ path, tasks: rows.length, checkedSteps: rows.reduce((n, row) => n + row.checkedSteps, 0),
  mismatchedSteps: rows.reduce((n, row) => n + row.mismatchedSteps.length, 0),
  finalMatchesLastStep: rows.filter(row => row.finalMatchesLastStep).length,
  unsupportedSteps: rows.reduce((n, row) => n + row.unsupportedSteps.length, 0) }));
if (rows.some(row => row.mismatchedSteps.length)) process.exitCode = 1;
