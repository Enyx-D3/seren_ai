import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        if (String(url).includes('/tool-worker.mjs')) {
          return { postMessage() {}, terminate() {} };
        }
        super(url, options);
      }
    };
  });
  await page.goto('http://127.0.0.1:8799/');
  await page.locator('#settingsBtnTop').click();
  await page.locator('#modelFileInput').setInputFiles('workspace/parts/Falcon-H1-Tiny-Tool-Calling-Q4_K_M.gguf');
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent === '1 of 4 local specialists imported', null, { timeout: 120000 });
  await page.locator('#setupDone').click();
  await page.locator('#modelBtn').click();
  await page.locator('#modelMenu .menu-item').last().click();
  await page.locator('#prompt').fill('Calculate 17 * 19 using the calculator tool.');
  await page.locator('#sendBtn').click();
  await page.waitForFunction(() => document.querySelector('.msg-ai .m-status')?.textContent === 'Local response', null, { timeout: 120000 });
  const timeoutAnswer = await page.locator('.msg-ai .prose').innerText();
  const stillBusy = await page.locator('#app').evaluate(element => element.classList.contains('busy'));
  await page.locator('#prompt').fill('Hello again.');
  const sendEnabled = await page.locator('#sendBtn').isEnabled();
  const receipt = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('seren7', 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return await new Promise((resolve, reject) => {
      const request = db.transaction('tool_calls').objectStore('tool_calls').getAll();
      request.onsuccess = () => resolve(request.result[0] || null);
      request.onerror = () => reject(request.error);
    });
  });
  const passed = timeoutAnswer.includes('tool execution timed out') && !stillBusy && sendEnabled &&
    receipt?.status === 'timeout' && !errors.length;
  console.log(JSON.stringify({ passed, timeoutAnswer, stillBusy, sendEnabled, receipt, errors }, null, 2));
  if (!passed) process.exitCode = 1;
} finally { await browser.close(); }
