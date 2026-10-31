import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const sourceFiles = {
  gsm8k: '/tmp/seren-gsm8k-test.jsonl',
  bbhBoolean: '/tmp/seren-bbh-boolean.json',
  bbhFallacies: '/tmp/seren-bbh-fallacies.json',
  humanEval: '/tmp/seren-humaneval.jsonl.gz',
  alpacaEval: '/tmp/seren-alpaca-eval.json',
};
const sourceUrls = {
  gsm8k: 'https://github.com/openai/grade-school-math/blob/master/grade_school_math/data/test.jsonl',
  bbhBoolean: 'https://github.com/suzgunmirac/BIG-Bench-Hard/blob/main/bbh/boolean_expressions.json',
  bbhFallacies: 'https://github.com/suzgunmirac/BIG-Bench-Hard/blob/main/bbh/formal_fallacies.json',
  humanEval: 'https://github.com/openai/human-eval/blob/master/data/HumanEval.jsonl.gz',
  alpacaEval: 'https://huggingface.co/datasets/tatsu-lab/alpaca_eval/blob/main/alpaca_eval.json',
};
const bytes = Object.fromEntries(await Promise.all(Object.entries(sourceFiles).map(async ([name, path]) => [name, await readFile(path)])));
const hashes = Object.fromEntries(Object.entries(bytes).map(([name, data]) => [name, createHash('sha256').update(data).digest('hex')]));
const pinnedSourceSha256 = {
  gsm8k: '3730d312f6e3440559ace48831e51066acaca737f6eabec99bccb9e4b3c39d14',
  bbhBoolean: 'ea6c754ec005e2d3f2d085d349a740f593b5764f32ea4638ffed4cfc0061b12a',
  bbhFallacies: '4c1adb664821157faade1d4153685403afcc02648f3c180a608a18f17f589629',
  humanEval: 'b796127e635a67f93fb35c04f4cb03cf06f38c8072ee7cee8833d7bee06979ef',
  alpacaEval: 'd92b92c51e8f1962a21193abe74e6f727c2bc8286035f4041505ff38a7c3ae51',
};
for (const [name, expected] of Object.entries(pinnedSourceSha256))
  if (hashes[name] !== expected) throw new Error(`${name} source bytes changed`);
const jsonl = data => data.trim().split('\n').map(JSON.parse);
const gsm = jsonl(bytes.gsm8k.toString());
const bool = JSON.parse(bytes.bbhBoolean).examples;
const fallacies = JSON.parse(bytes.bbhFallacies).examples;
const code = jsonl(gunzipSync(bytes.humanEval).toString());
const alpaca = JSON.parse(bytes.alpacaEval);
const rank = (name, index) => createHash('sha256').update(`seren-b2-v2-public-2026-10-31:${name}:${index}`).digest('hex');
const sample = (name, rows, count, eligible = () => true) => rows.map((row, index) => ({ row, index }))
  .filter(({ row }) => eligible(row)).sort((a, b) => rank(name, a.index).localeCompare(rank(name, b.index))).slice(0, count);
const fixtures = [];
for (const { row, index } of sample('gsm8k', gsm, 10)) fixtures.push({ id: `gsm8k-${index}`, category: 'mathematics',
  prompt: `${row.question}\nGive the final numeric answer.`, checker: { kind: 'number', expected: row.answer.split('####').at(-1).trim() } });
for (const { row, index } of sample('bbhBoolean', bool, 8)) fixtures.push({ id: `bbh-boolean-${index}`, category: 'logic',
  prompt: `${row.input} Answer True or False.`, checker: { kind: 'choice', expected: row.target, options: ['True', 'False'] } });
for (const { row, index } of sample('bbhFallacies', fallacies, 8)) fixtures.push({ id: `bbh-fallacy-${index}`, category: 'contradictions',
  prompt: `${row.input}\nAnswer valid or invalid.`, checker: { kind: 'choice', expected: row.target, options: ['valid', 'invalid'] } });
for (const { row, index } of sample('humanEval', code, 8, row => row.prompt.length <= 1200 && row.test.length <= 3000))
  fixtures.push({ id: `humaneval-${index}`, category: 'coding',
    prompt: `Complete this Python function. Return code only.\n\n${row.prompt}`,
    checker: { kind: 'python', entryPoint: row.entry_point, prefix: row.prompt, tests: row.test } });
for (const index of [176, 228, 243, 490, 550, 596, 646]) fixtures.push({ id: `alpaca-plan-${index}`, category: 'planning',
  prompt: alpaca[index].instruction, checker: { kind: 'human' } });
for (const index of [521, 626, 627, 629, 630, 650, 758]) fixtures.push({ id: `alpaca-chat-${index}`, category: 'ordinary_conversation',
  prompt: alpaca[index].instruction, checker: { kind: 'human' } });
const result = { schemaVersion: 1, frozenBeforeRun: new Date().toISOString(), selectionSeed: 'seren-b2-v2-public-2026-10-31',
  scope: 'Public author-created test sets, newly selected for this project; independent of the prior Seren development cases but potentially present in Falcon pretraining. Qualitative cases require a blinded human reviewer.',
  sourceUrls, sourceSha256: hashes, fixtures };
const path = 'evidence/b2-v2-public-fixture-2026-10-31.json';
await writeFile(path, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ path, count: fixtures.length, byCategory: Object.fromEntries([...new Set(fixtures.map(f => f.category))].map(c => [c, fixtures.filter(f => f.category === c).length])), sourceSha256: hashes }, null, 2));
