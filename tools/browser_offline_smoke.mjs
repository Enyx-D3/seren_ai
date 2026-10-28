import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const failedRequests = [];
page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
await page.goto('http://127.0.0.1:8799/');
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await page.locator('#settingsBtnTop').click();
await page.locator('#modelFileInput').setInputFiles('workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf');
await page.waitForFunction(() => document.querySelector('#modelRows')?.textContent.includes('Verified'));
await page.locator('#setupDone').click();
await page.locator('#prompt').fill('Say hello.'); await page.locator('#sendBtn').click();
await page.waitForFunction(() => document.querySelector('.msg-ai .m-status')?.textContent.includes('Local response'));
const online = await page.locator('.msg-ai .prose').last().innerText();
await context.setOffline(true);
await page.reload();
await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent === '1 of 4 local specialists imported');
await page.locator('#prompt').fill('Say goodbye.');
try { await page.locator('#sendBtn').click({ timeout: 10000 }); }
catch (error) {
  console.error(JSON.stringify({ stage: 'offline send', heroStatus: await page.locator('#heroStatus').textContent(),
    modelRows: await page.locator('#modelRows').allTextContents(), errors, failedRequests }, null, 2));
  throw error;
}
await page.waitForFunction(() => document.querySelectorAll('.msg-ai .m-status').length === 2 && document.querySelectorAll('.msg-ai .m-status')[1].textContent.includes('Local response'));
const offline = await page.locator('.msg-ai .prose').last().innerText();
console.log(JSON.stringify({ online, offline, persistedMessages: await page.locator('.msg-ai').count(), errors }, null, 2));
await browser.close();
