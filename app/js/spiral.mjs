/* CP009 bounded exact-state Spiral. Only verified deterministic arithmetic may
   be reused. Approximate similarity and model prose never enter this cache. */
import { Sha256 } from './sha256.mjs';
import { exactArithmetic } from './exact-arithmetic.mjs';
import { sharedStates } from './store.mjs';

const POLICY = 'spiral-exact-1';
const ENCODING = 1;
const MIN_REUSE_LENGTH = 160;
const encoder = new TextEncoder();
const hash = value => new Sha256().update(encoder.encode(value)).digest();
// Heartbeat checksum detects accidental replay damage; it is not a signature.
const checksum = value => {
  let number = 2166136261;
  for (let i = 0; i < value.length; i++) number = Math.imul(number ^ value.charCodeAt(i), 16777619);
  return (number >>> 0).toString(16).padStart(8, '0');
};

function validRow(row, scope) {
  if (!row || row.scope !== scope || row.confidence_kind !== 'exact' ||
      typeof row.canonical_expression !== 'string' || typeof row.value !== 'string') return false;
  const identity = hash(`arith:${ENCODING}:${row.canonical_expression}`);
  return row.content_identity === identity &&
    row.id === hash(`${scope}\0${identity}`) &&
    row.value_digest === hash(`${row.canonical_expression}\0${row.value}`);
}

export function canonicalArithmetic(source) {
  if (typeof source !== 'string' || !source || source.length > 256) throw new Error('invalid arithmetic state');
  const expression = source.trim();
  // Exactly two unsigned decimal atoms: sorting is justified by integer/rational
  // commutativity. Every other expression uses exact text identity only.
  const match = /^(\d+(?:\.\d+)?)\s*([+*])\s*(\d+(?:\.\d+)?)$/.exec(expression);
  if (!match) return { canonical: expression, proof: 'exact_text_identity' };
  const [left, right] = [match[1], match[3]].sort();
  return { canonical: `${left}${match[2]}${right}`, proof: match[2] === '+' ? 'commutative_add_v1' : 'commutative_multiply_v1' };
}

export function isReuseCandidate(expression) {
  return typeof expression === 'string' && expression.length >= MIN_REUSE_LENGTH &&
    (expression.match(/\//g) || []).length >= 4;
}

export function planExactDependencies(expression) {
  if (typeof expression !== 'string') return [];
  const factors = expression.match(/\(\d+(?:\.\d+)?\/\d+(?:\.\d+)?\)/g) || [];
  return factors.length >= 4 && factors.length <= 8 && factors.join('*') === expression
    ? factors.map(factor => factor.slice(1, -1)) : [];
}

export function replayHeartbeat(deltas) {
  if (!Array.isArray(deltas) || deltas.length > 5)
    return { ok: false, repair_from_sequence: 1, error: 'invalid heartbeat length' };
  let previous = 'genesis', expected = 1, result = null;
  for (const delta of deltas) {
    if (!delta || typeof delta.kind !== 'string' || !delta.payload || typeof delta.payload !== 'object')
      return { ok: false, repair_from_sequence: expected, error: 'invalid heartbeat record' };
    if (delta.sequence !== expected || delta.previous_hash !== previous ||
        delta.hash !== checksum(`${delta.sequence}|${previous}|${delta.kind}|${JSON.stringify(delta.payload)}`))
      return { ok: false, repair_from_sequence: expected, error: 'heartbeat sequence or content mismatch' };
    if (delta.kind === 'verified_result' || delta.kind === 'reused_result') result = delta.payload.value;
    previous = delta.hash; expected++;
  }
  return result === null ? { ok: false, repair_from_sequence: expected, error: 'missing verified result' }
    : { ok: true, value: result, final_hash: previous, sequences: expected - 1 };
}

export function repairHeartbeat(expression, deltas, displayedValue = null) {
  const expected = exactArithmetic(expression).text;
  const replay = replayHeartbeat(deltas);
  if (replay.ok && replay.value === expected && (displayedValue === null || displayedValue === expected))
    return { repaired: false, value: expected, deltas };
  const records = [];
  for (const [kind, payload] of [
    ['hypothesis', { expression, policy: POLICY }],
    ['repair', { reason: replay.ok ? 'decoded_result_mismatch' : replay.error,
      from_sequence: replay.repair_from_sequence || null }],
    ['verified_result', { value: expected, route: 'recomputed_after_replay_failure' }],
  ]) {
    const sequence = records.length + 1, previous_hash = records.at(-1)?.hash || 'genesis';
    records.push({ schema_version: 1, sequence, previous_hash, kind, payload,
      hash: checksum(`${sequence}|${previous_hash}|${kind}|${JSON.stringify(payload)}`) });
  }
  return { repaired: true, value: expected, deltas: records };
}

export class ExactSpiral {
  constructor({ storage = sharedStates } = {}) {
    this.storage = storage;
    this.memory = new Map();
    this.dirty = new Map();
    this.pending = new Set();
    this.corrupt = new Set();
    this.warmed = new Set();
    this.linked = new Set();
  }
  async warm(scope) {
    if (typeof scope !== 'string' || !scope || this.warmed.has(scope)) return;
    if (typeof this.storage.byScope !== 'function') return;
    const rows = await this.storage.byScope(scope);
    for (const row of rows) {
      if (row?.confidence_kind !== 'exact') continue;
      const key = `${scope}\0${row.canonical_expression}`;
      if (validRow(row, scope)) { if (!this.memory.has(key)) this.memory.set(key, row); }
      else this.corrupt.add(key);
    }
    this.warmed.add(scope);
  }
  async flush({ onlyPending = false } = {}) {
    const entries = [...this.dirty].filter(([id]) => !onlyPending || this.pending.has(id));
    for (const [id] of entries) this.dirty.delete(id);
    const failures = [];
    await Promise.all(entries.map(async ([id, count]) => {
      const row = [...this.memory.values()].find(candidate => candidate.id === id);
      if (!row) return;
      try {
        if (this.pending.has(id)) {
          await this.storage.put({ ...row, reuse_count: (row.reuse_count || 0) + count, updated_at: Date.now() });
          this.pending.delete(id);
        } else if (typeof this.storage.incrementReuse === 'function') {
          await this.storage.incrementReuse(id, count);
        } else {
          await this.storage.put({ ...row, reuse_count: (row.reuse_count || 0) + count, updated_at: Date.now() });
        }
      } catch (error) { failures.push([id, count, error]); }
    }));
    for (const [id, count] of failures) this.dirty.set(id, (this.dirty.get(id) || 0) + count);
    if (failures.length) throw failures[0][2];
  }
  clear(scope) {
    for (const [key, row] of this.memory) {
      if (scope && !key.startsWith(`${scope}\0`)) continue;
      this.memory.delete(key); this.pending.delete(row.id); this.dirty.delete(row.id); this.corrupt.delete(key);
    }
    if (scope) this.warmed.delete(scope); else this.warmed.clear();
  }
  async solve(expression, { scope, forceReuse = false } = {}) {
    if (typeof scope !== 'string' || !scope || scope.length > 200) throw new Error('state scope required');
    const { canonical, proof } = canonicalArithmetic(expression);
    const deltas = [];
    const step = (kind, payload) => {
      if (deltas.length >= 5) throw new Error('spiral step budget exceeded');
      const sequence = deltas.length + 1, previous_hash = deltas.at(-1)?.hash || 'genesis';
      deltas.push({ schema_version: 1, sequence, previous_hash, kind, payload,
        hash: checksum(`${sequence}|${previous_hash}|${kind}|${JSON.stringify(payload)}`) });
    };
    step('hypothesis', { canonical, proof, policy: POLICY });
    if (!forceReuse && !isReuseCandidate(expression)) {
      const value = exactArithmetic(expression).text;
      step('verified_result', { value, route: 'baseline_short_expression' });
      return { value, route: 'baseline_short_expression', reused: false, deltas };
    }
    const identity = hash(`arith:${ENCODING}:${canonical}`), key = `${scope}\0${canonical}`;
    let row = this.memory.get(key);
    let corrupted = this.corrupt.has(key);
    if (!row && !this.warmed.has(scope)) {
      if (typeof this.storage.byScope === 'function') {
        await this.warm(scope);
        row = this.memory.get(key) || null;
        corrupted = this.corrupt.has(key);
      } else {
        const found = await this.storage.find(identity, scope);
        row = found.find(candidate => validRow(candidate, scope)) || null;
        corrupted = found.length > 0 && !row;
        if (row) this.memory.set(key, row);
      }
    }
    if (row) {
      if (expression !== canonical && proof !== 'exact_text_identity') await this.#linkVariant(expression, scope, row, proof);
      this.dirty.set(row.id, (this.dirty.get(row.id) || 0) + 1);
      step('reused_result', { value: row.value, state_id: row.id, proof });
      return { value: row.value, route: 'verified_shared_state', reused: true, stateId: row.id, deltas };
    }
    const factors = planExactDependencies(canonical);
    let candidate = null;
    if (factors.length) {
      const ready = factors.map(factor => exactArithmetic(factor).text);
      candidate = exactArithmetic(ready.map(value => `(${value})`).join('*')).text;
      step('dependencies_ready', { count: ready.length, max_branches: 8 });
    }
    const value = exactArithmetic(canonical).text;
    if (candidate !== null && candidate !== value) throw new Error('dependency residual mismatch');
    step('residual', { zero: true, method: candidate === null ? 'dual_parser_exact' : 'factor_aggregation_vs_full_expression' });
    if (expression !== canonical && exactArithmetic(expression).text !== value)
      throw new Error('equivalence proof failed');
    row = { id: hash(`${scope}\0${identity}`), schema_version: 3,
      canonical_encoding_version: ENCODING, content_identity: identity, scope,
      canonical_expression: canonical, confidence_kind: 'exact', verification_id: 'two_parser_exact_v1',
      value, value_digest: hash(`${canonical}\0${value}`), reuse_count: 0,
      created_at: Date.now(), updated_at: Date.now() };
    this.memory.set(key, row); this.pending.add(row.id);
    if (expression !== canonical && proof !== 'exact_text_identity') await this.#linkVariant(expression, scope, row, proof);
    if (corrupted) {
      await this.storage.put(row); this.pending.delete(row.id);
      this.corrupt.delete(key);
      step('repair', { reason: 'invalid_shared_state_receipt', state_id: row.id });
    }
    step('verified_result', { value, state_id: row.id, route: corrupted ? 'computed_and_repaired' : 'computed_and_cached' });
    return { value, route: corrupted ? 'computed_and_repaired' : 'computed_and_cached', reused: false, stateId: row.id, deltas };
  }
  async #linkVariant(expression, scope, target, proof) {
    if (!this.storage.linkEquivalent) return;
    const identity = hash(`arith:${ENCODING}:${expression}`);
    const source = { id: hash(`${scope}\0${identity}`), schema_version: 3,
      canonical_encoding_version: ENCODING, content_identity: identity, scope,
      canonical_expression: expression, confidence_kind: 'equivalent',
      proof_ref: proof, target_state_id: target.id, created_at: Date.now(), updated_at: Date.now() };
    if (this.linked.has(source.id)) return;
    await this.storage.put(source);
    await this.storage.linkEquivalent(source, target, proof);
    this.linked.add(source.id);
  }
}
