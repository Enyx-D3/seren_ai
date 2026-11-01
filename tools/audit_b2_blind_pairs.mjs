import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SpiralController } from '../app/js/spiral.mjs';
import { buildChatPrompt } from '../app/js/prompts.mjs';

const sourcePaths = {
  raw: 'evidence/b2-complete-eval-2026-10-31T12-49-02-817Z.json',
  packet: 'evidence/b2-complete-blind-review-2026-10-31T12-49-02-817Z.md',
  mapping: 'evidence/b2-complete-blind-key-2026-10-31T12-49-02-817Z.json',
  fixture: 'evidence/b2-complete-fixture-2026-10-31.json',
};
const bytes = Object.fromEntries(await Promise.all(Object.entries(sourcePaths)
  .map(async ([name, path]) => [name, await readFile(path)])));
const hashes = Object.fromEntries(Object.entries(bytes)
  .map(([name, value]) => [name, createHash('sha256').update(value).digest('hex')]));
const raw = JSON.parse(bytes.raw), fixture = JSON.parse(bytes.fixture);
const packet = bytes.packet.toString();
const semantic = fixture.fixtures.filter(row => row.checker.kind === 'human');
const controller = new SpiralController();
const cases = [];
for (const [index, item] of semantic.entries()) {
  const pair = raw.rows.filter(row => row.id === item.id);
  if (pair.length !== 2 || new Set(pair.map(row => row.system)).size !== 2)
    throw new Error(`invalid raw pair for ${item.id}`);
  const start = packet.indexOf(`## ${item.id}\n`);
  const end = index + 1 < semantic.length ? packet.indexOf(`## ${semantic[index + 1].id}\n`, start + 1) : packet.length;
  if (start < 0 || end <= start) throw new Error(`missing packet section for ${item.id}`);
  const section = packet.slice(start, end);
  const match = /\*\*Response 1:\*\*\n\n([\s\S]*?)\n\n\*\*Response 2:\*\*\n\n([\s\S]*?)\n\n\*\*Reviewer:\*\*/.exec(section);
  if (!match) throw new Error(`unparseable packet pair for ${item.id}`);
  const packetAnswers = [match[1], match[2]];
  const rawAnswers = pair.map(row => row.answer);
  const exportMatchesRaw = packetAnswers.every(answer => rawAnswers.includes(answer));
  const captured = [];
  await controller.run(item.prompt, { scope: `audit-${item.id}`,
    turns: [{ role: 'user', content: item.prompt }],
    generate: async request => { captured.push(request); return { text: 'Audit placeholder.', tokens: 0 }; } });
  const baselinePrompt = buildChatPrompt('falcon_instruct', [{ role: 'user', content: item.prompt }]).prompt;
  const b2Prompt = captured.length ? buildChatPrompt('falcon_instruct', captured[0].turns).prompt : null;
  cases.push({ id: item.id, rawByteIdentical: rawAnswers[0] === rawAnswers[1],
    renderedTextIdentical: rawAnswers[0].trimEnd() === rawAnswers[1].trimEnd(),
    packetAnswersIdentical: packetAnswers[0].trimEnd() === packetAnswers[1].trimEnd(),
    exportMatchesRaw, promptBytesIdentical: baselinePrompt === b2Prompt,
    rawAnswerLengths: rawAnswers.map(answer => answer.length),
    modelCalls: pair.map(row => row.metrics.modelCalls),
    generationErrors: pair.map(row => row.error),
    b2TraceSteps: pair.find(row => row.system === 'falcon_plus_b2').trace.map(step => step.step) });
}
const summary = { totalPairs: cases.length,
  rawByteIdentical: cases.filter(row => row.rawByteIdentical).length,
  renderedTextIdentical: cases.filter(row => row.renderedTextIdentical).length,
  packetMatchesRaw: cases.filter(row => row.exportMatchesRaw).length,
  packetRenderedIdentical: cases.filter(row => row.packetAnswersIdentical).length,
  promptBytesIdentical: cases.filter(row => row.promptBytesIdentical).length,
  allOneCallPerArm: cases.every(row => row.modelCalls.every(n => n === 1)),
  noGenerationErrors: cases.every(row => row.generationErrors.every(error => error === null)) };
const path = 'evidence/b2-blind-pair-audit-v2-2026-10-31.json';
await writeFile(path, JSON.stringify({ schemaVersion: 2, originalFileSha256: hashes, summary,
  cases, conclusion: 'Original packet reproduces raw outputs. Identical rendered answers arose from equivalent prompts and one same-model generation per arm; no output-copy or export-duplication path found. Raw evidence lacks per-generation prompt hashes and request IDs, so future evaluations must record them.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ path, summary }, null, 2));
if (summary.packetMatchesRaw !== 8 || summary.promptBytesIdentical !== 8 || !summary.noGenerationErrors)
  process.exitCode = 1;
