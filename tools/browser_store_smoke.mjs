import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8799/');
const id = 'store-smoke-' + Date.now();
const before = await page.evaluate(async id => {
  const s = await import('/js/store.mjs');
  await s.conv.put({ id, title: 'Store smoke' });
  for (let i = 0; i < 60; i++) await s.msg.add(id, { role: i % 2 ? 'assistant' : 'user', content: 'turn ' + i });
  await s.events.append('run-a', 'token', { text: 'a' }, id);
  await s.events.append('run-b', 'token', { text: 'b' }, id);
  return { messages: (await s.msg.byConv(id)).length, eventRows: (await s.events.latest(10)).filter(e => e.conversation_id === id).length };
}, id);
await page.reload();
const after = await page.evaluate(async id => {
  const s = await import('/js/store.mjs');
  const messages = (await s.msg.byConv(id)).length;
  await s.conv.del(id);
  return { messages, deleted: !(await s.conv.get(id)), remainingEvents: (await s.events.latest(10)).filter(e => e.conversation_id === id).length };
}, id);
console.log(JSON.stringify({ before, after }, null, 2));
if (before.messages !== 60 || before.eventRows !== 2 || after.messages !== 60 || !after.deleted || after.remainingEvents !== 0) process.exitCode = 1;
await browser.close();
