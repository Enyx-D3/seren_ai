import assert from 'node:assert/strict';
import { researchWeb } from '../app/js/web-research.mjs';
import { searchBrave } from '../app/server/search-provider.mjs';
import { GET as deployedSearch } from '../app/api/research.mjs';

const jsonResponse = (body, status = 200) => ({ ok: status >= 200 && status < 300, status,
  async json() { return body; } });

assert.equal((await searchBrave('a valid question', { key: '' })).status, 503);
assert.equal((await searchBrave('', { key: 'test' })).status, 400);
const invalidRoute = await deployedSearch(new Request('https://example.org/api/research?q='));
assert.equal(invalidRoute.status, 400);
assert.equal(invalidRoute.headers.get('cache-control'), 'no-store');
let observedUrl = '', observedKey = '';
const backend = await searchBrave('What is science?', { key: 'fake-test-key',
  fetchImpl: async (url, opts) => {
    observedUrl = url.href; observedKey = opts.headers['X-Subscription-Token'];
    return jsonResponse({ web: { results: [{ title: 'Science <tag>',
      url: 'https://example.org/science', description: 'Science is evidence based.' }] } });
  },
});
assert.equal(backend.status, 200);
assert.match(observedUrl, /^https:\/\/api\.search\.brave\.com\/res\/v1\/web\/search/);
assert.equal(observedKey, 'fake-test-key');
assert.equal(backend.body.results[0].title, 'Science');
assert.doesNotMatch(JSON.stringify(backend.body), /fake-test-key/);

const live = await researchWeb('What is science?', {
  fetchImpl: async url => {
    assert.match(url, /^\/api\/research\?q=/);
    return jsonResponse({ results: [{ title: 'Evidence page', url: 'https://example.org/evidence',
      excerpt: 'A specific sourced statement returned from the live provider.' },
    { title: 'Blocked link', url: 'javascript:alert(1)', excerpt: 'Unsafe link' }] });
  },
});
assert.equal(live.status, 'live_sources');
assert.equal(live.sourceCount, 1);
assert.match(live.text, /\[Source 1\]\(https:\/\/example.org\/evidence\)/);
assert.doesNotMatch(live.text, /Unsafe link/);
assert.match(live.text, /not a synthesized or independently verified answer/);

let fallbackCalls = 0;
const limited = await researchWeb('What is science?', {
  fetchImpl: async url => {
    fallbackCalls++;
    if (url.startsWith('/api/research')) return jsonResponse({ error: 'not configured' }, 503);
    assert.match(url, /^https:\/\/en\.wikipedia\.org\/w\/api\.php\?/);
    assert.match(url, /origin=\*/);
    return jsonResponse({ query: { pages: { 10: { index: 1, title: 'Science',
      fullurl: 'https://en.wikipedia.org/wiki/Science',
      extract: 'Science is a systematic discipline that builds and organizes knowledge.' } } } });
  },
});
assert.equal(fallbackCalls, 2);
assert.equal(limited.status, 'live_sources');
assert.equal(limited.via.split(' · ')[0], 'Wikipedia');
assert.match(limited.text, /encyclopedic sources only/);

const blocked = await researchWeb('What is science?', {
  fetchImpl: async () => { throw new Error('offline'); },
});
assert.equal(blocked.status, 'unavailable');
assert.equal(blocked.sourceCount, 0);
assert.doesNotMatch(blocked.text, /Science is/);
console.log('web research selftest: PASS (configured search, credentials isolation, wiki fallback, offline honesty, link filtering)');
