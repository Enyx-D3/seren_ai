import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { SpiralController } from '../app/js/spiral.mjs';

const file = 'evidence/b2-cross-domain-unseen-fixture-2026-11-01.json';
const bytes = await readFile(file), fixture = JSON.parse(bytes);
const receipt = { fixture: file, sha256: createHash('sha256').update(bytes).digest('hex'),
  environment: { runtime: process.version, backend: 'Node exact operations; no Falcon invoked',
    comparison: 'B2 operation path only; Falcon-alone comparison pending same-model browser run' }, cases: [] };
for (const item of fixture.cases) {
  if (['planning', 'conversation'].includes(item.category)) {
    receipt.cases.push({ id: item.id, category: item.category, status: 'pending_blinded_human_and_same_model_comparison' });
    continue;
  }
  const began = performance.now();
  try {
    const result = await new SpiralController().run(item.prompt, { scope: `unseen-${item.id}`,
      generate: () => { throw Error('unexpected Falcon call'); } });
    const route = result.trace.find(row => row.step === 'direction');
    const pass = result.verification.status === item.expectedStatus &&
      (item.expectedAnswer ? result.answer.startsWith(item.expectedAnswer) : result.answer.includes(item.expectedAnswerContains)) &&
      result.metrics.modelCalls === 0 && route.candidates.length >= 2;
    receipt.cases.push({ id: item.id, category: item.category, prompt: item.prompt, expected: item,
      answer: result.answer, verification: result.verification, metrics: result.metrics,
      elapsedMsPrecise: performance.now() - began, route, trace: result.trace,
      graph: result.state.graph, residuals: result.state.residuals, pass });
  } catch (error) { receipt.cases.push({ id: item.id, error: error.message, pass: false }); }
}
receipt.objective = { passed: receipt.cases.filter(row => row.pass).length,
  total: receipt.cases.filter(row => typeof row.pass === 'boolean').length };
const out = `evidence/b2-cross-domain-unseen-${new Date().toISOString().replaceAll(':', '-')}.json`;
await writeFile(out, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ out, sha256: receipt.sha256, objective: receipt.objective,
  cases: receipt.cases.map(row => ({ id: row.id, pass: row.pass, error: row.error,
    chosen: row.route?.chosen?.kind, status: row.verification?.status })) }, null, 2));
if (receipt.objective.passed !== receipt.objective.total) process.exitCode = 1;
