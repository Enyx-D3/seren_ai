import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const fixture = JSON.parse(await readFile('evidence/b2-transfer-development-fixture-2026-11-01.json'));
const baseUrl = process.env.B2_BASE_URL || 'http://127.0.0.1:8799/';
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (!request.url().startsWith(baseUrl) && !request.url().startsWith(`blob:${baseUrl}`)) external.push(request.url());
  });
  await page.goto(baseUrl);
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent.includes('Falcon Instruct ready'), null, { timeout: 120000 });
  const cases = [];
  for (const item of fixture.cases.filter(row => row.expected).slice(0, 2)) {
    const before = await page.locator('.msg-ai').count();
    const started = performance.now();
    await page.locator('#prompt').fill(item.prompt);
    await page.locator('#sendBtn').click();
    await page.waitForFunction(n => {
      const rows = [...document.querySelectorAll('.msg-ai')];
      return rows.length > n && rows.at(-1).querySelector('.m-status')?.textContent !== 'Writing locally…';
    }, before, { timeout: 120000 });
    const uiElapsedMs = performance.now() - started;
    const actual = await page.locator('.msg-ai .prose').last().innerText();
    const stored = await page.evaluate(async () => {
      const { conv, msg } = await import('/js/store.mjs');
      const conversation = (await conv.list())[0];
      return (await msg.byConv(conversation.id)).filter(row => row.role === 'assistant').at(-1);
    });
    const trace = stored.meta?.spiral_trace || [];
    cases.push({ id: item.id, prompt: item.prompt, expected: item.expected, answer: actual.trim(),
      verification: stored.meta?.spiral_verification, metrics: stored.meta?.spiral_metrics,
      selected: trace.find(row => row.step === 'direction')?.chosen,
      receipts: trace.find(row => row.step === 'transfer_path_result')?.receipts,
      graphFinal: stored.meta?.spiral_state?.graph?.nodes?.find(row => row.id === 'transfer:target_final'),
      uiElapsedMs, passed: actual.trim() === item.expected && stored.meta?.spiral_verification?.status === 'verified' &&
        stored.meta?.spiral_metrics?.modelCalls === 0 &&
        stored.meta?.spiral_state?.graph?.nodes?.find(row => row.id === 'transfer:target_final')?.status === 'verified' });
  }
  const result = { baseUrl, cases, errors, external,
    passed: cases.every(row => row.passed) && errors.length === 0 && external.length === 0 };
  const path = `evidence/b2-transfer-browser-${new Date().toISOString().replaceAll(':', '-')}.json`;
  await writeFile(path, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ path, passed: result.passed, cases: cases.map(row => ({ id: row.id,
    answer: row.answer, selected: row.selected, modelCalls: row.metrics?.modelCalls,
    calculatorCalls: row.metrics?.calculatorCalls, uiElapsedMs: row.uiElapsedMs, passed: row.passed })), errors, external }, null, 2));
  if (!result.passed) process.exitCode = 1;
} finally { await browser.close(); }
