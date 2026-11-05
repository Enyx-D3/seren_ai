/* CP030 experimental local-only selective retrieval.
 *
 * User-supplied text is treated as untrusted data. This module indexes bounded
 * line blocks, never executes embedded instructions, performs no I/O/network,
 * and proves only exact lexical matches relative to the supplied source bytes.
 * It is NOT a remote search engine, RAG fact checker, or general retrieval.
 */
import { Sha256 } from './sha256.mjs';

export const B2_LOCAL_RETRIEVAL_POLICY = 'b2-local-selective-retrieval-1';
const MAX_DOCUMENTS = 12;
const MAX_SOURCE_LENGTH = 32768;
const MAX_BLOCKS = 512;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,47}$/;
const VERSION = /^v([1-9][0-9]{0,5})$/;
const encoder = new TextEncoder();
const indexRegistry = new WeakMap();
const receiptRegistry = new WeakSet();

const hash = value => new Sha256().update(encoder.encode(value)).digest();
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const tokenize = input => [...String(input).toLowerCase().matchAll(/[a-z0-9]+/g)].map(m => m[0]);

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const inner of Object.values(value)) freezeDeep(inner);
    Object.freeze(value);
  }
  return value;
}

function parseVersion(value) {
  const match = VERSION.exec(value || '');
  if (!match) throw Error('invalid_source_version');
  return Number(match[1]);
}

function normalizeSources(input) {
  if (!Array.isArray(input) || !input.length || input.length > MAX_DOCUMENTS)
    throw Error('invalid_local_document_set');
  const documents = input.map(source => {
    if (!source || typeof source !== 'object' || Array.isArray(source) ||
        !IDENTIFIER.test(source.id || '') || typeof source.text !== 'string' ||
        !source.text.trim() || source.text.length > MAX_SOURCE_LENGTH)
      throw Error('invalid_local_document');
    parseVersion(source.version);
    const sha256 = hash(source.text);
    if (source.expectedSha256 !== undefined &&
        source.expectedSha256 !== sha256) throw Error('source_content_hash_mismatch');
    return { id: source.id, version: source.version, text: source.text, sha256 };
  }).sort((a, b) => cmp(a.id, b.id));
  if (new Set(documents.map(d => d.id)).size !== documents.length)
    throw Error('duplicate_source_id');
  return documents;
}

function requirePermission(permission, documents) {
  if (!permission || permission.allowLocalRead !== true ||
      !IDENTIFIER.test(permission.scopeId || '') ||
      !Array.isArray(permission.allowedSourceIds) ||
      permission.allowedSourceIds.some(id => !IDENTIFIER.test(id)) ||
      new Set(permission.allowedSourceIds).size !== permission.allowedSourceIds.length)
    throw Error('local_document_permission_denied');
  const granted = new Set(permission.allowedSourceIds);
  if (documents.some(doc => !granted.has(doc.id))) throw Error('source_not_permitted');
  return { scopeId: permission.scopeId, allowedSourceIds: [...permission.allowedSourceIds].sort(cmp) };
}

function blocksFromSources(documents) {
  const blocks = [];
  for (const doc of documents) for (const match of doc.text.matchAll(/[^\r\n]+/g)) {
    if (!match[0].trim()) continue;
    const start = match.index, end = start + match[0].length;
    const quote = doc.text.slice(start, end);
    const blockId = hash(JSON.stringify([doc.id, doc.version, doc.sha256, start, end, quote]));
    blocks.push({ blockId, sourceId: doc.id, sourceVersion: doc.version,
      sourceSha256: doc.sha256, startUtf16: start, endUtf16: end, quote });
    if (blocks.length > MAX_BLOCKS) throw Error('local_index_capacity_exceeded');
  }
  return blocks;
}

function requireIndex(index) {
  if (!index || indexRegistry.get(index) !== index.root ||
      index.policy !== B2_LOCAL_RETRIEVAL_POLICY) throw Error('untrusted_local_index');
}

function requireFreshSources(index, currentSources) {
  if (!Array.isArray(currentSources)) throw Error('fresh_source_set_required');
  const current = normalizeSources(currentSources);
  if (current.length !== index.documents.length ||
      current.some((doc, i) => doc.id !== index.documents[i].id ||
        doc.version !== index.documents[i].version ||
        doc.sha256 !== index.documents[i].sha256))
    throw Error('stale_local_source_index');
  return current;
}

function requireScope(index, permission) {
  const permit = requirePermission(permission, index.documents);
  if (permit.scopeId !== index.scopeId ||
      permit.allowedSourceIds.join('\0') !== index.allowedSourceIds.join('\0'))
    throw Error('retrieval_scope_mismatch');
}

/** Only explicitly granted in-memory local sources are admitted. */
export function createLocalSelectiveIndex(sourceDocuments, { permission } = {}) {
  const documents = normalizeSources(sourceDocuments);
  const permit = requirePermission(permission, documents);
  const blocks = blocksFromSources(documents);
  const root = hash(JSON.stringify({
    scopeId: permit.scopeId,
    allowedSourceIds: permit.allowedSourceIds,
    documents: documents.map(({ id, version, sha256 }) => ({ id, version, sha256 })),
    blockIds: blocks.map(block => block.blockId),
  }));
  const index = freezeDeep({ policy: B2_LOCAL_RETRIEVAL_POLICY,
    root, scopeId: permit.scopeId, allowedSourceIds: permit.allowedSourceIds,
    documents, blocks, provenance: 'local_user_supplied_untrusted_text',
    sourceAuthenticity: 'not_established', networkUsed: false });
  indexRegistry.set(index, root);
  return index;
}

function queryTerms(query, mode) {
  if (typeof query !== 'string' || !query.trim() || query.length > 256 ||
      !['all_terms', 'exact_phrase'].includes(mode)) throw Error('invalid_retrieval_query');
  const terms = [...new Set(tokenize(query))];
  if (!terms.length || terms.length > 12) throw Error('unsupported_retrieval_query');
  return terms;
}

function matchesBlock(quote, query, terms, mode) {
  if (mode === 'exact_phrase') return quote.toLowerCase().includes(query.trim().toLowerCase());
  const set = new Set(tokenize(quote));
  return terms.every(term => set.has(term));
}

function rankHits(a, b) {
  const diff = a.quote.length - b.quote.length;
  return diff || cmp(a.sourceId, b.sourceId) || a.startUtf16 - b.startUtf16;
}

/** Search only complete known-local blocks, with verified current source set. */
export function searchLocalSelectiveIndex(index, query, {
  permission, currentSources, mode = 'all_terms', maxHits = 5,
} = {}) {
  requireIndex(index);
  requireScope(index, permission);
  requireFreshSources(index, currentSources);
  const terms = queryTerms(query, mode);
  if (!Number.isInteger(maxHits) || maxHits < 1 || maxHits > 8)
    throw Error('invalid_retrieval_hit_budget');
  const ranked = index.blocks.filter(block => matchesBlock(block.quote, query, terms, mode))
    .sort(rankHits).slice(0, maxHits);
  const hits = ranked.map(block => ({
    ...block, matchedTerms: [...terms], matchMode: mode,
    startByte: encoder.encode(index.documents.find(d => d.id === block.sourceId)
      .text.slice(0, block.startUtf16)).length,
    endByte: encoder.encode(index.documents.find(d => d.id === block.sourceId)
      .text.slice(0, block.endUtf16)).length,
    evidenceStatus: 'exact_lexical_match_only', executable: false,
  }));
  const receipt = freezeDeep({ schemaVersion: 1, policy: B2_LOCAL_RETRIEVAL_POLICY,
    indexRoot: index.root, query, queryHash: hash(query),
    mode, scopeId: index.scopeId, hits, totalIndexedBlocks: index.blocks.length,
    status: hits.length ? 'matched' : 'no_lexical_match',
    truthScope: 'exact_source_quote_and_tokens_only',
    remoteSearch: false, networkRequests: 0, modelCalls: 0 });
  receiptRegistry.add(receipt);
  return receipt;
}

/** Separate source-byte replay; never trusts graph scoring or a copied receipt. */
export function verifyLocalSelectiveReceipt(index, receipt, {
  permission, currentSources,
} = {}) {
  try {
    requireIndex(index);
    requireScope(index, permission);
    const docs = requireFreshSources(index, currentSources);
    if (!receiptRegistry.has(receipt) || receipt.indexRoot !== index.root ||
        receipt.queryHash !== hash(receipt.query) ||
        receipt.scopeId !== index.scopeId ||
        !Array.isArray(receipt.hits)) throw Error('untrusted_retrieval_receipt');
    const terms = queryTerms(receipt.query, receipt.mode);
    const independentlyFound = [];
    for (const source of docs) for (const match of source.text.matchAll(/[^\r\n]+/g)) {
      const quote = match[0];
      if (quote.trim() && matchesBlock(quote, receipt.query, terms, receipt.mode)) {
        independentlyFound.push({ sourceId: source.id, startUtf16: match.index,
          quote, sourceSha256: source.sha256 });
      }
    }
    independentlyFound.sort(rankHits);
    for (let i = 0; i < receipt.hits.length; i++) {
      const hit = receipt.hits[i], expected = independentlyFound[i];
      if (!expected || hit.sourceId !== expected.sourceId ||
          hit.startUtf16 !== expected.startUtf16 ||
          hit.quote !== expected.quote || hit.sourceSha256 !== expected.sourceSha256 ||
          docs.find(d => d.id === hit.sourceId).text.slice(hit.startUtf16, hit.endUtf16) !== hit.quote ||
          hit.startByte !== encoder.encode(docs.find(d => d.id === hit.sourceId).text.slice(0, hit.startUtf16)).length ||
          hit.endByte !== encoder.encode(docs.find(d => d.id === hit.sourceId).text.slice(0, hit.endUtf16)).length)
        throw Error('retrieved_source_coordinate_or_rank_mismatch');
    }
    if (receipt.hits.length > independentlyFound.length ||
        receipt.status !== (receipt.hits.length ? 'matched' : 'no_lexical_match'))
      throw Error('retrieval_status_inconsistent');
    return freezeDeep({ ok: true, verification: 'independent_source_byte_and_query_replay',
      scope: receipt.truthScope, sourceAuthenticity: 'not_established',
      networkRequests: 0 });
  } catch (error) {
    return freezeDeep({ ok: false, reason: String(error.message).slice(0, 160),
      sourceAuthenticity: 'not_established' });
  }
}

/** Only source-version updates can create new roots; unchanged blocks persist. */
export function updateLocalSelectiveIndex(previous, nextSources, {
  permission, expectedRoot,
} = {}) {
  requireIndex(previous);
  requireScope(previous, permission);
  if (expectedRoot !== undefined && expectedRoot !== previous.root)
    throw Error('stale_retrieval_update_base');
  const nextDocs = normalizeSources(nextSources);
  if (nextDocs.length !== previous.documents.length ||
      nextDocs.some((doc, i) => doc.id !== previous.documents[i].id))
    throw Error('source_identity_changed');
  const changed = [];
  for (let i = 0; i < nextDocs.length; i++) {
    const old = previous.documents[i], newer = nextDocs[i];
    if (newer.sha256 !== old.sha256 && newer.version === old.version)
      throw Error('source_version_not_advanced');
    if (parseVersion(newer.version) < parseVersion(old.version))
      throw Error('source_version_regressed');
    if (newer.version !== old.version || newer.sha256 !== old.sha256) changed.push(newer.id);
  }
  if (!changed.length) return freezeDeep({ next: previous, delta: {
    beforeRoot: previous.root, afterRoot: previous.root,
    invalidatedBlockIds: [], preservedBlockIds: previous.blocks.map(b => b.blockId),
    changedSourceIds: [], proofStatus: 'unchanged', rollbackRoot: previous.root } });
  const next = createLocalSelectiveIndex(nextDocs, { permission });
  const invalidatedBlockIds = previous.blocks.filter(b => changed.includes(b.sourceId)).map(b => b.blockId);
  const preservedBlockIds = previous.blocks.filter(b => !changed.includes(b.sourceId))
    .map(b => b.blockId).filter(id => next.blocks.some(b => b.blockId === id));
  return freezeDeep({ next, delta: { beforeRoot: previous.root, afterRoot: next.root,
    changedSourceIds: changed, invalidatedBlockIds, preservedBlockIds,
    proofStatus: 'requires_fresh_independent_verification',
    rollbackRoot: previous.root } });
}
