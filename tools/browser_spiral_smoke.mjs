import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const expression = Array(6).fill('(12345678901234567/98765432109876543)').join('*');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage(), errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:8799/')) external.push(request.url()); });
  await page.goto('http://127.0.0.1:8799/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent.includes('Start chatting'));
  await page.context().setOffline(true);
  async function ask() {
    const before = await page.locator('.msg-ai').count();
    const started = performance.now();
    await page.locator('#prompt').fill(expression);
    await page.locator('#sendBtn').click();
    await page.waitForFunction(previous => {
      const rows = [...document.querySelectorAll('.msg-ai')];
      return rows.length > previous && rows.at(-1).querySelector('.m-status')?.textContent !== 'Writing locally…';
    }, before);
    return { answer: await page.locator('.msg-ai .prose').last().innerText(),
      via: await page.locator('.msg-ai .m-status').last().innerText(),
      elapsedMs: Math.round(performance.now() - started) };
  }
  const first = await ask();
  const second = await ask();
  const evidence = await page.evaluate(async () => {
    const { conv, msg } = await import('/js/store.mjs');
    const { replayHeartbeat } = await import('/js/spiral.mjs');
    const conversation = (await conv.list())[0];
    const messages = await msg.byConv(conversation.id);
    const answers = messages.filter(row => row.role === 'assistant');
    return { conversationId: conversation.id, stateIds: answers.map(row => row.meta?.shared_state_id),
      replay: answers.map(row => replayHeartbeat(row.meta?.spiral_deltas || [])) };
  });
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.msg-ai').length >= 2);
  const afterReload = await ask();
  const benchmark = await page.evaluate(async source => {
    const { exactArithmetic } = await import('/js/exact-arithmetic.mjs');
    const { ExactSpiral } = await import('/js/spiral.mjs');
    const { conv } = await import('/js/store.mjs');
    const scope = (await conv.list())[0].id;
    const loops = 100;
    let started = performance.now();
    for (let i = 0; i < loops; i++) exactArithmetic(source);
    const baselineMs = performance.now() - started;
    const spiral = new ExactSpiral();
    await spiral.solve(source, { scope });
    started = performance.now();
    for (let i = 0; i < loops; i++) await spiral.solve(source, { scope });
    await spiral.flush();
    const reusedMs = performance.now() - started;
    return { loops, baselineMs, reusedMs, ratio: reusedMs / baselineMs };
  }, expression);
  await page.evaluate(async source => {
    const { conv } = await import('/js/store.mjs');
    const scope = (await conv.list())[0].id;
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('seren7', 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('shared_states', 'readwrite');
      const store = transaction.objectStore('shared_states');
      const request = store.getAll();
      request.onsuccess = () => { const row = request.result.find(item => item.confidence_kind === 'exact' && item.scope === scope && item.canonical_expression === source); row.value = 'corrupted'; store.put(row); };
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  }, expression);
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.msg-ai').length >= 3);
  const repaired = await ask();
  const repairEvidence = await page.evaluate(async () => {
    const { conv, msg } = await import('/js/store.mjs');
    const conversation = (await conv.list())[0];
    const answers = (await msg.byConv(conversation.id)).filter(row => row.role === 'assistant');
    const last = answers.at(-1);
    return { repairedDelta: last.meta?.spiral_deltas?.some(delta => delta.kind === 'repair'),
      stateId: last.meta?.shared_state_id, conversationId: conversation.id };
  });
  await page.evaluate(async () => {
    const { conv, msg } = await import('/js/store.mjs');
    const conversation = (await conv.list())[0];
    const first = (await msg.byConv(conversation.id)).find(row => row.role === 'assistant');
    const deltas = structuredClone(first.meta.spiral_deltas);
    deltas[1].payload.count = 99;
    await msg.update(first.id, { content: 'tampered', meta: { ...first.meta, spiral_deltas: deltas } });
  });
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.msg-ai').length >= 4);
  const replayRepair = await page.evaluate(async () => {
    const { conv, msg } = await import('/js/store.mjs');
    const { replayHeartbeat } = await import('/js/spiral.mjs');
    const conversation = (await conv.list())[0];
    const first = (await msg.byConv(conversation.id)).find(row => row.role === 'assistant');
    return { answer: first.content, repaired: first.meta.replay_repaired,
      replay: replayHeartbeat(first.meta.spiral_deltas) };
  });
  const deletion = await page.evaluate(async () => {
    const { conv } = await import('/js/store.mjs');
    const { ExactSpiral } = await import('/js/spiral.mjs');
    const conversation = (await conv.list())[0], scope = conversation.id;
    const engine = new ExactSpiral();
    await engine.solve('2+1', { scope, forceReuse: true });
    await engine.solve('1+2', { scope, forceReuse: true });
    await engine.flush();
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('seren7', 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const all = name => new Promise((resolve, reject) => {
      const request = db.transaction(name).objectStore(name).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const beforeStates = (await all('shared_states')).filter(row => row.scope === scope);
    const beforeEdges = await all('state_edges');
    await conv.del(scope);
    return { beforeStates: beforeStates.length, beforeEdges: beforeEdges.length,
      afterStates: (await all('shared_states')).filter(row => row.scope === scope).length,
      afterEdges: (await all('state_edges')).length };
  });
  const expected = await page.evaluate(async source => (await import('/js/exact-arithmetic.mjs')).exactArithmetic(source).text, expression);
  const passed = [first, second, afterReload].every(row => row.answer === expected) &&
    first.via === 'verified exact arithmetic' && second.via === 'verified shared state' &&
    afterReload.via === 'verified shared state' && evidence.stateIds[0] === evidence.stateIds[1] &&
    repaired.answer === expected && repaired.via === 'verified exact arithmetic' && repairEvidence.repairedDelta &&
    replayRepair.answer === expected && replayRepair.repaired && replayRepair.replay.ok &&
    deletion.beforeStates >= 3 && deletion.beforeEdges >= 1 && deletion.afterStates === 0 && deletion.afterEdges === 0 &&
    evidence.replay.every(row => row.ok && row.value === expected) && !errors.length && !external.length;
  const report = { expression, expected, first, second, afterReload, repaired, repairEvidence, replayRepair, deletion, evidence, benchmark, errors, external, passed,
    environment: 'macOS arm64 / isolated Playwright Chromium / browser offline / IndexedDB exact state / no model needed' };
  const output = `evidence/spiral-browser-${new Date().toISOString().slice(0, 10)}.json`;
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed, first, second, afterReload, repaired, repairEvidence, replayRepair, deletion, benchmark, errors, external, output }, null, 2));
  if (!passed) process.exitCode = 1;
} finally { await browser.close(); }
