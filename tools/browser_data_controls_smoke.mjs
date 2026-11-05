import { chromium } from 'playwright';
const executablePath = process.env.B2_CHROMIUM_EXECUTABLE_PATH;
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8799/');
await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent.includes('Falcon Instruct ready'), null, { timeout: 120000 });
await page.locator('#prompt').fill('2+2'); await page.locator('#sendBtn').click();
await page.waitForFunction(() => document.querySelector('.msg-ai .prose')?.textContent === '4');
await page.locator('#settingsBtnTop').click();
const downloadPromise = page.waitForEvent('download');
await page.locator('#exportChatsBtn').click();
const download = await downloadPromise;
const data = JSON.parse(await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'));
await page.locator('#deleteChatsBtn').click();
await page.locator('#confirmYes').click();
await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('conversations deleted'));
await page.reload();
const result = { exported: data.records.length === 1 && data.records[0].messages.length === 2,
  deleted: await page.locator('.msg-ai').count() === 0 && await page.locator('#threadList .thread-link').count() === 0 &&
    await page.evaluate(async () => (await (await import('/js/store.mjs')).conv.list()).length === 0) };
await page.locator('#settingsBtnTop').click();
await page.locator('#chatFileInput').setInputFiles({ name: 'seren-conversations.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('conversations imported'));
await page.reload();
// Reload completes before the asynchronous IndexedDB-backed renderThreads()
// does. Never treat an immediate DOM count of zero as a failed import.
const threadRendered = await page.waitForFunction(() =>
  document.querySelectorAll('#threadList .thread-link').length === 1,
  null, { timeout: 15000 }).then(() => true, () => false);
const persisted = await page.evaluate(async () => {
  const store = await import('/js/store.mjs');
  const rows = await store.conv.list();
  return { conversations: rows.length,
    messages: rows.length === 1 ? (await store.msg.byConv(rows[0].id)).length : null };
});
let answerRendered = false;
if (threadRendered) {
  await page.locator('#threadList .thread-open').click();
  answerRendered = await page.waitForFunction(() =>
    [...document.querySelectorAll('.msg-ai .prose')].some(el => el.textContent?.trim() === '4'),
    null, { timeout: 15000 }).then(() => true, () => false);
}
result.restored = threadRendered && persisted.conversations === 1 &&
  persisted.messages === 2 && answerRendered;
result.restoreEvidence = { threadRendered, ...persisted, answerRendered };
await page.locator('#settingsBtnTop').click();
const bad = structuredClone(data); bad.records[0].messages[0].role = 'system';
await page.locator('#chatFileInput').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
await page.waitForFunction(() => document.querySelector('#footnote')?.textContent.includes('Conversation import failed'));
result.invalidRejected = await page.locator('#threadList .thread-link').count() === 1;
console.log(JSON.stringify(result, null, 2));
if (!result.exported || !result.deleted || !result.restored || !result.invalidRejected) process.exitCode = 1;
await browser.close();
