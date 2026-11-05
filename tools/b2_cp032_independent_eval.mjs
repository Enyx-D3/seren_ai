/* CP032 independent, separately authored cross-domain ordering evaluator.
 *
 * Gold comes exclusively from the pinned case fixture's hand-reviewed action
 * inventory / directed edge list, not from a B2 parser, GraphOS or candidate
 * verification receipt. All tasks run with NO language model. This is a new
 * development challenge, NOT external blind language acceptance.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SpiralController } from '../app/js/spiral.mjs';

export const CP032_FIXTURE_SHA256 = '174c6cb7a34066871e6576969288639bbe4d3fcd49e0b721dc902cd1f2c8b0ca';
export const CP032_FIXTURE_URL = new URL('./fixtures/b2_cp032_cross_domain_2026_11_05.json', import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const ALLOWED_GOLD = new Set(['feasible', 'infeasible', 'abstain']);
const ALLOWED_REASONS = new Set([
  'external_prerequisite', 'conditional', 'exception', 'negation', 'alternative',
  'ambiguous_reference', 'injected_instruction', 'conflicting_goal',
  'duplicate_inventory', 'uncertain', 'conflicting_authority', 'missing_evidence',
]);
const PLAIN_NAME = /^[A-Za-z0-9][A-Za-z0-9 -]{1,63}$/;

/** Exact independent graph oracle, intentionally separate from GraphOS. */
export function firstValidPermutation(actions, edges) {
  if (!Array.isArray(actions) || actions.length < 2 || actions.length > 7)
    throw Error('gold_invalid_action_set');
  const order = [];
  const remaining = [...actions];
  let result = null;
  function recurse() {
    if (result) return;
    if (!remaining.length) {
      if (edges.every(([before, after]) => order.indexOf(before) < order.indexOf(after)))
        result = [...order];
      return;
    }
    for (let i = 0; i < remaining.length; i++) {
      const choice = remaining[i];
      // A prefix is impossible when an action is placed ahead of a remaining
      // prerequisite. This pruning is purely based on fixture gold edges.
      if (edges.some(([before, after]) => after === choice && remaining.includes(before)))
        continue;
      remaining.splice(i, 1);
      order.push(choice);
      recurse();
      order.pop();
      remaining.splice(i, 0, choice);
      if (result) return;
    }
  }
  recurse();
  return result;
}

function uniqueStrings(rows) {
  return Array.isArray(rows) && rows.every(row => typeof row === 'string' && row.length) &&
    new Set(rows).size === rows.length;
}

export function validateIndependentFixture(fixture, { expectedSha256 = null, bytes = null } = {}) {
  if (bytes && expectedSha256 && sha256(bytes) !== expectedSha256)
    throw Error('fixture_hash_mismatch');
  if (!fixture || fixture.schemaVersion !== 1 ||
      fixture.fixtureId !== 'seren7_cp032_cross_domain_independent_development_2026_11_05' ||
      !Array.isArray(fixture.cases) || fixture.cases.length < 30)
    throw Error('invalid_independent_fixture');
  const ids = new Set();
  const domains = new Set();
  let feasible = 0, infeasible = 0, abstain = 0;
  for (const item of fixture.cases) {
    if (!item || !/^cd\d\d_[a-z0-9_]+$/.test(item.id) || ids.has(item.id) ||
        typeof item.domain !== 'string' || !item.domain.trim() ||
        typeof item.source !== 'string' || item.source.length < 65 ||
        item.source.length > 2500 || !ALLOWED_GOLD.has(item.gold))
      throw Error('invalid_case_identity_source_or_gold');
    ids.add(item.id); domains.add(item.domain);
    if (item.gold === 'abstain') {
      abstain++;
      if (!ALLOWED_REASONS.has(item.reason) ||
          typeof item.unsafeQuote !== 'string' || !item.unsafeQuote.length ||
          !item.source.includes(item.unsafeQuote) || item.actions !== undefined ||
          item.edges !== undefined)
        throw Error('unsafe_gold_requires_exact_source_anchor');
      continue;
    }
    if (!uniqueStrings(item.actions) || item.actions.length < 2 || item.actions.length > 7 ||
        item.actions.some(action => !PLAIN_NAME.test(action) ||
          !item.source.includes('"' + action + '"')) ||
        !Array.isArray(item.edges) || !item.edges.length || item.edges.length > 12)
      throw Error('invalid_independent_graph_gold');
    const edges = new Set();
    for (const edge of item.edges) {
      if (!Array.isArray(edge) || edge.length !== 3 ||
          !item.actions.includes(edge[0]) || !item.actions.includes(edge[1]) ||
          edge[0] === edge[1] || typeof edge[2] !== 'string' ||
          edge[2].length < 8 || !item.source.includes(edge[2]) ||
          edges.has(edge[0] + '\0' + edge[1]))
        throw Error('unanchored_duplicated_or_invalid_gold_edge');
      edges.add(edge[0] + '\0' + edge[1]);
    }
    const solution = firstValidPermutation(item.actions, item.edges);
    if (item.gold === 'feasible') {
      feasible++;
      if (!solution) throw Error('feasible_gold_has_no_valid_order');
    } else {
      infeasible++;
      if (solution) throw Error('infeasible_gold_has_valid_order');
    }
  }
  if (feasible < 15 || infeasible < 3 || abstain < 8 || domains.size < 8)
    throw Error('insufficient_gold_category_or_domain_diversity');
  return Object.freeze({ total: ids.size, feasible, infeasible, abstain,
    domains: domains.size, fixtureSha256: bytes ? sha256(bytes) : null });
}

export async function loadIndependentCp032Fixture() {
  const bytes = await readFile(CP032_FIXTURE_URL);
  const fixture = JSON.parse(bytes.toString('utf8'));
  const validated = validateIndependentFixture(fixture, {
    expectedSha256: CP032_FIXTURE_SHA256, bytes,
  });
  return { fixture, validated };
}

export function independentlyScoreCp032(item, { answer = '', verification = null } = {}) {
  const claimedVerified = verification?.status === 'verified';
  if (item.gold === 'abstain') {
    const safe = !claimedVerified && /cannot verify|can't verify|cannot establish|not verified|unable to verify/i.test(answer);
    return { correct: safe, falseVerification: claimedVerified,
      gold: item.gold, outcome: safe ? 'safe_abstention' :
        claimedVerified ? 'unsafe_verified' : 'unscorable_abstention',
      claimedVerified, safeAbstention: safe };
  }
  const validGold = firstValidPermutation(item.actions, item.edges) !== null;
  if (item.gold === 'infeasible') {
    const conclusion = /no feasible order|no valid sequence|impossible order/i.test(answer);
    const correct = claimedVerified && !validGold && conclusion;
    return { correct, falseVerification: claimedVerified && !correct,
      gold: item.gold, outcome: correct ? 'checked_infeasible' :
        claimedVerified ? 'unsafe_verified' : 'unsolved_infeasible',
      claimedVerified, safeAbstention: false };
  }
  let proposed = null;
  try { proposed = JSON.parse(answer); } catch {}
  const valid = Array.isArray(proposed) && proposed.length === item.actions.length &&
    uniqueStrings(proposed) &&
    item.actions.every(action => proposed.includes(action)) &&
    item.edges.every(([before, after]) => proposed.indexOf(before) < proposed.indexOf(after));
  const correct = Boolean(claimedVerified && valid && validGold);
  return { correct, falseVerification: claimedVerified && !correct,
    gold: item.gold, outcome: correct ? 'checked_feasible' :
      claimedVerified ? 'unsafe_verified' : 'unsolved_feasible',
    claimedVerified, safeAbstention: false };
}

function p95(rows) {
  if (!rows.length) return null;
  const sorted = rows.slice().sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * .95) - 1];
}
function summarize(rows, arm) {
  const selected = rows.filter(row => row.arm === arm);
  return {
    cases: selected.length,
    feasibleCorrect: selected.filter(row => row.gold === 'feasible' && row.score.correct).length,
    infeasibleCorrect: selected.filter(row => row.gold === 'infeasible' && row.score.correct).length,
    safeAbstentions: selected.filter(row => row.score.safeAbstention).length,
    completeCorrect: selected.filter(row => row.score.correct).length,
    falseVerifications: selected.filter(row => row.score.falseVerification).length,
    unverifiedFeasible: selected.filter(row => row.gold === 'feasible' && !row.score.correct &&
      !row.score.falseVerification).length,
    modelCalls: selected.reduce((sum, row) => sum + row.modelCalls, 0),
    calculatorCalls: selected.reduce((sum, row) => sum + row.calculatorCalls, 0),
    totalElapsedMs: selected.reduce((sum, row) => sum + row.elapsedMs, 0),
    p95ElapsedMs: p95(selected.map(row => row.elapsedMs)),
    runtimeErrors: selected.filter(row => row.error).length,
  };
}

export async function runIndependentCp032Evaluation(fixture) {
  const controller = new SpiralController();
  const rows = [];
  for (const [index, item] of fixture.cases.entries()) {
    const arms = index % 2 === 0 ? ['existing', 'prose_v2'] : ['prose_v2', 'existing'];
    for (const arm of arms) {
      const start = performance.now();
      let result = null, error = null;
      try {
        result = await controller.run(item.source, {
          scope: 'cp032-independent/' + item.id,
          experimentalDependency: true,
          experimentalProseV2: arm === 'prose_v2',
          experimentalCortexGuard: true,
        });
      } catch (cause) { error = String(cause?.message || cause).slice(0, 160); }
      const elapsedMs = performance.now() - start;
      const answer = result?.answer || '';
      const verification = result?.verification || { status: 'unverified', method: 'runtime_error' };
      const score = independentlyScoreCp032(item, { answer, verification });
      if (error) {
        score.correct = false;
        score.outcome = 'runtime_error';
        score.falseVerification = verification.status === 'verified';
      }
      rows.push({ id: item.id, domain: item.domain, gold: item.gold, arm, armOrder: arms,
        answer, verification, score, modelCalls: result?.metrics?.modelCalls || 0,
        calculatorCalls: result?.metrics?.calculatorCalls || 0, elapsedMs, error });
    }
  }
  return {
    checkpoint: 'CP032_INDEPENDENT_CROSS_DOMAIN_DEV',
    status: 'COMPLETE_WITH_MEASURED_RESULTS',
    runtime: 'local Node actual SpiralController, no model supplied and zero generated tokens',
    caveat: 'Developed separately from CP027 parser tasks, but still locally authored and NOT externally blind broad reasoning acceptance.',
    fixtureSha256: CP032_FIXTURE_SHA256,
    rows, byArm: { existing: summarize(rows, 'existing'), prose_v2: summarize(rows, 'prose_v2') },
    strictQualityGate: rows.some(row => row.score.falseVerification) ? 'FAIL_FALSE_VERIFICATION' :
      'NO_FALSE_VERIFICATION_IN_THIS_DEV_SET',
    modelFreeOnly: true, browserExecuted: false, physicalDeviceExecuted: false,
  };
}

async function cli() {
  const { fixture, validated } = await loadIndependentCp032Fixture();
  const result = await runIndependentCp032Evaluation(fixture);
  assert.equal(result.rows.length, fixture.cases.length * 2);
  const evidencePath = resolve(root, 'evidence/cp032-independent-cross-domain-evaluation-2026-11-05.json');
  if (!evidencePath.startsWith(resolve(root, 'evidence') + '/')) throw Error('invalid_output_path');
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, JSON.stringify({ ...result, fixture: validated }, null, 2) + '\n');
  console.log(JSON.stringify({ output: evidencePath, fixture: validated,
    byArm: result.byArm, strictQualityGate: result.strictQualityGate,
    caveat: result.caveat }, null, 2));
  if (result.strictQualityGate === 'FAIL_FALSE_VERIFICATION') process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  cli().catch(error => { console.error(error?.stack || error); process.exitCode = 1; });
