/* CP026 independent, task-level scoring. No imports from the B2 app/solver. */

const STOP_WORDS = /\b(?:cannot verify|cannot determine|insufficient information|not enough information|ambiguous|unsupported|unclear|unable to verify|can't verify)\b/i;

function hasDirectedCycle(actions, edges) {
  const state = new Map();
  const adjacency = new Map(actions.map(name => [name, []]));
  for (const [before, after] of edges) adjacency.get(before).push(after);
  const visit = name => {
    if (state.get(name) === 1) return true;
    if (state.get(name) === 2) return false;
    state.set(name, 1);
    for (const next of adjacency.get(name)) if (visit(next)) return true;
    state.set(name, 2);
    return false;
  };
  return actions.some(visit);
}

export function validateCp026Fixture(fixture) {
  if (!fixture || fixture.schemaVersion !== 1 || !Array.isArray(fixture.cases) || !fixture.cases.length)
    throw Error('CP026 fixture schemaVersion=1 with nonempty cases[] required');
  const ids = new Set();
  for (const row of fixture.cases) {
    if (!row || typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(row.id) || ids.has(row.id))
      throw Error('invalid or duplicated CP026 case id');
    ids.add(row.id);
    if (typeof row.source !== 'string' || row.source.length < 8 || row.source.length > 5000)
      throw Error(`invalid source for ${row.id}`);
    if (!['feasible', 'infeasible', 'abstain'].includes(row.gold))
      throw Error(`invalid gold for ${row.id}`);
    if (row.gold === 'abstain') continue;
    if (!Array.isArray(row.actions) || row.actions.length < 1 ||
        row.actions.some(name => typeof name !== 'string' || !name.trim()) ||
        new Set(row.actions).size !== row.actions.length || !Array.isArray(row.edges))
      throw Error(`actions[] and edges[] required for ${row.id}`);
    const names = new Set(row.actions);
    if (row.edges.some(edge => !Array.isArray(edge) || edge.length !== 2 ||
      !names.has(edge[0]) || !names.has(edge[1]))) throw Error(`invalid edge for ${row.id}`);
    const cycle = hasDirectedCycle(row.actions, row.edges);
    if (cycle !== (row.gold === 'infeasible')) throw Error(`gold/edge cycle mismatch for ${row.id}`);
  }
  return fixture.cases.length;
}

function parseWholeJsonArray(answer) {
  const trimmed = String(answer || '').trim();
  const fence = /^```(?:json)?\s*\n([\s\S]+?)\n```$/i.exec(trimmed);
  const json = fence ? fence[1].trim() : trimmed;
  try { const data = JSON.parse(json); return Array.isArray(data) ? data : null; } catch { return null; }
}

export function independentlyScoreCp026Case(item, answer, verification = null, error = null) {
  if (error) return { status: 'error', correct: false, safeAbstention: false,
    falseVerification: verification?.status === 'verified', reason: 'runtime_error' };
  const order = parseWholeJsonArray(answer), text = String(answer || '').trim();
  let correct = false, reason = null;
  if (item.gold === 'feasible') {
    correct = !!order && order.length === item.actions.length && new Set(order).size === item.actions.length &&
      item.actions.every(name => order.includes(name)) &&
      item.edges.every(([before, after]) => order.indexOf(before) < order.indexOf(after));
    reason = correct ? 'complete_gold_order' : 'not_complete_gold_order';
  } else if (item.gold === 'infeasible') {
    correct = !order && /^No feasible (?:execution )?order\b/i.test(text);
    reason = correct ? 'cycle_explained' : 'infeasibility_not_correctly_reported';
  } else {
    correct = !order && STOP_WORDS.test(text) && verification?.status !== 'verified';
    reason = correct ? 'safe_abstention' : 'missing_or_unsafe_abstention';
  }
  return {
    status: correct ? 'passed' : 'failed', correct, reason,
    safeAbstention: item.gold === 'abstain' && correct,
    falseVerification: verification?.status === 'verified' && !correct,
    verifiedClaim: verification?.status === 'verified',
  };
}

export function summarizeCp026Rows(rows) {
  const percentile = (sorted, fraction) => sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : null;
  const arms = [...new Set(rows.map(row => row.arm))];
  const totals = {};
  for (const arm of arms) {
    const subset = rows.filter(row => row.arm === arm);
    const durations = subset.map(row => row.elapsedMs).filter(Number.isFinite).sort((a,b) => a-b);
    totals[arm] = {
      total: subset.length, correct: subset.filter(row => row.check?.correct).length,
      safeAbstentions: subset.filter(row => row.check?.safeAbstention).length,
      falseVerification: subset.filter(row => row.check?.falseVerification).length,
      runtimeErrors: subset.filter(row => row.error).length,
      modelCalls: subset.reduce((sum,row) => sum + (row.metrics?.modelCalls || 0), 0),
      calculatorCalls: subset.reduce((sum,row) => sum + (row.metrics?.calculatorCalls || 0), 0),
      generatedTokens: subset.reduce((sum,row) => sum + (row.metrics?.tokens || 0), 0),
      latencyMsP50: percentile(durations, .5), latencyMsP95: percentile(durations, .95),
      peakProcessTreeRssKiB: Math.max(0, ...subset.map(row => row.peakProcessTreeRssKiB || 0)) || null,
    };
  }
  // A time-to-correct comparison needs a pair where both arms gave a complete
  // correct result; counting immediate abstentions as speedups is misleading.
  const paired = new Map();
  for (const row of rows) {
    if (!paired.has(row.id)) paired.set(row.id, new Map());
    paired.get(row.id).set(row.arm, row);
  }
  const comparable = [...paired.values()].filter(arms =>
    arms.get('falcon_alone')?.check?.correct && arms.get('b2')?.check?.correct);
  return { totals, comparableBothCorrect: comparable.length,
    timeToCorrectComparableMs: comparable.length ? {
      falcon_alone: comparable.map(pair => pair.get('falcon_alone').elapsedMs),
      b2: comparable.map(pair => pair.get('b2').elapsedMs),
    } : null };
}
