import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8799/');
const result = await page.evaluate(async () => {
  const { buildChatPrompt } = await import('/js/prompts.mjs');
  const { reachableToolsJSON, parseToolFabric, executeToolCall } = await import('/js/tools.mjs');
  const built = buildChatPrompt('falcon_tools', [{ role: 'user', content: 'Calculate 17 * 19 using the calculator tool.' }], { tools: reachableToolsJSON() });
  const blob = await (await fetch('/models/parts/Falcon-H1-Tiny-Tool-Calling-Q4_K_M.gguf')).blob();
  const worker = new Worker('/workers/runtime-worker.mjs', { type: 'module' });
  let raw = ''; const waiters = new Map();
  worker.onmessage = ({ data }) => {
    if (data.kind === 'token') raw = data.payload.replace ? data.payload.text : raw + data.payload.text;
    if (data.type === 'reply' || ['complete','error'].includes(data.kind)) {
      const id = data.reqId || data.request_id;
      if (waiters.has(id)) { waiters.get(id)(data); waiters.delete(id); }
    }
  };
  const send = data => new Promise(resolve => { waiters.set(data.reqId, resolve); worker.postMessage(data); });
  const load = await send({ cmd: 'load', reqId: 'load', modelId: 'falcon_tools', blob });
  if (!load.ok) throw new Error(load.message);
  const end = await send({ cmd: 'complete', reqId: 'run', modelId: 'falcon_tools', prompt: built.prompt,
    maxTokens: 128, stops: [228,11,16], temperature: 0 });
  const parsed = parseToolFabric(raw);
  const receipts = parsed.calls.map(executeToolCall);
  worker.terminate(); return { end: end.kind, tokens: end.payload.tokens, raw, calls: parsed.calls, errors: parsed.errors, receipts };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
