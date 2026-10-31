import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [], external = [];
  const baseUrl = 'http://127.0.0.1:8799/';
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(baseUrl) && !request.url().startsWith(`blob:${baseUrl}`)) external.push(request.url()); });
  await page.goto(baseUrl);
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent.includes('Falcon Instruct ready'), null, { timeout: 120000 });
  const prompt = 'Use an approved local calculator tool to find the exact value of (3*7)+(4*5). Show the tool result.';
  const before = await page.locator('.msg-ai').count();
  await page.locator('#prompt').fill(prompt);
  await page.locator('#sendBtn').click();
  await page.waitForFunction(count => {
    const rows = [...document.querySelectorAll('.msg-ai')];
    return rows.length > count && rows.at(-1).querySelector('.m-status')?.textContent !== 'Writing locally…';
  }, before, { timeout: 120000 });
  const result = await page.evaluate(async () => {
    const { conv, msg } = await import('/js/store.mjs');
    const conversation = (await conv.list())[0];
    const answer = (await msg.byConv(conversation.id)).filter(row => row.role === 'assistant').at(-1);
    return { answer: answer.content, status: answer.status, verification: answer.meta?.spiral_verification,
      trace: answer.meta?.spiral_trace, state: answer.meta?.spiral_state, metrics: answer.meta?.spiral_metrics };
  });
  const path = `evidence/b2-direction-tool-probe-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await writeFile(path, JSON.stringify({ prompt, result, errors, external }, null, 2) + '\n');
  console.log(JSON.stringify({ path, answer: result.answer, verification: result.verification, metrics: result.metrics,
    directions: result.trace?.filter(row => row.step === 'direction').map(row => row.chosen),
    verifiedComponents: result.trace?.filter(row => row.step === 'verified_component'), errors, external }, null, 2));
  if (errors.length || external.length || result.status !== 'done') process.exitCode = 1;
} finally { await browser.close(); }
