/* Optional real pinned Falcon CP032 diagnostic, NOT a browser or blind test. */
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCortexResidualCycle } from '../app/js/b2-cortex-residual-cycle.mjs';
import { createPinnedFalconNodeSession } from './b2_node_wllama_runtime.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const devCases = [
  { id: 'cp032_real_cake',
    source: '"Cool pan" must finish before "Plate meal". "Plate meal" must finish before "Serve meal". Give a valid order.',
    initialOrder: ['Serve meal','Plate meal','Cool pan'],
    goldEdges: [['Cool pan','Plate meal'],['Plate meal','Serve meal']],
  },
  { id: 'cp032_real_electrical',
    source: '"Install panel" precede "Connect wiring". "Connect wiring" precede "Run diagnostic". Find an order.',
    initialOrder: ['Run diagnostic','Connect wiring','Install panel'],
    goldEdges: [['Install panel','Connect wiring'],['Connect wiring','Run diagnostic']],
  },
];

function separatelyCheck(order, edges) {
  return Array.isArray(order) && order.length === 3 && new Set(order).size === 3 &&
    edges.flat().every(name => order.includes(name)) &&
    edges.every(([before,after]) => order.indexOf(before) < order.indexOf(after));
}

const session = await createPinnedFalconNodeSession({ nCtx: 512, seed: 17 });
const startedAt = new Date().toISOString(), rows = [];
try {
  for (const row of devCases) {
    const started = performance.now();
    let actualCalls = 0, actualTokens = 0, modelElapsedMs = 0;
    const result = await runCortexResidualCycle(row.source, {
      initialOrder: row.initialOrder, maxModelCalls: 3, maxNoProgress: 2,
      generate: async input => {
        actualCalls++;
        const generated = await session.generate({ ...input, temperature: 0 });
        actualTokens += generated.tokens;
        modelElapsedMs += generated.elapsedMs;
        return generated;
      },
    });
    const independentlyCorrect = result.wholeTaskVerified ?
      separatelyCheck(result.order, row.goldEdges) : false;
    rows.push({ id: row.id, source: row.source, startingOrder: row.initialOrder,
      result, actualModelCalls: actualCalls, actualTokens, modelElapsedMs,
      elapsedMs: performance.now() - started, independentlyCorrect });
    console.log(`${row.id}: ${result.status}, actualFalconCalls=${actualCalls}, actualTokens=${actualTokens}`);
  }
} finally { await session.close(); }

const report = { checkpoint: 'CP032_REAL_FALCON_RESIDUAL_DEV',
  status: 'DEV_DIAGNOSTIC_NOT_ACCEPTANCE', startedAt,
  modelSha256: session.modelSha256, runtime: session.platform,
  realModelCalls: rows.reduce((n,row) => n + row.actualModelCalls,0),
  independentlyCorrect: rows.filter(row => row.independentlyCorrect).length,
  falseVerifications: rows.filter(row => row.result.wholeTaskVerified && !row.independentlyCorrect).length,
  rows, caveats: ['Separately authored developer prompts, not CP026 frozen or external BBH.',
    'Model choice is not a new fact; it is checked against source prerequisites.',
    'No browser, physical phone, general reasoning, code execution or speedup claim.'] };
const target = resolve(root, 'evidence/cp032-real-falcon-residual-dev.json');
await writeFile(target, JSON.stringify(report,null,2) + '\n');
console.log(JSON.stringify({status:report.status, output:target,
  modelSha256:report.modelSha256, realModelCalls:report.realModelCalls,
  independentlyCorrect:report.independentlyCorrect,
  falseVerifications:report.falseVerifications},null,2));
if (report.falseVerifications) process.exitCode = 1;
