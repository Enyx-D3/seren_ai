/* CP026 Node policy regression. Worker and service-worker APIs are doubles;
 * this test does not claim physical browser/offline/model acceptance. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parseToolFabric, executeToolCall } from '../app/js/tools.mjs';
import { capabilityEnvelopeFromParsedTool, createB2ToolCapabilitySession } from '../app/js/b2-tool-capability.mjs';

const modelProposal = '<tool_call>{"name":"exact_arithmetic","arguments":{"expression":"17*19"}}</tool_call>';
const parsed = parseToolFabric(modelProposal).calls;
assert.equal(parsed.length, 1);
assert.equal(typeof parsed[0].raw, 'string', 'model parser must retain non-executable audit text');

let workerCreates = 0, workerKills = 0;
function toolWorkerDouble() {
  workerCreates++;
  let terminated = false;
  return {
    postMessage({ id, call, permissionScope }) {
      queueMicrotask(() => {
        if (!terminated) this.onmessage?.({ data: { id,
          result: executeToolCall(call, { allowLocalCompute: permissionScope === 'local_compute_only' }) } });
      });
    },
    terminate() { workerKills++; terminated = true; },
  };
}

const session = createB2ToolCapabilitySession({ allowLocalCompute: true,
  allowedTools: ['exact_arithmetic'], workerFactory: toolWorkerDouble });
const unaudited = await session.run(parsed[0]);
assert.equal(unaudited.ok, false, 'raw model text must not directly enter an executable envelope');
assert.equal(unaudited.error, 'invalid_tool_envelope');
assert.equal(workerCreates, 0);
const normalized = capabilityEnvelopeFromParsedTool(parsed[0]);
assert.deepEqual(normalized, { name: 'exact_arithmetic', arguments: { expression: '17*19' } });
assert.equal('raw' in normalized, false);
const accepted = await session.run(normalized);
assert.equal(accepted.ok, true);
assert.equal(accepted.value, '323');
assert.equal(accepted.verification, 'independently_verified_exact');
assert.equal(workerCreates, 1);
assert.equal(workerKills, 1);
assert.equal(capabilityEnvelopeFromParsedTool({ ...parsed[0], permissionScope: 'shell' }), null);
assert.equal(capabilityEnvelopeFromParsedTool({ ...parsed[0], raw: {} }), null);
assert.equal(capabilityEnvelopeFromParsedTool({ ...parsed[0], arguments: { expression: '1+1', shell: 'ls' } })?.arguments.shell, 'ls');
assert.equal((await session.run(capabilityEnvelopeFromParsedTool({ ...parsed[0],
  arguments: { expression: '1+1', shell: 'ls' } }))).error, 'argument_schema_mismatch');
assert.equal(workerCreates, 1, 'bad model arguments must not allocate another Worker');
session.close();

const scope = 'https://seren.example/preview/';
const deleted = [];
const handlers = new Map();
let online = true;
class FakeRequest {
  constructor(url, options = {}) { this.url = new URL(url, scope).href; this.method = 'GET'; this.mode = 'cors'; this.cache = options.cache; }
}
class FakeResponse {
  constructor(body, options = {}) { this.body = body; this.status = options.status || 200; this.ok = this.status >= 200 && this.status < 300; }
  clone() { return new FakeResponse(this.body, { status: this.status }); }
}
const cacheData = new Map();
function entryMap(name) {
  if (!cacheData.has(name)) cacheData.set(name, new Map());
  return cacheData.get(name);
}
function handle(name) {
  return {
    async add(req) { entryMap(name).set(new URL(req.url, scope).href, new FakeResponse('shell')); },
    async put(req, resp) { entryMap(name).set(new URL(req.url, scope).href, resp); },
    async match(req) { return entryMap(name).get(new URL(typeof req === 'string' ? req : req.url, scope).href); },
  };
}
// A different app sharing the origin must never lose its own cache on update.
entryMap('another-app-persistent').set('https://seren.example/other', new FakeResponse('other'));
entryMap('seren7-shell-v50').set('https://seren.example/old', new FakeResponse('old'));
entryMap('seren7-shell-v51').set('https://seren.example/preview/api/private', new FakeResponse('previously-cached-private-data'));
const caches = {
  async open(name) { return handle(name); },
  async keys() { return [...cacheData.keys()]; },
  async delete(name) { deleted.push(name); return cacheData.delete(name); },
  async match(req) {
    for (const name of cacheData.keys()) {
      const hit = await handle(name).match(req);
      if (hit) return hit;
    }
    return undefined;
  },
};
const swSelf = {
  registration: { scope }, location: { origin: new URL(scope).origin },
  addEventListener(name, fn) { handlers.set(name, fn); },
  async skipWaiting() {}, clients: { async claim() {} },
};
const swText = readFileSync(new URL('../app/sw.js', import.meta.url), 'utf8');
const shellCache = swText.match(/const CACHE = "(seren7-shell-v\d+)";/)?.[1];
assert.ok(shellCache, 'test must identify the service worker cache under test');
runInNewContext(swText, { self: swSelf, caches, URL, Request: FakeRequest, Response: FakeResponse,
  fetch: async req => {
    if (!online) throw new Error('network_offline');
    return new FakeResponse(`network:${req.url}`);
  }, Set, Promise, console }, { filename: 'app/sw.js' });

async function dispatch(name, request) {
  const queued = [];
  let response = null;
  handlers.get(name)({ request,
    waitUntil(p) { queued.push(Promise.resolve(p)); },
    respondWith(p) { response = Promise.resolve(p); },
  });
  const result = response ? await response : null;
  await Promise.all(queued);
  return result;
}

await dispatch('install');
await dispatch('activate');
assert.ok(cacheData.has('another-app-persistent'), 'SW must not delete unrelated cache namespaces');
assert.ok(!cacheData.has('seren7-shell-v50'), 'SW must retire its own stale shell namespace');
assert.ok(!cacheData.has('seren7-shell-v51'), 'SW must expunge its old overbroad cache');
assert.deepEqual(deleted, ['seren7-shell-v50', 'seren7-shell-v51']);

// Never intercept arbitrary GET APIs, models, cross-origin requests or
// cache-busting URLs potentially carrying private tokens.
for (const address of [
  'https://seren.example/preview/api/private?token=supersecret',
  'https://seren.example/preview/export/conversation.json',
  'https://seren.example/preview/models/Falcon.gguf',
  'https://seren.example/preview/js/main.mjs?user=private',
  'https://third-party.example/js/main.mjs',
]) {
  assert.equal(await dispatch('fetch', new FakeRequest(address)), null, `must not intercept ${address}`);
}
const shellURL = new URL('js/main.mjs', scope).href;
assert.equal((await dispatch('fetch', new FakeRequest(shellURL))).ok, true);
assert.equal(entryMap(shellCache).get(shellURL)?.body, `network:${shellURL}`);
entryMap('another-app-persistent').set(shellURL, new FakeResponse('foreign-cache-poison'));
online = false;
assert.equal((await dispatch('fetch', new FakeRequest(shellURL))).body, `network:${shellURL}`,
  'allowlisted static shell must reload offline from its own cache, not another app');
assert.equal((await dispatch('fetch', { url: new URL('thread/1', scope).href,
  method: 'GET', mode: 'navigate' })).ok, true, 'offline navigation falls back to cached shell');

console.log('CP026 tool parser -> strict capability -> Worker and SW privacy policy PASS (Node doubles only)');
