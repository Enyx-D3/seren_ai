import { chromium } from 'playwright';
const budget = Number(process.argv[2] || 256);
const mode = process.argv[3] || 'system';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage(); await page.goto('http://127.0.0.1:8799/');
const result = await page.evaluate(async ({ budget, mode }) => {
  const { buildChatPrompt } = await import('/js/prompts.mjs');
  const built = mode === 'no-system'
    ? { prompt: '<|begin_of_text|><|im_start|>user\nWhat is 7 + 5? Answer with the number.<|im_end|>\n<|im_start|>assistant\n', stops: [228, 11, 16] }
    : buildChatPrompt('falcon_reason', [{ role: 'user', content: 'What is 7 + 5? Answer with the number.' }]);
  const blob = await (await fetch('/models/parts/Falcon-H1R-Tiny-90M-Q4_K_M.gguf')).blob();
  const worker = new Worker('/workers/runtime-worker.mjs', { type: 'module' });
  const waiters = new Map(); let raw = '';
  worker.onmessage = ({ data }) => {
    if (data.kind === 'token') raw = data.payload.replace ? data.payload.text : raw + data.payload.text;
    if (data.type === 'reply' || ['complete','error'].includes(data.kind)) {
      const id = data.reqId || data.request_id; if (waiters.has(id)) { waiters.get(id)(data); waiters.delete(id); }
    }
  };
  const send = data => new Promise(resolve => { waiters.set(data.reqId, resolve); worker.postMessage(data); });
  await send({ cmd: 'load', reqId: 'load', modelId: 'falcon_reason', blob });
  const start = performance.now();
  const end = await send({ cmd: 'complete', reqId: 'gen', modelId: 'falcon_reason', prompt: built.prompt,
    maxTokens: budget, stops: built.stops, temperature: 0 });
  worker.terminate();
  const close = raw.lastIndexOf('</think>');
  return { budget, mode, tokens: end.payload.tokens, ms: Math.round(performance.now() - start), hasFinal: close >= 0,
    visible: close >= 0 ? raw.slice(close + 8).trim() : '', rawTail: raw.slice(-300) };
}, { budget, mode });
console.log(JSON.stringify(result, null, 2)); await browser.close();
