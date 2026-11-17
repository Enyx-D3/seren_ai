/* Seren-7 V1 source-bounded extractive writer.
 * No model calls, internet requests, or invented source statements.
 * This is an initial measurable baseline, NOT a claim of perfect summarization.
 */

const STOP = new Set(('a an and are as at be been but by can could did do does for from had has have ' +
  'how i if in into is it its may more most not of on or our shall should so such than that the their ' +
  'them there these they this those through to was were what when where which while who why will with would ' +
  'you your about also all each any some many only after before one two three').split(' '));

const WORDS = /[\p{L}\p{N}]+/gu;
const normalize = text => String(text).replace(/\s+/g, ' ').trim();
const words = text => (normalize(text).toLowerCase().match(WORDS) || [])
  .filter(word => word.length >= 3 && !STOP.has(word));

function sourceSentences(source) {
  const candidates = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Sentence breaks require whitespace/end-of-line, preserving decimal dots.
    const ends = [];
    for (const match of line.matchAll(/[.!?]+(?=\s|$)/g)) ends.push(match.index + match[0].length);
    ends.push(line.length);
    let start = 0;
    for (const end of ends) {
      const original = line.slice(start, end);
      const content = original.trim();
      const sourceStart = start + (original.length - original.trimStart().length);
      start = end;
      if (content.length < 24 || words(content).length < 4) continue;
      candidates.push({ text: content, line: i + 1, offset: offset + sourceStart,
        terms: [...new Set(words(content))] });
    }
    offset += line.length + 1;
  }
  const seen = new Set();
  return candidates.filter(s => { const key = s.text.toLowerCase();
    if (seen.has(key)) return false; seen.add(key); return true; });
}

function overlap(a, b) {
  const A = new Set(a.terms), B = new Set(b.terms);
  let shared = 0;
  for (const x of A) if (B.has(x)) shared++;
  return shared / Math.max(1, A.size + B.size - shared);
}

function rank(source, maxItems) {
  const candidates = sourceSentences(source);
  const df = new Map();
  for (const c of candidates) for (const t of c.terms) df.set(t, (df.get(t) || 0) + 1);
  const n = candidates.length;
  candidates.forEach((c, index) => {
    const distinctiveness = c.terms.reduce((sum, t) => sum + Math.log(1 + n / (df.get(t) || 1)), 0);
    const sized = distinctiveness / Math.sqrt(Math.max(4, c.terms.length));
    const sourceOrder = 0.28 / (1 + index / 6);
    const quantitative = /\d/.test(c.text) ? 0.22 : 0;
    c.score = sized + sourceOrder + quantitative;
  });
  const chosen = [];
  while (chosen.length < Math.min(maxItems, n)) {
    let best = null, bestScore = -Infinity;
    for (const c of candidates) {
      if (chosen.includes(c)) continue;
      const noveltyPenalty = chosen.length ? Math.max(...chosen.map(s => overlap(c, s))) * 3 : 0;
      const score = c.score - noveltyPenalty;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (!best) break;
    chosen.push(best);
  }
  return { selected: chosen.sort((a, b) => a.offset - b.offset), candidates };
}

export function produceDeterministicV1(mode, input, { detailed = false } = {}) {
  const source = String(input || '').replace(/\r\n?/g, '\n').trim();
  if (source.length > 500_000) throw new Error('Text exceeds the 500,000-character V1 limit. Split the document into parts.');
  if (!['summary', 'report'].includes(mode)) throw new Error('Unknown deterministic V1 mode');
  if (source.length < 80) return {
    text: 'Please paste at least 80 characters of source text to create a grounded ' +
      (mode === 'summary' ? 'summary.' : 'report.') + ' This mode never invents missing facts.',
    via: 'Source required', status: 'needs_source', evidence: [], sourceCount: 0,
  };
  const count = mode === 'summary' ? detailed ? 8 : 4 : detailed ? 13 : 8;
  const { selected, candidates } = rank(source, count);
  if (!selected.length) return { text: 'No sufficiently informative complete sentences were found in the supplied text.',
    via: 'Insufficient source', status: 'needs_source', evidence: [], sourceCount: 0 };
  const bullets = items => items.map(c => `- ${c.text} [Source line ${c.line}]`).join('\n');
  const numerical = selected.filter(c => /\d/.test(c.text));
  const text = mode === 'summary'
    ? `## Source-grounded summary\n\n${bullets(selected)}\n\n` +
      `_Extractive V1 baseline: ${selected.length} of ${candidates.length} unique source sentences selected. ` +
      'All statements are drawn from the supplied text; relevance and completeness are not independently verified._'
    : `# Evidence-based report (V1 draft)\n\n` +
      `## Executive summary\n\n${bullets(selected.slice(0, Math.min(3, selected.length)))}\n\n` +
      `## Main findings\n\n${bullets(selected)}\n\n` +
      `## Quantitative evidence\n\n${numerical.length ? bullets(numerical) : 'No numerical statements were selected from the supplied source.'}\n\n` +
      `## Scope and limitations\n\nThis draft uses only the supplied text. ` +
      `It does not independently confirm the source's claims or add outside research. ` +
      `The cited line numbers refer to the pasted document.\n\n` +
      `_Extractive V1 baseline: ${selected.length} of ${candidates.length} unique source sentences selected._`;
  return { text, via: 'Deterministic extractive ' + mode + ' · source-bounded', status: 'source_bounded',
    evidence: selected.map(({ text, line, offset }) => ({ text, line, offset })), sourceCount: candidates.length };
}
