import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8799/');
  await page.locator('#settingsBtnTop').click();
  await page.locator('#modelFileInput').setInputFiles('workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf');
  await page.waitForFunction(() => document.querySelector('#modelRows')?.textContent.includes('Verified'));
  await page.locator('#setupDone').click();
  await page.evaluate(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) { super(...args); window.__runtimeWorker = this; }
    };
  });
  await page.locator('#prompt').fill('Write a detailed story about a blue lighthouse in twenty paragraphs.');
  await page.locator('#thinkBtn').click();
  await page.locator('#sendBtn').click();
  await page.waitForFunction(() => !!window.__runtimeWorker && document.querySelector('#footnote')?.textContent.includes('Writing with'));
  await page.evaluate(() => window.__runtimeWorker.dispatchEvent(new ErrorEvent('error', { message: 'synthetic crash' })));
  await page.waitForFunction(() => document.querySelector('.msg-ai .m-status')?.textContent.includes('Generation failed'));
  const before = await page.locator('.msg-ai .prose').last().innerText();
  await page.reload();
  const after = await page.locator('.msg-ai .prose').last().innerText();
  const status = await page.locator('.msg-ai .m-status').last().innerText();
  console.log(JSON.stringify({ before, after, status }));
  if (!before || before !== after || status !== 'Generation failed') process.exitCode = 1;
} finally { await browser.close(); }
