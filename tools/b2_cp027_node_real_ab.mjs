/* CP027 real pinned Falcon in Node/Wllama, not a browser acceptance test.
 * The separately frozen CP026 holdout is evaluated once, without using its
 * gold labels to tune source parsing, prompts or routing.
 * Usage: node tools/b2_cp027_node_real_ab.mjs [--max-cases N] [--max-tokens N]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { SpiralController } from '../app/js/spiral.mjs';
import { createPinnedFalconNodeSession } from './b2_node_wllama_runtime.mjs';
import { loadIndependentFixture, scoreIndependentOutcome } from './b2_cp026_independent_oracle.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}
function boundedInt(value, name, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw Error(`invalid ${name}: ${String(value)}`);
  return n;
}
function summaries(rows, count) {
  const byArm = {};
  for (const arm of ['falcon_alone', 'b2']) {
    const sample = rows.filter(row => row.arm === arm);
    byArm[arm] = {
      evaluated: sample.length,
      totalCases: count,
      completeCorrect: sample.filter(row => row.check.correct).length,
      feasibleCorrect: sample.filter(row => row.gold === 'feasible' && row.check.correct).length,
      infeasibleCorrect: sample.filter(row => row.gold === 'infeasible' && row.check.correct).length,
      safeAbstentions: sample.filter(row => row.gold === 'abstain' && row.check.correct).length,
      falseVerifications: sample.filter(row => row.check.falseVerification).length,
      modelCalls: sample.reduce((n, row) => n + row.modelCalls, 0),
      generatedTokens: sample.reduce((n, row) => n + row.generatedTokens, 0),
      calculatorCalls: sample.reduce((n, row) => n + (row.calculatorCalls || 0), 0),
      totalElapsedMs: sample.reduce((n, row) => n + row.elapsedMs, 0),
      errors: sample.filter(row => row.error).length,
    };
  }
  const comparable = [];
  for (const id of new Set(rows.map(row => row.id))) {
    const a = rows.find(row => row.id === id && row.arm === 'falcon_alone');
    const b = rows.find(row => row.id === id && row.arm === 'b2');
    if (a?.check.correct && b?.check.correct)
      comparable.push({ id, falconMs: a.elapsedMs, b2Ms: b.elapsedMs });
  }
  return { byArm, comparableTimeToCorrect: { count: comparable.length, pairs: comparable } };
}

async function main() {
  const fixture = loadIndependentFixture();
  const maxCases = boundedInt(option('--max-cases', fixture.cases.length), '--max-cases', 1, fixture.cases.length);
  const maxTokens = boundedInt(option('--max-tokens', 64), '--max-tokens', 1, 128);
  const cases = fixture.cases.slice(0, maxCases);
  const session = await createPinnedFalconNodeSession({ nCtx: 1024, seed: 42, maxLoadMs: 60000 });
  const rows = [];
  const sourceHash = createHash('sha256').update(await readFile(new URL('../app/js/spiral.mjs', import.meta.url))).digest('hex');
  const startedAt = new Date().toISOString();
  let fatal = null;
  try {
    const spiral = new SpiralController();
    for (const [index, item] of cases.entries()) {
      const arms = index % 2 ? ['b2', 'falcon_alone'] : ['falcon_alone', 'b2'];
      for (const arm of arms) {
        const started = performance.now();
        let modelCalls = 0, generatedTokens = 0, ttftMs = null;
        let modelElapsedMs = 0, peakNodeRssBytes = process.memoryUsage().rss;
        let answer = '', verification = null, trace = [], calculatorCalls = 0, error = null;
        const sample = setInterval(() => {
          peakNodeRssBytes = Math.max(peakNodeRssBytes, process.memoryUsage().rss);
        }, 200);
        const generate = async ({ turns, maxTokens: requested }) => {
          modelCalls++;
          const result = await session.generate({ turns, maxTokens: Math.min(maxTokens, requested || maxTokens), temperature: 0.2 });
          generatedTokens += result.tokens || 0;
          modelElapsedMs += result.elapsedMs || 0;
          if (ttftMs === null) ttftMs = result.ttftMs ?? null;
          return result;
        };
        try {
          if (arm === 'falcon_alone') {
            const reply = await generate({ turns: [{ role: 'user', content: item.source }], maxTokens });
            answer = reply.text;
          } else {
            const result = await spiral.run(item.source, {
              scope: `cp027-node-real/${item.id}`, turns: [{ role: 'user', content: item.source }],
              experimentalDependency: true, experimentalCortexGuard: true, generate,
            });
            answer = result.answer;
            verification = result.verification;
            trace = result.trace;
            calculatorCalls = result.metrics?.calculatorCalls || 0;
          }
        } catch (cause) { error = String(cause?.message || cause).slice(0, 600); }
        clearInterval(sample);
        peakNodeRssBytes = Math.max(peakNodeRssBytes, process.memoryUsage().rss);
        const check = scoreIndependentOutcome(item, { answer, verification });
        rows.push({ id: item.id, gold: item.gold, arm, armOrder: arms,
          answer, check, verification, trace, modelCalls, generatedTokens, calculatorCalls,
          ttftMs, modelElapsedMs, elapsedMs: performance.now() - started,
          peakNodeRssBytes, error });
        console.log(`${rows.length}/${cases.length * 2} ${item.id} ${arm} ${check.correct ? 'CORRECT' : 'NOT_CORRECT'} calls=${modelCalls}`);
      }
    }
  } catch (error) { fatal = String(error?.stack || error); }
  finally { await session.close(); }
  const report = {
    checkpoint: 'CP027-NODE-REAL-AB', status: fatal ? 'PARTIAL' : maxCases < fixture.cases.length ? 'DIAGNOSTIC_SUBSET' : 'COMPLETE_WITH_RESULTS',
    qualityGate: rows.some(row => row.check.falseVerification) ? 'FAIL_FALSE_VERIFICATION' :
      rows.some(row => row.gold === 'feasible' && !row.check.correct) ? 'FAIL_FEASIBLE_COVERAGE' :
      fatal || rows.some(row => row.error) ? 'FAIL_RUNTIME' : 'PASS_SCOPED',
    startedAt, modelSha256: session.modelSha256, fixtureSha256: fixture.sha256,
    sourceHash, maxCases, maxTokens, runtime: 'Node Worker threads + pinned Wllama single-thread WASM; REAL GGUF, NOT BROWSER',
    method: 'Alternating AB/BA per case. Falcon-only receives one model call; B2 receives the same source and may invoke bounded model calls or deterministic operations. Independent frozen gold is never passed to either arm.',
    caveats: [
      'This does not pass browser, UI, WebGPU, native TinyLinux or physical-phone gates.',
      'No matched-call/time speedup claim: some B2 paths avoid or add model calls.',
      'Process RSS is sampled from Node only and is not comparable to Chromium whole-process memory.',
      'The locally authored fixture is independent of implementation changes, not externally authored broad reasoning.',
    ],
    ...summaries(rows, cases.length), fatal, rows,
  };
  const target = resolve(ROOT, option('--out', `evidence/b2-cp027-node-real-ab-${new Date().toISOString().replaceAll(':', '-')}.json`));
  if (!target.startsWith(resolve(ROOT, 'evidence') + '/')) throw Error('CP027 evidence output must remain under evidence/');
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output: target, status: report.status, ...report.byArm,
    comparablePairs: report.comparableTimeToCorrect.count, qualityGate: report.qualityGate, fatal }, null, 2));
  if (report.qualityGate !== 'PASS_SCOPED') process.exitCode = 1;
}

try { await main(); } catch (error) { console.error('CP027 Node real A/B BLOCKED:', error?.stack || error); process.exitCode = 1; }
