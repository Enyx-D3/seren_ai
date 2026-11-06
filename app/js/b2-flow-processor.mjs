/* CP032 B2 Flow Processor: bounded deterministic exact-task scheduling.
 * This is a research-only, programmatic typed DAG. It coordinates eligible
 * independent tasks and releases a dependent task only after every prerequisite
 * is independently checked. Promise scheduling is NOT CPU/GPU parallelism.
 * No model, shell, native TinyLinux, network, filesystem or background daemon.
 */
import { Sha256 } from './sha256.mjs';
import { exactArithmetic } from './exact-arithmetic.mjs';

export const B2_FLOW_POLICY = 'b2-flow-exact-dag-cp032-v1';
const MAX_TASKS = 8;
const IDENTIFIER = /^[a-z][a-z0-9_]{0,15}$/;
const REFERENCE = /@([a-z][a-z0-9_]{0,15})/g;
const encoder = new TextEncoder();
const sha = value => new Sha256().update(encoder.encode(value)).digest();
const verifiedReceipts = new WeakSet();

const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) freeze(entry);
    Object.freeze(value);
  }
  return value;
};

function normalizePlan(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      Object.keys(raw).sort().join() !== 'requested,sourceVersion,tasks,version' ||
      raw.version !== 1 || !Number.isInteger(raw.sourceVersion) ||
      raw.sourceVersion < 1 || raw.sourceVersion > 1_000_000 ||
      !Array.isArray(raw.tasks) || raw.tasks.length < 2 || raw.tasks.length > MAX_TASKS ||
      !Array.isArray(raw.requested) || !raw.requested.length || raw.requested.length > MAX_TASKS)
    throw Error('invalid_flow_plan');
  const tasks = raw.tasks.map(task => {
    if (!task || typeof task !== 'object' || Array.isArray(task) ||
        Object.keys(task).sort().join() !== 'dependsOn,expression,id' ||
        typeof task.id !== 'string' || !IDENTIFIER.test(task.id) ||
        typeof task.expression !== 'string' || !task.expression.trim() ||
        task.expression.length > 128 || !/^[a-z0-9_@+*/().\s-]+$/.test(task.expression) ||
        !Array.isArray(task.dependsOn) || task.dependsOn.length > MAX_TASKS ||
        task.dependsOn.some(dep => typeof dep !== 'string' || !IDENTIFIER.test(dep)) ||
        new Set(task.dependsOn).size !== task.dependsOn.length)
      throw Error('invalid_flow_task');
    const references = [...task.expression.matchAll(REFERENCE)].map(row => row[1]);
    if (new Set(references).size !== task.dependsOn.length ||
        task.dependsOn.some(dep => !references.includes(dep)) ||
        references.some(ref => !task.dependsOn.includes(ref)))
      throw Error('flow_reference_dependency_mismatch');
    return { id: task.id, expression: task.expression, dependsOn: [...task.dependsOn].sort() };
  });
  const byId = new Map(tasks.map(task => [task.id, task]));
  if (byId.size !== tasks.length || raw.requested.some(id => !byId.has(id)) ||
      new Set(raw.requested).size !== raw.requested.length ||
      tasks.some(task => task.dependsOn.some(dep => dep === task.id || !byId.has(dep))))
    throw Error('flow_unknown_or_duplicate_node');
  const required = new Set(raw.requested), queue = [...raw.requested];
  for (let index = 0; index < queue.length; index++) {
    for (const dep of byId.get(queue[index]).dependsOn) {
      if (!required.has(dep)) { required.add(dep); queue.push(dep); }
    }
  }
  if (required.size !== tasks.length) throw Error('flow_unrequested_work');
  const ordered = [...tasks].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const normalized = freeze({ version: 1, sourceVersion: raw.sourceVersion,
    requested: [...raw.requested].sort(), tasks: ordered });
  return freeze({ ...normalized, sourceHash: sha(JSON.stringify(normalized)) });
}

function exactForTask(task, results) {
  const expanded = task.expression.replace(REFERENCE, (_, id) => {
    if (!results.has(id)) throw Error('flow_dependency_not_checked');
    return `(${results.get(id)})`;
  });
  if (/@|[a-z_]/.test(expanded)) throw Error('flow_unsupported_expression');
  const answer = exactArithmetic(expanded).text;
  if (!/^-?(?:0|[1-9]\d*)$/.test(answer) || answer.length > 120)
    throw Error('flow_noninteger_or_overflow');
  return { expanded, answer };
}

/**
 * `executor` is a trusted caller-owned adapter, never parsed from model text.
 * Every returned value is independently checked. In the default executor all
 * compute is synchronous CPU JavaScript; overlapping promises prove no physical
 * parallel speedup and are not a native-guest substitute.
 */
export async function runB2FlowPlan(raw, { maxConcurrent = 2, executor = null,
  signal = null, clock = () => performance.now() } = {}) {
  const plan = normalizePlan(raw);
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 3 ||
      (executor !== null && typeof executor !== 'function') || typeof clock !== 'function')
    throw Error('invalid_flow_execution_configuration');
  const checkAbort = () => { if (signal?.aborted) throw Error('flow_aborted'); };
  const byId = new Map(plan.tasks.map(task => [task.id, task]));
  const results = new Map(), receipts = [], batches = [];
  let maxScheduledTogether = 0, executed = 0;
  const began = clock();
  try {
    while (results.size < plan.tasks.length) {
      checkAbort();
      const ready = plan.tasks.filter(task => !results.has(task.id) &&
        !receipts.some(item => item.id === task.id) &&
        task.dependsOn.every(dep => results.has(dep))).slice(0, maxConcurrent);
      if (!ready.length) throw Error('flow_cycle_or_unsatisfied_dependency');
      maxScheduledTogether = Math.max(maxScheduledTogether, ready.length);
      const batch = ready.map(task => task.id);
      batches.push(batch);
      // A failed task invalidates its entire batch. Forward cancellation to
      // sibling adapters and await their terminal acknowledgments before
      // returning an unverified receipt: no late result may be published.
      // A trusted adapter must itself terminate its underlying Worker/process;
      // aborting a Promise alone cannot hard-kill arbitrary external work.
      const batchAbort = new AbortController();
      const cancelBatch = () => batchAbort.abort();
      if (signal?.aborted) cancelBatch();
      signal?.addEventListener('abort', cancelBatch, { once: true });
      let completed;
      try {
        const attempts = ready.map(async task => {
          try {
            const independent = exactForTask(task, results);
            checkAbort();
            const result = executor ? await executor(freeze({ id: task.id,
              expression: independent.expanded, policy: B2_FLOW_POLICY }), { signal: batchAbort.signal }) :
              exactArithmetic(independent.expanded).text;
            checkAbort();
            const value = typeof result === 'string' ? result : result?.text;
            if (value !== independent.answer) throw Error(`flow_independent_mismatch:${task.id}`);
            return freeze({ id: task.id, value, refs: task.dependsOn,
              method: 'independent_exact_arithmetic_recalculation' });
          } catch (error) {
            cancelBatch();
            throw error;
          }
        });
        const settled = await Promise.allSettled(attempts);
        checkAbort();
        const failure = settled.find(entry => entry.status === 'rejected');
        if (failure) throw failure.reason;
        completed = settled.map(entry => entry.value);
      } finally {
        signal?.removeEventListener('abort', cancelBatch);
      }
      // Publish no partial batch before every member has passed verification.
      for (const checked of completed) {
        results.set(checked.id, checked.value);
        receipts.push(checked); executed++;
      }
      for (const id of batch) if (!byId.has(id)) throw Error('flow_internal_unknown_task');
    }
    const targetValues = plan.requested.map(id => ({ id, value: results.get(id) }));
    const root = sha(JSON.stringify({ policy: B2_FLOW_POLICY, planHash: plan.sourceHash,
      rows: receipts, targetValues }));
    const receipt = freeze({ policy: B2_FLOW_POLICY, sourceHash: plan.sourceHash,
      sourceVersion: plan.sourceVersion, plan, root, rows: receipts, targetValues,
      batches, status: 'verified', scope: 'caller_supplied_exact_integer_dag_only',
      sourceAuthenticity: 'not_established', capabilities: { network: false,
        model: false, nativeTinyLinux: false, physicalParallelismMeasured: false },
      metrics: { scheduledTasks: executed, scheduledBatches: batches.length,
        maxScheduledTogether, elapsedMs: clock() - began } });
    verifiedReceipts.add(receipt);
    return receipt;
  } catch (error) {
    return freeze({ policy: B2_FLOW_POLICY, status: 'unverified',
      sourceHash: plan.sourceHash, scope: 'no_whole_task_result',
      reason: String(error?.message || error).slice(0, 160),
      metrics: { scheduledTasks: executed, scheduledBatches: batches.length,
        maxScheduledTogether, elapsedMs: clock() - began } });
  }
}

/** Replays every source expression and compares all outputs independently. */
export function verifyB2FlowReceipt(receipt, rawPlan) {
  try {
    const plan = normalizePlan(rawPlan);
    if (!verifiedReceipts.has(receipt) || receipt?.policy !== B2_FLOW_POLICY ||
        receipt.status !== 'verified' || receipt.sourceHash !== plan.sourceHash ||
        receipt.sourceVersion !== plan.sourceVersion ||
        !Array.isArray(receipt.rows) || receipt.rows.length !== plan.tasks.length)
      throw Error('untrusted_or_stale_flow_receipt');
    const result = new Map();
    let previous = null;
    for (const row of receipt.rows) {
      const task = plan.tasks.find(item => item.id === row.id);
      if (!task || result.has(row.id) || task.dependsOn.some(dep => !result.has(dep)) ||
          row.value !== exactForTask(task, result).answer ||
          JSON.stringify(row.refs) !== JSON.stringify(task.dependsOn))
        throw Error('flow_replay_value_or_order_mismatch');
      result.set(row.id, row.value);
      previous = row.id;
    }
    const targets = plan.requested.map(id => ({ id, value: result.get(id) }));
    const root = sha(JSON.stringify({ policy: B2_FLOW_POLICY, planHash: plan.sourceHash,
      rows: receipt.rows, targetValues: targets }));
    if (receipt.root !== root || JSON.stringify(receipt.targetValues) !== JSON.stringify(targets))
      throw Error('flow_replay_root_mismatch');
    return freeze({ ok: true, verification: 'independent_full_exact_dag_replay',
      scope: 'caller_supplied_exact_integer_dag_only', lastVerifiedTask: previous });
  } catch (error) {
    return freeze({ ok: false, reason: String(error?.message || error).slice(0, 160) });
  }
}
