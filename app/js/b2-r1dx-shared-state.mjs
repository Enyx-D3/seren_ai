/* CP028 experimental R1/R1D/R1DX: bounded integer computation graph.
 * R1 = exact source-bound node identities; R1D = deterministic replay records;
 * R1DX = provenance-aware selective reuse / invalidation.
 * Only the arithmetic specified by these caller-supplied numbers is proven;
 * this does not authenticate a document, model proposal, device or TinyLinux.
 */
import { Sha256 } from './sha256.mjs';
import { exactArithmetic } from './exact-arithmetic.mjs';

export const R1DX_POLICY = 'b2-r1dx-int-graph-v1';
const ID = /^[a-z][a-z0-9_-]{0,23}$/;
const DECIMAL = /^-?(?:0|[1-9][0-9]{0,9})$/;
const decoder = new TextEncoder();
const sha = source => new Sha256().update(decoder.encode(source)).digest();
const provedSnapshots = new WeakSet();
const MAX_DIGITS = 120;
const MAX_SOURCE_ABS = 1_000_000_000n;
const symbols = Object.freeze({ add: '+', subtract: '-', multiply: '*' });

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    for (const item of Object.values(obj)) deepFreeze(item);
    Object.freeze(obj);
  }
  return obj;
}
function exactShape(value, fields) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === fields.length &&
    Object.keys(value).every(key => fields.includes(key));
}
function requireId(value) {
  if (typeof value !== 'string' || !ID.test(value)) throw Error('invalid_r1_node_id');
  return value;
}
function normalizeProgram(raw) {
  if (!exactShape(raw, ['programVersion', 'sources', 'operations', 'target']))
    throw Error('invalid_r1_program_shape');
  if (!Number.isSafeInteger(raw.programVersion) || raw.programVersion < 1 || raw.programVersion > 1_000_000)
    throw Error('invalid_r1_program_version');
  if (!Array.isArray(raw.sources) || raw.sources.length < 2 || raw.sources.length > 6 ||
      !Array.isArray(raw.operations) || raw.operations.length < 1 || raw.operations.length > 12)
    throw Error('invalid_r1_graph_size');
  const all = new Set();
  const sources = raw.sources.map(item => {
    if (!exactShape(item, ['id', 'version', 'value'])) throw Error('invalid_r1_source_shape');
    const id = requireId(item.id);
    if (all.has(id)) throw Error('duplicate_r1_node');
    all.add(id);
    if (!Number.isSafeInteger(item.version) || item.version < 1 || item.version > 1_000_000)
      throw Error('invalid_r1_source_version');
    if (typeof item.value !== 'string' || !DECIMAL.test(item.value) ||
        BigInt(item.value) > MAX_SOURCE_ABS || BigInt(item.value) < -MAX_SOURCE_ABS)
      throw Error('invalid_r1_source_value');
    return { id, version: item.version, value: item.value };
  });
  const operations = raw.operations.map(item => {
    if (!exactShape(item, ['id', 'kind', 'left', 'right'])) throw Error('invalid_r1_operation_shape');
    const id = requireId(item.id), left = requireId(item.left), right = requireId(item.right);
    if (all.has(id)) throw Error('duplicate_r1_node');
    if (!Object.hasOwn(symbols, item.kind)) throw Error('unknown_r1_operation');
    if (!all.has(left) || !all.has(right)) throw Error('r1_dependency_missing_or_forward');
    all.add(id);
    return { id, kind: item.kind, left, right };
  });
  const target = requireId(raw.target);
  if (target !== operations.at(-1).id) throw Error('r1_target_must_be_final_operation');
  const dependencies = new Map(operations.map(op => [op.id, [op.left, op.right]]));
  const used = new Set([target]), queue = [target];
  for (let i = 0; i < queue.length; i++) for (const child of dependencies.get(queue[i]) || []) {
    if (!used.has(child)) { used.add(child); queue.push(child); }
  }
  if (operations.some(op => !used.has(op.id)) || sources.some(source => !used.has(source.id)))
    throw Error('r1_incomplete_unconsumed_operations');
  const structure = sha(JSON.stringify({ sources: sources.map(s => s.id), operations, target }));
  return deepFreeze({ programVersion: raw.programVersion, sources, operations, target, structure });
}
function signedInteger(value) {
  const b = BigInt(value);
  const text = String(b);
  if (text.replace('-', '').length > MAX_DIGITS) throw Error('r1_intermediate_limit');
  return text;
}
function integerOperation(kind, left, right) {
  const a = BigInt(left), b = BigInt(right);
  return signedInteger(kind === 'add' ? a + b : kind === 'subtract' ? a - b : a * b);
}
function independentOperation(kind, left, right) {
  const computed = exactArithmetic(`(${left})${symbols[kind]}(${right})`).text;
  return signedInteger(computed);
}
function fingerprint(item, left, right, programVersion) {
  return item.kind === 'source' ? sha(`source:${item.id}:${item.version}:${item.value}`) :
    sha(`operation:${R1DX_POLICY}:${programVersion}:${item.id}:${item.kind}:${left.fingerprint}:${right.fingerprint}`);
}
function hashDelta(record) {
  return sha(JSON.stringify(record));
}
function requireCompatible(previous, program) {
  if (!provedSnapshots.has(previous) || previous.policy !== R1DX_POLICY)
    throw Error('unverified_r1_previous_snapshot');
  if (previous.programVersion > program.programVersion) throw Error('stale_r1_program_version');
  if (previous.structure !== program.structure && previous.programVersion === program.programVersion)
    throw Error('r1_structure_changed_without_version');
  const old = new Map(previous.sources.map(s => [s.id, s]));
  for (const now of program.sources) {
    const before = old.get(now.id);
    if (!before) continue;
    if (now.version < before.version) throw Error('stale_r1_source_version');
    if (now.value !== before.value && now.version === before.version)
      throw Error('r1_source_changed_without_version');
  }
}

export function executeR1DX(rawProgram, { previous = null } = {}) {
  const program = normalizeProgram(rawProgram);
  if (previous !== null) requireCompatible(previous, program);
  const before = new Map((previous?.nodes || []).map(node => [node.id, node]));
  const results = new Map(), nodes = [], deltas = [], invalidated = [], preserved = [];
  let computed = 0, reused = 0;
  const addNode = (candidate, dependencies) => {
    const previousNode = before.get(candidate.id);
    const token = fingerprint(candidate, dependencies[0], dependencies[1], program.programVersion);
    const canReuse = previousNode?.fingerprint === token && previousNode.verification === 'exact_checked_v1';
    let value = candidate.value;
    if (candidate.kind !== 'source') {
      value = canReuse ? previousNode.value : integerOperation(candidate.kind,
        dependencies[0].value, dependencies[1].value);
      if (!canReuse && value !== independentOperation(candidate.kind, dependencies[0].value, dependencies[1].value))
        throw Error('r1_independent_arithmetic_mismatch');
    }
    if (canReuse) { reused++; preserved.push(candidate.id); }
    else { computed++; if (previousNode) invalidated.push(candidate.id); }
    const node = deepFreeze({ id: candidate.id, kind: candidate.kind, fingerprint: token, value,
      sourceVersion: candidate.version ?? null, verification: 'exact_checked_v1' });
    results.set(candidate.id, node); nodes.push(node);
    const entry = { sequence: deltas.length + 1, previousHash: deltas.at(-1)?.hash || 'genesis',
      nodeId: node.id, fingerprint: token, value, mode: canReuse ? 'reused' : 'calculated' };
    deltas.push(deepFreeze({ ...entry, hash: hashDelta(entry) }));
  };
  for (const source of program.sources) addNode({ ...source, kind: 'source' }, []);
  for (const op of program.operations) addNode(op, [results.get(op.left), results.get(op.right)]);
  const root = sha(`${program.structure}:${program.programVersion}:${deltas.at(-1).hash}`);
  const snapshot = deepFreeze({ policy: R1DX_POLICY, programVersion: program.programVersion,
    structure: program.structure, sources: program.sources, operations: program.operations,
    target: program.target, nodes, deltas, root, parentRoot: previous?.root || null,
    value: results.get(program.target).value,
    metrics: { reused, computed, invalidated, preserved },
    verification: { status: 'verified', scope: 'exact_caller_supplied_integer_graph',
      sourceAuthenticity: 'not_established' } });
  provedSnapshots.add(snapshot);
  return snapshot;
}

// Independent R1D replay: never trust stored values, reported verification, or
// chain hashes. Parse fresh input, check every record and calculate every node
// with the repository's separate two-parser exact-arithmetic implementation.
export function replayR1D(rawSnapshot, rawProgram) {
  const program = normalizeProgram(rawProgram);
  if (!rawSnapshot || rawSnapshot.policy !== R1DX_POLICY ||
      rawSnapshot.programVersion !== program.programVersion ||
      rawSnapshot.structure !== program.structure || rawSnapshot.target !== program.target)
    throw Error('r1_replay_stale_program');
  if (!Array.isArray(rawSnapshot.sources) || rawSnapshot.sources.length !== program.sources.length ||
      !Array.isArray(rawSnapshot.operations) || rawSnapshot.operations.length !== program.operations.length ||
      JSON.stringify(rawSnapshot).length > 100_000 ||
      JSON.stringify(rawSnapshot.sources) !== JSON.stringify(program.sources) ||
      JSON.stringify(rawSnapshot.operations) !== JSON.stringify(program.operations) ||
      rawSnapshot.verification?.status !== 'verified' ||
      rawSnapshot.verification?.scope !== 'exact_caller_supplied_integer_graph' ||
      rawSnapshot.verification?.sourceAuthenticity !== 'not_established')
    throw Error('r1_replay_provenance_mismatch');
  const expectedCount = program.sources.length + program.operations.length;
  if (!Array.isArray(rawSnapshot.nodes) || rawSnapshot.nodes.length !== expectedCount ||
      !Array.isArray(rawSnapshot.deltas) || rawSnapshot.deltas.length !== expectedCount)
    throw Error('r1_replay_incomplete');
  const verified = new Map();
  for (const [i, candidate] of [...program.sources.map(source => ({ ...source, kind: 'source' })), ...program.operations].entries()) {
    const prev = rawSnapshot.deltas[i - 1];
    const delta = rawSnapshot.deltas[i], row = rawSnapshot.nodes[i];
    const left = candidate.left ? verified.get(candidate.left) : null;
    const right = candidate.right ? verified.get(candidate.right) : null;
    const expectedFingerprint = fingerprint(candidate, left, right, program.programVersion);
    const value = candidate.kind === 'source' ? candidate.value : independentOperation(candidate.kind, left.value, right.value);
    if (!exactShape(row, ['id', 'kind', 'fingerprint', 'value', 'sourceVersion', 'verification']) ||
        row.id !== candidate.id || row.kind !== candidate.kind ||
        row.fingerprint !== expectedFingerprint || row.value !== value ||
        row.sourceVersion !== (candidate.version ?? null) || row.verification !== 'exact_checked_v1')
      throw Error('r1_replay_node_mismatch');
    if (!exactShape(delta, ['sequence', 'previousHash', 'nodeId', 'fingerprint', 'value', 'mode', 'hash']) ||
        delta.sequence !== i + 1 || delta.previousHash !== (prev?.hash || 'genesis') ||
        delta.nodeId !== candidate.id || delta.fingerprint !== expectedFingerprint || delta.value !== value ||
        !['reused', 'calculated'].includes(delta.mode)) throw Error('r1_replay_delta_mismatch');
    const { hash: recorded, ...body } = delta;
    if (recorded !== hashDelta(body)) throw Error('r1_replay_chain_mismatch');
    verified.set(candidate.id, { value, fingerprint: expectedFingerprint });
  }
  const root = sha(`${program.structure}:${program.programVersion}:${rawSnapshot.deltas.at(-1).hash}`);
  if (rawSnapshot.root !== root || rawSnapshot.value !== verified.get(program.target).value)
    throw Error('r1_replay_root_mismatch');
  const reusedNodes = rawSnapshot.deltas.filter(d => d.mode === 'reused').map(d => d.nodeId);
  const calculated = rawSnapshot.deltas.length - reusedNodes.length;
  const metrics = rawSnapshot.metrics;
  if (!metrics || metrics.reused !== reusedNodes.length || metrics.computed !== calculated ||
      JSON.stringify(metrics.preserved) !== JSON.stringify(reusedNodes) ||
      !Array.isArray(metrics.invalidated) || metrics.invalidated.length > calculated ||
      metrics.invalidated.some(id => !rawSnapshot.deltas.some(d => d.nodeId === id && d.mode === 'calculated')))
    throw Error('r1_replay_metric_mismatch');
  return deepFreeze({ ok: true, value: rawSnapshot.value, root,
    nodeCount: expectedCount, method: 'independent_two_parser_exact_replay',
    scope: 'exact_caller_supplied_integer_graph', sourceAuthenticity: 'not_established' });
}

// Serialization cannot authorize reuse by itself. This call reconstructs an
// immutable, locally attested snapshot only after independent full replay.
export function restoreR1D(serialized, rawProgram) {
  replayR1D(serialized, rawProgram);
  const copy = deepFreeze(JSON.parse(JSON.stringify(serialized)));
  provedSnapshots.add(copy);
  return copy;
}
