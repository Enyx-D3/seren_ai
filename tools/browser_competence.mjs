import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const cases = [
  { id: 'chat-1', family: 'chat', split: 'train', prompt: 'Reply with exactly the word BLUE.', expected: '\\bBLUE\\b' },
  { id: 'chat-2', family: 'chat', split: 'calibration', prompt: 'What planet do humans live on? Answer with one word.', expected: '\\bEarth\\b' },
  { id: 'chat-3', family: 'chat', split: 'heldout', prompt: 'What color is healthy grass? Answer with one word.', expected: '\\bgreen\\b' },
  { id: 'math-1', family: 'math', split: 'train', prompt: 'What is 7 + 5? Answer with the number.', expected: '\\b12\\b' },
  { id: 'math-2', family: 'math', split: 'calibration', prompt: 'What is 9 times 8? Answer with the number.', expected: '\\b72\\b' },
  { id: 'math-3', family: 'math', split: 'heldout', prompt: 'What is 100 minus 37? Answer with the number.', expected: '\\b63\\b' },
  { id: 'code-1', family: 'code', split: 'train', prompt: 'function add(a,b){ return ', expected: 'a\\s*\\+\\s*b' },
  { id: 'code-2', family: 'code', split: 'calibration', prompt: 'def square(x):\n    return ', expected: 'x\\s*\\*\\s*x|x\\s*\\*\\*\\s*2' },
  { id: 'code-3', family: 'code', split: 'heldout', prompt: 'function isEven(n){ return ', expected: 'n\\s*%\\s*2' },
  { id: 'tool-1', family: 'tool', split: 'train', prompt: 'Use the calculator tool to compute 17 * 19.', expected: '\\b323\\b' },
  { id: 'tool-2', family: 'tool', split: 'calibration', prompt: 'Use the calculator tool to compute 8 * 11.', expected: '\\b88\\b' },
  { id: 'tool-3', family: 'tool', split: 'heldout', prompt: 'Use the calculator tool to compute 144 / 12.', expected: '\\b12\\b' },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8799/');
const runs = await page.evaluate(async cases => {
  const { buildChatPrompt } = await import('/js/prompts.mjs');
  const { reachableToolsJSON, parseToolFabric, executeToolCall } = await import('/js/tools.mjs');
  const roster = [
    ['falcon_instruct', 'Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf'],
    ['falcon_reason', 'Falcon-H1R-Tiny-90M-Q4_K_M.gguf'],
    ['falcon_coder', 'Falcon-H1-Tiny-Coder-Q4_K_M.gguf'],
    ['falcon_tools', 'Falcon-H1-Tiny-Tool-Calling-Q4_K_M.gguf'],
  ];
  const worker = new Worker('/workers/runtime-worker.mjs', { type: 'module' });
  const waiters = new Map(), output = new Map(), first = new Map();
  worker.onmessage = ({ data }) => {
    if (data.kind === 'token') {
      if (!first.has(data.request_id)) first.set(data.request_id, performance.now());
      output.set(data.request_id, data.payload.replace ? data.payload.text : (output.get(data.request_id) || '') + data.payload.text);
    }
    if (data.type === 'reply' || ['complete','error','cancelled'].includes(data.kind)) {
      const id = data.reqId || data.request_id;
      if (waiters.has(id)) { waiters.get(id)(data); waiters.delete(id); }
    }
  };
  const send = data => new Promise(resolve => { waiters.set(data.reqId, resolve); worker.postMessage(data); });
  const records = [];
  for (const [modelId, file] of roster) {
    const blob = await (await fetch('/models/parts/' + file)).blob();
    const load = await send({ cmd: 'load', reqId: modelId + '-load', modelId, blob });
    if (!load.ok) { records.push({ modelId, error: load.message }); continue; }
    for (const c of cases) {
      const id = modelId + '-' + c.id;
      output.set(id, '');
      const opts = c.family === 'tool' ? { tools: reachableToolsJSON() } : {};
      const built = buildChatPrompt(modelId, [{ role: 'user', content: c.prompt }], opts);
      const started = performance.now();
      const end = await send({ cmd: 'complete', reqId: id, modelId, prompt: built.prompt,
        stops: built.stops, maxTokens: 64, temperature: 0 });
      const raw = output.get(id);
      let judged = raw;
      if (c.family === 'tool') {
        const parsed = parseToolFabric(raw);
        judged = parsed.calls.map(call => executeToolCall(call)).filter(r => r.ok).map(r => String(r.value)).join(' ');
      }
      records.push({ modelId, caseId: c.id, family: c.family, split: c.split,
        passed: new RegExp(c.expected, 'i').test(judged), raw, judged,
        tokens: end.payload?.tokens || 0, ttftMs: first.has(id) ? Math.round(first.get(id) - started) : null,
        elapsedMs: Math.round(performance.now() - started), end: end.kind });
    }
  }
  worker.terminate(); return records;
}, cases);
await mkdir('evidence', { recursive: true });
await writeFile('evidence/competence-browser-2026-10-26.json', JSON.stringify({
  createdAt: new Date().toISOString(), environment: 'macOS arm64 / Playwright Chromium headless / CPU WASM / Q4_K_M',
  cases, runs,
}, null, 2));
const summary = {};
for (const run of runs) {
  const key = run.modelId + '/' + run.split;
  const s = summary[key] ||= { passed: 0, total: 0, medianTtftMs: [] };
  s.passed += Number(!!run.passed); s.total++; if (run.ttftMs != null) s.medianTtftMs.push(run.ttftMs);
}
for (const s of Object.values(summary)) {
  s.medianTtftMs.sort((a, b) => a - b);
  s.medianTtftMs = s.medianTtftMs[Math.floor(s.medianTtftMs.length / 2)] || null;
}
console.log(JSON.stringify(summary, null, 2));
await browser.close();
