import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8799/');
  const result = await page.evaluate(async () => {
    const bytes = new Uint8Array(await (await fetch('/models/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf')).arrayBuffer());
    bytes[bytes.length - 100] ^= 1;
    const worker = new Worker('/workers/runtime-worker.mjs', { type: 'module' });
    const result = await new Promise(resolve => {
      worker.onmessage = ({ data }) => { if (data.type === 'reply' && data.reqId === 'load') resolve(data); };
      worker.postMessage({ cmd: 'load', reqId: 'load', modelId: 'falcon_instruct', blob: new Blob([bytes]) });
    });
    worker.terminate(); return result;
  });
  console.log(JSON.stringify({ rejected: !result.ok, message: result.message }));
  if (result.ok || !result.message?.includes('SHA-256')) process.exitCode = 1;
} finally { await browser.close(); }
