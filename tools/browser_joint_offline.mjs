import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [], external = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (!/^(?:http|blob:http):\/\/127\.0\.0\.1:8799\//.test(request.url())) external.push(request.url()); });
try {
  await page.goto('http://127.0.0.1:8799/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  const prompt = 'Use the calculator tool to compute 31 * 37.';
  await page.locator('#prompt').fill(prompt);
  await page.locator('#sendBtn').click();
  await page.waitForFunction(() => document.querySelector('.msg-ai .prose')?.textContent.trim() === '1147');
  const answer = (await page.locator('.msg-ai .prose').innerText()).trim();
  const receipt = await page.evaluate(async () => {
    const { conv, msg, jointRecords } = await import('/js/store.mjs');
    const current = (await conv.list())[0];
    return { message: (await msg.byConv(current.id)).findLast(item => item.role === 'assistant'),
      active: await jointRecords.policy('joint-exact-calculator-1'),
      braked: await jointRecords.policy('joint-shadow-1-tool-candidate') };
  });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.msg-ai .prose')?.textContent.trim() === '1147');
  const resumed = (await page.locator('.msg-ai .prose').innerText()).trim();
  const afterErase = await page.evaluate(async () => {
    const { factoryReset, jointRecords } = await import('/js/store.mjs');
    await factoryReset();
    return { active: await jointRecords.policy('joint-exact-calculator-1'),
      braked: await jointRecords.policy('joint-shadow-1-tool-candidate') };
  });
  const passed = answer === '1147' && resumed === answer && receipt.message.meta.policy_version === 'joint-exact-calculator-1' &&
    receipt.message.model_id === null && receipt.active?.status === 'active' && receipt.braked?.status === 'braked' &&
    afterErase.active === undefined && afterErase.braked === undefined && !errors.length && !external.length;
  const report = { checkpoint: 'CP010', prompt, answer, resumed,
    policy_version: receipt.message.meta.policy_version, backend: receipt.message.meta.backend,
    model_id: receipt.message.model_id, activePolicyStored: receipt.active?.status === 'active',
    failedPolicyRetained: receipt.braked?.status === 'braked', erasedPolicies: afterErase.active === undefined && afterErase.braked === undefined,
    errors, external, passed,
    environment: 'macOS arm64 / Playwright Chromium offline after service-worker cache / no model import' };
  await writeFile('evidence/joint-exact-offline-2026-10-28.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  if (!passed) process.exitCode = 1;
} finally { await browser.close(); }
