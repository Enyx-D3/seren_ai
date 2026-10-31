import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';

const fixtureSet = process.argv[2] || 'public';
if (!['public', 'confirm'].includes(fixtureSet)) throw new Error('Usage: node tools/b2_public_eval.mjs [public|confirm]');
const fixturePath = `evidence/b2-v2-${fixtureSet}-fixture-2026-10-31.json`;
const expectedFixtureSha = {
  public: 'a06200b7454504175836b337718788ea59b5490486c4893163b540acfede44e5',
  confirm: 'a4a75ae96139fff5e79544c6252daef64b64b55d7cb9fb4a7d9e1618e2255429',
}[fixtureSet];
const fixtureBytes = await readFile(fixturePath);
const actualFixtureSha = createHash('sha256').update(fixtureBytes).digest('hex');
if (actualFixtureSha !== expectedFixtureSha) throw new Error('frozen fixture hash changed');
const fixtures = JSON.parse(fixtureBytes).fixtures;
const hashFile = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const sourceSha256 = {
  controller: await hashFile('app/js/spiral.mjs'),
  prompts: await hashFile('app/js/prompts.mjs'),
  worker: await hashFile('app/workers/runtime-worker.mjs'),
  model: await hashFile('workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf'),
};
const baseUrl = process.env.B2_BASE_URL || 'http://127.0.0.1:8799/';

function checkPython(row, fixture) {
  return new Promise(resolve => {
    const child = spawn('python3', ['-I', '-S', 'tools/b2_python_check.py'], {
      cwd: process.cwd(), env: { PATH: '/usr/bin:/bin:/Library/Frameworks/Python.framework/Versions/3.14/bin', PYTHONDONTWRITEBYTECODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', error = '', ended = false;
    const finish = value => { if (ended) return; ended = true; clearTimeout(timer); resolve(value); };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish({ status: 'failed', reason: 'checker_timeout' }); }, 5000);
    child.stdout.on('data', data => { output += data.toString().slice(0, 2000); });
    child.stderr.on('data', data => { error += data.toString().slice(0, 500); });
    child.on('error', err => finish({ status: 'failed', reason: 'checker_spawn', detail: err.message }));
    child.on('close', () => { try { finish(JSON.parse(output.trim())); }
      catch { finish({ status: 'failed', reason: 'checker_crash', detail: error }); } });
    child.stdin.end(JSON.stringify({ answer: row.answer, ...fixture.checker }));
  });
}

function machineCheck(row, fixture) {
  if (row.error) return { status: 'failed', reason: 'generation_error' };
  const expected = fixture.checker.expected;
  if (fixture.checker.kind === 'number') {
    const numbers = [...row.answer.matchAll(/(?<![\w.])-?\d[\d,]*(?:\.\d+)?(?!\w)/g)].map(m => m[0].replaceAll(',', ''));
    const value = numbers.at(-1) || null;
    return { status: value === expected ? 'passed' : 'failed', method: 'published_final_number', expected, observed: value };
  }
  if (fixture.checker.kind === 'choice') {
    const claims = fixture.checker.options.filter(option => new RegExp(`\\b${option}\\b`, 'i').test(row.answer));
    const observed = claims.length === 1 ? claims[0] : null;
    return { status: observed?.toLowerCase() === expected.toLowerCase() ? 'passed' : 'failed',
      method: 'unambiguous_published_choice', expected, observed };
  }
  return { status: 'pending_human' };
}

const browser = await chromium.launch({ headless: true });
let rssTimer;
try {
  const page = await browser.newPage();
  const errors = [], external = [], rssPeaks = {};
  let activeStage = null;
  const sampleRss = () => {
    if (!activeStage) return;
    try {
      const processes = execFileSync('ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf8' }).trim().split('\n')
        .map(line => line.trim().split(/\s+/).map(Number));
      const descendants = new Set([process.pid]);
      let changed = true;
      while (changed) { changed = false; for (const [pid, ppid] of processes)
        if (descendants.has(ppid) && !descendants.has(pid)) { descendants.add(pid); changed = true; } }
      const total = processes.filter(([pid]) => descendants.has(pid)).reduce((sum, row) => sum + (row[2] || 0), 0);
      rssPeaks[activeStage] = Math.max(rssPeaks[activeStage] || 0, total);
    } catch { /* unavailable measurement remains null */ }
  };
  await page.exposeFunction('__b2PublicStage', (id, system) => { activeStage = `${id}/${system}`; console.log('RUN', activeStage); sampleRss(); });
  rssTimer = setInterval(sampleRss, 300);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(baseUrl) && !request.url().startsWith('blob:' + baseUrl)) external.push(request.url()); });
  await page.addInitScript(() => localStorage.setItem('seren-auto-provision-suppressed', '1'));
  await page.goto(baseUrl);
  const rows = await page.evaluate(async fixtureRows => {
    const { SpiralController } = await import('/js/spiral.mjs');
    const { buildChatPrompt } = await import('/js/prompts.mjs');
    const { runToolProposal } = await import('/js/tool-runner.mjs');
    const worker = new Worker('/workers/runtime-worker.mjs', { type: 'module' });
    const pending = new Map(); let counter = 0;
    worker.onmessage = ({ data }) => {
      const id = data.reqId || data.request_id, p = pending.get(id);
      if (!p) return;
      if (data.kind === 'token') {
        if (p.ttftMs === null) p.ttftMs = performance.now() - p.started;
        p.text = data.payload.replace ? data.payload.text : p.text + data.payload.text;
      }
      if (data.type === 'reply' || ['complete', 'cancelled', 'error'].includes(data.kind)) {
        pending.delete(id); p.resolve({ data, text: p.text, ttftMs: p.ttftMs });
      }
    };
    const send = (cmd, fields) => new Promise(resolve => {
      const id = `b2-public-${++counter}`;
      const timer = setTimeout(() => { pending.delete(id); worker.postMessage({ cmd: 'abort', reqId: id });
        resolve({ data: { kind: 'error', payload: { message: `${cmd} timeout` } }, text: '', ttftMs: null }); }, 60000);
      pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, text: '', ttftMs: null, started: performance.now() });
      worker.postMessage({ cmd, reqId: id, ...fields });
    });
    const blob = await (await fetch('/models/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf')).blob();
    const loaded = await send('load', { modelId: 'falcon_instruct', blob });
    if (!loaded.data.ok) throw new Error(loaded.data.message || 'model load failed');
    const generate = async ({ turns, maxTokens }) => {
      const built = buildChatPrompt('falcon_instruct', turns);
      const result = await send('complete', { modelId: 'falcon_instruct', prompt: built.prompt,
        stops: built.stops, maxTokens: Math.min(128, maxTokens || 128), temperature: 0.2 });
      if (result.data.kind !== 'complete') throw new Error(result.data.payload?.message || result.data.kind);
      return { text: result.text, tokens: result.data.payload.tokens || 0, ttftMs: result.ttftMs };
    };
    const spiral = new SpiralController();
    const records = [];
    for (const [index, fixture] of fixtureRows.entries()) {
      const order = index % 2 ? ['falcon_plus_b2', 'falcon_alone'] : ['falcon_alone', 'falcon_plus_b2'];
      for (const system of order) {
        await window.__b2PublicStage(fixture.id, system);
        const started = performance.now();
        let answer = '', metrics = {}, verification = null, trace = [], error = null;
        try {
          if (system === 'falcon_alone') {
            const result = await generate({ turns: [{ role: 'user', content: fixture.prompt }], maxTokens: 128 });
            answer = result.text; metrics = { modelCalls: 1, tokens: result.tokens, calculatorCalls: 0, cacheHits: 0, firstModelTokenMs: result.ttftMs };
          } else {
            const result = await spiral.run(fixture.prompt, { scope: `public-${fixture.id}`,
              turns: [{ role: 'user', content: fixture.prompt }], generate,
              runTool: call => runToolProposal(call) });
            answer = result.answer; metrics = result.metrics; verification = result.verification; trace = result.trace;
          }
        } catch (e) { error = e.message; }
        records.push({ id: fixture.id, category: fixture.category, system, order, answer, metrics, verification, trace,
          error, elapsedMs: Math.round(performance.now() - started) });
      }
    }
    worker.terminate(); return records;
  }, fixtures.map(({ id, category, prompt }) => ({ id, category, prompt })));
  activeStage = null; clearInterval(rssTimer);
  for (const row of rows) row.browserProcessTreePeakRssKiB = rssPeaks[`${row.id}/${row.system}`] ?? null;
  for (const row of rows) {
    const fixture = fixtures.find(item => item.id === row.id);
    row.check = fixture.checker.kind === 'python' ? await checkPython(row, fixture) : machineCheck(row, fixture);
  }
  const summary = Object.fromEntries(['falcon_alone', 'falcon_plus_b2'].map(system => {
    const subset = rows.filter(row => row.system === system);
    const times = subset.map(row => row.elapsedMs).sort((a, b) => a - b);
    return [system, { checkedPassed: subset.filter(row => row.check.status === 'passed').length,
      checkedFailed: subset.filter(row => row.check.status === 'failed').length,
      pendingHuman: subset.filter(row => row.check.status === 'pending_human').length,
      byCategory: Object.fromEntries([...new Set(fixtures.map(f => f.category))].map(category => {
        const categoryRows = subset.filter(row => row.category === category);
        return [category, { passed: categoryRows.filter(row => row.check.status === 'passed').length,
          failed: categoryRows.filter(row => row.check.status === 'failed').length,
          pendingHuman: categoryRows.filter(row => row.check.status === 'pending_human').length }];
      })),
      b2Verified: subset.filter(row => row.verification?.status === 'verified').length,
      b2Unverified: subset.filter(row => row.verification?.status === 'unverified').length,
      repairAttempts: subset.reduce((n, row) => n + row.trace.filter(step => step.step === 'repair').length, 0),
      repairSuccesses: subset.reduce((n, row) => n + row.trace.filter(step => step.step === 'repair' && step.verification === 'verified').length, 0),
      totalMs: subset.reduce((n, row) => n + row.elapsedMs, 0),
      p50Ms: times[Math.floor((times.length - 1) * 0.5)], p95Ms: times[Math.floor((times.length - 1) * 0.95)],
      tokens: subset.reduce((n, row) => n + (row.metrics.tokens || 0), 0),
      modelCalls: subset.reduce((n, row) => n + (row.metrics.modelCalls || 0), 0),
      calculatorCalls: subset.reduce((n, row) => n + (row.metrics.calculatorCalls || 0), 0),
      cacheHits: subset.reduce((n, row) => n + (row.metrics.cacheHits || 0), 0),
      peakProcessTreeRssKiB: Math.max(0, ...subset.map(row => row.browserProcessTreePeakRssKiB || 0)) || null }];
  }));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const evidencePath = `evidence/b2-v2-${fixtureSet}-eval-${timestamp}.json`;
  await writeFile(evidencePath, JSON.stringify({ generatedAt: timestamp, fixturePath, fixtureSha256: actualFixtureSha, sourceSha256,
    model: 'Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf', temperature: 0.2, maxTokensPerCall: 128,
    order: 'AB on even fixture indices, BA on odd indices', environment: 'macOS arm64 / Playwright Chromium / CPU WebAssembly',
    limits: 'Public benchmark may be present in model pretraining. Process-tree RSS includes harness. Semantic cases require blinded human grades. The restricted Python checker rejects unsupported generated syntax.',
    summary, errors, external, rows }, null, 2) + '\n');
  const blind = [], key = {}, gradeTemplate = {};
  for (const fixture of fixtures.filter(f => f.checker.kind === 'human')) {
    const pair = rows.filter(row => row.id === fixture.id);
    const reversed = parseInt(createHash('sha256').update(`blind:${fixture.id}`).digest('hex').slice(0, 2), 16) % 2 === 1;
    const ordered = reversed ? pair.slice().reverse() : pair;
    key[fixture.id] = ordered.map(row => row.system);
    gradeTemplate[fixture.id] = { response1: { score: null, errors: '' },
      response2: { score: null, errors: '' }, preferred: null };
    blind.push(`## ${fixture.id}\n\n**Prompt:** ${fixture.prompt}\n\n**Response 1:**\n\n${ordered[0].answer}\n\n**Response 2:**\n\n${ordered[1].answer}\n\n**Reviewer:** Rate each response 0 (wrong/off-topic), 1 (partly useful), or 2 (correct/useful). Note concrete errors and choose 1, 2, or tie.\n`);
  }
  const blindPath = `evidence/b2-v2-${fixtureSet}-blind-review-${timestamp}.md`;
  const keyPath = `evidence/b2-v2-${fixtureSet}-blind-key-${timestamp}.json`;
  const gradeTemplatePath = `evidence/b2-v2-${fixtureSet}-human-grades-${timestamp}.json`;
  await writeFile(blindPath, `# B2 V2 blinded semantic review\n\nThe systems are hidden; please assess content without looking at the key or run evidence.\n\n${blind.join('\n')}`);
  await writeFile(keyPath, JSON.stringify(key, null, 2) + '\n');
  await writeFile(gradeTemplatePath, JSON.stringify(gradeTemplate, null, 2) + '\n');
  console.log(JSON.stringify({ evidencePath, blindPath, gradeTemplatePath, keyPath, summary, errors, external }, null, 2));
  if (errors.length || external.length || rows.some(row => row.error)) process.exitCode = 1;
} finally { clearInterval(rssTimer); await browser.close(); }
