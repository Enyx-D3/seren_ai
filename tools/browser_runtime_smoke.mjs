import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', m => console.log('console:', m.type(), m.text()));
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto('http://127.0.0.1:8799/');
const result = await page.evaluate(async () => {
  const url = '/models/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf';
  const response = await fetch(url);
  if (!response.ok) throw new Error('model fetch ' + response.status);
  const blob = await response.blob();
  const worker = new Worker('/workers/runtime-worker.mjs', { type: 'module' });
  const events = [];
  worker.onmessage = e => events.push(e.data);
  worker.onerror = e => events.push({ type: 'worker-error', message: e.message });
  const until = (predicate, timeout = 120000) => new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const found = events.find(predicate);
      if (found) { clearInterval(timer); resolve(found); }
      else if (Date.now() - start > timeout) { clearInterval(timer); reject(new Error('timeout: ' + JSON.stringify(events))); }
    }, 100);
  });
  worker.postMessage({ cmd: 'load', reqId: 'load-1', modelId: 'falcon_instruct', blob });
  const loaded = await until(e => e.type === 'reply' && e.reqId === 'load-1' || e.type === 'worker-error');
  if (!loaded.ok) return { blobSize: blob.size, loaded, events };
  worker.postMessage({ cmd: 'complete', reqId: 'gen-1', modelId: 'falcon_instruct', prompt: '<|im_start|>user\nSay hello.<|im_end|>\n<|im_start|>assistant\n', maxTokens: 12, stops: [228, 11, 16], temperature: 0 });
  const ended = await until(e => e.request_id === 'gen-1' && (e.kind === 'complete' || e.kind === 'error'));
  worker.terminate();
  return { blobSize: blob.size, loaded, ended, events };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
