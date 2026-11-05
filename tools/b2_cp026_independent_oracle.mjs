/* CP026 independent, frozen gold oracle. Does not import B2 source or infer
 * relationships from the candidate model's output. This file is an evaluation
 * tool only, never a routing/calibration source. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

export const FIXTURE_SHA256 = 'bec2deb71bbd93f03d1aab7b48ae24a97e396a8e65a488610e937a125d7934a4';
export const FIXTURE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/b2_cp026_independent_holdout_2026_11_05.json');
const CHOICES = new Set(['feasible', 'infeasible', 'abstain']);

function isNonEmptyString(value) { return typeof value === 'string' && value.trim().length > 0; }
function hasCycle(actions, edges) {
  const todo = new Map(actions.map(action => [action, 0]));
  const outbound = new Map(actions.map(action => [action, []]));
  for (const [before, after] of edges) {
    todo.set(after, todo.get(after) + 1);
    outbound.get(before).push(after);
  }
  let queue = actions.filter(action => todo.get(action) === 0);
  let visited = 0;
  while (queue.length) {
    const next = queue.shift();
    visited++;
    for (const after of outbound.get(next)) {
      todo.set(after, todo.get(after) - 1);
      if (todo.get(after) === 0) queue.push(after);
    }
  }
  return visited !== actions.length;
}

export function loadIndependentFixture(path = FIXTURE_PATH, expectedHash = FIXTURE_SHA256) {
  const bytes = readFileSync(path);
  const actualHash = createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== expectedHash) throw new Error(`CP026 fixture integrity failure: ${actualHash}`);
  const fixture = JSON.parse(bytes.toString('utf8'));
  if (fixture.schemaVersion !== 1 || !Array.isArray(fixture.cases) || fixture.cases.length !== 28)
    throw new Error('CP026 fixture identity/count mismatch');
  const ids = new Set();
  const sources = new Set();
  const counts = { feasible: 0, infeasible: 0, abstain: 0 };
  for (const item of fixture.cases) {
    if (!isNonEmptyString(item.id) || ids.has(item.id) || !isNonEmptyString(item.source) || sources.has(item.source))
      throw new Error(`Duplicate or invalid CP026 case ${String(item.id)}`);
    ids.add(item.id); sources.add(item.source);
    if (!CHOICES.has(item.gold) || !Array.isArray(item.actions) || item.actions.length < 2 || item.actions.length > 7 ||
        !item.actions.every(isNonEmptyString) || new Set(item.actions).size !== item.actions.length)
      throw new Error(`Invalid inventory or gold in ${item.id}`);
    const edges = item.edges || [];
    if (!Array.isArray(edges) || !edges.every(e => Array.isArray(e) && e.length === 2 && e.every(a => item.actions.includes(a))))
      throw new Error(`Gold edge outside action inventory in ${item.id}`);
    if (new Set(edges.map(([a,b]) => `${a}\0${b}`)).size !== edges.length)
      throw new Error(`Duplicate gold prerequisite in ${item.id}`);
    if (item.gold !== 'abstain' && hasCycle(item.actions, edges) !== (item.gold === 'infeasible'))
      throw new Error(`Inconsistent feasibility oracle in ${item.id}`);
    if (item.gold === 'abstain' && !isNonEmptyString(item.policyReason))
      throw new Error(`Missing reason for scoped abstention ${item.id}`);
    counts[item.gold]++;
  }
  if (counts.feasible !== 16 || counts.infeasible !== 3 || counts.abstain !== 9)
    throw new Error(`Unexpected frozen class distribution ${JSON.stringify(counts)}`);
  return { ...fixture, sha256: actualHash, distribution: counts };
}

function validateOrder(item, order) {
  if (!Array.isArray(order) || order.length !== item.actions.length ||
      !order.every(isNonEmptyString) || new Set(order).size !== order.length ||
      !order.every(action => item.actions.includes(action))) return false;
  const position = new Map(order.map((action, i) => [action, i]));
  return item.edges.every(([before, after]) => position.get(before) < position.get(after));
}

function parseExplicitOrder(answer, actions) {
  if (Array.isArray(answer)) return answer;
  if (!isNonEmptyString(answer)) return null;
  const trimmed = answer.trim();
  // Accept only an explicit complete JSON array or a clear "A -> B -> C" chain.
  // Prose listing task names is not objective evidence of a proposed schedule.
  const arrayMatch = /(?:^|```(?:json)?\s*)(\[[\s\S]*?\])(?:\s*```|$)/i.exec(trimmed);
  if (arrayMatch) {
    try { const arr = JSON.parse(arrayMatch[1]); if (Array.isArray(arr)) return arr; }
    catch { /* malformed JSON is not independently scorable */ }
  }
  const chain = trimmed.replace(/^\s*(?:order|sequence|schedule)\s*:\s*/i, '').split(/\s*(?:->|→)\s*/);
  if (chain.length === actions.length && chain.every(item => actions.includes(item.trim())))
    return chain.map(item => item.trim());
  return null;
}

export function scoreIndependentOutcome(item, { answer = null, verification = null } = {}) {
  const explicitOrder = parseExplicitOrder(answer, item.actions);
  const verbal = typeof answer === 'string' ? answer.trim().toLowerCase() : '';
  const infeasible = explicitOrder === null && /\b(?:no feasible order|no valid order|no (?:total )?order satisfies|cycle prevents|cyclic dependency|impossible to satisfy|cannot satisfy all|inconsistent prerequisites)\b/i.test(verbal);
  const abstained = explicitOrder === null && !infeasible &&
    /\b(?:cannot verify|can't verify|insufficient information|ambiguous|unsupported|cannot determine|can't determine|must abstain|unable to verify|not enough information)\b/i.test(verbal);
  let correct = false, outcome = 'unsupported_or_unscorable';
  if (explicitOrder) {
    outcome = 'proposed_order';
    correct = item.gold === 'feasible' && validateOrder(item, explicitOrder);
  } else if (infeasible) {
    outcome = 'asserted_infeasible';
    correct = item.gold === 'infeasible';
  } else if (abstained) {
    outcome = 'abstention';
    correct = item.gold === 'abstain';
  }
  const claimedVerified = verification?.status === 'verified' || verification?.status === 'VERIFIED';
  return { id: item.id, gold: item.gold, outcome, correct, claimedVerified,
    falseVerification: claimedVerified && !correct,
    coverage: outcome !== 'unsupported_or_unscorable',
    proposedOrder: explicitOrder || undefined,
  };
}

// Prints the immutable fixture identity only; no model generation occurs here.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fixture = loadIndependentFixture();
  const tests = [
    scoreIndependentOutcome(fixture.cases[0], { answer: ['Chart shallows','Read tide gauge','Reserve skiff','Start patrol'] }),
    scoreIndependentOutcome(fixture.cases[0], { answer: ['Start patrol','Reserve skiff','Read tide gauge','Chart shallows'], verification: { status: 'verified' } }),
    scoreIndependentOutcome(fixture.cases[16], { answer: 'No feasible order satisfies the stated prerequisites.' }),
    scoreIndependentOutcome(fixture.cases[19], { answer: 'I cannot verify an order: ambiguous wording.' }),
  ];
  if (!(tests[0].correct && !tests[0].falseVerification &&
      !tests[1].correct && tests[1].falseVerification && tests[2].correct && tests[3].correct))
    throw new Error(`Independent outcome oracle selftest failed: ${JSON.stringify(tests)}`);
  let positiveOrders = 0, rejectedMutations = 0, scopedAbstentions = 0;
  for (const item of fixture.cases) {
    if (item.gold === 'feasible') {
      const order = [], remaining = [...item.actions];
      while (remaining.length) {
        const eligible = remaining.find(candidate => item.edges.every(([before, after]) =>
          after !== candidate || order.includes(before)));
        if (!eligible) throw new Error(`Positive gold graph has no topological action: ${item.id}`);
        order.push(eligible);
        remaining.splice(remaining.indexOf(eligible), 1);
      }
      const accepted = scoreIndependentOutcome(item, { answer: JSON.stringify(order) });
      if (!accepted.correct) throw new Error(`Independent gold schedule failed: ${item.id}`);
      positiveOrders++;
      const [before, after] = item.edges[0];
      const mutated = [...order];
      [mutated[order.indexOf(before)], mutated[order.indexOf(after)]] = [after, before];
      const rejected = scoreIndependentOutcome(item, { answer: mutated, verification: { status: 'verified' } });
      if (rejected.correct || !rejected.falseVerification) throw new Error(`Mutated schedule accepted: ${item.id}`);
      rejectedMutations++;
    } else if (item.gold === 'infeasible') {
      const accepted = scoreIndependentOutcome(item, { answer: 'No feasible order satisfies all prerequisites.' });
      if (!accepted.correct) throw new Error(`Cyclic graph rejection failed: ${item.id}`);
    } else {
      const accepted = scoreIndependentOutcome(item, { answer: 'I cannot verify this order from ambiguous or unsupported source.' });
      if (!accepted.correct) throw new Error(`Scoped abstention failed: ${item.id}`);
      scopedAbstentions++;
    }
  }
  let wrongHashRejected = false;
  try { loadIndependentFixture(FIXTURE_PATH, '0'.repeat(64)); }
  catch { wrongHashRejected = true; }
  if (!wrongHashRejected) throw new Error('Holdout hash integrity check bypassed');
  console.log(JSON.stringify({ status: 'PASS', fixtureId: fixture.fixtureId,
    sha256: fixture.sha256, distribution: fixture.distribution,
    positiveOrders, rejectedMutations, scopedAbstentions, wrongHashRejected,
    actualModelRuns: 0, scope: 'independent_gold_oracle_structural_selftest_only' }));
}
