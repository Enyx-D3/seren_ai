import { extractGroundedSemantics } from './b2-grounded-semantics.mjs';

const MAX_SOURCE = 2000;
const MAX_OUTPUT = 6000;
const MAX_ITEMS = 8;
const OPERATIONS = new Set(['add', 'subtract', 'multiply', 'divide', 'compare', 'order',
  'filter', 'sum', 'count', 'sort', 'return']);

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function grounded(source, quote) {
  if (typeof quote !== 'string' || quote.length < 2 || quote.length > 300) return null;
  const offset = source.indexOf(quote);
  return offset >= 0 ? { quote, sourceOffset: offset, provenance: 'source_span',
    status: 'model_proposed_unverified' } : null;
}

export function parseStructuredInterpretation(raw, source) {
  const original = String(source || '');
  if (original.length > MAX_SOURCE) return { ok: false, error: 'source_too_long' };
  let text = String(raw || '').trim();
  if (text.length > MAX_OUTPUT) return { ok: false, error: 'output_too_long' };
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(text);
  if (fenced) text = fenced[1].trim();
  let object;
  try { object = JSON.parse(text); } catch { return { ok: false, error: 'invalid_json' }; }
  if (!plainObject(object) || Object.keys(object).sort().join(',') !== 'facts,relations,unknown')
    return { ok: false, error: 'invalid_top_level_schema' };
  if (!Array.isArray(object.facts) || object.facts.length > MAX_ITEMS ||
      !Array.isArray(object.relations) || object.relations.length > MAX_ITEMS)
    return { ok: false, error: 'invalid_array_schema' };
  const facts = [];
  for (const quote of object.facts) {
    const span = grounded(original, quote);
    if (!span) return { ok: false, error: 'ungrounded_fact' };
    facts.push({ ...span, type: 'model_fact_proposal' });
  }
  const relations = [];
  for (const item of object.relations) {
    if (!plainObject(item) || Object.keys(item).sort().join(',') !== 'operation,quote' ||
        typeof item.operation !== 'string' || !OPERATIONS.has(item.operation))
      return { ok: false, error: 'invalid_relation_schema' };
    const span = grounded(original, item.quote);
    if (!span) return { ok: false, error: 'ungrounded_relation' };
    relations.push({ ...span, type: 'model_relation_proposal', operationHint: item.operation,
      verification: 'independent_semantic_check_required' });
  }
  const unknown = object.unknown === null ? null : grounded(original, object.unknown);
  if (object.unknown !== null && !unknown) return { ok: false, error: 'ungrounded_unknown' };
  return { ok: true, value: { schemaVersion: 1, facts, relations,
    unknown: unknown ? { ...unknown, type: 'model_unknown_proposal' } : null,
    status: 'provisional', verifiedFacts: [] } };
}

export function parseSpanLines(raw, source) {
  const text = String(raw || '').trim();
  if (!text || text.length > MAX_OUTPUT || String(source || '').length > MAX_SOURCE)
    return { ok: false, error: 'invalid_span_line_length' };
  const facts = [], relations = [];
  let unknown = null, sawUnknown = false;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let match = /^FACT:\s*(.{2,300})$/i.exec(line);
    if (match) {
      const span = grounded(source, match[1]);
      if (!span || facts.length >= MAX_ITEMS) return { ok: false, error: 'ungrounded_fact' };
      facts.push({ ...span, type: 'model_fact_proposal' }); continue;
    }
    match = /^RELATION:\s*(add|subtract|multiply|divide|compare|order|filter|sum|count|sort|return)\s*\|\s*(.{2,300})$/i.exec(line);
    if (match) {
      const span = grounded(source, match[2]);
      if (!span || relations.length >= MAX_ITEMS) return { ok: false, error: 'ungrounded_relation' };
      relations.push({ ...span, type: 'model_relation_proposal', operationHint: match[1].toLowerCase(),
        verification: 'independent_semantic_check_required' }); continue;
    }
    match = /^UNKNOWN:\s*(null|.{2,300})$/i.exec(line);
    if (match && !sawUnknown) {
      sawUnknown = true;
      if (match[1].toLowerCase() !== 'null') {
        const span = grounded(source, match[1]);
        if (!span) return { ok: false, error: 'ungrounded_unknown' };
        unknown = { ...span, type: 'model_unknown_proposal' };
      }
      continue;
    }
    return { ok: false, error: 'invalid_span_line' };
  }
  if (!sawUnknown || facts.length + relations.length + (unknown ? 1 : 0) === 0)
    return { ok: false, error: 'empty_span_lines' };
  return { ok: true, value: { schemaVersion: 1, facts, relations, unknown,
    status: 'provisional', verifiedFacts: [] } };
}

export function interpretationPrompt(source, { retryError = null } = {}) {
  const text = String(source || '').slice(0, MAX_SOURCE);
  if (retryError) return `Copy exact phrases from INPUT into plain lines. Return no JSON, Markdown, or explanation. Each line must be FACT: <exact input phrase>, RELATION: <operation>|<exact input phrase>, or UNKNOWN: <exact input phrase>. Allowed operations: add, subtract, multiply, divide, compare, order, filter, sum, count, sort, return. Include one UNKNOWN line, using UNKNOWN: null if unclear. Omit facts and relations if unsure.\nINPUT:\n${text}`;
  return `Extract only exact text spans from INPUT. Return one JSON object only. No Markdown or example values.\nRequired keys: facts (array of quoted substrings), relations (array of objects with quote and operation), unknown (quoted substring or null). Allowed operations: add, subtract, multiply, divide, compare, order, filter, sum, count, sort, return. Use empty arrays when unsure.\nINPUT:\n${text}`;
}

export async function interpretProblemWithFalcon(source, category, generate, { signal, maxAttempts = 2 } = {}) {
  const lexical = extractGroundedSemantics(source, category);
  if (typeof generate !== 'function' || String(source || '').length > MAX_SOURCE)
    return { kind: 'lexical_fallback', interpretation: lexical, attempts: [], modelCalls: 0, tokens: 0 };
  const attempts = [];
  let tokens = 0;
  for (let index = 0; index < Math.max(1, Math.min(2, maxAttempts)); index++) {
    if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
    const prompt = interpretationPrompt(source, { retryError: attempts.at(-1)?.error || null });
    let result;
    try { result = await generate({ turns: [{ role: 'user', content: prompt }], maxTokens: index ? 112 : 160, signal }); }
    catch (error) {
      attempts.push({ status: 'generation_error', error: String(error.message || error).slice(0, 120) });
      break;
    }
    tokens += result.tokens || 0;
    const parsed = index ? parseSpanLines(result.text, source) : parseStructuredInterpretation(result.text, source);
    attempts.push({ status: parsed.ok ? 'schema_and_spans_valid' : 'rejected',
      format: index ? 'span_lines' : 'json', error: parsed.ok ? null : parsed.error, tokens: result.tokens || 0,
      ttftMs: result.ttftMs ?? null });
    if (parsed.ok) return { kind: 'model_grounded_provisional', interpretation: parsed.value,
      attempts, modelCalls: attempts.length, tokens };
  }
  return { kind: 'lexical_fallback', interpretation: lexical, attempts,
    modelCalls: attempts.length, tokens };
}
