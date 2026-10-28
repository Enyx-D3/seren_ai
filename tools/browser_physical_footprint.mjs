// macOS-only CP002 probe. Run outside the command sandbox: `footprint` needs task access.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const mib = 1024 * 1024;
const candidates = {
  instruct: ['falcon_instruct', 'Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf'],
  reason: ['falcon_reason', 'Falcon-H1R-Tiny-90M-Q4_K_M.gguf'],
  coder: ['falcon_coder', 'Falcon-H1-Tiny-Coder-Q4_K_M.gguf'],
  tools: ['falcon_tools', 'Falcon-H1-Tiny-Tool-Calling-Q4_K_M.gguf'],
};
const modelKey = process.argv.find(value => value.startsWith('--model='))?.slice(8) || 'instruct';
if (!Object.hasOwn(candidates, modelKey)) throw new Error('unknown Falcon specialist');
const [modelId, modelName] = candidates[modelKey];
function chromePids() {
  return new Set(execFileSync('ps', ['-axo', 'pid=,ppid=,comm='], { encoding: 'utf8' })
    .split('\n').filter(row => row.includes('chrome-headless-shell'))
    .map(row => Number(row.trim().split(/\s+/)[0])).filter(Number.isFinite));
}
const baseline = chromePids();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const samples = [];
let timer;

function sample(phase) {
  const pids = [...chromePids()].filter(pid => !baseline.has(pid));
  if (!pids.length) throw new Error('no isolated Chromium processes found');
  const args = ['--noCategories', '-f', 'bytes', ...pids.flatMap(pid => ['-p', String(pid)])];
  const report = execFileSync('footprint', args, { encoding: 'utf8', timeout: 20000 });
  const physicalBytes = [...report.matchAll(/phys_footprint:\s+(\d+) B/g)].map(match => Number(match[1]));
  const peakBytes = [...report.matchAll(/phys_footprint_peak:\s+(\d+) B/g)].map(match => Number(match[1]));
  if (physicalBytes.length !== pids.length || peakBytes.length !== pids.length) {
    throw new Error(`footprint returned ${physicalBytes.length} measurements for ${pids.length} processes`);
  }
  samples.push({ phase, at: Date.now(), processCount: pids.length,
    physicalMiB: Math.round(physicalBytes.reduce((a, b) => a + b, 0) / mib),
    sumProcessPeakMiB: Math.round(peakBytes.reduce((a, b) => a + b, 0) / mib) });
}

try {
  await page.goto('http://127.0.0.1:8799/');
  sample('idle');
  const load = await page.evaluate(async ({ modelId, modelName }) => {
    const worker = new Worker('/workers/runtime-worker.mjs', { type: 'module' });
    window.__serenProbeWorker = worker;
    window.__serenProbeSend = data => new Promise(resolve => {
      const handler = ({ data: reply }) => {
        if ((reply.reqId || reply.request_id) !== data.reqId) return;
        if (reply.type !== 'reply' && !['complete', 'error', 'cancelled'].includes(reply.kind)) return;
        worker.removeEventListener('message', handler); resolve(reply);
      };
      worker.addEventListener('message', handler); worker.postMessage(data);
    });
    const blob = await (await fetch('/models/parts/' + modelName)).blob();
    const result = await window.__serenProbeSend({ cmd: 'load', reqId: 'load', modelId, blob });
    if (!result.ok) throw new Error(result.message || 'load failed');
    return { modelBytes: blob.size };
  }, { modelId, modelName });
  sample('loaded');
  let generationSamples = 0;
  timer = setInterval(() => {
    if (generationSamples++ >= 4) return;
    try { sample('generating'); } catch (error) { samples.push({ phase: 'sample-error', message: error.message }); }
  }, 1500);
  const generation = await page.evaluate(async modelId => {
    const { buildChatPrompt } = await import('/js/prompts.mjs');
    const built = buildChatPrompt(modelId, [{ role: 'user', content: 'Say hello.' }]);
    return window.__serenProbeSend({ cmd: 'complete', reqId: 'gen', modelId,
      prompt: built.prompt, maxTokens: 32, stops: built.stops, temperature: 0 });
  }, modelId);
  clearInterval(timer); timer = undefined;
  sample('complete');
  await page.evaluate(() => { window.__serenProbeWorker.terminate(); window.__serenProbeWorker = null; });
  sample('worker-terminated');
  const summary = { environment: { os: process.platform, arch: process.arch, browser: 'Playwright Chromium headless',
    model: modelName, backend: 'CPU WebAssembly' }, load, generation: {
    kind: generation.kind, tokens: generation.payload?.tokens }, samples,
    caveat: 'Sum of macOS per-process physical footprints for the isolated test browser. Shared accounting and asynchronous process peaks make this a whole-browser estimate, not model-only allocation.' };
  console.log(JSON.stringify(summary, null, 2));
  await writeFile(`evidence/browser-physical-footprint-${modelKey}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(summary, null, 2) + '\n');
  if (generation.kind !== 'complete') process.exitCode = 1;
} finally {
  if (timer) clearInterval(timer);
  await browser.close();
}
