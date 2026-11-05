import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
const base = process.env.B2_BASE_URL || 'http://127.0.0.1:8799/';
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext(), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '?b2_chain=1');
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent.includes('Falcon Instruct ready'), null, { timeout: 120000 });
  const prompt = 'All auditors are reviewers. All reviewers are staff. Are all auditors staff?';
  await page.locator('#prompt').fill(prompt);
  await page.locator('#sendBtn').click();
  await page.waitForFunction(() => document.querySelector('.msg-ai .m-status')?.textContent.includes('Verified local result'), null, { timeout: 30000 });
  const stored = await page.evaluate(async () => {
    const { conv, msg } = await import('/js/store.mjs');
    return (await msg.byConv((await conv.list())[0].id)).filter(row => row.role === 'assistant').at(-1);
  });
  assert.equal(stored.meta.spiral_metrics.modelCalls, 0);
  assert.equal(stored.meta.spiral_verification.status, 'verified');
  assert.equal(stored.meta.spiral_trace.find(row => row.step === 'direction').chosen, 'chain_forward');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  const offline = await page.evaluate(async prompt => {
    const { SpiralController, planSpiral } = await import('/js/spiral.mjs');
    const result = await new SpiralController().run(prompt, { experimentalChain: true });
    return { result, defaultOperations: planSpiral(prompt).parts[0].candidateOperations };
  }, prompt);
  assert.equal(offline.result.verification.status, 'verified');
  assert.equal(offline.defaultOperations.includes('chain_forward'), false);
  assert.equal(errors.length, 0);
  await page.screenshot({ path: '/tmp/seren-cp024-ui.png', fullPage: true });
  const path = `evidence/cp024-browser-${new Date().toISOString().replaceAll(':', '-')}.json`;
  await writeFile(path, JSON.stringify({ base, prompt, stored, offline, errors, passed: true }, null, 2));
  console.log(JSON.stringify({ path, passed: true, modelCalls: 0, offline: true }));
} finally { await browser.close(); }
