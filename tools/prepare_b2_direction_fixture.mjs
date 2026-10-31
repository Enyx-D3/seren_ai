import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const priorPaths = [
  'evidence/b2-v2-public-fixture-2026-10-31.json',
  'evidence/b2-v2-confirm-fixture-2026-10-31.json',
];
const prior = await Promise.all(priorPaths.map(async path => JSON.parse(await readFile(path, 'utf8'))));
const used = new Set(prior.flatMap(set => set.fixtures.map(fixture => fixture.id)));
const paths = {
  gsm8k: '/tmp/seren-gsm8k-test.jsonl',
  bbhBoolean: '/tmp/seren-bbh-boolean.json',
  bbhFallacies: '/tmp/seren-bbh-fallacies.json',
  humanEval: '/tmp/seren-humaneval.jsonl.gz',
  alpacaEval: '/tmp/seren-alpaca-eval.json',
};
const bytes = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([name, path]) => [name, await readFile(path)])));
const sourceSha256 = Object.fromEntries(Object.entries(bytes).map(([name, data]) => [name, createHash('sha256').update(data).digest('hex')]));
for (const [name, hash] of Object.entries(sourceSha256))
  if (hash !== prior[0].sourceSha256[name] || hash !== prior[1].sourceSha256[name]) throw new Error(`${name} source differs from prior frozen sets`);

const jsonl = data => data.trim().split('\n').map(JSON.parse);
const gsm = jsonl(bytes.gsm8k.toString());
const bool = JSON.parse(bytes.bbhBoolean).examples;
const fallacies = JSON.parse(bytes.bbhFallacies).examples;
const code = jsonl(gunzipSync(bytes.humanEval).toString());
const alpaca = JSON.parse(bytes.alpacaEval);
const seed = 'seren-b2-direction-2026-10-31-v2';
const rank = (name, index) => createHash('sha256').update(`${seed}:${name}:${index}`).digest('hex');
const sample = (name, prefix, rows, count, eligible) => rows.map((row, index) => ({ row, index }))
  .filter(({ row, index }) => !used.has(`${prefix}-${index}`) && eligible(row))
  .sort((a, b) => rank(name, a.index).localeCompare(rank(name, b.index))).slice(0, count);
const fixtures = [];
for (const { row, index } of sample('gsm8k', 'gsm8k', gsm, 4, row => row.question.length <= 500))
  fixtures.push({ id: `gsm8k-${index}`, category: 'mathematics',
    prompt: `${row.question}\nGive the final numeric answer.`,
    checker: { kind: 'number', expected: row.answer.split('####').at(-1).trim() } });
for (const { row, index } of sample('bbhBoolean', 'bbh-boolean', bool, 3, row => row.input.length <= 500))
  fixtures.push({ id: `bbh-boolean-${index}`, category: 'logic',
    prompt: `${row.input} Answer True or False.`,
    checker: { kind: 'choice', expected: row.target, options: ['True', 'False'] } });
for (const { row, index } of sample('bbhFallacies', 'bbh-fallacy', fallacies, 3, row => row.input.length <= 900))
  fixtures.push({ id: `bbh-fallacy-${index}`, category: 'contradictions',
    prompt: `${row.input}\nAnswer valid or invalid.`,
    checker: { kind: 'choice', expected: row.target, options: ['valid', 'invalid'] } });
const canonicalCheckable = row => {
  if (row.prompt.length > 1000 || row.test.length > 3000) return false;
  const child = spawnSync('python3', ['-I', '-S', 'tools/b2_python_check.py'], {
    input: JSON.stringify({ answer: row.prompt + row.canonical_solution, prefix: row.prompt,
      entryPoint: row.entry_point, tests: row.test }), encoding: 'utf8', timeout: 5000,
    env: { PATH: '/usr/bin:/bin:/Library/Frameworks/Python.framework/Versions/3.14/bin', PYTHONDONTWRITEBYTECODE: '1' },
  });
  if (child.status !== 0) return false;
  try { return JSON.parse(child.stdout).status === 'passed'; } catch { return false; }
};
for (const { row, index } of sample('humanEval', 'humaneval', code, 4, canonicalCheckable))
  fixtures.push({ id: `humaneval-${index}`, category: 'coding',
    prompt: `Complete this Python function. Return code only.\n\n${row.prompt}`,
    checker: { kind: 'python', entryPoint: row.entry_point, prefix: row.prompt, tests: row.test } });
// Curated by reading only third-party task prompts, before observing either arm's output.
for (const index of [450, 576, 721]) fixtures.push({ id: `alpaca-plan-${index}`, category: 'planning',
  prompt: alpaca[index].instruction, checker: { kind: 'human' } });
for (const index of [6, 17, 315]) fixtures.push({ id: `alpaca-chat-${index}`, category: 'ordinary_conversation',
  prompt: alpaca[index].instruction, checker: { kind: 'human' } });

if (fixtures.length !== 20 || fixtures.some(fixture => used.has(fixture.id)) || new Set(fixtures.map(fixture => fixture.id)).size !== fixtures.length)
  throw new Error('Direction fixture size/overlap invariant failed');
const path = 'evidence/b2-direction-fixture-v2-2026-10-31.json';
const payload = {
  schemaVersion: 1, frozenBeforeModelRun: new Date().toISOString(), selectionSeed: seed,
  scope: '20 disjoint public-source tasks; selected before seeing the new B2 direction policy run. HumanEval candidates must pass the restricted checker with published canonical code. Public pretraining contamination is possible. Six semantic cases need blind human review.',
  supersedesInvalidPreparation: 'evidence/b2-direction-fixture-2026-10-31.json',
  excludedFixturePaths: priorPaths,
  sourceUrls: prior[0].sourceUrls, sourceSha256, fixtures,
};
await writeFile(path, JSON.stringify(payload, null, 2) + '\n', { flag: 'wx' });
const sha256 = createHash('sha256').update(await readFile(path)).digest('hex');
console.log(JSON.stringify({ path, sha256, count: fixtures.length,
  categories: Object.fromEntries([...new Set(fixtures.map(f => f.category))].map(category => [category, fixtures.filter(f => f.category === category).length])) }, null, 2));
