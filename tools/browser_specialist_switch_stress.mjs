import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const roster = [
  ['falcon_instruct', 1, 'Say hello in one sentence.'],
  ['falcon_reason', 2, 'Why does 2 + 2 equal 4? Give a brief final answer.'],
  ['falcon_coder', 3, 'Write a Python function add(a, b).'],
  ['falcon_tools', 4, 'Say hello.'],
];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [], external = [], results = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  if (!/^(?:http|blob:http):\/\/127\.0\.0\.1:8799\//.test(request.url())) external.push(request.url());
});
try {
  await page.goto('http://127.0.0.1:8799/');
  for (let cycle = 1; cycle <= 2; cycle++) {
    if (cycle === 2) { await context.setOffline(true); await page.reload(); }
    for (const [id, menuIndex, prompt] of roster) {
      await page.locator('#newBtn').click();
      await page.locator('#modelBtn').click();
      await page.locator('#modelMenu .menu-item').nth(menuIndex).click();
      const started = Date.now();
      await page.locator('#prompt').fill(prompt);
      await page.locator('#sendBtn').click();
      await page.waitForFunction(() => {
        const row = document.querySelector('.msg-ai');
        return row && row.querySelector('.m-status')?.textContent !== 'Writing locally…' &&
          row.querySelector('.prose')?.textContent.trim();
      }, null, { timeout: 120000 });
      const item = await page.evaluate(async () => {
        const { conv, msg } = await import('/js/store.mjs');
        const current = (await conv.list())[0];
        const answer = (await msg.byConv(current.id)).findLast(row => row.role === 'assistant');
        return { modelId: answer.model_id, status: answer.status, content: answer.content.slice(0, 160),
          routeMode: answer.meta?.route_mode, policyVersion: answer.meta?.policy_version };
      });
      results.push({ cycle, requested: id, elapsedMs: Date.now() - started, ...item });
    }
  }
  const passed = results.length === 8 && results.every(row => row.modelId === row.requested &&
    row.status === 'done' && row.routeMode === 'manual' && row.content.trim()) && !errors.length && !external.length;
  const report = { checkpoint: 'CP003/CP006/CP011', environment: 'macOS arm64 / Playwright Chromium / CPU WASM / four verified Falcon Q4_K_M GGUFs',
    cycles: 2, offlineCycle: 2, results, errors, external, passed,
    caveat: 'Nonempty completion and identity checks demonstrate compatibility, not task correctness or failover.' };
  await writeFile('evidence/specialist-switch-stress-2026-10-28.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed, results, errors, external }));
  if (!passed) process.exitCode = 1;
} finally { await browser.close(); }
