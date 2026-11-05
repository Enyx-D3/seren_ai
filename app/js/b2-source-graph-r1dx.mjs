/* CP032: explicit, model-free source → local retrieval → GraphOS/Spiral → R1DX.
 *
 * The caller supplies two bounded local text documents and grants their reads.
 * Source statements are assumptions, not authenticated facts. The output is a
 * conditional execution order and exact counts of source-linked evidence, not
 * proof of a real-world order, semantic relevance, or native TinyLinux work.
 * No app default invokes this module; caller must opt in on every run.
 */
import { Sha256 } from './sha256.mjs';
import { SpiralController } from './spiral.mjs';
import { composeDependencySources, executeComposedDependencyPath,
  verifyComposedDependencyOrder, updateComposedDependencySources } from './b2-graphos-composition.mjs';
import { createLocalSelectiveIndex, searchLocalSelectiveIndex,
  verifyLocalSelectiveReceipt, updateLocalSelectiveIndex } from './b2-local-selective-retrieval.mjs';
import { executeR1DX, replayR1D } from './b2-r1dx-shared-state.mjs';

export const SOURCE_GRAPH_R1DX_POLICY = 'b2-source-graph-r1dx-1';
const sessions = new WeakSet();
const hash = text => new Sha256().update(new TextEncoder().encode(text)).digest();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const member of Object.values(value)) freeze(member);
    Object.freeze(value);
  }
  return value;
}

function countProgram(docs, bundle, receipt) {
  // Fixed graph structure means only a changed document's source-versioned
  // integer leaves and its downstream arithmetic are invalidated on refresh.
  const sourceRows = docs.flatMap((doc, index) => {
    const sourceVersion = Number(doc.version.slice(1));
    if (!Number.isSafeInteger(sourceVersion) || sourceVersion < 1 || sourceVersion > 1_000_000)
      throw Error('unsupported_numeric_source_version');
    return [
      { id: `d${index + 1}facts`, version: sourceVersion,
        value: String(bundle.sourceFacts.filter(fact => fact.sourceId === doc.id).length) },
      { id: `d${index + 1}hits`, version: sourceVersion,
        value: String(receipt.hits.filter(hit => hit.sourceId === doc.id).length) },
    ];
  });
  return { programVersion: 1, sources: sourceRows,
    operations: [
      { id: 'firstunits', kind: 'add', left: 'd1facts', right: 'd1hits' },
      { id: 'secondunits', kind: 'add', left: 'd2facts', right: 'd2hits' },
      { id: 'allunits', kind: 'add', left: 'firstunits', right: 'secondunits' },
    ], target: 'allunits' };
}

function requirePrevious(previous, permission, query, mode, maxHits) {
  if (!sessions.has(previous) || previous.policy !== SOURCE_GRAPH_R1DX_POLICY ||
      previous.scopeId !== permission.scopeId ||
      !same(previous.allowedSourceIds, [...permission.allowedSourceIds].sort()) ||
      previous.query !== query || previous.mode !== mode || previous.maxHits !== maxHits)
    throw Error('untrusted_or_wrong_scope_previous_run');
}

function candidateFromSpiral(answer) {
  if (answer === 'No feasible order satisfies the stated prerequisites.') return null;
  try {
    const candidate = JSON.parse(answer);
    return Array.isArray(candidate) ? candidate : undefined;
  } catch { return undefined; }
}

/** Safely execute the opt-in bounded graph. No fetch, tools or model calls. */
export async function runSourceGraphR1DX({ sourceDocuments, permission, query,
  mode = 'all_terms', maxHits = 8, experimental = false, previous = null,
  expectedPreviousRoot = null } = {}) {
  if (experimental !== true) throw Error('source_graph_experiment_requires_opt_in');
  if (!permission || permission.allowLocalRead !== true ||
      !Array.isArray(permission.allowedSourceIds)) throw Error('source_read_permission_required');
  if (typeof query !== 'string' || !query.trim()) throw Error('source_query_required');
  if (previous !== null) {
    requirePrevious(previous, permission, query, mode, maxHits);
    if (expectedPreviousRoot !== previous.root) throw Error('stale_source_pipeline_base');
  }
  const retrievalUpdate = previous ? updateLocalSelectiveIndex(previous.index, sourceDocuments,
    { permission, expectedRoot: previous.index.root }) : null;
  const index = retrievalUpdate?.next || createLocalSelectiveIndex(sourceDocuments, { permission });
  const docs = index.documents.map(({ id, version, text }) => ({ id, version, text }));
  const compositionUpdate = previous ? updateComposedDependencySources(previous.bundle, docs,
    { expectedRoot: previous.bundle.snapshot.root }) : null;
  const bundle = compositionUpdate?.next || composeDependencySources(docs);
  const receipt = searchLocalSelectiveIndex(index, query, { permission, currentSources: docs, mode, maxHits });
  const evidenceCheck = verifyLocalSelectiveReceipt(index, receipt, { permission, currentSources: docs });
  if (!evidenceCheck.ok) throw Error(`retrieval_replay_failed:${evidenceCheck.reason}`);

  // Actual SpiralController path: Compass chooses a direction, the elastic
  // joint executes it and the independent source checker gates admission.
  const spiral = await new SpiralController().run('Give an order relative only to these source assumptions.', {
    scope: `cp032-source-${permission.scopeId}`, experimentalComposedSources: docs,
  });
  if (spiral.verification?.status !== 'verified' || spiral.metrics?.modelCalls !== 0)
    throw Error('spiral_whole_task_not_checked_or_model_used');
  const order = candidateFromSpiral(spiral.answer);
  if (order === undefined) throw Error('invalid_spiral_order_answer');
  const checked = verifyComposedDependencyOrder(bundle, order, { currentSources: docs });
  if (!checked.ok) throw Error('independent_source_order_mismatch');
  // Cross-check the second deterministic traversal too; it must independently
  // agree on feasibility (not necessarily one particular valid permutation).
  for (const direction of bundle.paths) {
    const path = executeComposedDependencyPath(bundle, direction, { currentSources: docs });
    if (!path.ok || (path.candidate === null) !== (order === null))
      throw Error('independent_graph_direction_disagreement');
  }

  const program = countProgram(docs, bundle, receipt);
  const r1 = executeR1DX(program, { previous: previous?.r1 || null });
  const calculationCheck = replayR1D(r1, program);
  const sourceSum = program.sources.reduce((sum, source) => sum + BigInt(source.value), 0n);
  if (!calculationCheck.ok || r1.value !== String(sourceSum))
    throw Error('r1_source_count_replay_mismatch');

  const manifest = docs.map(doc => ({ id: doc.id, version: doc.version,
    sha256: index.documents.find(row => row.id === doc.id).sha256 }));
  const integratedRoot = hash(JSON.stringify({ policy: SOURCE_GRAPH_R1DX_POLICY,
    scopeId: permission.scopeId, manifest, query, mode,
    sourceGraphRoot: bundle.snapshot.root, retrievalRoot: index.root,
    receiptQueryHash: receipt.queryHash, r1Root: r1.root,
    conditionalOrder: order }));
  const result = freeze({ policy: SOURCE_GRAPH_R1DX_POLICY, scopeId: permission.scopeId,
    allowedSourceIds: [...permission.allowedSourceIds].sort(),
    manifest, query, mode, maxHits, index, bundle, retrievalReceipt: receipt,
    order, graphVerification: checked, r1, r1Program: program,
    root: integratedRoot, parentRoot: previous?.root || null,
    delta: previous ? {
      rollbackRoot: previous.root, retrieval: retrievalUpdate.delta,
      graph: compositionUpdate.delta, r1: r1.metrics,
    } : null,
    metrics: { modelCalls: 0, networkCalls: 0, graphDirections: bundle.paths.length,
      retrievedBlocks: receipt.hits.length, exactEvidenceUnits: r1.value,
      r1ReusedNodes: r1.metrics.reused, r1ComputedNodes: r1.metrics.computed },
    verification: { status: 'verified',
      scope: 'bounded_local_lexical_and_source_conditional_order_plus_exact_evidence_counts',
      sourceAuthenticity: 'not_established',
      modelOutputQuality: 'not_established',
      nativeTinyLinuxUsed: false, remoteSearchUsed: false } });
  sessions.add(result);
  return result;
}

/** Current-byte independent replay. Calling it on a later source edit fails. */
export function verifySourceGraphR1DX(result, { sourceDocuments, permission } = {}) {
  try {
    if (!sessions.has(result) || result.policy !== SOURCE_GRAPH_R1DX_POLICY ||
        !permission || permission.scopeId !== result.scopeId ||
        !same([...permission.allowedSourceIds].sort(), result.allowedSourceIds))
      throw Error('untrusted_source_graph_result');
    const receipt = verifyLocalSelectiveReceipt(result.index, result.retrievalReceipt,
      { permission, currentSources: sourceDocuments });
    if (!receipt.ok) throw Error(receipt.reason);
    const graph = verifyComposedDependencyOrder(result.bundle, result.order,
      { currentSources: sourceDocuments });
    if (!graph.ok) throw Error('graph_source_replay_failed');
    const r1 = replayR1D(result.r1, result.r1Program);
    if (!r1.ok) throw Error('r1_replay_failed');
    const computed = hash(JSON.stringify({ policy: SOURCE_GRAPH_R1DX_POLICY,
      scopeId: result.scopeId, manifest: result.manifest,
      query: result.query, mode: result.mode,
      sourceGraphRoot: result.bundle.snapshot.root, retrievalRoot: result.index.root,
      receiptQueryHash: result.retrievalReceipt.queryHash,
      r1Root: result.r1.root, conditionalOrder: result.order }));
    if (computed !== result.root) throw Error('integrated_provenance_root_mismatch');
    return freeze({ ok: true, root: result.root,
      scope: result.verification.scope, sourceAuthenticity: 'not_established' });
  } catch (error) { return freeze({ ok: false, reason: String(error.message).slice(0, 120) }); }
}
