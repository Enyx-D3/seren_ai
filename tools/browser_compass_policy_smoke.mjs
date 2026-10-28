import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:8799/');
  await page.locator('#settingsBtnTop').click();
  await page.locator('#modelFileInput').setInputFiles('workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf');
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent === '1 of 4 local specialists imported', null, { timeout: 120000 });
  await page.locator('#setupDone').click();
  await page.locator('#prompt').fill('Write a JavaScript function that returns 2.');
  await page.locator('#sendBtn').click();
  await page.waitForFunction(() => document.querySelector('.msg-ai .m-status')?.textContent === 'Local response', null, { timeout: 120000 });
  await page.locator('.inspector-details summary').click();
  const inspector = await page.locator('.inspector-details').innerText();
  const receipt = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('seren7', 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return await new Promise((resolve, reject) => {
      const request = db.transaction('run_events').objectStore('run_events').getAll();
      request.onsuccess = () => resolve(request.result.find(row => row.kind === 'route_selected'));
      request.onerror = () => reject(request.error);
    });
  });
  const passed = inspector.includes('Model: falcon_instruct') &&
    inspector.includes('Route mode: conservative_fallback') &&
    inspector.includes('Task category: code') &&
    inspector.includes('Policy: compass-conservative-1') &&
    receipt?.payload?.model_id === 'falcon_instruct' &&
    receipt?.payload?.reason_category === 'code' &&
    receipt?.payload?.policy_version === 'compass-conservative-1' && !errors.length;
  console.log(JSON.stringify({ passed, inspector, receipt, errors }, null, 2));
  if (!passed) process.exitCode = 1;
} finally { await browser.close(); }
