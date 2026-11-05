import assert from 'node:assert/strict';
import { composeDependencySources as compose, executeComposedDependencyPath as execute,
  verifyComposedDependencyOrder as verify, updateComposedDependencySources as update } from '../app/js/b2-graphos-composition.mjs';

const documents = [
  { id: 'release', version: 'v1', text: '"Prepare shipment" must finish before "Inspect shipment".' },
  { id: 'quality', version: 'v1', text: '"Inspect shipment" must finish before "Release shipment".' },
];
const composed = compose(documents);
assert.equal(composed.snapshot.nodes.length, 3);
assert.equal(composed.snapshot.edges.length, 2);
assert.equal(composed.documents.every(doc => doc.sha256.length === 64), true);
assert.equal(Object.isFrozen(composed.snapshot.edges[0].attrs), true);
for (const fact of composed.sourceFacts) {
  const source = documents.find(doc => doc.id === fact.sourceId);
  assert.equal(source.text.slice(fact.sourceOffset, fact.sourceOffset + fact.quote.length), fact.quote);
}
for (const direction of composed.paths) {
  const result = execute(composed, direction);
  assert.equal(result.ok, true);
  assert.deepEqual(result.candidate, ['Prepare shipment', 'Inspect shipment', 'Release shipment']);
  assert.equal(result.sourceAuthenticity, 'not_established');
}
assert.equal(verify(composed, ['Release shipment', 'Inspect shipment', 'Prepare shipment']).ok, false);
assert.equal(verify(composed, null).ok, false);
assert.throws(() => execute({ ...composed }, 'composed_forward'), /untrusted_composition/);
assert.throws(() => verify(composed, null, { currentSources: [{ ...documents[0], version: 'v2' }, documents[1]] }),
  /stale_composed_sources/);
assert.throws(() => compose([documents[0], { ...documents[1], id: documents[0].id }]), /duplicate_source_id/);
assert.throws(() => compose([documents[0], { ...documents[1], text: '"Release shipment" might happen after "Inspect shipment".' }]),
  /source_uninterpretable/);

const mutated = [documents[0], { ...documents[1], version: 'v2',
  text: '"Release shipment" must finish before "Inspect shipment".' }];
assert.throws(() => update(composed, [{ ...documents[0] }, { ...mutated[1], version: 'v1' }]),
  /source_version_not_advanced/);
assert.throws(() => update(composed, mutated, { expectedRoot: '0'.repeat(64) }), /stale_composition_base/);
const changed = update(composed, mutated, { expectedRoot: composed.snapshot.root });
assert.equal(changed.next.snapshot.parent_root, composed.snapshot.root);
assert.equal(changed.delta.changedSourceIds.length, 1);
assert.equal(changed.delta.proofStatus, 'requires_fresh_independent_verification');
const idByLabel = Object.fromEntries(composed.snapshot.nodes.map(n => [n.label, n.id]));
assert.ok(changed.delta.invalidatedNodeIds.includes(idByLabel['Inspect shipment']));
assert.ok(changed.delta.invalidatedNodeIds.includes(idByLabel['Release shipment']));
assert.ok(changed.delta.preservedNodeIds.includes(idByLabel['Prepare shipment']));
assert.equal(verify(changed.next, ['Prepare shipment', 'Inspect shipment', 'Release shipment']).ok, false);
assert.equal(execute(changed.next, 'composed_backward').ok, true);
assert.equal(update(composed, documents).next, composed);
assert.equal(composed.snapshot.root, changed.delta.rollbackRoot);

const cyclic = compose([
  { id: 'a', version: 'v1', text: '"Task A" before "Task B".' },
  { id: 'b', version: 'v1', text: '"Task B" before "Task A".' },
]);
for (const direction of cyclic.paths) {
  const result = execute(cyclic, direction);
  assert.equal(result.candidate, null);
  assert.equal(result.ok, true);
  assert.equal(result.method, 'independent_source_permutation_infeasibility');
}

// Independently authored deterministic oracle: exhaust all permutations with
// a separate inequality predicate. No production graph/verification functions.
function hasWitness(items, constraints) {
  let found = false;
  function walk(path, rest) {
    if (found) return;
    if (!rest.length) {
      const position = Object.fromEntries(path.map((name, index) => [name, index]));
      found = constraints.every(([before, after]) => position[before] < position[after]);
      return;
    }
    for (const name of rest) walk([...path, name], rest.filter(other => other !== name));
  }
  walk([], items);
  return found;
}
let seed = 1729;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
let checked = 0;
for (let trial = 0; trial < 120; trial++) {
  const actionCount = 3 + Math.floor(random() * 5);
  const names = Array.from({ length: actionCount }, (_, i) => `Action ${i}`);
  const edgeCount = 2 + Math.floor(random() * 8);
  const clauses = [[], []], constraints = [];
  for (let j = 0; j < edgeCount; j++) {
    let from = Math.floor(random() * actionCount);
    let to = Math.floor(random() * actionCount);
    if (from === to) to = (to + 1) % actionCount;
    clauses[j % 2].push(`"${names[from]}" must finish before "${names[to]}".`);
    constraints.push([names[from], names[to]]);
  }
  const docs = clauses.map((parts, i) => ({ id: `part${i}`, version: 'v1', text: parts.join(' ') }));
  const bundle = compose(docs);
  const oracle = hasWitness([...new Set(constraints.flat())], constraints);
  for (const path of bundle.paths) {
    const result = execute(bundle, path);
    assert.equal(result.ok, true);
    assert.equal(result.candidate !== null, oracle);
    checked++;
  }
}

console.log(`GraphOS two-source composition, provenance, mutation invalidation and independent oracle PASS (${checked} sampled directions)`);
