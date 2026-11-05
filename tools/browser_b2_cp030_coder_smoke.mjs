// Developer-only CP030 proof. Requires real pinned Coder GGUF, Chromium, and
// node_modules/playwright. This never modifies the default Seren application UI.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { CODER_FILENAME, CODER_SHA256 } from '../app/js/b2-coder-experiment.mjs';

const modelPath = `workspace/parts/${CODER_FILENAME}`;
assert.ok(existsSync(modelPath), `real Coder GGUF missing: ${modelPath}`);
const bytes = readFileSync(modelPath);
assert.equal(bytes.length, 68034464);
assert.equal(createHash('sha256').update(bytes).digest('hex'), CODER_SHA256);

const port = String(process.env.B2_CP030_PORT || 8799);
const base = `http://127.0.0.1:${port}/`;
const server = spawn(process.execPath, ['tools/serve.mjs'], {
  env: { ...process.env, PORT: port, B2_EXPERIMENTAL_CODER: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverDiagnostics = '';
server.stderr.on('data', data => { serverDiagnostics += String(data).slice(0, 2048); });

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try { const res = await fetch(base); if (res.ok) return; } catch {}
    if (server.exitCode !== null) throw Error('development server exited: ' + serverDiagnostics);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw Error('development server did not start: ' + serverDiagnostics);
}

let browser;
try {
  await waitForServer();
  const executablePath = process.env.SEREN_CHROMIUM_EXECUTABLE;
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage();
  // Same-origin minimalist probe, bypassing the app's normal single-Instruct UI.
  await page.route(base, route => route.fulfill({ status: 200, contentType: 'text/html',
    body: '<!doctype html><html><body>CP030 independent browser worker probe</body></html>' }));
  await page.goto(base);
  const result = await page.evaluate(async () => {
    const { buildExperimentalCoderFIM } = await import('/js/b2-coder-experiment.mjs');
    const response = await fetch('/models/parts/Falcon-H1-Tiny-Coder-Q4_K_M.gguf');
    if (!response.ok) throw Error('Coder model provisioning response: ' + response.status);
    const blob = await response.blob();
    const worker = new Worker('/workers/runtime-worker.mjs', { type: 'module' });
    const events = [];
    worker.onmessage = e => events.push(e.data);
    worker.onerror = e => events.push({ type:'worker-error', message: e.message });
    const until = (predicate, ms = 120000) => new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(Error('worker wait timeout: ' + JSON.stringify(events.slice(-8)))), ms);
      const poll = () => {
        const found = events.find(predicate);
        if (found) { clearTimeout(t); resolve(found); }
        else setTimeout(poll, 40);
      };
      poll();
    });
    const request = async (reqId, cmd, extra, ms = 120000) => {
      worker.postMessage({ reqId, cmd, modelId:'falcon_coder', ...extra });
      return until(e => e.type === 'worker-error' || (e.type === 'reply' && e.reqId === reqId), ms);
    };
    try {
      const noOptIn = await request('reject-load','load',{ blob }, 10000);
      if (noOptIn.ok !== false || !/explicit opt-in/.test(noOptIn.message || ''))
        throw Error('Worker failed closed-load proof: ' + JSON.stringify(noOptIn));
      const load = await request('load-coder','load',{ blob, experimentalCoder:true }, 180000);
      if (!load.ok || load.modelId !== 'falcon_coder')
        throw Error('real Coder failed to load: ' + JSON.stringify(load));
      const req = buildExperimentalCoderFIM({ experimentalCoder:true,
        prefix:'def add(a: int, b: int) -> int:\n    ', suffix:'\n\nprint(add(2, 3))', maxTokens:32 });
      worker.postMessage({ cmd:'complete', reqId:'reject-completion', ...req, experimentalCoder:false });
      // The Worker emits an event, not a reply, on completion errors.
      const rejected = await until(e => e.request_id === 'reject-completion' && e.kind === 'error',10000);
      if (!/explicit opt-in/.test(rejected.payload?.message || ''))
        throw Error('Worker failed closed-completion proof: ' + JSON.stringify(rejected));
      worker.postMessage({ cmd:'complete', reqId:'gen-coder', ...req, experimentalCoder:true, temperature:0 });
      const final = await until(e => e.request_id === 'gen-coder' && (e.kind === 'complete' || e.kind === 'error'),180000);
      const generated = events.filter(e => e.request_id === 'gen-coder' && e.kind === 'token')
        .map(e => e.payload?.text || '').join('');
      if (final.kind !== 'complete' || !generated.length)
        throw Error('real Coder FIM failed: ' + JSON.stringify({final,generated}));
      const unload = await request('unload-coder','unload',{},30000);
      if (!unload.ok) throw Error('Worker failed to unload Coder');
      const ping = await request('ping-after','ping',{},10000);
      if (ping.loadedModelId !== null) throw Error('Worker retained a model after unload');
      return { status:'PASS', actualCoderGGUFBytes: blob.size, pinnedSha256:'1f769dd9cc450a4a080ebd623e1bf7c15d0a3ccdfb40e339e6640c53228cd019',
        rejectedUnapprovedLoad:true, rejectedUnapprovedCompletion:true,
        generatedTokens: final.payload.tokens, generatedText:generated.slice(0,256),
        unloadedCleanly:true, caveat:'Provisional Python FIM; not a correctness or broad reasoning acceptance result' };
    } finally { worker.terminate(); }
  });
  console.log(JSON.stringify(result,null,2));
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
