import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const fixture = JSON.parse(await readFile('evidence/b2-cross-domain-unseen-fixture-2026-11-01.json'));
const baseUrl = process.env.B2_BASE_URL || 'http://127.0.0.1:8799/';
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage(), errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (!request.url().startsWith(baseUrl) && !request.url().startsWith(`blob:${baseUrl}`)) external.push(request.url());
  });
  await page.goto(baseUrl);
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent.includes('Falcon Instruct ready'), null, { timeout: 120000 });
  const cases = [];
  for (const item of fixture.cases.filter(row => ['word_math', 'logic', 'code'].includes(row.category))) {
    const before = await page.locator('.msg-ai').count(), started = performance.now();
    await page.locator('#prompt').fill(item.prompt);
    await page.locator('#sendBtn').click();
    await page.waitForFunction(n => {
      const rows = [...document.querySelectorAll('.msg-ai')];
      return rows.length > n && rows.at(-1).querySelector('.m-status')?.textContent !== 'Writing locally…';
    }, before, { timeout: 120000 });
    const answer = (await page.locator('.msg-ai .prose').last().innerText()).trim();
    const stored = await page.evaluate(async () => {
      const { conv, msg } = await import('/js/store.mjs');
      const conversation = (await conv.list())[0];
      return (await msg.byConv(conversation.id)).filter(row => row.role === 'assistant').at(-1);
    });
    const trace = stored.meta?.spiral_trace || [], selected = trace.find(row => row.step === 'direction')?.chosen;
    const passed = stored.meta?.spiral_verification?.status === item.expectedStatus &&
      (item.expectedAnswer ? answer.startsWith(item.expectedAnswer) : answer.includes(item.expectedAnswerContains)) &&
      stored.meta?.spiral_metrics?.modelCalls === 0 && !!selected;
    cases.push({ id: item.id, prompt: item.prompt, answer, expected: item, selected,
      verification: stored.meta?.spiral_verification, metrics: stored.meta?.spiral_metrics,
      trace, graph: stored.meta?.spiral_state?.graph, uiElapsedMs: performance.now() - started, passed });
  }
  const result = { fixture: 'evidence/b2-cross-domain-unseen-fixture-2026-11-01.json', baseUrl, cases, errors, external,
    passed: cases.every(row => row.passed) && !errors.length && !external.length };
  const path = `evidence/b2-cross-domain-browser-${new Date().toISOString().replaceAll(':', '-')}.json`;
  await writeFile(path, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ path, passed: result.passed,
    cases: cases.map(row => ({ id: row.id, selected: row.selected, status: row.verification?.status,
      modelCalls: row.metrics?.modelCalls, uiElapsedMs: row.uiElapsedMs, passed: row.passed })), errors, external }, null, 2));
  if (!result.passed) process.exitCode = 1;
} finally { await browser.close(); }
