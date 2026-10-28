import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8799/');
const result = await page.evaluate(async () => {
  const response = await fetch('/models/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf');
  const bytes = new Uint8Array(await response.arrayBuffer());
  bytes[bytes.length - 100] ^= 1;
  const worker = new Worker('/workers/ingest-worker.mjs', { type: 'module' });
  const result = await new Promise(resolve => {
    worker.onmessage = e => { if (e.data.type === 'done' || e.data.type === 'error') resolve(e.data); };
    worker.postMessage({ cmd: 'ingest', reqId: 'bad-hash', file: new File([bytes], 'corrupted.gguf') });
  });
  worker.terminate(); return result;
});
console.log(JSON.stringify({ rejected: result.type === 'error', message: result.message }, null, 2));
await browser.close();
