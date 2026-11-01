import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const fixturePath = process.argv[2] || 'evidence/b2-word-confirm-fixture-2026-11-01.json';
const bytes = await readFile(fixturePath);
const fixture = JSON.parse(bytes);
const baseUrl = process.env.B2_BASE_URL || 'http://127.0.0.1:8799/';
const browser = await chromium.launch({ headless: true });
const errors = [], external = [];
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(baseUrl) && !request.url().startsWith(`blob:${baseUrl}`)) external.push(request.url()); });
  await page.goto(baseUrl);
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent.includes('Falcon Instruct ready'), null, { timeout: 120000 });
  const results = [];
  for (const item of fixture.cases.filter(row => row.expected)) {
    const before = await page.locator('.msg-ai').count();
    const started = performance.now();
    await page.locator('#prompt').fill(item.prompt);
    await page.locator('#sendBtn').click();
    await page.waitForFunction(n => {
      const rows = [...document.querySelectorAll('.msg-ai')];
      return rows.length > n && rows.at(-1).querySelector('.m-status')?.textContent !== 'Writing locally…';
    }, before, { timeout: 120000 });
    const answer = (await page.locator('.msg-ai .prose').last().innerText()).trim();
    const uiElapsedMs = performance.now() - started;
    const stored = await page.evaluate(async () => {
      const { conv, msg } = await import('/js/store.mjs');
      const conversation = (await conv.list())[0];
      return (await msg.byConv(conversation.id)).filter(row => row.role === 'assistant').at(-1);
    });
    results.push({ id: item.id, prompt: item.prompt, expected: item.expected, answer, uiElapsedMs,
      verification: stored.meta?.spiral_verification, metrics: stored.meta?.spiral_metrics,
      trace: stored.meta?.spiral_trace, graph: stored.meta?.spiral_state?.graph,
      passed: answer === item.expected &&
        stored.meta?.spiral_verification?.status === 'verified' &&
        stored.meta?.spiral_metrics?.modelCalls === 0 &&
        stored.meta?.spiral_state?.graph?.nodes?.find(node => node.id === 'word:final_item_count')?.status === 'verified' });
  }
  const receipt = { fixturePath, fixtureSha256: createHash('sha256').update(bytes).digest('hex'),
    baseUrl, environment: 'Playwright Chromium, local app, stored run receipts', results, errors, external,
    passed: results.every(row => row.passed) && errors.length === 0 && external.length === 0 };
  const path = `evidence/b2-word-browser-${new Date().toISOString().replaceAll(':', '-')}.json`;
  await writeFile(path, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ path, passed: receipt.passed, results: results.map(row => ({ id: row.id,
    answer: row.answer, passed: row.passed, modelCalls: row.metrics?.modelCalls,
    calculatorCalls: row.metrics?.calculatorCalls,
    chosen: row.trace?.find(step => step.step === 'direction')?.chosen })), errors, external }, null, 2));
  if (!receipt.passed) process.exitCode = 1;
} finally { await browser.close(); }
