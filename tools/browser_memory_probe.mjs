import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

function chromeRss() {
  const rows = execFileSync('ps', ['-axo', 'pid=,rss=,comm='], { encoding: 'utf8' }).split('\n');
  const map = new Map();
  for (const row of rows) {
    if (!row.includes('chrome-headless-shell')) continue;
    const match = /^\s*(\d+)\s+(\d+)\s+/.exec(row);
    if (match) map.set(Number(match[1]), Number(match[2]));
  }
  return map;
}

const before = chromeRss();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8799/');
let peakKiB = 0, idleKiB = 0, sampled = 0;
const sample = () => {
  const current = chromeRss(); let sum = 0;
  for (const [pid, rss] of current) if (!before.has(pid)) sum += rss;
  peakKiB = Math.max(peakKiB, sum); sampled++;
  return sum;
};
idleKiB = sample();
const timer = setInterval(sample, 150);
const result = await page.evaluate(async () => {
  const worker = new Worker('/workers/runtime-worker.mjs', { type: 'module' });
  const waiters = new Map(); let tokens = 0;
  worker.onmessage = ({ data }) => {
    if (data.kind === 'token') tokens = data.payload.token_count;
    if (data.type === 'reply' || ['complete','error'].includes(data.kind)) {
      const id = data.reqId || data.request_id; if (waiters.has(id)) { waiters.get(id)(data); waiters.delete(id); }
    }
  };
  const send = data => new Promise(resolve => { waiters.set(data.reqId, resolve); worker.postMessage(data); });
  const blob = await (await fetch('/models/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf')).blob();
  const load = await send({ cmd: 'load', reqId: 'load', modelId: 'falcon_instruct', blob });
  if (!load.ok) throw new Error(load.message);
  const end = await send({ cmd: 'complete', reqId: 'gen', modelId: 'falcon_instruct',
    prompt: '<|im_start|>user\nSay hello.<|im_end|>\n<|im_start|>assistant\n',
    maxTokens: 64, stops: [228,11,16], temperature: 0 });
  worker.terminate(); return { bytes: blob.size, end: end.kind, tokens };
});
clearInterval(timer);
console.log(JSON.stringify({ result, idleMiB: Math.round(idleKiB / 1024), peakSummedRssMiB: Math.round(peakKiB / 1024),
  samples: sampled, note: 'Sum of new Chromium process RSS. Shared pages may be counted more than once; this is not an exact inference allocation.' }, null, 2));
await browser.close();
