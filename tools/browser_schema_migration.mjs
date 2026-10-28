import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/js/main.mjs', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.goto('http://127.0.0.1:8799/');
  await page.evaluate(async () => {
    const request = indexedDB.open('seren7', 2);
    const legacy = await new Promise((resolve, reject) => {
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('conversations', { keyPath: 'id' });
        db.createObjectStore('messages', { keyPath: 'id' }).createIndex('conv', 'conversation_id');
        db.createObjectStore('models', { keyPath: 'id' });
        db.createObjectStore('blobs', { keyPath: 'id' });
        db.createObjectStore('kv', { keyPath: 'k' });
        const e = db.createObjectStore('events', { keyPath: 'seq', autoIncrement: true });
        e.createIndex('request', 'request_id'); e.createIndex('kind', 'kind');
        const re = db.createObjectStore('run_events', { keyPath: 'id', autoIncrement: true });
        re.createIndex('request', 'request_id'); re.createIndex('conversation', 'conversation_id');
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle('fixture.gguf', { create: true });
    const writer = await handle.createWritable(); await writer.write(new Blob(['abc'])); await writer.close();
    await new Promise((resolve, reject) => {
      const tx = legacy.transaction(['conversations', 'messages', 'models', 'run_events'], 'readwrite');
      tx.objectStore('conversations').put({ id: 'fixture', title: 'Legacy thread', schema_version: 2, updated_at: 1 });
      for (let i = 0; i < 60; i++) tx.objectStore('messages').put({ id: 'm' + i, conversation_id: 'fixture', role: i % 2 ? 'assistant' : 'user', content: 'turn ' + i, sequence: i, schema_version: 2 });
      tx.objectStore('models').put({ id: 'falcon_instruct', file_id: 'fixture.gguf', storage: 'opfs', bytes: 3, schema_version: 2 });
      tx.objectStore('run_events').add({ request_id: 'run-a', sequence: 1, kind: 'token', conversation_id: 'fixture' });
      tx.objectStore('run_events').add({ request_id: 'run-b', sequence: 1, kind: 'token', conversation_id: 'fixture' });
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    legacy.close();
  });
  const migrated = await page.evaluate(async () => {
    const store = await import('/js/store.mjs');
    const db = await store.init();
    const needed = ['competence_profiles', 'runs', 'tool_calls', 'verifications', 'shared_states', 'state_edges', 'joint_policies', 'joint_trials', 'asset_receipts'];
    const available = needed.every(name => db.objectStoreNames.contains(name));
    const before = { version: db.version, available, messages: (await store.msg.byConv('fixture')).length,
      events: (await store.events.latest(10)).filter(e => e.conversation_id === 'fixture').length,
      modelBytes: (await store.modelFile(await store.models.get('falcon_instruct')))?.size };
    await new Promise(resolve => {
      const tx = db.transaction('conversations', 'readwrite');
      tx.objectStore('conversations').put({ id: 'aborted', title: 'Must not persist' });
      tx.onabort = resolve; tx.abort();
    });
    before.abortedWriteGone = !(await store.conv.get('aborted'));
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['runs', 'tool_calls', 'verifications', 'shared_states', 'state_edges'], 'readwrite');
      tx.objectStore('runs').put({ id: 'run-a', conversation_id: 'fixture', started_at: 1 });
      tx.objectStore('tool_calls').put({ id: 'tool-a', run_id: 'run-a' });
      tx.objectStore('verifications').put({ id: 'verify-a', run_id: 'run-a' });
      tx.objectStore('shared_states').put({ id: 'state-a', scope: 'fixture', content_identity: 'x' });
      tx.objectStore('state_edges').put({ id: 'edge-a', from_state_id: 'state-a', to_state_id: 'other' });
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    await store.conv.del('fixture');
    const empty = await Promise.all(['runs', 'tool_calls', 'verifications', 'shared_states', 'state_edges'].map(name => new Promise((resolve, reject) => {
      const request = db.transaction(name).objectStore(name).count();
      request.onsuccess = () => resolve(request.result === 0); request.onerror = () => reject(request.error);
    })));
    const after = { conversationGone: !(await store.conv.get('fixture')), messagesGone: (await store.msg.byConv('fixture')).length === 0,
      eventsGone: (await store.events.latest(10)).every(e => e.conversation_id !== 'fixture'),
      privateRecordsGone: empty.every(Boolean), globalModelPreserved: !!(await store.models.get('falcon_instruct')) };
    db.close();
    return { before, after };
  });
  await page.reload();
  const reopened = await page.evaluate(async () => {
    const store = await import('/js/store.mjs');
    const db = await store.init(); return { version: db.version, modelPreserved: !!(await store.models.get('falcon_instruct')) };
  });
  await page.evaluate(async () => {
    const store = await import('/js/store.mjs');
    (await store.init()).close();
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('seren7', 4);
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
  });
  await page.reload();
  const futureVersion = await page.evaluate(async () => {
    try { await (await import('/js/store.mjs')).init(); return 'accepted'; }
    catch (error) { return error.name; }
  });
  console.log(JSON.stringify({ migrated, reopened, futureVersion }));
  if (migrated.before.version !== 3 || !migrated.before.available || migrated.before.messages !== 60 ||
      migrated.before.events !== 2 || migrated.before.modelBytes !== 3 || !migrated.before.abortedWriteGone ||
      Object.values(migrated.after).some(value => value !== true) || reopened.version !== 3 || !reopened.modelPreserved ||
      futureVersion !== 'VersionError') process.exitCode = 1;
} finally { await browser.close(); }
