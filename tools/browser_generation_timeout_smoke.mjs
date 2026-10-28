import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.clock.install();
  await page.goto('http://127.0.0.1:8799/');
  await page.locator('#settingsBtnTop').click();
  await page.locator('#modelFileInput').setInputFiles('workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf');
  await page.waitForFunction(() => document.querySelector('#modelRows')?.textContent.includes('Verified'));
  await page.locator('#setupDone').click();
  await page.evaluate(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      postMessage(data, transfer) {
        if (data?.cmd === 'complete') { window.__swallowedCompletion = true; return; }
        return super.postMessage(data, transfer);
      }
    };
  });
  await page.locator('#prompt').fill('Say hello.');
  await page.locator('#sendBtn').click();
  await page.waitForFunction(() => window.__swallowedCompletion === true);
  await page.clock.fastForward(181000);
  await page.waitForFunction(() => document.querySelector('.msg-ai .m-status')?.textContent === 'Generation failed');
  const before = await page.locator('.msg-ai .prose').last().innerText();
  await page.reload();
  const after = await page.locator('.msg-ai .prose').last().innerText();
  const result = { failed: before.includes('Generation stalled'), persisted: before === after };
  console.log(JSON.stringify(result));
  if (!result.failed || !result.persisted) process.exitCode = 1;
} finally { await browser.close(); }
