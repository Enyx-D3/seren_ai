import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.B2_BASE_URL || 'http://127.0.0.1:8799/';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__b2ModelLoads = 0;
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(message, ...rest) {
      if (message?.cmd === 'load' && message.modelId === 'falcon_instruct') window.__b2ModelLoads++;
      return post.call(this, message, ...rest);
    };
  });
  await page.goto(baseUrl);
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent.includes('Falcon Instruct ready'), null, { timeout: 120000 });
  async function ask(prompt) {
    const before = await page.locator('.msg-ai').count();
    await page.locator('#prompt').fill(prompt);
    await page.locator('#sendBtn').click();
    await page.waitForFunction(n => {
      const answers = [...document.querySelectorAll('.msg-ai')];
      return answers.length > n && answers.at(-1).querySelector('.m-status')?.textContent !== 'Writing locally…';
    }, before, { timeout: 120000 });
    return page.locator('.msg-ai .prose').last().innerText();
  }
  const exact = await ask('Calculate 17 * 19 exactly.');
  const beforeChat = await page.evaluate(() => window.__b2ModelLoads);
  const chat = await ask('Say hello in one short sentence.');
  const afterChat = await page.evaluate(() => window.__b2ModelLoads);
  assert.equal(exact.trim(), '323');
  assert.equal(beforeChat, 0, 'exact arithmetic must not load Falcon');
  assert.equal(afterChat, 1, 'language generation must load Falcon once');
  assert.ok(chat.length > 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ exact, beforeChat, afterChat, chat, errors }));
} finally { await browser.close(); }
