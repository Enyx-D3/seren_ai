/* Isolated feasibility probe; does not change the shipped v2 runtime.
   Prerequisite: npm pack @wllama/wllama@3.8.1 --pack-destination /tmp
                 tar -xzf /tmp/wllama-wllama-3.8.1.tgz -C /tmp/seren-wllama-v3-spike */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const pkgRoot = '/tmp/seren-wllama-v3-spike/package/esm';
const modelFiles = {
  instruct: 'Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf',
  reason: 'Falcon-H1R-Tiny-90M-Q4_K_M.gguf',
  coder: 'Falcon-H1-Tiny-Coder-Q4_K_M.gguf',
  tools: 'Falcon-H1-Tiny-Tool-Calling-Q4_K_M.gguf',
};
const model = process.argv.find(x => x.startsWith('--model='))?.slice(8) || 'instruct';
if (!Object.hasOwn(modelFiles, model)) throw new Error('unknown model');
const modelPath = 'workspace/parts/' + modelFiles[model];
const server = createServer(async (req, res) => {
  let path, type;
  if (req.url === '/model.gguf') { path = modelPath; type = 'application/octet-stream'; }
  else if (req.url?.startsWith('/pkg/')) {
    const relative = req.url.slice(5);
    if (relative.includes('..')) { res.writeHead(400).end(); return; }
    path = join(pkgRoot, relative);
    type = relative.endsWith('.wasm') ? 'application/wasm' : 'text/javascript';
  } else { res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>Seren runtime spike</title>'); return; }
  try { const bytes = await readFile(path); res.writeHead(200, { 'content-type': type }).end(bytes); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const browser = await chromium.launch({ headless: !process.argv.includes('--headed'),
  args: process.argv.includes('--unsafe-webgpu') ? ['--enable-unsafe-webgpu'] : [] });
try {
  const page = await browser.newPage();
  const backendLogs = [];
  page.on('console', m => { if (/webgpu|offload|gpu layers|metal|falcon/i.test(m.text()) && backendLogs.length < 40) backendLogs.push(m.text()); });
  page.on('pageerror', e => console.log('pageerror:', e.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  const result = await page.evaluate(async ({ gpu, model }) => {
    const { Wllama } = await import('/pkg/index.js');
    const blob = await (await fetch('/model.gguf')).blob();
    const w = new Wllama({ default: '/pkg/wasm/wllama.wasm' }, { allowOffline: true });
    const adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
    const started = performance.now();
    try {
      await w.loadModel([blob], { n_ctx: 512, n_gpu_layers: gpu ? 4 : 0 });
      const loadedMs = Math.round(performance.now() - started);
      let debug;
      try { debug = await w._getDebugInfo(); } catch (e) { debug = { error: String(e.message || e) }; }
      const prompt = model === 'coder' ? 'def add(a, b):\n    ' :
        '<|im_start|>user\nSay hello.<|im_end|>\n<|im_start|>assistant\n';
      const answer = await w.createCompletion({ prompt, max_tokens: 24, temperature: 0 });
      return { model, requestedGpuLayers: gpu ? 4 : 0, webGpuAdapterAvailable: !!adapter,
        adapterInfo: adapter ? { vendor: adapter.info?.vendor, architecture: adapter.info?.architecture, device: adapter.info?.device } : null,
        wllamaWebGpuSupport: w.isSupportWebGPU(), loadedMs,
        debug, answer: answer.choices?.[0]?.text || '', usage: answer.usage };
    } finally { await w.exit(); }
  }, { gpu: process.argv.includes('--gpu'), model });
  console.log(JSON.stringify({ ...result, backendLogs }, null, 2));
  if (!result.answer) process.exitCode = 1;
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
