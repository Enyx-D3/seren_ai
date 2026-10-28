import { chromium } from 'playwright';

const url = process.argv[2];
if (!url || new URL(url).protocol !== 'https:') throw new Error('pass an HTTPS preview URL');
const browser = await chromium.launch({ headless: true, ...(process.argv.includes('--brave') ?
  { executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' } : {}) });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#modelLoadStatus')?.dataset.loading === 'true', null, { timeout: 30000 });
  await page.locator('#prompt').fill('Say hello.');
  if (await page.locator('#sendBtn').isEnabled()) throw new Error('Send enabled during model preparation');
  await page.waitForFunction(() => document.querySelector('#modelLoadStatus')?.textContent.includes('ready in this browser'), null, { timeout: 180000 });
  if (!await page.locator('#sendBtn').isEnabled()) throw new Error('Send did not enable after verification');
  await page.locator('#sendBtn').click();
  await page.waitForFunction(() => document.querySelector('.msg-ai .m-status')?.textContent === 'Local response', null, { timeout: 120000 });
  if (process.argv.includes('--all')) {
    await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent.includes('4 of 4 local specialists imported') ||
      [...document.querySelectorAll('#modelRows .st')].filter(item => item.textContent.startsWith('Verified')).length === 4,
    null, { timeout: 240000 });
    await page.locator('#settingsBtnTop').click();
    await page.locator('#modelRows input[type="radio"]').nth(2).check();
    if (await page.locator('#modelName').innerText() !== 'Seren 7 Coder') throw new Error('settings radio did not select Coder');
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('PASS public model provisioning, Send gating, and local response:', (await page.locator('.msg-ai .prose').last().innerText()).slice(0, 120));
} finally { await browser.close(); }
