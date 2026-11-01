import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseInventoryTransfer, candidateTransferPaths, executeTransferPath } from '../app/js/b2-transfer.mjs';
import { SpiralController } from '../app/js/spiral.mjs';

const fixturePath = process.argv[2] || 'evidence/b2-transfer-development-fixture-2026-11-01.json';
const bytes = await readFile(fixturePath);
const fixture = JSON.parse(bytes);
const rows = [];
const impossibleGenerate = async () => { throw new Error('unanticipated Falcon call'); };
for (const item of fixture.cases) {
  const parsed = parseInventoryTransfer(item.prompt);
  if (item.expectedParse === false) {
    rows.push({ id: item.id, passed: parsed === null, parserAbstained: parsed === null });
    continue;
  }
  const staticBegan = performance.now();
  const direct = executeTransferPath(parsed, candidateTransferPaths(parsed)[0]);
  const directMs = performance.now() - staticBegan;
  const alternativeBegan = performance.now();
  const alternative = executeTransferPath(parsed, candidateTransferPaths(parsed)[1]);
  const alternativeMs = performance.now() - alternativeBegan;
  const began = performance.now();
  const result = await new SpiralController().run(item.prompt,
    { scope: `transfer-local-${item.id}`, generate: impossibleGenerate });
  rows.push({ id: item.id, expected: item.expected, answer: result.answer,
    chosen: result.trace.find(step => step.step === 'direction')?.chosen,
    graphVerified: result.state.graph.nodes.find(node => node.id === 'transfer:target_final')?.status === 'verified',
    verification: result.verification.status, modelCalls: result.metrics.modelCalls,
    calculatorCalls: result.metrics.calculatorCalls, elapsedMs: Number((performance.now() - began).toFixed(3)),
    staticDirectMs: Number(directMs.toFixed(3)), alternativeMs: Number(alternativeMs.toFixed(3)),
    alternativeAnswer: alternative.answer,
    passed: result.answer === item.expected && result.verification.status === 'verified' &&
      result.metrics.modelCalls === 0 && result.metrics.calculatorCalls === 1 &&
      direct.answer === item.expected && alternative.answer === item.expected &&
      result.state.graph.nodes.find(node => node.id === 'transfer:target_final')?.status === 'verified' });
}
const receipt = { fixturePath, fixtureSha256: createHash('sha256').update(bytes).digest('hex'),
  sourceRevision: 'working tree based on 63c38a6',
  environment: 'Node local deterministic controller; NOT browser or external held-out grading',
  results: rows, passed: rows.every(row => row.passed) };
const output = `evidence/b2-transfer-development-${new Date().toISOString().replaceAll(':', '-')}.json`;
await writeFile(output, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ receipt: output, passed: receipt.passed, results: rows }, null, 2));
if (!receipt.passed) process.exitCode = 1;
