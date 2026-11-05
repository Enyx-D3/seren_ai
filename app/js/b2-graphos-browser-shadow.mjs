/* Browser-safe, bounded GraphOS CP004 transition subset. Research-only.
   No native Python runner, no network access, no active Seren chat routing.
   Mirrors snapshot/delta/residual/dependency semantics, not all GraphOS views. */
import { Sha256 } from './sha256.mjs';

export const BROWSER_GRAPHOS_POLICY = 'mrs-graphos-cp004-browser-shadow-1';
const SUPERFAMILIES = new Set('REALITY HYPOTHESIS RESIDUAL EXPERIMENT PARAMETER DECISION KNOWLEDGE SEARCH UNIVERSAL_MEANING DISTRIBUTED_SYSTEMS COMPUTE STREAMING PATTERN_DISCOVERY TEMPORAL META_GRAPHS REASONING'.split(' '));
const FUNCTIONS = new Set('RECORD PREDICT COMPARE FILTER PERTURB MAGNIFY VERIFY CONTRADICT GENERALIZE DECIDE'.split(' '));
const LENSES = new Set('LITERAL ABSTRACT SKEPTICAL RESIDUAL'.split(' '));
const EVIDENCE = new Set('OBSERVED VERIFIED INFERRED HYPOTHESIS UNKNOWN'.split(' '));
const RELATIONS = new Set('depends_on feeds requires next gates allows produces routes'.split(' '));
const ID = /^[a-zA-Z0-9][a-zA-Z0-9:_.>\/-]{0,127}$/;
const encoder = new TextEncoder();
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const hash = value => new Sha256().update(encoder.encode(value)).digest();

function jsonValue(value, depth = 0) {
  if (depth > 12) throw new Error('graph_value_too_deep');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string' && value.length <= 2048) return value;
  // CP004 emits a different canonical spelling for 1.0/-0.0/floating values.
  // The currently proved parity contract is exact integer/string evidence;
  // admit no float payload until an independently tested float serializer exists.
  if (typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0)) return value;
  if (Array.isArray(value)) {
    if (value.length > 256) throw new Error('graph_array_too_large');
    return value.map(item => jsonValue(item, depth + 1));
  }
  if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    const keys = Object.keys(value);
    if (keys.length > 64 || keys.some(key => key.length > 128 ||
      ['__proto__', 'constructor', 'prototype'].includes(key)))
      throw new Error('unsafe_graph_mapping');
    return Object.fromEntries(keys.map(key => [key, jsonValue(value[key], depth + 1)]));
  }
  throw new Error('non_json_graph_value');
}

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

// Python GraphOS CP004 canonical JSON uses sorted keys, compact separators and
// UTF-8. Compare by code points (not JS UTF-16) to match Python sort_keys.
function codePointCompare(a, b) {
  const x = Array.from(a, ch => ch.codePointAt(0)), y = Array.from(b, ch => ch.codePointAt(0));
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort(codePointCompare)
    .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function coordinate(input = { superfamily: 'REASONING', function: 'VERIFY', lens: 'LITERAL' }) {
  const coord = jsonValue(input);
  if (!SUPERFAMILIES.has(coord.superfamily) || !FUNCTIONS.has(coord.function) || !LENSES.has(coord.lens) ||
      (coord.canonical_id != null && (typeof coord.canonical_id !== 'string' || !coord.canonical_id.trim())))
    throw new Error('invalid_graph_coordinate');
  return { superfamily: coord.superfamily, function: coord.function, lens: coord.lens,
    canonical_id: coord.canonical_id ?? null };
}

function record(input, edge = false) {
  const row = jsonValue(input);
  if (typeof row.id !== 'string' || !ID.test(row.id) ||
      (edge && (!ID.test(row.src || '') || !ID.test(row.dst || '') || typeof row.relation !== 'string')) ||
      (!edge && typeof row.label !== 'string') || !EVIDENCE.has(row.evidence_class ?? 'UNKNOWN') ||
      !Array.isArray(row.source_refs ?? []) || !(row.source_refs ?? []).every(ref => typeof ref === 'string'))
    throw new Error('invalid_graph_record');
  if (edge) return { id: row.id, src: row.src, dst: row.dst, relation: row.relation,
    attrs: jsonValue(row.attrs ?? {}), evidence_class: row.evidence_class ?? 'UNKNOWN',
    source_refs: [...(row.source_refs ?? [])] };
  return { id: row.id, label: row.label, kind: row.kind ?? 'state',
    attrs: jsonValue(row.attrs ?? {}), evidence_class: row.evidence_class ?? 'UNKNOWN',
    source_refs: [...(row.source_refs ?? [])] };
}

export function createBrowserGraphSnapshot({ frame_id, coordinate: coord, nodes, edges,
  parent_root = null, metadata = {} }) {
  if (typeof frame_id !== 'string' || !frame_id || frame_id.length > 128 ||
      !Array.isArray(nodes) || nodes.length > 256 || !Array.isArray(edges) || edges.length > 1024 ||
      (parent_root !== null && (typeof parent_root !== 'string' || !/^[a-f0-9]{64}$/.test(parent_root))))
    throw new Error('invalid_or_unbounded_snapshot');
  const n = nodes.map(row => record(row)).sort((a, b) => cmp(a.id, b.id));
  const e = edges.map(row => record(row, true)).sort((a, b) => cmp(a.id, b.id));
  const ids = new Set(n.map(row => row.id));
  if (ids.size !== n.length || new Set(e.map(row => row.id)).size !== e.length ||
      e.some(row => !ids.has(row.src) || !ids.has(row.dst))) throw new Error('invalid_graph_references');
  const snapshot = { frame_id, coordinate: coordinate(coord), nodes: n, edges: e, parent_root,
    metadata: jsonValue(metadata) };
  const root = hash(canonical(snapshot));
  return freezeDeep({ ...snapshot, root, policy: BROWSER_GRAPHOS_POLICY });
}

export function browserDependencyBlastRadius(snapshot, startIds, relations = RELATIONS) {
  if (!Array.isArray(startIds) || startIds.length > 256 ||
      startIds.some(id => !snapshot.nodes.some(row => row.id === id))) throw new Error('blast_radius_unknown_start');
  const rels = new Set(Array.from(relations, value => String(value).toLowerCase()));
  const adj = new Map();
  for (const edge of snapshot.edges) if (rels.has(edge.relation.toLowerCase())) {
    if (!adj.has(edge.src)) adj.set(edge.src, []);
    adj.get(edge.src).push(edge);
  }
  const visited = new Set(startIds), used = new Set(), queue = [...startIds];
  for (let i = 0; i < queue.length; i++) {
    const u = queue[i];
    for (const edge of (adj.get(u) ?? []).sort((a, b) => cmp(a.dst, b.dst) || cmp(a.id, b.id))) {
      used.add(edge.id);
      if (!visited.has(edge.dst)) { visited.add(edge.dst); queue.push(edge.dst); }
    }
  }
  return { start: [...new Set(startIds)].sort(), affected_nodes: [...visited].filter(id => !startIds.includes(id)).sort(),
    affected_edges: [...used].sort(), affected_count: visited.size - new Set(startIds).size };
}

export function applyBrowserGraphDelta(base, delta) {
  if (delta?.base_root !== base.root) throw new Error('stale_graph_base');
  if (!Array.isArray(delta.operations) || delta.operations.length > 1024) throw new Error('invalid_graph_delta');
  const nodes = new Map(base.nodes.map(row => [row.id, row]));
  const edges = new Map(base.edges.map(row => [row.id, row]));
  const ops = [];
  for (const raw of delta.operations) {
    const op = jsonValue(raw);
    if (!['ADD_NODE', 'UPDATE_NODE', 'REMOVE_NODE', 'ADD_EDGE', 'UPDATE_EDGE', 'REMOVE_EDGE'].includes(op.op) ||
        typeof op.target_id !== 'string') throw new Error('invalid_graph_operation');
    const edge = op.op.endsWith('EDGE'), collection = edge ? edges : nodes;
    const present = collection.has(op.target_id);
    if ((op.op.startsWith('ADD_') && present) || (!op.op.startsWith('ADD_') && !present))
      throw new Error('graph_operation_target_mismatch');
    if (op.op.startsWith('REMOVE_')) {
      if (!edge && [...edges.values()].some(row => row.src === op.target_id || row.dst === op.target_id))
        throw new Error('graph_remove_attached_edges');
      collection.delete(op.target_id);
    } else {
      const merged = { ...(present ? collection.get(op.target_id) : {}), ...(op.value ?? {}), id: op.target_id };
      collection.set(op.target_id, record(merged, edge));
    }
    ops.push({ op: op.op, target_id: op.target_id, value: op.value ?? null });
  }
  const deltaRoot = hash(canonical({ base_root: delta.base_root, operations: ops,
    frame_id: delta.frame_id, coordinate: delta.coordinate ? coordinate(delta.coordinate) : null,
    metadata: jsonValue(delta.metadata ?? {}) }));
  return createBrowserGraphSnapshot({ frame_id: delta.frame_id, coordinate: delta.coordinate ?? base.coordinate,
    nodes: [...nodes.values()], edges: [...edges.values()], parent_root: base.root,
    metadata: { ...base.metadata, ...jsonValue(delta.metadata ?? {}), applied_delta_root: deltaRoot } });
}

export function deriveBrowserGraphResidual(expected, observed) {
  const out = [];
  for (const [items, targetType] of [['nodes', 'node'], ['edges', 'edge']]) {
    const a = new Map(expected[items].map(row => [row.id, row]));
    const b = new Map(observed[items].map(row => [row.id, row]));
    for (const id of [...new Set([...a.keys(), ...b.keys()])].sort()) {
      if (!a.has(id) || !b.has(id)) {
        out.push({ type: `${targetType.toUpperCase()}_${a.has(id) ? 'MISSING' : 'UNEXPECTED'}`,
          target_type: targetType, target_id: id, field: null, expected: a.get(id) ?? null,
          observed: b.get(id) ?? null, evidence_class: 'OBSERVED' });
        continue;
      }
      for (const field of Object.keys(a.get(id)).sort()) {
        if (canonical(a.get(id)[field]) !== canonical(b.get(id)[field]))
          out.push({ type: `${targetType.toUpperCase()}_ATTR_MISMATCH`, target_type: targetType,
            target_id: id, field, expected: a.get(id)[field], observed: b.get(id)[field],
            evidence_class: 'OBSERVED' });
      }
    }
  }
  return freezeDeep(out);
}

// Require the authentic COMPLETE run object, not a caller-supplied array of
// rows spelling "verified". Its private WeakMap brand exists only after the
// source/values were independently checked by the recursive controller.
// Generic GraphSnapshot remains a data carrier, never an execution lease.
