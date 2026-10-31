import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const first = JSON.parse(await readFile('evidence/b2-v2-public-fixture-2026-10-31.json', 'utf8'));
const used = new Set(first.fixtures.map(f => f.id));
const files = {
  gsm8k: '/tmp/seren-gsm8k-test.jsonl', bbhBoolean: '/tmp/seren-bbh-boolean.json',
  bbhFallacies: '/tmp/seren-bbh-fallacies.json', humanEval: '/tmp/seren-humaneval.jsonl.gz',
  alpacaEval: '/tmp/seren-alpaca-eval.json',
};
const bytes = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([name, path]) => [name, await readFile(path)])));
for (const [name, data] of Object.entries(bytes))
  if (createHash('sha256').update(data).digest('hex') !== first.sourceSha256[name]) throw new Error(`${name} source changed`);
const jsonl = data => data.trim().split('\n').map(JSON.parse);
const gsm = jsonl(bytes.gsm8k.toString());
const bool = JSON.parse(bytes.bbhBoolean).examples;
const fallacies = JSON.parse(bytes.bbhFallacies).examples;
const code = jsonl(gunzipSync(bytes.humanEval).toString());
const alpaca = JSON.parse(bytes.alpacaEval);
const rank = (name, index) => createHash('sha256').update(`seren-b2-v2-confirm-2026-10-31:${name}:${index}`).digest('hex');
const pick = (name, prefix, rows, count, eligible = () => true) => rows.map((row, index) => ({ row, index }))
  .filter(({ row, index }) => !used.has(`${prefix}-${index}`) && eligible(row))
  .sort((a, b) => rank(name, a.index).localeCompare(rank(name, b.index))).slice(0, count);
const fixtures = [];
for (const { row, index } of pick('gsm8k', 'gsm8k', gsm, 6)) fixtures.push({ id: `gsm8k-${index}`, category: 'mathematics',
  prompt: `${row.question}\nGive the final numeric answer.`, checker: { kind: 'number', expected: row.answer.split('####').at(-1).trim() } });
for (const { row, index } of pick('bbhBoolean', 'bbh-boolean', bool, 4)) fixtures.push({ id: `bbh-boolean-${index}`, category: 'logic',
  prompt: `${row.input} Answer True or False.`, checker: { kind: 'choice', expected: row.target, options: ['True', 'False'] } });
for (const { row, index } of pick('bbhFallacies', 'bbh-fallacy', fallacies, 4)) fixtures.push({ id: `bbh-fallacy-${index}`, category: 'contradictions',
  prompt: `${row.input}\nAnswer valid or invalid.`, checker: { kind: 'choice', expected: row.target, options: ['valid', 'invalid'] } });
for (const { row, index } of pick('humanEval', 'humaneval', code, 4, row => row.prompt.length <= 1200 && row.test.length <= 3000))
  fixtures.push({ id: `humaneval-${index}`, category: 'coding',
    prompt: `Complete this Python function. Return code only.\n\n${row.prompt}`,
    checker: { kind: 'python', entryPoint: row.entry_point, prefix: row.prompt, tests: row.test } });
for (const index of [515, 532, 580]) fixtures.push({ id: `alpaca-plan-${index}`, category: 'planning',
  prompt: alpaca[index].instruction, checker: { kind: 'human' } });
for (const index of [374, 628, 756]) fixtures.push({ id: `alpaca-chat-${index}`, category: 'ordinary_conversation',
  prompt: alpaca[index].instruction, checker: { kind: 'human' } });
if (fixtures.some(f => used.has(f.id))) throw new Error('confirmation set overlaps first evaluation');
const path = 'evidence/b2-v2-confirm-fixture-2026-10-31.json';
await writeFile(path, JSON.stringify({ schemaVersion: 1, frozenBeforeFirstEvaluationResult: new Date().toISOString(),
  selectionSeed: 'seren-b2-v2-confirm-2026-10-31', scope: 'Disjoint confirmation tasks from the same independent public sources; six semantic cases require blinded human grades.',
  sourceUrls: first.sourceUrls, sourceSha256: first.sourceSha256, fixtures }, null, 2) + '\n');
console.log(JSON.stringify({ path, count: fixtures.length, sha256: createHash('sha256').update(await readFile(path)).digest('hex') }));
