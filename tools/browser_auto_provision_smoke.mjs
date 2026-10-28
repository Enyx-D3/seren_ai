import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [], external = [], modelRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  const url = request.url();
  if (url.includes('/models/parts/')) modelRequests.push(url);
  if (!/^(?:http|blob:http):\/\/127\.0\.0\.1:8799\//.test(url)) external.push(url);
});
try {
  await page.goto('http://127.0.0.1:8799/');
  const before = await page.evaluate(async () => (await (await import('/js/store.mjs')).models.all()).length);
  await page.locator('#prompt').fill('Say hello in one sentence.');
  await page.locator('#sendBtn').click();
  await page.waitForFunction(() => document.querySelector('.msg-ai .m-status')?.textContent === 'Local response', null, { timeout: 120000 });
  const first = await page.locator('.msg-ai .prose').innerText();
  const after = await page.evaluate(async () => (await (await import('/js/store.mjs')).models.all()).map(model => model.id));
  await page.locator('#settingsBtnTop').click();
  await page.locator('#factoryResetBtn').click();
  await page.locator('#confirmYes').click();
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent.includes('Start chatting'));
  await page.reload();
  const afterEraseReload = await page.evaluate(async () => (await (await import('/js/store.mjs')).models.all()).length);
  const passed = before === 0 && !!first.trim() && after.includes('falcon_instruct') &&
    modelRequests.some(url => url.endsWith('Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf')) &&
    afterEraseReload === 0 && !errors.length && !external.length;
  const report = { checkpoint: 'CP011', before, first: first.slice(0, 160), after, afterEraseReload,
    sameSiteModelRequests: modelRequests.length, errors, external, passed,
    environment: 'macOS arm64 / Playwright Chromium / fresh profile / localhost same-origin auto provisioning' };
  await writeFile('evidence/auto-provision-browser-2026-10-28.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  if (!passed) process.exitCode = 1;
} finally { await browser.close(); }
