import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [], external = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  if (!/^(?:http|blob:http):\/\/127\.0\.0\.1:8799\//.test(request.url())) external.push(request.url());
});
try {
  await page.goto('http://127.0.0.1:8799/');
  const prompts = [
    'Use the calculator to calculate 17 * 19 exactly.',
    'Use the calculator to calculate 17 \\* 19 exactly.',
  ];
  const results = [];
  for (const prompt of prompts) {
    await page.locator('#prompt').fill(prompt);
    await page.locator('#sendBtn').click();
    const count = results.length + 1;
    await page.waitForFunction(n => document.querySelectorAll('.msg-ai').length === n, count);
    const article = page.locator('.msg-ai').nth(results.length);
    await article.locator('.inspector-details summary').click();
    results.push({ prompt, answer: (await article.locator('.prose').innerText()).trim(),
      label: await article.locator('.m-name').innerText(),
      details: await article.locator('.inspector-details').innerText() });
  }
  const passed = results.every(row => row.answer === '323' && row.label === 'Seren 7' &&
    row.details.includes('Model: deterministic') && row.details.includes('Route mode: verified_joint_tool') &&
    row.details.includes('Policy: joint-exact-calculator-1')) && !errors.length && !external.length;
  const report = { checkpoint: 'CP010/CP011', results, errors, external, passed };
  await writeFile('evidence/calculator-phrase-2026-10-28.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  if (!passed) process.exitCode = 1;
} finally { await browser.close(); }
