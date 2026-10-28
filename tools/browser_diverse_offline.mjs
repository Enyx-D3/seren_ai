import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const prompts = [
  'Say hello in one sentence.', 'Name a primary color.', 'What planet do humans live on?',
  'Give one synonym for quick.', 'Name an animal that can fly.', 'What is the opposite of cold?',
  'Write one sentence about rain.', 'List two fruits.', 'What month comes after March?',
  'What is 7 + 5?', 'What is 9 times 8?', 'What is 100 minus 37?',
  'What is half of 50?', 'Is 17 odd or even?', 'What is the square of 6?',
  'Write a short Python greeting.', 'Name a common programming language.', 'What does HTML stand for?',
  'Give one reason to back up files.', 'Explain photosynthesis briefly.', 'How many days are in a week?',
  'What is the capital of Japan?', 'Complete: The sky is usually ___.', 'Give one example of renewable energy.',
];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const networkAfterOffline = [];
  await page.goto('http://127.0.0.1:8799/');
  const loaded = await page.evaluate(async () => {
    const blob = await (await fetch('/models/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf')).blob();
    const worker = new Worker('/workers/runtime-worker.mjs', { type: 'module' });
    const pending = new Map(), outputs = new Map(), first = new Map();
    worker.onmessage = ({ data }) => {
      if (data.kind === 'token') {
        if (!first.has(data.request_id)) first.set(data.request_id, performance.now());
        outputs.set(data.request_id, data.payload.replace ? data.payload.text : (outputs.get(data.request_id) || '') + data.payload.text);
      }
      if (data.type === 'reply' || ['complete', 'error', 'cancelled'].includes(data.kind)) {
        const id = data.reqId || data.request_id;
        if (pending.has(id)) { pending.get(id)(data); pending.delete(id); }
      }
    };
    const send = data => new Promise(resolve => { pending.set(data.reqId, resolve); worker.postMessage(data); });
    window.__offlineProbe = { worker, outputs, first, send };
    return await send({ cmd: 'load', reqId: 'load', modelId: 'falcon_instruct', blob });
  });
  if (!loaded.ok) throw new Error(`load failed: ${loaded.message}`);
  page.on('request', request => networkAfterOffline.push(request.url()));
  await page.context().setOffline(true);
  const rows = await page.evaluate(async prompts => {
    const { buildChatPrompt } = await import('/js/prompts.mjs');
    const { outputs, first, send } = window.__offlineProbe;
    const rows = [];
    for (const [i, prompt] of prompts.entries()) {
      const id = 'prompt-' + i;
      const built = buildChatPrompt('falcon_instruct', [{ role: 'user', content: prompt }]);
      const started = performance.now();
      const end = await send({ cmd: 'complete', reqId: id, modelId: 'falcon_instruct', prompt: built.prompt,
        stops: built.stops, maxTokens: 32, temperature: 0 });
      rows.push({ prompt, answer: outputs.get(id) || '', tokens: end.payload?.tokens || 0,
        kind: end.kind, ttft_ms: first.has(id) ? Math.round(first.get(id) - started) : null,
        elapsed_ms: Math.round(performance.now() - started) });
    }
    window.__offlineProbe.worker.terminate();
    return rows;
  }, prompts);
  const report = { date: new Date().toISOString(), browser: 'Playwright Chromium headless', model: 'Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf',
    backend: 'CPU WebAssembly', offline_after_load: true, requests_after_offline: networkAfterOffline, rows };
  await mkdir('evidence', { recursive: true });
  await writeFile(`evidence/diverse-offline-browser-${report.date.slice(0, 10)}.json`, JSON.stringify(report, null, 2) + '\n');
  const failures = rows.filter(row => row.kind !== 'complete' || !row.answer || row.tokens < 1);
  console.log(JSON.stringify({ prompts: rows.length, realResponses: rows.length - failures.length, failures,
    requestsAfterOffline: networkAfterOffline, p50Ms: rows.map(r => r.elapsed_ms).sort((a,b) => a-b)[Math.floor(rows.length/2)] }));
  if (failures.length || networkAfterOffline.length) process.exitCode = 1;
} finally { await browser.close(); }
