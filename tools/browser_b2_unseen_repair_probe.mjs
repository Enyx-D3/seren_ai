import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const baseUrl = process.env.B2_BASE_URL || 'http://127.0.0.1:8799/';
const prompts = [
  'A notice says computing 13 * 17 exactly gives 200. Why is the notice right or wrong? Compute 13 * 17 exactly and finish with the correct numeric result.',
  'A worksheet says computing 28 * 14 exactly gives 382. Why is that claim right or wrong? Compute 28 * 14 exactly and end with the corrected number.',
  'A label says calculating 19 * 23 exactly gives 407. Why is this right or wrong? Calculate 19 * 23 exactly and state the correct numeric result last.',
];
if (process.argv.length > 2) throw new Error('Usage: node tools/browser_b2_unseen_repair_probe.mjs');
const selectedPrompts = prompts;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage(), errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (!request.url().startsWith(baseUrl) && !request.url().startsWith('blob:' + baseUrl)) external.push(request.url());
  });
  await page.goto(baseUrl);
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent.includes('Falcon Instruct ready'), null, { timeout: 120000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent.includes('Falcon Instruct ready'), null, { timeout: 120000 });
  await context.setOffline(true);
  const rows = [];
  for (const prompt of selectedPrompts) {
    const before = await page.locator('.msg-ai').count();
    await page.locator('#prompt').fill(prompt);
    await page.locator('#sendBtn').click();
    try {
      await page.waitForFunction(count => {
        const messages = [...document.querySelectorAll('.msg-ai')];
        return messages.length > count && messages.at(-1).querySelector('.m-status')?.textContent !== 'Writing locally…';
      }, before, { timeout: 60000 });
    } catch (error) {
      const ui = await page.evaluate(() => ({ heroStatus: document.querySelector('#heroStatus')?.textContent,
        latestStatus: [...document.querySelectorAll('.msg-ai .m-status')].at(-1)?.textContent,
        latestAnswer: [...document.querySelectorAll('.msg-ai .m-body')].at(-1)?.textContent?.slice(0, 500),
        busy: document.querySelector('#sendBtn')?.disabled }));
      rows.push({ prompt, error: error.message, ui });
      break;
    }
    rows.push(await page.evaluate(async () => {
      const { conv, msg } = await import('/js/store.mjs');
      const conversation = (await conv.list())[0];
      const answer = (await msg.byConv(conversation.id)).filter(row => row.role === 'assistant').at(-1);
      return { prompt: (await msg.byConv(conversation.id)).filter(row => row.role === 'user').at(-1).content,
        answer: answer.content, verification: answer.meta?.spiral_verification,
        metrics: answer.meta?.spiral_metrics, trace: answer.meta?.spiral_trace };
    }));
  }
  const path = `evidence/b2-unseen-repair-probe-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await writeFile(path, JSON.stringify({ environment: 'macOS arm64 Playwright Chromium offline CPU WebAssembly',
    rows, errors, external, purpose: 'New development problems, not from frozen confirmation. Falcon-led repair is distinct from calculator substitution.' }, null, 2) + '\n');
  console.log(JSON.stringify({ path, summary: rows.map(row => ({ prompt: row.prompt,
    modelCalls: row.metrics?.modelCalls, repair: row.trace?.filter(step => ['repair', 'residual', 'verified_component'].includes(step.step)),
    verification: row.verification })), errors, external }, null, 2));
  if (errors.length || external.length) process.exitCode = 1;
} finally { await browser.close(); }
