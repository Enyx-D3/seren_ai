import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const baseUrl = process.env.B2_BASE_URL || 'http://127.0.0.1:8799/';
const prompts = [
  'A club has 7 folders with 6 photos in each folder and removes 5 duplicates. How many photos remain?',
  'Nina starts with 18 seeds, gives 4 seeds to Omar, and receives 9 more. How many seeds does Nina have now?',
  'Complete this Python function: def count_long(words): Return the count of words longer than five characters.',
  'Debug this Python function: def triple(x): return x + 3. It should multiply x by 3.',
];
if (process.argv.length > 2) throw new Error('Usage: node tools/browser_b2_interpretation_probe.mjs');
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
  for (const prompt of prompts) {
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
        metrics: answer.meta?.spiral_metrics, trace: answer.meta?.spiral_trace,
        modelInterpretation: answer.meta?.spiral_state?.graph?.modelInterpretation,
        modelSpanNodes: answer.meta?.spiral_state?.graph?.nodes?.filter(node => node.status === 'model_proposed_unverified'),
        verifiedFacts: answer.meta?.spiral_state?.verifiedFacts };
    }));
  }
  const path = `evidence/b2-structured-interpretation-probe-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await writeFile(path, JSON.stringify({ environment: 'macOS arm64 Playwright Chromium offline CPU WebAssembly',
    rows, errors, external, purpose: 'Development structured interpretation probe. Source-grounded model spans remain provisional.' }, null, 2) + '\n');
  console.log(JSON.stringify({ path, summary: rows.map(row => ({ prompt: row.prompt,
    modelCalls: row.metrics?.modelCalls, interpretation: row.modelInterpretation,
    modelSpanCount: row.modelSpanNodes?.length, verifiedFacts: row.verifiedFacts?.length,
    verification: row.verification })), errors, external }, null, 2));
  if (errors.length || external.length) process.exitCode = 1;
} finally { await browser.close(); }
