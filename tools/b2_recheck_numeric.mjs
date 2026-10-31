import { readFile, writeFile } from 'node:fs/promises';

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Usage: node tools/b2_recheck_numeric.mjs <raw-evaluation.json>');
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const fixture = JSON.parse(await readFile(source.fixturePath, 'utf8'));
const expected = new Map(fixture.fixtures.filter(item => item.checker.kind === 'number').map(item => [item.id, item.checker.expected.replaceAll(',', '')]));
const rows = source.rows.filter(row => expected.has(row.id)).map(row => {
  const claims = [...row.answer.matchAll(/(?<![\w.])-?\d[\d,]*(?:\.\d+)?(?!\w)/g)].map(match => match[0].replaceAll(',', ''));
  const observed = claims.at(-1) || null;
  return { id: row.id, system: row.system, previous: row.check,
    corrected: { status: !row.error && observed === expected.get(row.id) ? 'passed' : 'failed',
      expected: expected.get(row.id), observed } };
});
const path = sourcePath.replace(/\.json$/, '-numeric-recheck.json');
await writeFile(path, JSON.stringify({ sourcePath, reason: 'Initial numeric regex wrongly rejected a final number followed by sentence punctuation.',
  checker: 'last numeric claim with decimal and comma handling', rows,
  summary: Object.fromEntries(['falcon_alone', 'falcon_plus_b2'].map(system => [system,
    rows.filter(row => row.system === system && row.corrected.status === 'passed').length])) }, null, 2) + '\n');
console.log(path);
