/* Vercel Node.js function for deployed general web search.
 * Configure BRAVE_SEARCH_API_KEY in the server environment, never the client.
 */
import { searchBrave } from '../server/search-provider.mjs';

export async function GET(request) {
  const question = new URL(request.url).searchParams.get('q');
  const { status, body } = await searchBrave(question);
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
