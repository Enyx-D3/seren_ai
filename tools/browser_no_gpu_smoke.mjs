import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  await context.addInitScript(() => Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:8799/');
  await page.locator('#settingsBtnTop').click();
  await page.locator('#modelFileInput').setInputFiles('workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf');
  await page.waitForFunction(() => document.querySelector('#modelRows')?.textContent.includes('Verified'));
  await page.locator('#setupDone').click();
  await page.locator('#prompt').fill('Say hello.');
  await page.locator('#sendBtn').click();
  await page.waitForFunction(() => document.querySelector('.msg-ai .m-status')?.textContent.includes('Local response'), null, { timeout: 120000 });
  const answer = await page.locator('.msg-ai .prose').last().innerText();
  const status = await page.locator('#footnote').textContent();
  console.log(JSON.stringify({ gpuAvailable: await page.evaluate(() => !!navigator.gpu), answer, status, errors }));
  if (!answer.trim() || !status.includes('CPU WebAssembly') || errors.length) process.exitCode = 1;
} finally { await browser.close(); }
