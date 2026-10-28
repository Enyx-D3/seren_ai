import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [], external = [], results = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  const url = request.url();
  if (!/^(?:http|blob:http):\/\/127\.0\.0\.1:8799\//.test(url)) external.push(url);
});
const roster = [
  ['falcon_instruct', 1], ['falcon_reason', 2], ['falcon_coder', 3], ['falcon_tools', 4],
];
try {
  await page.goto('http://127.0.0.1:8799/');
  for (const [modelId, menuIndex] of roster) {
    await page.locator('#newBtn').click();
    await page.locator('#modelBtn').click();
    await page.locator('#modelMenu .menu-item').nth(menuIndex).click();
    await page.locator('#prompt').fill('Say hello.');
    await page.locator('#sendBtn').click();
    await page.waitForFunction(() => {
      const reply = document.querySelector('.msg-ai');
      return reply && reply.querySelector('.prose')?.textContent.trim() &&
        reply.querySelector('.m-status')?.textContent !== 'Writing locally…';
    }, null, { timeout: 120000 });
    const row = await page.evaluate(async () => {
      const { conv, msg, models } = await import('/js/store.mjs');
      const current = (await conv.list())[0];
      const answer = (await msg.byConv(current.id)).findLast(item => item.role === 'assistant');
      return { answer: answer.content.slice(0, 120), modelId: answer.model_id,
        stored: (await models.all()).map(model => model.id) };
    });
    results.push({ requested: modelId, ...row });
  }
  await context.setOffline(true);
  await page.reload();
  const storedOffline = await page.evaluate(async () => (await (await import('/js/store.mjs')).models.all()).map(model => model.id));
  const passed = results.every((row, index) => row.modelId === row.requested &&
    roster.slice(0, index + 1).every(([id]) => row.stored.includes(id))) &&
    roster.every(([id]) => storedOffline.includes(id)) && !errors.length && !external.length;
  const report = { checkpoint: 'CP011', results, storedOffline, errors, external, passed,
    environment: 'macOS arm64 / Playwright Chromium / fresh profile / four same-origin on-demand GGUFs / offline reload' };
  await writeFile('evidence/auto-provision-four-2026-10-28.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed, results: results.map(({ requested, modelId, stored }) => ({ requested, modelId, stored })), storedOffline, errors, external }));
  if (!passed) process.exitCode = 1;
} finally { await browser.close(); }
