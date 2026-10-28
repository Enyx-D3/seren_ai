import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8799/');
const result = await page.evaluate(async () => {
  const worker = new Worker('/workers/runtime-worker.mjs', { type: 'module' });
  const waiters = new Map(), chunks = new Map();
  worker.onmessage = ({ data }) => {
    if (data.kind === 'token') chunks.set(data.request_id, data.payload.replace ? data.payload.text : (chunks.get(data.request_id) || '') + data.payload.text);
    if (data.type === 'reply' || ['complete','error'].includes(data.kind)) {
      const id = data.reqId || data.request_id;
      if (waiters.has(id)) { waiters.get(id)(data); waiters.delete(id); }
    }
  };
  const send = data => new Promise(resolve => { waiters.set(data.reqId, resolve); worker.postMessage(data); });
  const blob = await (await fetch('/models/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf')).blob();
  const load = await send({ cmd: 'load', reqId: 'load', modelId: 'falcon_instruct', blob });
  if (!load.ok) throw new Error('load failed');
  const answers = [];
  for (const id of ['a', 'b']) {
    chunks.set(id, '');
    const end = await send({ cmd: 'complete', reqId: id, modelId: 'falcon_instruct',
      prompt: '<|im_start|>user\nSay hello.<|im_end|>\n<|im_start|>assistant\n',
      maxTokens: 20, stops: [228,11,16], temperature: 0 });
    answers.push({ text: chunks.get(id), tokens: end.payload.tokens, kind: end.kind });
  }
  worker.terminate(); return answers;
});
console.log(JSON.stringify({ equal: result[0].text === result[1].text, answers: result }, null, 2));
if (result[0].text !== result[1].text) process.exitCode = 1;
await browser.close();
