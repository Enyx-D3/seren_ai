import { chromium } from 'playwright';

const baseUrl = process.env.B2_BASE_URL || 'http://127.0.0.1:8799/';
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [], external = [];
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
  async function ask(prompt) {
    const before = await page.locator('.msg-ai').count();
    await page.locator('#prompt').fill(prompt);
    await page.locator('#sendBtn').click();
    await page.waitForFunction(count => {
      const messages = [...document.querySelectorAll('.msg-ai')];
      return messages.length > count && messages.at(-1).querySelector('.m-status')?.textContent !== 'Writing locally…';
    }, before, { timeout: 120000 });
    return page.evaluate(async () => {
      const { conv, msg } = await import('/js/store.mjs');
      const conversation = (await conv.list())[0];
      return (await msg.byConv(conversation.id)).filter(row => row.role === 'assistant').at(-1);
    });
  }
  const first = await ask('Say hello briefly.');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent.includes('Falcon Instruct ready'), null, { timeout: 120000 });
  const second = await ask('Say goodbye briefly.');
  const persistedMessages = await page.locator('.msg-ai').count();
  const result = { first: first.content, second: second.content, firstStatus: first.status,
    secondStatus: second.status, persistedMessages, offline: true, errors, external };
  console.log(JSON.stringify(result, null, 2));
  if (!first.content || !second.content || first.status !== 'done' || second.status !== 'done' ||
      persistedMessages !== 2 || errors.length || external.length) process.exitCode = 1;
} finally { await browser.close(); }
