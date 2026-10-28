import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8799/');
  await page.locator('#settingsBtnTop').click();
  const button = page.locator('#importLocalBtn');
  if (!await button.isVisible()) throw new Error('localhost model import button missing');
  await button.click();
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent === '4 of 4 local specialists imported', null, { timeout: 120000 });
  const rows = await page.locator('#modelRows .model-row').allTextContents();
  await page.reload();
  const persisted = await page.locator('#heroStatus').textContent();
  console.log(JSON.stringify({ verified: rows.every(x => x.includes('Verified · Q4_K_M')), persisted }));
  if (!rows.every(x => x.includes('Verified · Q4_K_M')) || persisted !== '4 of 4 local specialists imported') process.exitCode = 1;
} finally { await browser.close(); }
