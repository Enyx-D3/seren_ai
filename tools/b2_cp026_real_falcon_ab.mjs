/*
 * CP026: real browser/Wllama/Falcon paired evaluation.
 * Usage (from repository root):
 *   PORT=8799 npm run serve                      # in another terminal
 *   node tools/b2_cp026_real_falcon_ab.mjs --fixture PATH --fixture-sha256 HASH
 *
 * Refuses to use a synthetic model, changed fixture, missing pinned GGUF,
 * absent runtime assets, or a nonresponding local HTTP server.
 */
import { readFile, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { independentlyScoreCp026Case, validateCp026Fixture, summarizeCp026Rows } from './b2_cp026_ab_oracle.mjs';
import { FIXTURE_SHA256, scoreIndependentOutcome } from './b2_cp026_independent_oracle.mjs';
import { EXPECTED_SHA256 } from '../app/js/model-receipts.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GGUF = resolve(ROOT, 'workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf');
const MODEL_URL = '/models/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf';
const PATH_HASH = [
  'app/js/spiral.mjs', 'app/js/b2-dependency-task.mjs', 'app/js/b2-semantic-extraction.mjs',
  'app/js/b2-cortex-guard.mjs', 'app/js/b2-graphos-composition.mjs',
  'app/js/b2-direction.mjs', 'app/js/prompts.mjs', 'app/workers/runtime-worker.mjs',
];

function argument(name, fallback = null) {
  const position = process.argv.indexOf(name);
  return position === -1 ? fallback : (process.argv[position + 1] || null);
}
function fail(reason, code = 2) {
  console.error(`CP026 REAL-FALCON EVAL BLOCKED: ${reason}`);
  process.exitCode = code;
}
async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}
async function requireFile(path, hint) {
  try { const file = await stat(resolve(ROOT, path)); if (!file.size || !file.isFile()) throw Error('empty or not a file'); }
  catch { throw Error(`${path} is missing; ${hint}`); }
}
function rssKiB() {
  try {
    const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf8' }).trim()
      .split('\n').map(line => line.trim().split(/\s+/).map(Number));
    const members = new Set([process.pid]); let changed = true;
    while (changed) { changed = false; for (const [pid, ppid] of rows)
      if (members.has(ppid) && !members.has(pid)) { members.add(pid); changed = true; } }
    return rows.filter(([pid]) => members.has(pid)).reduce((sum, row) => sum + (row[2] || 0), 0);
  } catch { return null; }
}

async function main() {
  const fixturePath = argument('--fixture', 'tools/fixtures/b2_cp026_independent_holdout_2026_11_05.json');
  const expectedFixtureHash = argument('--fixture-sha256', FIXTURE_SHA256);
  const baseUrl = argument('--base-url', process.env.B2_BASE_URL || 'http://127.0.0.1:8799/');
  const outputPath = argument('--out', `evidence/b2-cp026-real-ab-${new Date().toISOString().replaceAll(':', '-')}.json`);
  const maxCases = argument('--max-cases');
  const baselineCalls = Number(argument('--baseline-calls', '1'));
  if (!fixturePath || !/^[a-f0-9]{64}$/i.test(expectedFixtureHash || ''))
    throw Error('--fixture PATH and --fixture-sha256 EXACT_64_HEX required; no auto-generated or silently changed fixture');
  if (maxCases !== null && (!Number.isInteger(Number(maxCases)) || Number(maxCases) < 1))
    throw Error('--max-cases must be a positive integer');
  if (![1,4].includes(baselineCalls)) throw Error('--baseline-calls must be 1 or 4');
  const fixtureBytes = await readFile(resolve(ROOT, fixturePath));
  const fixtureSha256 = createHash('sha256').update(fixtureBytes).digest('hex');
  if (fixtureSha256 !== expectedFixtureHash.toLowerCase())
    throw Error(`frozen fixture changed: expected ${expectedFixtureHash}, got ${fixtureSha256}`);
  const fixture = JSON.parse(fixtureBytes.toString('utf8'));
  validateCp026Fixture(fixture);
  const cases = maxCases ? fixture.cases.slice(0, Number(maxCases)) : fixture.cases;

  await requireFile('app/vendor/wllama/index.js', 'run npm run build:web or npm run prepare:runtime in an available dependency environment');
  await requireFile('app/vendor/wllama/wllama-single.wasm', 'prepare Wllama WASM runtime');
  await requireFile('app/vendor/wllama/wllama-multi.wasm', 'prepare Wllama WASM runtime');
  await requireFile('workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf', 'provision the exact approved Instruct model');
  const modelSha256 = await sha256File(GGUF);
  if (modelSha256 !== EXPECTED_SHA256.falcon_instruct) throw Error('pinned Falcon GGUF hash mismatch; model substitution refused');
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { throw Error('Playwright dependency unavailable; run npm ci in authorized environment'); }
  let response;
  try { response = await fetch(new URL(MODEL_URL, baseUrl), { method: 'HEAD', signal: AbortSignal.timeout(5000) }); }
  catch { throw Error(`local model HTTP server unreachable at ${baseUrl}; start with npm run serve`); }
  if (!response.ok || Number(response.headers.get('content-length')) !== (await stat(GGUF)).size)
    throw Error('local HTTP server did not serve the expected model size; refusing browser test');

  const sourceSha256 = Object.fromEntries(await Promise.all(PATH_HASH.map(async path =>
    [path, await sha256File(resolve(ROOT, path))])));
  const rows = [], errors = [], externalRequests = [], rssPeaks = {};
  let active = null, timer = null;
  const chromiumExecutable = process.env.B2_CHROMIUM_EXECUTABLE_PATH || process.env.SEREN_CHROMIUM_EXECUTABLE;
  const browser = await chromium.launch({ headless: true,
    ...(chromiumExecutable ? { executablePath: chromiumExecutable } : {}) });
  let failure = null;
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(180000);
    page.on('pageerror', error => errors.push(error.message));
    const serverOrigin = new URL(baseUrl).origin;
    await page.route('**/*', route => {
      const target = route.request().url();
      let approved = false;
      try {
        const parsed = new URL(target);
        approved = parsed.origin === serverOrigin;
      } catch { /* malformed/opaque URL is not allowed */ }
      if (!approved) { externalRequests.push(target); return route.abort(); }
      return route.continue();
    });
    await page.exposeFunction('__cp026Stage', key => { active = key; rssPeaks[key] = rssKiB(); });
    await page.exposeFunction('__cp026Receipt', row => { rows.push(row); });
    timer = setInterval(() => { if (active) rssPeaks[active] = Math.max(rssPeaks[active] || 0, rssKiB() || 0); }, 300);
    await page.addInitScript(() => localStorage.setItem('seren-auto-provision-suppressed', '1'));
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async ({ cases, modelUrl, baselineCalls }) => {
      const { SpiralController } = await import('/js/spiral.mjs');
      const { buildChatPrompt } = await import('/js/prompts.mjs');
      const worker = new Worker('/workers/runtime-worker.mjs', { type: 'module' });
      const pending = new Map(); let sequence = 0;
      worker.onerror = error => { for (const [id, wait] of pending) {
        pending.delete(id); wait.resolve({ event: { kind: 'error', payload: { message: error.message || 'Worker import failed' } }, text: wait.text, tokens: 0, ttftMs: wait.ttftMs });
      } };
      worker.onmessage = ({ data }) => {
        const id = data.reqId || data.request_id, waiting = pending.get(id);
        if (!waiting) return;
        if (data.kind === 'token') {
          if (waiting.ttftMs === null) waiting.ttftMs = performance.now() - waiting.started;
          waiting.text = data.payload?.replace ? data.payload.text : waiting.text + (data.payload?.text || '');
        }
        if (data.type === 'reply' || ['complete', 'cancelled', 'error'].includes(data.kind)) {
          pending.delete(id);
          waiting.resolve({ event: data, text: waiting.text, tokens: data.payload?.tokens || 0,
            ttftMs: waiting.ttftMs });
        }
      };
      const send = (cmd, options, timeoutMs = 90000) => new Promise(resolve => {
        const reqId = `cp026-${++sequence}`;
        const wait = { started: performance.now(), text: '', ttftMs: null,
          resolve: value => { clearTimeout(timer); resolve(value); } };
        const timer = setTimeout(() => {
          pending.delete(reqId); worker.postMessage({ cmd: 'abort', reqId });
          resolve({ event: { kind: 'error', payload: { message: `${cmd} timed out` } },
            text: wait.text, tokens: 0, ttftMs: wait.ttftMs });
        }, timeoutMs);
        pending.set(reqId, wait);
        worker.postMessage({ cmd, reqId, ...options });
      });
      try {
        const response = await fetch(modelUrl);
        if (!response.ok) throw Error(`model GET failed: ${response.status}`);
        const blob = await response.blob();
        const loaded = await send('load', { modelId: 'falcon_instruct', blob }, 180000);
        if (loaded.event.type !== 'reply' || !loaded.event.ok)
          throw Error(loaded.event.message || loaded.event.payload?.message || 'actual Falcon Worker load failed');
        const spiral = new SpiralController();
        for (const [index, item] of cases.entries()) {
          const order = index % 2 ? ['b2', 'falcon_alone'] : ['falcon_alone', 'b2'];
          for (const arm of order) {
            const key = `${item.id}/${arm}`;
            await window.__cp026Stage(key);
            const started = performance.now(); let answer = '', metrics = {}, verification = null;
            let trace = [], error = null, actualWorkerCalls = 0, firstModelTokenMs = null;
            const generate = async ({ turns, maxTokens }) => {
              actualWorkerCalls++;
              const built = buildChatPrompt('falcon_instruct', turns);
              const result = await send('complete', { modelId: 'falcon_instruct', prompt: built.prompt,
                stops: built.stops, maxTokens: Math.min(64, maxTokens || 64), temperature: 0.2 });
              if (result.event.kind !== 'complete') throw Error(result.event.payload?.message || result.event.message || 'Worker completion failed');
              if (firstModelTokenMs === null) firstModelTokenMs = result.ttftMs;
              return { text: result.text, tokens: result.tokens, ttftMs: result.ttftMs };
            };
            try {
              if (arm === 'falcon_alone') {
                let tokens = 0, turns = [{ role: 'user', content: item.source }];
                for (let attempt = 0; attempt < baselineCalls; attempt++) {
                  const result = await generate({ turns, maxTokens: 64 });
                  answer = result.text; tokens += result.tokens;
                  turns = [...turns, { role: 'assistant', content: answer },
                    { role: 'user', content: 'Check the same source requirements. Correct if necessary; give the complete answer only.' }];
                }
                metrics = { modelCalls: actualWorkerCalls, tokens, calculatorCalls: 0, firstModelTokenMs };
              } else {
                const result = await spiral.run(item.source, {
                  scope: `cp026/${item.id}`, turns: [{ role: 'user', content: item.source }],
                  experimentalDependency: true, experimentalCortexGuard: true, generate,
                });
                answer = result.answer; metrics = { ...result.metrics, actualWorkerCalls,
                  firstModelTokenMs }; verification = result.verification; trace = result.trace;
              }
            } catch (cause) { error = String(cause?.message || cause); }
            await window.__cp026Receipt({ id: item.id, category: item.category || null,
              gold: item.gold, arm, order, answer, metrics, verification, trace,
              actualWorkerCalls, error, elapsedMs: performance.now() - started });
          }
        }
      } finally { worker.terminate(); }
    }, { cases, modelUrl: MODEL_URL, baselineCalls });
  } catch (error) { failure = String(error?.message || error); }
  finally { active = null; clearInterval(timer); await browser.close(); }

  for (const row of rows) {
    const item = cases.find(item => item.id === row.id);
    row.peakProcessTreeRssKiB = rssPeaks[`${row.id}/${row.arm}`] || null;
    const strict = independentlyScoreCp026Case(item, row.answer, row.verification, row.error);
    const gold = scoreIndependentOutcome(item, { answer: row.answer, verification: row.verification });
    row.check = {
      status: !row.error && gold.correct ? 'passed' : (row.error ? 'error' : 'failed'),
      correct: !row.error && gold.correct,
      safeAbstention: !row.error && item.gold === 'abstain' && gold.correct,
      falseVerification: gold.falseVerification,
      outcome: gold.outcome,
      coveredByGoldOracle: gold.coverage,
      stricterJsonOnlyCorrect: strict.correct,
      scorerDisagreement: !row.error && gold.correct !== strict.correct,
    };
  }
  const summary = summarizeCp026Rows(rows);
  const report = {
    schemaVersion: 1, checkpoint: 'CP026', status: failure || rows.length !== cases.length * 2 ? 'PARTIAL_OR_BLOCKED' : 'COMPLETED_WITH_RESULTS',
    fixturePath, fixtureSha256, modelSha256, sourceSha256, baseUrl, baselineCalls,
    policy: 'Real pinned Falcon Worker, identical user source, one model resident, temperature 0.2, max 64 generated tokens per call, alternating AB/BA task order, isolated B2 scope, Cortex guarded, frozen independent gold oracle. B2 may consume up to four model calls; baseline uses 1 or 4 as explicitly selected. Different available tools are the B2 intervention, not an intrinsic Falcon-model change.',
    rows, ...summary, errors, externalRequests, fatalError: failure,
    caveats: [
      'No model calls are mocked. A success requires real browser Worker load from pinned GGUF.',
      'Independent gold checks the fixture action/edge graph; it does not independently attest the worldly truth of source facts.',
      'No generic reasoning or speedup claim follows from small or category-restricted fixtures.',
      'Response latency, including immediate abstention, is distinct from time-to-correct. Comparable pairs are reported separately.',
      'Process-tree RSS includes Node, Chromium, page and Worker overhead; it is not model-only memory.',
      'No human qualitative grading is present; user-provided sources may require additional review.',
      'Independent CP026 gold oracle recognizes explicit arrow chains and JSON arrays; the secondary strict JSON-only scorer is diagnostic, not the acceptance authority.',
    ],
  };
  await writeFile(resolve(ROOT, outputPath), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ outputPath, rows: rows.length, expectedRows: cases.length * 2,
    fixtureSha256, modelSha256, ...summary, errors, externalRequests, fatalError: failure }, null, 2));
  if (failure || errors.length || externalRequests.length || rows.length !== cases.length * 2 ||
      rows.some(row => row.error)) process.exitCode = 1;
}

try { await main(); } catch (error) { fail(error.message || String(error)); }
