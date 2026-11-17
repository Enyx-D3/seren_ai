/* Deterministic web research. Evidence is a search-provider excerpt, never an
 * invented answer. Brave runs behind our own server; public Wikipedia is a
 * limited, key-free fallback for static deployments and local development.
 */

const MAX_QUERY = 400;
const MAX_RESULTS = 8;
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const md = value => clean(value).replace(/([\\\[\]()<>])/g, '\\$1');

function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href.replace(/\(/g, '%28').replace(/\)/g, '%29') : null;
  } catch { return null; }
}

function normalizeResults(results, provider) {
  return (Array.isArray(results) ? results : []).slice(0, MAX_RESULTS)
    .map(result => ({
      title: clean(result.title).slice(0, 180),
      url: safeUrl(result.url),
      excerpt: clean(result.excerpt ?? result.description).slice(0, 1100),
      provider,
    }))
    .filter(result => result.title && result.url && result.excerpt);
}

async function fetchJson(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  } finally { clearTimeout(timer); }
}

export async function researchWeb(question, { fetchImpl = fetch, baseUrl = '/api/research' } = {}) {
  const query = clean(question);
  if (!query || query.length > MAX_QUERY) throw new Error('Enter a research question of 1–400 characters.');
  let results = [], provider = '', warning = '';
  try {
    const api = new URL(baseUrl, 'https://seren.invalid');
    api.searchParams.set('q', query);
    const json = await fetchJson(fetchImpl, baseUrl.startsWith('/') ? api.pathname + api.search : api.href, 10000);
    results = normalizeResults(json.results, 'Brave Search');
    if (results.length) provider = 'Brave Search';
  } catch {
    warning = 'General web search is not configured or unavailable; showing encyclopedic sources only.';
  }
  if (!results.length) {
    const url = new URL('https://en.wikipedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('generator', 'search');
    url.searchParams.set('gsrsearch', query);
    url.searchParams.set('gsrlimit', String(MAX_RESULTS));
    url.searchParams.set('prop', 'extracts|info');
    url.searchParams.set('exintro', '1');
    url.searchParams.set('explaintext', '1');
    url.searchParams.set('inprop', 'url');
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');
    try {
      const json = await fetchJson(fetchImpl, url.href, 10000);
      const pages = Object.values(json.query?.pages || {}).sort((a, b) => (a.index || 99) - (b.index || 99));
      results = normalizeResults(pages.map(page => ({
        title: page.title, url: page.fullurl, excerpt: page.extract,
      })), 'Wikipedia');
      provider = 'Wikipedia';
      if (!warning) warning = 'General web search returned no usable results; showing encyclopedic sources only.';
    } catch (error) {
      return {
        status: 'unavailable', via: 'Search unavailable', sourceCount: 0, evidence: [],
        text: '## Smart Research — search unavailable\n\nCould not retrieve live sources. ' +
          'Check your connection or configure `BRAVE_SEARCH_API_KEY` on the server. ' +
          'No factual answer is claimed and no source has been verified.',
      };
    }
  }
  if (!results.length) return {
    status: 'no_results', via: provider || 'Web search', sourceCount: 0, evidence: [],
    text: `## Smart Research — no evidence found\n\nNo usable live source excerpts were returned. ` +
      `Try a more specific question. No answer is claimed.`,
  };
  const bullets = results.map((r, i) =>
    `${i + 1}. **${md(r.title)}** — ${md(r.excerpt)}\n   [Source ${i + 1}](${r.url})`
  );
  return {
    status: 'live_sources', via: provider + ' · deterministic evidence extraction',
    sourceCount: results.length,
    evidence: results.map((r, i) => ({ ...r, sourceIndex: i + 1 })),
    text: `## Smart Research — retrieved evidence\n\n${warning ? `_${warning}_\n\n` : ''}` +
      bullets.join('\n\n') + '\n\n' +
      '_These are live source excerpts, not a synthesized or independently verified answer. ' +
      'Open the linked sources to confirm context, date, and accuracy._',
  };
}
