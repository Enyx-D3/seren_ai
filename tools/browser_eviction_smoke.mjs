import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8799/');
  const result = await page.evaluate(async () => {
    const file = new File([await (await fetch('/models/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf')).blob()], 'instruct.gguf');
    const store = await import('/js/store.mjs');
    const worker = new Worker('/workers/ingest-worker.mjs', { type: 'module' });
    const ingest = reqId => new Promise(resolve => {
      const listener = ({ data }) => {
        if (data.reqId !== reqId || !['done', 'error'].includes(data.type)) return;
        worker.removeEventListener('message', listener); resolve(data);
      };
      worker.addEventListener('message', listener);
      worker.postMessage({ cmd: 'ingest', reqId, file });
    });
    const first = await ingest('first');
    if (first.type !== 'done') return { first };
    await store.opfsDel(first.desc.file_id);
    const missing = !(await store.modelFile(first.desc));
    const second = await ingest('second');
    const restored = second.type === 'done' && !!(await store.modelFile(second.desc));
    worker.terminate();
    return { missing, second: second.type, unchanged: second.unchanged, restored };
  });
  console.log(JSON.stringify(result));
  if (!result.missing || result.second !== 'done' || result.unchanged || !result.restored) process.exitCode = 1;
} finally { await browser.close(); }
