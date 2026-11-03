import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const prompt = 'Debug this JavaScript:\n```js\nfunction perimeter(w, h) { return 2 * (w + h);\n```\nFind the syntax error.';
const baseUrl = process.env.B2_BASE_URL || 'http://127.0.0.1:8799/';
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext(), page = await context.newPage(), errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (!request.url().startsWith(baseUrl) && !request.url().startsWith(`blob:${baseUrl}`)) external.push(request.url());
  });
  await page.goto(baseUrl);
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent.includes('Falcon Instruct ready'), null, { timeout: 120000 });
  await page.locator('#thinkBtn').click();
  await page.locator('#prompt').fill(prompt);
  await page.locator('#sendBtn').click();
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll('.msg-ai')];
    return rows.length && rows.at(-1).querySelector('.m-status')?.textContent !== 'Writing locally…';
  }, null, { timeout: 120000 });
  const stored = await page.evaluate(async () => {
    const { conv, msg } = await import('/js/store.mjs');
    const conversation = (await conv.list())[0];
    return (await msg.byConv(conversation.id)).filter(row => row.role === 'assistant').at(-1);
  });
  const receipt = { prompt, answer: stored.content, verification: stored.meta?.spiral_verification,
    metrics: stored.meta?.spiral_metrics, trace: stored.meta?.spiral_trace, errors, external,
    note: 'Real single-Falcon code repair probe. A checked single delimiter edit remains partial, not full program verification.' };
  const path = `evidence/b2-code-repair-probe-${new Date().toISOString().replaceAll(':', '-')}.json`;
  await writeFile(path, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ path, verification: receipt.verification,
    repair: receipt.trace?.find(row => row.step === 'falcon_code_repair'), metrics: receipt.metrics, errors, external }, null, 2));
  if (errors.length || external.length) process.exitCode = 1;
} finally { await browser.close(); }
