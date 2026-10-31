import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const prompts = [
  'Explain step by step how to compute 37*46 exactly, and give the final number.',
  'Plan three numbered steps for archiving family photos locally and mention one risk.',
  'Plan two numbered steps for organizing a music collection and mention one risk.',
];
const sourceSha256 = createHash('sha256').update(await readFile('app/js/spiral.mjs')).digest('hex');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:8799/') && !request.url().startsWith('blob:http://127.0.0.1:8799/')) external.push(request.url()); });
  await page.addInitScript(() => localStorage.setItem('seren-auto-provision-suppressed', '1'));
  await page.goto('http://127.0.0.1:8799/');
  const rows = await page.evaluate(async tasks => {
    const { SpiralController } = await import('/js/spiral.mjs');
    const { buildChatPrompt } = await import('/js/prompts.mjs');
    const worker = new Worker('/workers/runtime-worker.mjs', { type: 'module' });
    const pending = new Map(); let idCounter = 0;
    worker.onmessage = ({ data }) => {
      const pendingRow = pending.get(data.reqId || data.request_id);
      if (!pendingRow) return;
      if (data.kind === 'token') pendingRow.text = data.payload.replace ? data.payload.text : pendingRow.text + data.payload.text;
      if (data.type === 'reply' || ['complete', 'cancelled', 'error'].includes(data.kind)) {
        pending.delete(data.reqId || data.request_id); pendingRow.resolve({ data, text: pendingRow.text });
      }
    };
    const send = (cmd, fields) => new Promise(resolve => {
      const id = `repair-${++idCounter}`;
      const timer = setTimeout(() => { pending.delete(id); resolve({ data: { kind: 'error', payload: { message: 'timeout' } }, text: '' }); }, 60000);
      pending.set(id, { text: '', resolve: value => { clearTimeout(timer); resolve(value); } });
      worker.postMessage({ cmd, reqId: id, ...fields });
    });
    const blob = await (await fetch('/models/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf')).blob();
    const loaded = await send('load', { modelId: 'falcon_instruct', blob });
    if (!loaded.data.ok) throw new Error(loaded.data.message || 'model load failed');
    const controller = new SpiralController();
    const results = [];
    for (const prompt of tasks) {
      const candidates = [];
      const generate = async ({ turns, maxTokens }) => {
        const built = buildChatPrompt('falcon_instruct', turns);
        const result = await send('complete', { modelId: 'falcon_instruct', prompt: built.prompt,
          stops: built.stops, maxTokens: Math.min(128, maxTokens || 128), temperature: 0.2 });
        if (result.data.kind !== 'complete') throw new Error(result.data.payload?.message || result.data.kind);
        candidates.push(result.text);
        return { text: result.text, tokens: result.data.payload.tokens || 0 };
      };
      const result = await controller.run(prompt, { scope: `repair-dev-${results.length}`, deeper: true,
        turns: [{ role: 'user', content: prompt }], generate });
      results.push({ prompt, candidates, answer: result.answer, verification: result.verification,
        trace: result.trace, metrics: result.metrics });
    }
    worker.terminate(); return results;
  }, prompts);
  const path = `evidence/b2-v2-repair-probe-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await writeFile(path, JSON.stringify({ sourceSha256, environment: 'macOS arm64 / Chromium / local Falcon Instruct Q4_K_M / CPU WebAssembly',
    purpose: 'New development prompts, disjoint from frozen public evaluation fixture. Structural and numeric residuals are checkable; open-ended plan semantics remain unverified.',
    rows, errors, external }, null, 2) + '\n');
  console.log(JSON.stringify({ path, summary: rows.map(r => ({ prompt: r.prompt, candidateCount: r.candidates.length,
    residuals: r.trace.filter(s => s.step === 'residual').map(s => s.residual),
    repairs: r.trace.filter(s => s.step === 'repair'), verification: r.verification, answer: r.answer })), errors, external }, null, 2));
  if (errors.length || external.length) process.exitCode = 1;
} finally { await browser.close(); }
