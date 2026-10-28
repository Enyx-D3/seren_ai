import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8799/');
  await page.locator('#settingsBtnTop').click();
  await page.locator('#modelFileInput').setInputFiles('workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf');
  await page.waitForFunction(() => document.querySelector('#modelRows')?.textContent.includes('Verified'));
  await page.locator('#setupDone').click();
  await page.locator('#prompt').fill('2+2'); await page.locator('#sendBtn').click();
  await page.waitForFunction(() => document.querySelector('.msg-ai .prose')?.textContent === '4');
  await page.locator('#settingsBtnTop').click();
  await page.locator('#factoryResetBtn').click(); await page.locator('#confirmYes').click();
  await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('erased'));
  await page.reload();
  const state = await page.evaluate(async () => {
    const store = await import('/js/store.mjs');
    const db = await store.init();
    const counts = {};
    for (const name of db.objectStoreNames) counts[name] = await new Promise((resolve, reject) => {
      const req = db.transaction(name).objectStore(name).count();
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    const root = await navigator.storage.getDirectory();
    const opfsNames = [];
    for await (const name of root.keys()) opfsNames.push(name);
    return { counts, opfsNames };
  });
  console.log(JSON.stringify(state));
  if (Object.values(state.counts).some(count => count !== 0) || state.opfsNames.some(name => name.endsWith('.gguf'))) process.exitCode = 1;
} finally { await browser.close(); }
