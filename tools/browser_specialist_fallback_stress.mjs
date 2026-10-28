import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [], external = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  if (!/^(?:http|blob:http):\/\/127\.0\.0\.1:8799\//.test(request.url())) external.push(request.url());
});
try {
  await page.goto('http://127.0.0.1:8799/');
  await page.locator('#settingsBtnTop').click();
  await page.locator('#modelFileInput').setInputFiles('workspace/parts/Falcon-H1-Tiny-Coder-Q4_K_M.gguf');
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent === '1 of 4 local specialists imported', null, { timeout: 120000 });
  await page.locator('#setupDone').click();
  await page.route('**/models/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf', route => route.abort());
  await page.locator('#prompt').fill('Write a Python function that returns 2.');
  await page.locator('#sendBtn').click();
  await page.locator('#setupDialog').waitFor({ state: 'visible', timeout: 30000 });
  const autoFailure = {
    dialog: await page.locator('#setupTitle').innerText(),
    assistantCount: await page.locator('.msg-ai').count(),
    status: await page.locator('#footnote').innerText(),
    stored: await page.evaluate(async () => (await (await import('/js/store.mjs')).models.all()).map(row => row.id)),
  };
  await page.locator('#setupDone').click();
  await page.locator('#modelBtn').click();
  await page.locator('#modelMenu .menu-item').nth(3).click();
  await page.locator('#prompt').fill('Write a Python function that returns 2.');
  await page.locator('#sendBtn').click();
  await page.waitForFunction(() => document.querySelector('.msg-ai .m-status')?.textContent !== 'Writing locally…' &&
    document.querySelector('.msg-ai .prose')?.textContent.trim(), null, { timeout: 120000 });
  const manualRecovery = await page.evaluate(async () => {
    const { conv, msg } = await import('/js/store.mjs');
    const current = (await conv.list())[0];
    const answer = (await msg.byConv(current.id)).findLast(row => row.role === 'assistant');
    return { modelId: answer.model_id, status: answer.status, answer: answer.content.slice(0, 160) };
  });
  const passed = autoFailure.assistantCount === 0 && autoFailure.stored.includes('falcon_coder') &&
    autoFailure.status.includes('Local model not ready') && manualRecovery.modelId === 'falcon_coder' &&
    manualRecovery.status === 'done' && !!manualRecovery.answer.trim() && !errors.length && !external.length;
  const report = { checkpoint: 'CP007/CP011', expectedFallbackToCoder: true,
    observedAutomaticFallbackToCoder: false, autoFailure, manualRecovery, errors, external, passed,
    note: 'A missing Auto/Instruct model opens setup even when verified Coder is ready. Manual Coder remains usable.' };
  await writeFile('evidence/specialist-fallback-stress-2026-10-28.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  if (!passed) process.exitCode = 1;
} finally { await browser.close(); }
