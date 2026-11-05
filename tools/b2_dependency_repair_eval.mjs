import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const fixturePath = process.argv[2] || 'evidence/b2-dependency-fresh-2026-11-04.json';
const fixtureBytes = await readFile(fixturePath);
const fixtureSha256 = createHash('sha256').update(fixtureBytes).digest('hex');
const modelPath = 'workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf';
const modelSha256 = createHash('sha256').update(await readFile(modelPath)).digest('hex');
if (modelSha256 !== 'e7d655345a876ecb073ea86f5ce68e412b99090c34a6bde8a2982bc48afb2612')
  throw Error('pinned Falcon model changed');
const fixture = JSON.parse(fixtureBytes), baseUrl = process.env.B2_BASE_URL || 'http://127.0.0.1:8799/';
const evaluatedSourceSha256 = Object.fromEntries(await Promise.all(['app/js/spiral.mjs', 'app/js/b2-dependency-task.mjs', 'app/js/b2-graphos-browser-shadow.mjs', 'app/js/b2-elastic-joint.mjs', 'app/js/b2-direction.mjs', 'app/js/prompts.mjs', 'app/workers/runtime-worker.mjs'].map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
const browser = await chromium.launch({ headless: true });
let timer, active = null;
try {
  const page = await browser.newPage(), errors = [], external = [], rssPeaks = {};
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (!request.url().startsWith(baseUrl) && !request.url().startsWith(`blob:${baseUrl}`)) external.push(request.url());
  });
  const sampleRss = () => {
    if (!active) return;
    try {
      const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf8' }).trim().split('\n')
        .map(line => line.trim().split(/\s+/).map(Number));
      const members = new Set([process.pid]); let changed = true;
      while (changed) { changed = false; for (const [pid, ppid] of rows)
        if (members.has(ppid) && !members.has(pid)) { members.add(pid); changed = true; } }
      const rss = rows.filter(([pid]) => members.has(pid)).reduce((sum, row) => sum + (row[2] || 0), 0);
      rssPeaks[active] = Math.max(rssPeaks[active] || 0, rss);
    } catch { /* null is more honest than an inferred memory value */ }
  };
  await page.exposeFunction('__crossStage', key => { active = key; sampleRss(); });
  timer = setInterval(sampleRss, 300);
  await page.addInitScript(() => localStorage.setItem('seren-auto-provision-suppressed', '1'));
  await page.goto(baseUrl);
  const rows = await page.evaluate(async cases => {
    const { SpiralController } = await import('/js/spiral.mjs');
    const { buildChatPrompt } = await import('/js/prompts.mjs');
    const worker = new Worker('/workers/runtime-worker.mjs', { type: 'module' });
    const pending = new Map(); let serial = 0;
    worker.onmessage = ({ data }) => {
      const id = data.reqId || data.request_id, wait = pending.get(id);
      if (!wait) return;
      if (data.kind === 'token') {
        if (wait.ttftMs === null) wait.ttftMs = performance.now() - wait.started;
        wait.text = data.payload.replace ? data.payload.text : wait.text + data.payload.text;
      }
      if (data.type === 'reply' || ['complete', 'cancelled', 'error'].includes(data.kind)) {
        pending.delete(id); wait.resolve({ data, text: wait.text, ttftMs: wait.ttftMs });
      }
    };
    const send = (cmd, fields) => new Promise(resolve => {
      const id = `cross-ab-${++serial}`;
      const timeout = setTimeout(() => { pending.delete(id); worker.postMessage({ cmd: 'abort', reqId: id });
        resolve({ data: { kind: 'error', payload: { message: `${cmd} timeout` } }, text: '', ttftMs: null }); }, 60000);
      pending.set(id, { resolve: value => { clearTimeout(timeout); resolve(value); }, text: '', ttftMs: null, started: performance.now() });
      worker.postMessage({ cmd, reqId: id, ...fields });
    });
    const blob = await (await fetch('/models/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf')).blob();
    const loaded = await send('load', { modelId: 'falcon_instruct', blob });
    if (!loaded.data.ok) throw Error(loaded.data.message || 'model load failed');
    const generate = async ({ turns, maxTokens }) => {
      const built = buildChatPrompt('falcon_instruct', turns);
      const result = await send('complete', { modelId: 'falcon_instruct', prompt: built.prompt,
        stops: built.stops, maxTokens: Math.min(64, maxTokens || 64), temperature: 0.2 });
      if (result.data.kind !== 'complete') throw Error(result.data.payload?.message || result.data.kind);
      return { text: result.text, tokens: result.data.payload.tokens || 0, ttftMs: result.ttftMs };
    };
    const spiral = new SpiralController(), out = [];
    for (const [index, item] of cases.entries()) {
      const order = index % 2 ? ['b2', 'falcon_alone'] : ['falcon_alone', 'b2'];
      for (const arm of order) {
        await window.__crossStage(`${item.id}/${arm}`);
        const started = performance.now(); let answer = '', metrics = {}, verification = null, trace = [], error = null;
        try {
          if (arm === 'falcon_alone') {
            const attempts = []; let tokens = 0;
            for (let attempt = 0; attempt < 4; attempt++) {
              const turns = [{ role: 'user', content: item.prompt }];
              if (attempts.length) turns.push({ role: 'assistant', content: attempts.at(-1) },
                { role: 'user', content: 'Check the original requirements and correct your answer. For an ordering task return only a JSON array of action names; for multiple choice return only the letter.' });
              const result = await generate({ turns, maxTokens: 64 });
              attempts.push(result.text); tokens += result.tokens;
            }
            answer = attempts.at(-1); trace.push({ step: 'baseline_attempts', attempts });
            metrics = { modelCalls: 4, tokens, calculatorCalls: 0 };
          } else {
            const result = await spiral.run(item.prompt, { scope: `cross-ab-${item.id}`,
              turns: [{ role: 'user', content: item.prompt }], experimentalDependency: true, generate });
            answer = result.answer; metrics = result.metrics; verification = result.verification; trace = result.trace;
          }
        } catch (cause) { error = cause.message; }
        out.push({ id: item.id, category: item.category, arm, order, answer, metrics, verification, trace,
          error, elapsedMs: performance.now() - started });
      }
    }
    worker.terminate(); return out;
  }, fixture.cases);
  active = null; clearInterval(timer);
  for (const row of rows) {
    const item = fixture.cases.find(test => test.id === row.id);
    row.peakProcessTreeRssKiB = rssPeaks[`${row.id}/${row.arm}`] ?? null;
    if (row.error) row.check = { status: 'failed', reason: 'runtime_error' };
    else {
      let order; try { order = JSON.parse(row.answer.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, '$1')); } catch {}
      const valid = Array.isArray(order) && item.names && order.length === item.names.length && new Set(order).size === item.names.length &&
        item.names.every(n => order.includes(n)) && item.edges.every(([a,b]) => order.indexOf(a) < order.indexOf(b));
      const impossible = item.impossible && /^No feasible order/i.test(row.answer.trim());
      const abstention = row.verification?.method === 'semantic_abstention' || /ambiguous|cannot determine|not enough information|insufficient information|unclear|cannot verify/i.test(row.answer);
      const choice = /^\(?([ABC])\)?[.!]?$/i.exec(row.answer.trim())?.[1]?.toUpperCase();
      const passed = item.expectedAbstain ? abstention : item.target ? choice === item.target : valid || impossible;
      const repairs = row.trace.filter(step => step.step === 'dependency_model_repair');
      row.check = { status: passed ? 'passed' : 'failed', method: item.target ? 'external_published_target' : 'separate_gold_constraints',
        correctAbstention: !!item.expectedAbstain && abstention,
        falseVerification: row.verification?.status === 'verified' && !(valid || impossible),
        repairs: repairs.map(step => ({ component: step.repair.componentChecked, wholeTask: step.repair.checked.ok })) };
    }
  }
  const totals = Object.fromEntries(['falcon_alone', 'b2'].map(arm => {
    const subset = rows.filter(row => row.arm === arm);
    return [arm, { objectivePassed: subset.filter(row => row.check.status === 'passed').length,
      objectiveTotal: subset.filter(row => row.category === 'dependency').length,
      pendingHumanCode: subset.filter(row => row.check.status === 'pending_human_code').length,
      pendingHuman: subset.filter(row => row.check.status === 'pending_blinded_human').length,
      totalElapsedMs: subset.reduce((sum, row) => sum + row.elapsedMs, 0),
      modelCalls: subset.reduce((sum, row) => sum + (row.metrics.modelCalls || 0), 0),
      tokens: subset.reduce((sum, row) => sum + (row.metrics.tokens || 0), 0),
      calculatorCalls: subset.reduce((sum, row) => sum + (row.metrics.calculatorCalls || 0), 0),
      peakProcessTreeRssKiB: Math.max(0, ...subset.map(row => row.peakProcessTreeRssKiB || 0)) || null }];
  }));
  const report = { fixturePath, fixtureSha256, modelSha256, baseUrl,
    conditions: 'same Falcon weights/runtime/hardware/temperature 0.2; each arm <=4 calls x64 output tokens, AB/BA order; baseline generic reconsideration, B2 source-grounded interpretation/tools and targeted correction; tool intervention charged; no live calibration',
    sourceSha256: evaluatedSourceSha256,
    rows, totals, errors, external,
    caveats: ['Small locally authored fixture; not independent external generalization evidence.',
      'Ordering check uses separately authored gold action/edge constraints; prose interpretations not admitted remain failures/abstentions.',
      'The first baseline prompt matches the B2 hypothesis prompt; generic reconsideration uses no fixed negative-answer example.', 'RSS includes Node and Chromium harness.'] };
  const out = `evidence/b2-dependency-repair-eval-${new Date().toISOString().replaceAll(':', '-')}.json`;
  await writeFile(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ out, totals, rows: rows.map(row => ({ id: row.id, arm: row.arm,
    check: row.check, modelCalls: row.metrics.modelCalls, elapsedMs: Math.round(row.elapsedMs), error: row.error })), errors, external }, null, 2));
  if (errors.length || external.length || rows.some(row => row.error)) process.exitCode = 1;
} finally { clearInterval(timer); await browser.close(); }
