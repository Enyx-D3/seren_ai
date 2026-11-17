/* A narrow backend search adapter. Never put an API key in browser code.
 * The host must set BRAVE_SEARCH_API_KEY to enable general web results.
 */

const clean = value => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

export async function searchBrave(question, {
  key = process.env.BRAVE_SEARCH_API_KEY, fetchImpl = fetch,
} = {}) {
  const query = String(question ?? '').trim();
  if (!query || query.length > 400) return { status: 400, body: { error: 'Question must be 1–400 characters.' } };
  if (!key) return { status: 503, body: { error: 'General web search provider not configured.' } };
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', '8');
  url.searchParams.set('safesearch', 'moderate');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(url, {
      method: 'GET', signal: controller.signal,
      headers: { Accept: 'application/json', 'X-Subscription-Token': key },
    });
    if (!response.ok) return { status: 502, body: { error: 'Search provider error.' } };
    const data = await response.json();
    const results = (data.web?.results || []).slice(0, 8).map(item => ({
      title: clean(item.title).slice(0, 180),
      url: String(item.url || ''),
      excerpt: clean(item.description).slice(0, 1100),
    }));
    return { status: 200, body: { provider: 'Brave Search', results } };
  } catch {
    return { status: 502, body: { error: 'Search provider unreachable.' } };
  } finally { clearTimeout(timer); }
}
