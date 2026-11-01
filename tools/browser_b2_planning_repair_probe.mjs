import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const baseUrl = process.env.B2_BASE_URL || 'http://127.0.0.1:8799/';
const prompts = [
  'Plan exactly three numbered steps for organizing a community library donation and mention one risk.',
  'Plan exactly two numbered steps for backing up family photos offline and mention one risk.',
  'Plan exactly three numbered steps for preparing a neighborhood garden and mention one risk.',
  'Plan exactly 4 numbered steps for cataloging a small offline museum archive and mention one risk.',
  'Plan exactly 4 numbered steps for training volunteers to sort donated books and mention one risk.',
  'Plan exactly 3 numbered steps for moving an offline photo collection to a new drive and mention one risk.',
];
const appendPrompts = [
  'Plan exactly 3 numbered steps for preserving local oral-history recordings, including metadata, a second storage copy, a way to test playback, and one concrete risk.',
  'Plan exactly 3 numbered steps for cataloging donated historical letters offline, including labels, safe storage, a retrieval check, and one concrete risk.',
  'Plan exactly 3 numbered steps for organizing a neighborhood seed library, including intake, labeling, distribution, and one concrete risk.',
  'Plan exactly 3 numbered steps for moving a school science archive to an offline drive, including inventory, copy, restore check, and one concrete risk.',
];
if (process.argv.length > 3 || (process.argv[2] && !['--focus', '--append'].includes(process.argv[2])))
  throw new Error('Usage: node tools/browser_b2_planning_repair_probe.mjs [--focus|--append]');
const selectedPrompts = process.argv[2] === '--focus' ? prompts.slice(3, 5)
  : process.argv[2] === '--append' ? appendPrompts : prompts;
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
  const path = `evidence/b2-planning-repair-probe-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await writeFile(path, JSON.stringify({ environment: 'macOS arm64 Playwright Chromium offline CPU WebAssembly',
    rows, errors, external, purpose: 'Development repair probe; surface constraint checks are not semantic correctness.' }, null, 2) + '\n');
  console.log(JSON.stringify({ path, summary: rows.map(row => ({ prompt: row.prompt,
    modelCalls: row.metrics?.modelCalls, repair: row.trace?.filter(step => step.step === 'repair'),
    verification: row.verification })), errors, external }, null, 2));
  if (errors.length || external.length) process.exitCode = 1;
} finally { await browser.close(); }
