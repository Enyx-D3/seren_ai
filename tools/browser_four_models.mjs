import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8799/');
const rows = await page.evaluate(async () => {
  const roster = [
    ['falcon_instruct', 'Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf', '<|im_start|>user\nSay hello.<|im_end|>\n<|im_start|>assistant\n'],
    ['falcon_reason', 'Falcon-H1R-Tiny-90M-Q4_K_M.gguf', '<|im_start|>user\nWhy is 2 + 2 equal to 4?<|im_end|>\n<|im_start|>assistant\n'],
    ['falcon_coder', 'Falcon-H1-Tiny-Coder-Q4_K_M.gguf', 'def add(a, b):\n    '],
    ['falcon_tools', 'Falcon-H1-Tiny-Tool-Calling-Q4_K_M.gguf', '<|im_start|>user\nSay hello.<|im_end|>\n<|im_start|>assistant\n'],
  ];
  const worker = new Worker('/workers/runtime-worker.mjs', { type: 'module' });
  const pending = new Map(); const tokens = new Map(); const outputs = new Map();
  worker.onmessage = ({ data }) => {
    if (data.kind === 'token') {
      tokens.get(data.request_id)?.push({ at: performance.now() });
      outputs.set(data.request_id, data.payload.replace ? data.payload.text : (outputs.get(data.request_id) || '') + data.payload.text);
    }
    if (data.type === 'reply' || ['complete','error','cancelled'].includes(data.kind)) {
      const id = data.type === 'reply' ? data.reqId : data.request_id;
      if (pending.has(id)) { pending.get(id)(data); pending.delete(id); }
    }
  };
  const send = (data, timeout = 120000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(data.reqId); reject(new Error('timeout')); }, timeout);
    pending.set(data.reqId, result => { clearTimeout(timer); resolve(result); });
    worker.postMessage(data);
  });
  const out = [];
  for (const [id, filename, prompt] of roster) {
    const f = await fetch('/models/parts/' + filename);
    const blob = await f.blob();
    const loadStart = performance.now();
    const load = await send({ cmd: 'load', reqId: id + '-load', modelId: id, blob });
    const loadMs = Math.round(performance.now() - loadStart);
    if (!load.ok) { out.push({ id, loadMs, error: load.message }); continue; }
    const genId = id + '-gen'; tokens.set(genId, []); outputs.set(genId, '');
    const genStart = performance.now();
    const end = await send({ cmd: 'complete', reqId: genId, modelId: id, prompt, maxTokens: 24, stops: [228,11,16], temperature: 0 });
    const chunks = tokens.get(genId);
    out.push({ id, bytes: blob.size, loadMs, ttftMs: chunks.length ? Math.round(chunks[0].at - genStart) : null,
      generationMs: Math.round(performance.now() - genStart), tokens: end.payload?.tokens || 0,
      output: outputs.get(genId), end: end.kind });
  }
  worker.terminate(); return out;
});
console.log(JSON.stringify(rows, null, 2));
await browser.close();
