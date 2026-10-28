import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [], results = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:8799/');
  await page.evaluate(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        if (String(args[0]).includes('runtime-worker')) window.__runtimeWorker = this;
      }
    };
  });
  const roster = [
    ['falcon_instruct', 1], ['falcon_reason', 2], ['falcon_coder', 3], ['falcon_tools', 4],
  ];
  for (const [modelId, menuIndex] of roster) {
    await page.locator('#newBtn').click();
    await page.locator('#modelBtn').click();
    await page.locator('#modelMenu .menu-item').nth(menuIndex).click();
    await page.evaluate(() => { window.__runtimeWorker = null; });
    await page.locator('#prompt').fill('Write a detailed story about a blue lighthouse in twenty paragraphs.');
    await page.locator('#sendBtn').click();
    await page.waitForFunction(() => window.__runtimeWorker && document.querySelector('#footnote')?.textContent.includes('Writing with'), null, { timeout: 120000 });
    await page.evaluate(() => window.__runtimeWorker.dispatchEvent(new ErrorEvent('error', { message: 'synthetic crash' })));
    await page.waitForFunction(() => document.querySelector('.msg-ai .m-status')?.textContent === 'Generation failed');
    const item = await page.evaluate(async () => {
      const { conv, msg } = await import('/js/store.mjs');
      const current = (await conv.list())[0];
      const answer = (await msg.byConv(current.id)).findLast(row => row.role === 'assistant');
      return { modelId: answer.model_id, status: answer.status, content: answer.content.slice(0, 120) };
    });
    results.push({ requested: modelId, ...item, automaticFallback: item.modelId !== modelId });
  }
  const passed = results.length === 4 && results.every(row => row.modelId === row.requested &&
    row.status === 'error' && row.content.includes('synthetic crash') && !row.automaticFallback) && !errors.length;
  const report = { checkpoint: 'CP003/CP007/CP011', fault: 'synthetic runtime Worker error after model load, before completion',
    results, errors, passed, observedCrossModelFallback: false,
    note: 'All four failures are reported and persisted. No cross-model fallback is implemented.' };
  await writeFile('evidence/four-model-crash-stress-2026-10-28.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  if (!passed) process.exitCode = 1;
} finally { await browser.close(); }
