import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseGroupedWordMath, candidateWordPaths, executeWordPath } from '../app/js/b2-word-math.mjs';
import { SpiralController } from '../app/js/spiral.mjs';

const fixturePath = process.argv[2] || 'evidence/b2-word-heldout-fixture-2026-11-01.json';
const bytes = await readFile(fixturePath);
const fixture = JSON.parse(bytes);
const receipt = { fixturePath, fixtureSha256: createHash('sha256').update(bytes).digest('hex'),
  environment: { runtime: 'Node 22 exact arithmetic adapter; browser app tested separately', modelCalls: 0 },
  cases: [] };
for (const item of fixture.cases) {
  const parsed = parseGroupedWordMath(item.prompt);
  if (item.expectedParse === false) {
    receipt.cases.push({ id: item.id, prompt: item.prompt, parsed: !!parsed,
      passed: parsed === null, status: 'semantic_uncertainty_preserved' });
    continue;
  }
  const directStart = performance.now();
  const direct = parsed && executeWordPath(parsed, candidateWordPaths(parsed)[0]);
  const directMs = performance.now() - directStart;
  const controllerStart = performance.now();
  let b2 = null, controllerError = null;
  try {
    b2 = await new SpiralController().run(item.prompt, { scope: `word-heldout-${item.id}`,
      generate: async () => { throw new Error('unexpected Falcon call'); } });
  } catch (error) { controllerError = error.message; }
  const wallMs = performance.now() - controllerStart;
  receipt.cases.push({ id: item.id, prompt: item.prompt, expected: item.expected,
    parsed, direct: { answer: direct?.answer, receipts: direct?.receipts, elapsedMs: directMs },
    b2: b2 && { answer: b2.answer, verification: b2.verification, trace: b2.trace, metrics: b2.metrics,
      graph: { nodes: b2.state.graph.nodes.filter(row => row.id.startsWith('word:')),
        edges: b2.state.graph.edges.filter(row => row.from.startsWith('word:')) }, wallMs },
    controllerError,
    passed: parsed !== null && direct.answer === item.expected && b2?.answer === item.expected &&
      b2?.verification.status === 'verified' && b2?.metrics.modelCalls === 0 &&
      b2?.trace.some(row => row.step === 'direction' && row.candidates.filter(c => c.kind.startsWith('word_')).length === 2) });
}
receipt.passed = receipt.cases.every(row => row.passed);
const path = `evidence/b2-word-${fixture.protocol.includes('confirm') ? 'confirm' : 'heldout'}-eval-${new Date().toISOString().replaceAll(':', '-')}.json`;
await writeFile(path, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ path, fixtureSha256: receipt.fixtureSha256, passed: receipt.passed,
  cases: receipt.cases.map(row => ({ id: row.id, passed: row.passed,
    selected: row.b2?.trace.find(step => step.step === 'direction')?.chosen,
    answer: row.b2?.answer, directMs: row.direct?.elapsedMs, b2Ms: row.b2?.wallMs })) }, null, 2));
if (!receipt.passed) process.exitCode = 1;
