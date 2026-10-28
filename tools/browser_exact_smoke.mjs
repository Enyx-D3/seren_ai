import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8799/');
  for (const [prompt, expected] of [
    ['calculate 1/3', '1/3'],
    ['0.1+0.2', '3/10'],
    ['9007199254740993+1', '9007199254740994'],
    ['1/0', 'Undefined (division by zero).'],
  ]) {
    await page.locator('#prompt').fill(prompt);
    await page.locator('#sendBtn').click();
    await page.waitForFunction(value => document.querySelector('.msg-ai:last-of-type .prose')?.textContent === value, expected);
  }
  const answers = await page.locator('.msg-ai .prose').allTextContents();
  console.log(JSON.stringify({ answers }));
  if (answers.join('|') !== '1/3|3/10|9007199254740994|Undefined (division by zero).') process.exitCode = 1;
} finally { await browser.close(); }
