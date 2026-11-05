/* Experimental L2 GraphOS composition for two source-grounded ordering documents.
 * This module schedules named actions; it never executes those actions. It
 * proves feasibility only relative to supported user-stated prerequisites.
 * No model, network, native tool or browser-storage privilege is involved. */
import { Sha256 } from './sha256.mjs';
import { createBrowserGraphSnapshot } from './b2-graphos-browser-shadow.mjs';
import { interpretDependencyTask } from './b2-dependency-task.mjs';

export const COMPOSED_GRAPH_POLICY = 'b2-graphos-composition-experimental-1';
export const COMPOSED_GRAPH_PATHS = Object.freeze(['composed_forward', 'composed_backward']);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,31}$/;
const encoder = new TextEncoder();
const hash = value => new Sha256().update(encoder.encode(value)).digest();
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const registered = new WeakMap();

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const part of Object.values(value)) freeze(part);
    Object.freeze(value);
  }
  return value;
}

function normalizeSources(input) {
  if (!Array.isArray(input) || input.length !== 2) throw Error('two_source_documents_required');
  const docs = input.map(raw => {
    if (!raw || typeof raw !== 'object' || !IDENTIFIER.test(raw.id || '') ||
        !IDENTIFIER.test(raw.version || '') || typeof raw.text !== 'string' ||
        !raw.text.trim() || raw.text.length > 4000) throw Error('invalid_source_document');
    return { id: raw.id, version: raw.version, text: raw.text, sha256: hash(raw.text) };
  }).sort((a, b) => compare(a.id, b.id));
  if (docs[0].id === docs[1].id) throw Error('duplicate_source_id');
  return docs;
}

function parseSourceFacts(doc) {
  // The typed caller already requests an execution order. Append only the
  // parser's goal cue, after the original bytes; fact offsets remain exact.
  const bounded = interpretDependencyTask(`${doc.text}\nGive a valid order.`);
  if (!bounded || bounded.unknowns.length || !bounded.facts.length) throw Error(`source_uninterpretable:${doc.id}`);
  return bounded.facts.map(fact => {
    if (fact.sourceOffset + fact.quote.length > doc.text.length ||
        doc.text.slice(fact.sourceOffset, fact.sourceOffset + fact.quote.length) !== fact.quote)
      throw Error(`source_quote_mismatch:${doc.id}`);
    return { ...fact, sourceId: doc.id, sourceVersion: doc.version, sourceHash: doc.sha256 };
  });
}

function requireBundle(bundle) {
  if (!bundle || registered.get(bundle) !== bundle.snapshot?.root ||
      bundle.policy !== COMPOSED_GRAPH_POLICY) throw Error('untrusted_composition');
}

function requireCurrentSources(bundle, sourceDocuments) {
  if (sourceDocuments === undefined) return bundle.documents;
  const normalized = normalizeSources(sourceDocuments);
  if (normalized.some((doc, i) => doc.id !== bundle.documents[i].id ||
      doc.version !== bundle.documents[i].version || doc.sha256 !== bundle.documents[i].sha256))
    throw Error('stale_composed_sources');
  return normalized;
}

export function composeDependencySources(sourceDocuments, { parentRoot = null } = {}) {
  const docs = normalizeSources(sourceDocuments);
  const facts = docs.flatMap(parseSourceFacts);
  const actions = [...new Set(facts.flatMap(fact => [fact.before, fact.after]))].sort(compare);
  if (actions.length > 7 || facts.length > 16) throw Error('composition_capacity_exceeded');
  const idFor = name => `action-${hash(name).slice(0, 24)}`;
  const actionIds = actions.map(idFor);
  if (new Set(actionIds).size !== actions.length) throw Error('action_identity_collision');
  const refsFor = name => facts.filter(f => f.before === name || f.after === name)
    .map(f => `${f.sourceId}@${f.sourceVersion}:${f.sourceOffset}:${f.sourceHash}`);
  const snapshot = createBrowserGraphSnapshot({
    frame_id: 'composed-dependency-v1',
    coordinate: { superfamily: 'REASONING', function: 'VERIFY', lens: 'LITERAL' },
    nodes: actions.map(label => ({ id: idFor(label), label, kind: 'action',
      evidence_class: 'OBSERVED', source_refs: refsFor(label), attrs: { conditional: true } })),
    edges: facts.map(fact => ({ id: `relation-${hash(`${fact.sourceId}:${fact.sourceVersion}:${fact.sourceOffset}:${fact.quote}`).slice(0, 32)}`,
      src: idFor(fact.before), dst: idFor(fact.after), relation: 'requires',
      evidence_class: 'OBSERVED', source_refs: [`${fact.sourceId}@${fact.sourceVersion}:${fact.sourceOffset}:${fact.sourceHash}`],
      attrs: { before: fact.before, after: fact.after, quote: fact.quote, sourceOffset: fact.sourceOffset,
        sourceId: fact.sourceId, sourceVersion: fact.sourceVersion, sourceHash: fact.sourceHash } })),
    parent_root: parentRoot,
    metadata: { source_manifest: docs.map(({ id, version, sha256 }) => ({ id, version, sha256 })),
      proof_scope: 'ordering_relative_to_source_assumptions_only' },
  });
  const bundle = freeze({ policy: COMPOSED_GRAPH_POLICY, snapshot, documents: docs,
    actions, paths: [...COMPOSED_GRAPH_PATHS], sourceFacts: facts.map(f => ({ before: f.before, after: f.after,
      sourceId: f.sourceId, sourceVersion: f.sourceVersion, sourceHash: f.sourceHash,
      quote: f.quote, sourceOffset: f.sourceOffset })) });
  registered.set(bundle, snapshot.root);
  return bundle;
}

function graphCandidate(bundle, direction) {
  const names = bundle.actions;
  const labels = new Map(bundle.snapshot.nodes.map(node => [node.id, node.label]));
  const edges = bundle.snapshot.edges.map(e => ({ before: labels.get(e.src), after: labels.get(e.dst) }));
  const result = [], pending = new Set(names);
  if (direction === 'composed_forward') {
    while (pending.size) {
      const ready = [...pending].find(action => edges.every(edge => edge.after !== action || result.includes(edge.before)));
      if (!ready) return null;
      result.push(ready);
      pending.delete(ready);
    }
    return result;
  }
  if (direction !== 'composed_backward') throw Error('ineligible_composition_direction');
  const visiting = new Set(), completed = new Set();
  function visit(name) {
    if (visiting.has(name)) throw Error('dependency_cycle');
    if (completed.has(name)) return;
    visiting.add(name);
    for (const edge of edges.filter(e => e.after === name).sort((a, b) => compare(a.before, b.before))) visit(edge.before);
    visiting.delete(name);
    completed.add(name);
    result.push(name);
  }
  try { for (const action of names) visit(action); }
  catch (e) { if (e.message === 'dependency_cycle') return null; throw e; }
  return result;
}

// The checker does NOT consume graph edges or the path's verified label.
// It reparses the original source documents and exhaustively enumerates up to
// 7! permutations, independently of both graph traversal implementations.
export function verifyComposedDependencyOrder(bundle, candidate, { currentSources } = {}) {
  requireBundle(bundle);
  const docs = requireCurrentSources(bundle, currentSources);
  const relations = docs.flatMap(parseSourceFacts);
  const names = [...new Set(relations.flatMap(f => [f.before, f.after]))].sort(compare);
  const valid = order => Array.isArray(order) && order.length === names.length &&
    new Set(order).size === names.length && names.every(name => order.includes(name)) &&
    relations.every(relation => order.indexOf(relation.before) < order.indexOf(relation.after));
  const residuals = [];
  let witness = null;
  if (candidate === null) {
    function enumerate(prefix, available) {
      if (witness) return;
      if (!available.length) { if (valid(prefix)) witness = prefix; return; }
      for (let i = 0; i < available.length; i++)
        enumerate([...prefix, available[i]], available.filter((_, j) => i !== j));
    }
    enumerate([], names);
    if (witness) residuals.push('feasible_order_exists');
  } else {
    if (!Array.isArray(candidate) || candidate.length !== names.length ||
        new Set(candidate).size !== names.length || names.some(name => !candidate.includes(name)))
      residuals.push('missing_or_duplicate_actions');
    for (const relation of relations) if (!Array.isArray(candidate) ||
        candidate.indexOf(relation.before) < 0 || candidate.indexOf(relation.after) < 0 ||
        candidate.indexOf(relation.before) >= candidate.indexOf(relation.after))
      residuals.push({ before: relation.before, after: relation.after, sourceId: relation.sourceId, quote: relation.quote });
  }
  const ok = candidate === null ? witness === null : valid(candidate);
  return freeze({ ok, status: ok ? 'verified' : 'unverified', method: candidate === null ?
    'independent_source_permutation_infeasibility' : 'independent_source_position_inequalities',
    scope: 'conditional_on_explicit_supported_source_relations', sourceAuthenticity: 'not_established',
    graphRoot: bundle.snapshot.root, residuals, witness });
}

export function executeComposedDependencyPath(bundle, direction, options = {}) {
  requireBundle(bundle);
  requireCurrentSources(bundle, options.currentSources);
  if (!COMPOSED_GRAPH_PATHS.includes(direction)) throw Error('ineligible_composition_direction');
  const candidate = graphCandidate(bundle, direction);
  const verified = verifyComposedDependencyOrder(bundle, candidate, options);
  return freeze({ direction, candidate, ...verified, policy: COMPOSED_GRAPH_POLICY });
}

function affectedBySources(bundle, changed) {
  const initial = new Set(bundle.snapshot.edges.filter(e => changed.has(e.attrs.sourceId))
    .flatMap(e => [e.src, e.dst]));
  const outbound = new Map();
  for (const edge of bundle.snapshot.edges) {
    if (!outbound.has(edge.src)) outbound.set(edge.src, []);
    outbound.get(edge.src).push(edge.dst);
  }
  const visited = new Set(initial), queue = [...initial];
  for (let i = 0; i < queue.length; i++) for (const downstream of outbound.get(queue[i]) || []) {
    if (!visited.has(downstream)) { visited.add(downstream); queue.push(downstream); }
  }
  return visited;
}

export function updateComposedDependencySources(previous, nextSourceDocuments, { expectedRoot } = {}) {
  requireBundle(previous);
  if (expectedRoot !== undefined && previous.snapshot.root !== expectedRoot) throw Error('stale_composition_base');
  const incoming = normalizeSources(nextSourceDocuments);
  if (incoming.some((doc, i) => doc.id !== previous.documents[i].id)) throw Error('source_identity_changed');
  const changed = new Set();
  for (let i = 0; i < incoming.length; i++) {
    const before = previous.documents[i], after = incoming[i];
    if (before.sha256 !== after.sha256 && before.version === after.version) throw Error('source_version_not_advanced');
    if (before.version !== after.version || before.sha256 !== after.sha256) changed.add(after.id);
  }
  if (!changed.size) return freeze({ next: previous, delta: { beforeRoot: previous.snapshot.root,
    afterRoot: previous.snapshot.root, changedSourceIds: [], invalidatedNodeIds: [],
    preservedNodeIds: previous.snapshot.nodes.map(n => n.id), rollbackRoot: previous.snapshot.root } });
  const next = composeDependencySources(incoming, { parentRoot: previous.snapshot.root });
  const invalidated = new Set([...affectedBySources(previous, changed), ...affectedBySources(next, changed)]);
  const preservedNodeIds = previous.snapshot.nodes.map(node => node.id)
    .filter(id => !invalidated.has(id) && next.snapshot.nodes.some(node => node.id === id));
  return freeze({ next, delta: { beforeRoot: previous.snapshot.root, afterRoot: next.snapshot.root,
    changedSourceIds: [...changed].sort(compare), invalidatedNodeIds: [...invalidated].sort(compare),
    preservedNodeIds, rollbackRoot: previous.snapshot.root,
    proofStatus: 'requires_fresh_independent_verification' } });
}
