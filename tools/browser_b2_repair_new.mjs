import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const baseUrl = process.env.B2_BASE_URL || 'http://127.0.0.1:8799/';
const prompts = [
  'A catalog says computing 47 * 36 exactly gives 1682. Check the claim. Compute 47 * 36 exactly and end with the correct numeric result.',
  'A receipt says computing 26 * 39 exactly gives 1004. Check the claim. Compute 26 * 39 exactly and end with the correct numeric result.',
  'A card says computing 34 * 27 exactly gives 908. Check the claim. Compute 34 * 27 exactly and end with the correct numeric result.',
];
if (process.argv.length > 2) throw new Error('Usage: node tools/browser_b2_repair_new.mjs');
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
  await page.locator('#thinkBtn').click();
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
  const path = `evidence/b2-repair-new-probe-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await writeFile(path, JSON.stringify({ environment: 'macOS arm64 Playwright Chromium offline CPU WebAssembly',
    rows, errors, external, purpose: 'New development problems, not from frozen confirmation. Falcon-led repair is distinct from calculator substitution.' }, null, 2) + '\n');
  console.log(JSON.stringify({ path, summary: rows.map(row => ({ prompt: row.prompt,
    modelCalls: row.metrics?.modelCalls, repair: row.trace?.filter(step => ['repair', 'residual', 'verified_component'].includes(step.step)),
    verification: row.verification })), errors, external }, null, 2));
  if (errors.length || external.length) process.exitCode = 1;
} finally { await browser.close(); }
