import { chromium } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'seren-restart-'));
let context;
try {
  context = await chromium.launchPersistentContext(profile, { headless: true });
  let page = await context.newPage();
  await page.goto('http://127.0.0.1:8799/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.locator('#settingsBtnTop').click();
  await page.locator('#modelFileInput').setInputFiles('workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf');
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent === '1 of 4 local specialists imported');
  await page.locator('#setupDone').click();
  await page.locator('#prompt').fill('Say hello.');
  await page.locator('#sendBtn').click();
  await page.waitForFunction(() => document.querySelector('.msg-ai .m-status')?.textContent.includes('Local response'), null, { timeout: 120000 });
  const online = await page.locator('.msg-ai .prose').last().innerText();
  const conversationId = await page.evaluate(async () => {
    const store = await import('/js/store.mjs');
    const id = await store.kv.get('active_conversation');
    for (let index = 0; index < 60; index++) {
      await store.msg.add(id, { role: index % 2 ? 'assistant' : 'user', content: `saved turn ${index}` });
    }
    return id;
  });
  await context.close(); context = null;

  context = await chromium.launchPersistentContext(profile, { headless: true });
  await context.setOffline(true);
  page = await context.newPage();
  const externalRequests = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== 'http://127.0.0.1:8799') {
      externalRequests.push(request.url());
    }
  });
  await page.goto('http://127.0.0.1:8799/');
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent === '1 of 4 local specialists imported');
  const restored = await page.evaluate(async id => {
    const store = await import('/js/store.mjs');
    return (await store.msg.byConv(id)).length;
  }, conversationId);
  await page.locator('#prompt').fill('Say goodbye.');
  await page.locator('#sendBtn').click();
  await page.waitForFunction(() => {
    const replies = document.querySelectorAll('.msg-ai');
    return replies.length === 32 && replies[replies.length - 1].querySelector('.m-status')?.textContent.includes('Local response');
  },
    null, { timeout: 120000 });
  const offline = await page.locator('.msg-ai .prose').last().innerText();
  const totalMessages = await page.evaluate(async id => {
    const store = await import('/js/store.mjs');
    return (await store.msg.byConv(id)).length;
  }, conversationId);
  console.log(JSON.stringify({ online, restored, offline, totalMessages, externalRequests }));
  if (!online.trim() || restored !== 62 || !offline.trim() || totalMessages !== 64 || externalRequests.length) process.exitCode = 1;
} finally {
  if (context) await context.close();
  await rm(profile, { recursive: true, force: true });
}
