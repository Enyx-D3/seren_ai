import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const first = await context.newPage(), second = await context.newPage();
  await Promise.all([first.goto('http://127.0.0.1:8799/'), second.goto('http://127.0.0.1:8799/')]);
  const id = 'multi-tab-' + crypto.randomUUID();
  await first.evaluate(async conversationId => {
    const store = await import('/js/store.mjs');
    await store.conv.put({ id: conversationId, title: 'Concurrent writes' });
  }, id);
  await Promise.all([first, second].map((page, tab) => page.evaluate(async ({ conversationId, tabIndex }) => {
    const store = await import('/js/store.mjs');
    await Promise.all(Array.from({ length: 20 }, (_, index) =>
      store.msg.add(conversationId, { role: 'user', content: `tab ${tabIndex} message ${index}` })));
  }, { conversationId: id, tabIndex: tab })));
  const before = await first.evaluate(async conversationId => {
    const store = await import('/js/store.mjs');
    const messages = await store.msg.byConv(conversationId);
    return { count: messages.length, sequences: messages.map(message => message.sequence),
      contentCount: new Set(messages.map(message => message.content)).size };
  }, id);
  await second.reload();
  const afterReload = await second.evaluate(async conversationId => {
    const store = await import('/js/store.mjs');
    return (await store.msg.byConv(conversationId)).length;
  }, id);
  await first.evaluate(async conversationId => { const store = await import('/js/store.mjs'); await store.conv.del(conversationId); }, id);
  const afterDelete = await second.evaluate(async conversationId => {
    const store = await import('/js/store.mjs');
    return { conversation: await store.conv.get(conversationId), messages: (await store.msg.byConv(conversationId)).length };
  }, id);
  console.log(JSON.stringify({ before, afterReload, afterDelete }));
  if (before.count !== 40 || before.contentCount !== 40 ||
    before.sequences.some((sequence, index) => sequence !== index) ||
    afterReload !== 40 || afterDelete.conversation || afterDelete.messages) process.exitCode = 1;
} finally { await browser.close(); }
