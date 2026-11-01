import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { exactArithmetic } from '../app/js/exact-arithmetic.mjs';

const priorPaths = [
  'evidence/b2-v2-public-fixture-2026-10-31.json',
  'evidence/b2-v2-confirm-fixture-2026-10-31.json',
  'evidence/b2-direction-fixture-2026-10-31.json',
  'evidence/b2-direction-fixture-v2-2026-10-31.json',
  'evidence/b2-direction-confirm-fixture-2026-10-31.json',
  'evidence/b2-direction-third-fixture-2026-10-31.json',
];
const prior = await Promise.all(priorPaths.map(async path => JSON.parse(await readFile(path, 'utf8'))));
const used = new Set(prior.flatMap(set => set.fixtures.map(row => row.id)));
const paths = {
  gsm8k: '/tmp/seren-gsm8k-test.jsonl', bbhBoolean: '/tmp/seren-bbh-boolean.json',
  bbhFallacies: '/tmp/seren-bbh-fallacies.json', humanEval: '/tmp/seren-humaneval.jsonl.gz',
  alpacaEval: '/tmp/seren-alpaca-eval.json',
};
const bytes = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([name, path]) => [name, await readFile(path)])));
const sourceSha256 = Object.fromEntries(Object.entries(bytes).map(([name, data]) => [name, createHash('sha256').update(data).digest('hex')]));
for (const [name, hash] of Object.entries(sourceSha256))
  if (prior.some(set => set.sourceSha256[name] !== hash)) throw new Error(`${name} source hash changed`);
const jsonl = data => data.trim().split('\n').map(JSON.parse);
const gsm = jsonl(bytes.gsm8k.toString());
const bool = JSON.parse(bytes.bbhBoolean).examples;
const fallacies = JSON.parse(bytes.bbhFallacies).examples;
const code = jsonl(gunzipSync(bytes.humanEval).toString());
const alpaca = JSON.parse(bytes.alpacaEval);
const seed = 'seren-b2-complete-reasoning-2026-10-31-v1';
const rank = (name, index) => createHash('sha256').update(`${seed}:${name}:${index}`).digest('hex');
const sample = (name, prefix, rows, count, eligible) => rows.map((row, index) => ({ row, index }))
  .filter(({ row, index }) => !used.has(`${prefix}-${index}`) && eligible(row))
  .sort((a, b) => rank(name, a.index).localeCompare(rank(name, b.index))).slice(0, count);
const number = (name, index, min, max) => min + parseInt(rank(name, index).slice(0, 8), 16) % (max - min + 1);
const fixtures = [];
for (let i = 0; i < 4; i++) {
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(label => number(`arithmetic-${label}`, i, 12, 99));
  const expression = `(${a}*${b})+(${c}-${d})`;
  fixtures.push({ id: `generated-arithmetic-${i + 1}`, category: 'arithmetic',
    prompt: `Calculate ${expression} exactly.`,
    checker: { kind: 'number', expected: exactArithmetic(expression).text, source: 'dual_exact_arithmetic_v1' } });
}
for (const { row, index } of sample('gsm8k', 'gsm8k', gsm, 4, row => row.question.length <= 500))
  fixtures.push({ id: `gsm8k-${index}`, category: 'mathematical_word_problem',
    prompt: `${row.question}\nGive the final numeric answer.`,
    checker: { kind: 'number', expected: row.answer.split('####').at(-1).trim(), source: 'published_gsm8k_test' } });
for (let i = 0; i < 4; i++) {
  const a = number('multistep-a', i, 15, 75), b = number('multistep-b', i, 3, 19),
    c = number('multistep-c', i, 2, 9);
  const operation = i % 2 ? `add ${c} to that result` : `multiply that result by ${c}`;
  const expression = i % 2 ? `(${a}+${b})+${c}` : `(${a}+${b})*${c}`;
  fixtures.push({ id: `generated-multistep-${i + 1}`, category: 'multistep',
    prompt: `Calculate ${a}+${b}; then ${operation}.`,
    checker: { kind: 'number', expected: exactArithmetic(expression).text, source: 'dual_exact_arithmetic_v1' } });
}
for (const { row, index } of sample('bbhBoolean', 'bbh-boolean', bool, 3, row => row.input.length <= 500))
  fixtures.push({ id: `bbh-boolean-${index}`, category: 'logic',
    prompt: `${row.input} Answer True or False.`,
    checker: { kind: 'choice', expected: row.target, options: ['True', 'False'] } });
for (const { row, index } of sample('bbhFallacies', 'bbh-fallacy', fallacies, 4, row => row.input.length <= 900))
  fixtures.push({ id: `bbh-fallacy-${index}`, category: 'contradiction_detection',
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
for (const { row, index } of sample('alpacaPlanning', 'alpaca-plan', alpaca, 4,
  row => row.instruction.length < 450 && /\b(?:plan|schedule|steps|strategy)\b/i.test(row.instruction)))
  fixtures.push({ id: `alpaca-plan-${index}`, category: 'planning', prompt: row.instruction, checker: { kind: 'human' } });
for (const { row, index } of sample('alpacaConversation', 'alpaca-chat', alpaca, 4,
  row => row.instruction.length < 250 && !/\b(?:plan|schedule|steps|code|function|calculate|solve|math)\b/i.test(row.instruction)))
  fixtures.push({ id: `alpaca-chat-${index}`, category: 'ordinary_conversation', prompt: row.instruction, checker: { kind: 'human' } });
if (fixtures.length !== 31 || fixtures.some(row => used.has(row.id)) || new Set(fixtures.map(row => row.id)).size !== 31)
  throw new Error('fixture count or overlap invariant failed');
const path = 'evidence/b2-complete-fixture-2026-10-31.json';
await writeFile(path, JSON.stringify({ schemaVersion: 1, frozenBeforeModelRun: new Date().toISOString(),
  selectionSeed: seed, scope: '31-case independent same-Falcon comparison; generated arithmetic and explicit dependent operations are system-level tests, not intrinsic model-accuracy tests. Public-source pretraining exposure is possible. Eight semantic pairs require blinded human review.',
  excludedFixturePaths: priorPaths, sourceUrls: prior[0].sourceUrls, sourceSha256, fixtures }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex'),
  count: fixtures.length, categories: Object.fromEntries([...new Set(fixtures.map(row => row.category))]
    .map(category => [category, fixtures.filter(row => row.category === category).length])) }, null, 2));
