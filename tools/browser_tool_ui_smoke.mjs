import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto('http://127.0.0.1:8799/');
await page.locator('#settingsBtnTop').click();
await page.locator('#modelFileInput').setInputFiles('workspace/parts/Falcon-H1-Tiny-Tool-Calling-Q4_K_M.gguf');
await page.waitForFunction(() => document.querySelector('#modelRows')?.textContent.includes('Verified'));
await page.locator('#setupDone').click();
await page.evaluate(() => navigator.serviceWorker.ready);
await page.context().setOffline(true);
await page.locator('#modelBtn').click();
await page.locator('#modelMenu .menu-item').last().click();
await page.locator('#prompt').fill('Calculate 17 * 19 using the calculator tool.');
await page.locator('#sendBtn').click();
try {
  await page.waitForFunction(() => [...document.querySelectorAll('.msg-ai')].some(el =>
    el.querySelector('.m-status')?.textContent.includes('Local response')), null, { timeout: 60000 });
} catch (error) {
  console.error(JSON.stringify({ status: await page.locator('#heroStatus').textContent(),
    messages: await page.locator('.msg-ai').allTextContents(), errors }, null, 2));
  throw error;
}
const answer = await page.locator('.msg-ai .prose').innerText();
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
const stored = receipt?.tool_name === 'calculator' && receipt?.status === 'succeeded' &&
  receipt?.verification === 'independently_verified_exact' &&
  JSON.parse(receipt?.result_json || '{}').value === '323';
if (receipt?.conversation_id) {
  await page.evaluate(async id => { const { conv } = await import('/js/store.mjs'); await conv.del(id); }, receipt.conversation_id);
}
const remaining = await page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('seren7', 3);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return await new Promise((resolve, reject) => {
    const request = db.transaction('tool_calls').objectStore('tool_calls').count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
});
console.log(JSON.stringify({ answer, stored, receipt, remainingAfterConversationDelete: remaining, errors }, null, 2));
if (answer.trim() !== 'calculator: 323' || !stored || remaining !== 0 || errors.length) process.exitCode = 1;
await browser.close();
