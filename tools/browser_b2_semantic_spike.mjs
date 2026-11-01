import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:8799/') &&
    !request.url().startsWith('blob:http://127.0.0.1:8799/')) external.push(request.url()); });
  await page.goto('http://127.0.0.1:8799/');
  const prompts = [
    'Read: A shop has 3 packs of 8 pens and sells 5 pens. How many pens remain? Return only JSON: {"facts":[{"quote":"exact source words","meaning":"brief"}],"relations":[{"quote":"exact source words","operation":"multiply|subtract|add|divide"}],"unknown":"exact question words"}.',
    'Read: Mira has 14 coins. She gives 6 coins to Leo, then receives 3 coins. How many coins does Mira have now? Return only JSON: {"facts":[{"quote":"exact source words","meaning":"brief"}],"relations":[{"quote":"exact source words","operation":"multiply|subtract|add|divide"}],"unknown":"exact question words"}.',
    'Read: Complete this Python function: def total_even(items): Return the sum of even integers in items. Return only JSON: {"facts":[{"quote":"exact source words","meaning":"brief"}],"relations":[{"quote":"exact source words","operation":"filter|sum|sort|count"}],"unknown":"exact requested output words"}.',
    'Read: Debug this Python function: def double(x): return x + 2. It should multiply x by 2. Return only JSON: {"facts":[{"quote":"exact source words","meaning":"brief"}],"relations":[{"quote":"exact source words","operation":"multiply|subtract|add|divide"}],"unknown":"exact requested output words"}.',
  ];
  const rows = await page.evaluate(async prompts => {
    const { buildChatPrompt } = await import('/js/prompts.mjs');
    const worker = new Worker('/workers/runtime-worker.mjs', { type: 'module' });
    const pending = new Map(); let counter = 0;
    worker.onmessage = ({ data }) => {
      const row = pending.get(data.reqId || data.request_id);
      if (!row) return;
      if (data.kind === 'token') row.text = data.payload.replace ? data.payload.text : row.text + data.payload.text;
      if (data.type === 'reply' || ['complete', 'cancelled', 'error'].includes(data.kind)) {
        pending.delete(data.reqId || data.request_id); row.resolve({ data, text: row.text });
      }
    };
    const send = (cmd, fields) => new Promise(resolve => {
      const reqId = `semantic-spike-${++counter}`;
      const timer = setTimeout(() => { pending.delete(reqId); resolve({ data: { kind: 'error' }, text: '' }); }, 60000);
      pending.set(reqId, { text: '', resolve: value => { clearTimeout(timer); resolve(value); } });
      worker.postMessage({ cmd, reqId, ...fields });
    });
    const blob = await (await fetch('/models/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf')).blob();
    const loaded = await send('load', { modelId: 'falcon_instruct', blob });
    if (!loaded.data.ok) throw new Error(loaded.data.message || 'model load failed');
    const rows = [];
    for (const prompt of prompts) {
      const built = buildChatPrompt('falcon_instruct', [{ role: 'user', content: prompt }]);
      const started = performance.now();
      const result = await send('complete', { modelId: 'falcon_instruct', prompt: built.prompt,
        stops: built.stops, maxTokens: 128, temperature: 0.2 });
      rows.push({ prompt, output: result.text, status: result.data.kind, tokens: result.data.payload?.tokens || 0,
        elapsedMs: Math.round(performance.now() - started) });
    }
    worker.terminate(); return rows;
  }, prompts);
  const path = `evidence/b2-semantic-spike-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await writeFile(path, JSON.stringify({ rows, errors, external, purpose: 'Development spike only; not held-out evidence.' }, null, 2) + '\n');
  console.log(JSON.stringify({ path, rows, errors, external }, null, 2));
  if (errors.length || external.length || rows.some(row => row.status !== 'complete')) process.exitCode = 1;
} finally { await browser.close(); }
