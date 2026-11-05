/**
 * Independent, model-free V2 dependency red-team suite.
 *
 * The gold edges below are separately authored in a frozen fixture; neither
 * the DUT graph nor its verifier determines the expected outcome. The suite
 * measures source-to-edge admission separately from solver correctness.
 *
 * Run: node tools/b2_v2_parallel_independent_eval.mjs
 * Frozen second set: --confirm
 * Optional candidate: --candidate=/absolute/path/to/b2-semantic-extraction.mjs
 * The script never updates calibration, the older P4 fixtures, or user data.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { interpretDependencyTask, executeDependencyPath, verifyDependencyOrder,
  checkSourceRelationship } from '../app/js/b2-dependency-task.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const confirmation = process.argv.includes('--confirm');
const fixtureFile = resolve(here, confirmation
  ? 'fixtures/b2_v2_parallel_dependency_confirmation_2026_11_05.json'
  : 'fixtures/b2_v2_parallel_dependency_redteam.json');
const bytes = readFileSync(fixtureFile);
const fixture = JSON.parse(bytes.toString('utf8'));
assert.equal(fixture.schemaVersion, 1);
assert.equal(new Set(fixture.cases.map(test => test.id)).size, fixture.cases.length,
  'duplicate case ID');
const fixtureSha256 = createHash('sha256').update(bytes).digest('hex');
const FROZEN_FIXTURE_SHA256 = confirmation
  ? 'fb9cedee175024d2871d0653d2f4e62970be2d79b89674077f71744b0b7933b8'
  : '1b2512fef0ea75d8c3df5cb592ea592ee88010cd6fce33d5c1637d6028ccfd81';
assert.equal(fixtureSha256, FROZEN_FIXTURE_SHA256,
  'fixture changed: create a separately versioned test set instead of rewriting baseline');

function goldNodes(test) {
  return [...new Set(test.edges.flat())];
}
function goldValid(test, order) {
  const nodes = goldNodes(test);
  return Array.isArray(order) && order.length === nodes.length && new Set(order).size === nodes.length &&
    nodes.every(node => order.includes(node)) &&
    test.edges.every(([before, after]) => order.indexOf(before) < order.indexOf(after));
}
function independentFeasibility(test) {
  const nodes = goldNodes(test);
  let witness;
  const search = (prefix, rest) => {
    if (witness) return;
    if (!rest.length) {
      if (goldValid(test, prefix)) witness = prefix;
      return;
    }
    for (let i = 0; i < rest.length; i++) search([...prefix, rest[i]], rest.filter((_, j) => j !== i));
  };
  search([], nodes);
  return witness || null;
}
const identity = pair => JSON.stringify(pair);
const edgesEqual = (actual, expected) => {
  const a = actual.map(item => identity([item.before, item.after])).sort();
  const b = expected.map(item => identity(item)).sort();
  return JSON.stringify(a) === JSON.stringify(b);
};
const exactSpans = (source, facts) => facts.every(f =>
  Number.isInteger(f.sourceOffset) && f.sourceOffset >= 0 && typeof f.quote === 'string' &&
  source.slice(f.sourceOffset, f.sourceOffset + f.quote.length) === f.quote &&
  typeof f.before === 'string' && typeof f.after === 'string');

function examineBaseline(test) {
  const problem = interpretDependencyTask(test.source);
  if (!problem || problem.unknowns.length) {
    return { status: 'abstained', expected: test.gold, reason: !problem ? 'no_interpretation' :
      problem.unknowns.map(item => item.reason).join(',') };
  }
  const provenance = exactSpans(test.source, problem.facts);
  const gold = test.gold === 'abstain' ? null : test.edges;
  const factsMatch = !!gold && edgesEqual(problem.facts, gold);
  const result = executeDependencyPath(problem, 'dependency_forward');
  const reverse = executeDependencyPath(problem, 'dependency_backward');
  const ownCheck = verifyDependencyOrder(problem, result);
  const ownReverse = verifyDependencyOrder(problem, reverse);
  const witness = gold && independentFeasibility(test);
  const expectedFeasible = test.gold === 'feasible';
  const independentlyCorrect = gold &&
    (expectedFeasible ? goldValid(test, result) && goldValid(test, reverse) :
      result === null && reverse === null && witness === null);
  const externallyVerified = ownCheck.ok && ownReverse.ok && provenance && factsMatch && independentlyCorrect;
  let status = 'false_verification';
  if (externallyVerified) status = 'accepted_checked';
  return {
    status, expected: test.gold, sourceSpansValid: provenance,
    factsMatchGold: factsMatch, ownVerifierForward: ownCheck.ok,
    ownVerifierBackward: ownReverse.ok, independentOracle: independentlyCorrect,
    directionsAgree: (result === null && reverse === null) ||
      (Array.isArray(result) && Array.isArray(reverse) &&
        (test.gold === 'feasible' ? goldValid(test, result) && goldValid(test, reverse) : true)),
    result, reverse, observedEdges: problem.facts.map(f => [f.before, f.after]),
  };
}

function verifyAdversarialStateMutations() {
  const parsed = interpretDependencyTask('first screening must happen before final screening. Give an order for first screening and final screening.');
  assert.ok(parsed && !parsed.unknowns.length, 'mutation seed did not parse');
  assert.ok(parsed.facts.every(f => checkSourceRelationship(parsed.source, f)));
  const original = parsed.facts[0];
  const mutations = [
    { ...original, sourceOffset: original.sourceOffset + 1 },
    { ...original, quote: `${original.quote} alter` },
    { ...original, before: original.after, after: original.before },
    { ...original, relationEvidence: { ...original.relationEvidence, prefix: 'before' } },
  ];
  return mutations.map((mutation, i) => ({ id: `M0${i + 1}`,
    rejected: !checkSourceRelationship(parsed.source, mutation) }));
}

async function examineCandidate(test, candidate) {
  if (!candidate) return null;
  const gold = test.gold === 'abstain' ? null : test.edges;
  // The candidate extraction is deliberately not passed into the baseline
  // controller/verifier: parser-only improvements are not end-to-end passes.
  // Do not pass oracle labels/names into the candidate. Only action names
  // explicitly enumerated in the user's *source text* may be supplied.
  const goalNames = /\b(?:order|sequence|schedule|plan)\s+(?:for|of|using)\s+([^.!?]+)[.!?]?$/i.exec(test.source)?.[1]
    ?.split(/,\s*|\s+and\s+/).map(name => name.trim()).filter(Boolean) || [];
  const sourceNamed = goalNames.length >= 2 && goalNames.every(name => /^[a-z][a-z -]{0,59}$/i.test(name)) ? goalNames : [];
  const result = candidate.extractDependencyRelations(test.source, {
    actionNames: sourceNamed,
  });
  const accepted = result?.status === 'parsed' && !result.unknowns?.length;
  if (!accepted) return { status: 'abstained', expected: test.gold };
  const sourceIdentity = result.source === test.source;
  const spans = sourceIdentity && exactSpans(test.source, result.facts || []);
  const matching = !!gold && edgesEqual(result.facts || [], gold);
  const secondary = typeof candidate.verifyExtractedDependencyFacts === 'function'
    ? candidate.verifyExtractedDependencyFacts(test.source, result) : null;
  const checked = spans && matching && secondary?.ok === true;
  return { status: checked ? 'extraction_correct' : 'unsafe_or_incorrect_extraction',
    expected: test.gold, sourceIdentity, sourceSpansValid: spans, factsMatchGold: matching,
    independentVerifier: secondary?.ok ?? null,
    observedEdges: (result.facts || []).map(f => [f.before, f.after]) };
}

const candidateArg = process.argv.find(item => item.startsWith('--candidate='));
let candidate = null;
if (candidateArg) {
  const sourcePath = resolve(process.cwd(), candidateArg.slice('--candidate='.length));
  candidate = await import(pathToFileURL(sourcePath));
  assert.equal(typeof candidate.extractDependencyRelations, 'function',
    'candidate must export extractDependencyRelations');
  assert.equal(typeof candidate.verifyExtractedDependencyFacts, 'function',
    'candidate must export verifyExtractedDependencyFacts');
}

const rows = [];
for (const test of fixture.cases) {
  if (test.gold !== 'abstain') {
    const witness = independentFeasibility(test);
    assert.equal(!!witness, test.gold === 'feasible', `${test.id}: invalid independent gold`);
  }
  const baseline = examineBaseline(test);
  const proposal = await examineCandidate(test, candidate);
  rows.push({ id: test.id, category: test.category, gold: test.gold, baseline, ...(proposal && { candidate: proposal }) });
}
const mutationRows = verifyAdversarialStateMutations();
const group = (key, field) => rows.reduce((acc, row) => {
  const name = row[field]?.[key] || 'not_available';
  acc[name] = (acc[name] || 0) + 1; return acc;
}, {});
const summarize = field => ({ ...group('status', field),
  acceptedCorrect: rows.filter(r => r[field]?.status === 'accepted_checked' ||
    r[field]?.status === 'extraction_correct').length,
  safeAbstentions: rows.filter(r => r.gold === 'abstain' && r[field]?.status === 'abstained').length,
  missedSupported: rows.filter(r => r.gold !== 'abstain' && r[field]?.status === 'abstained').length,
  unsafeAcceptances: rows.filter(r => r[field]?.status === 'false_verification' ||
    r[field]?.status === 'unsafe_or_incorrect_extraction').length,
});
const summary = {
  schemaVersion: 1, source: confirmation ? 'seren7_v2_sealed_confirmation' : 'seren7_v2_development_redteam', fixtureSha256,
  baseRevision: 'b52b636', modelCalls: 0,
  total: rows.length, fixtureGroups: rows.reduce((acc,r) => (acc[r.category]=(acc[r.category]||0)+1,acc),{}),
  baseline: summarize('baseline'), candidate: candidate ? summarize('candidate') : 'not_evaluated',
  mutationRejections: `${mutationRows.filter(r => r.rejected).length}/${mutationRows.length}`,
  failures: rows.filter(r => ['false_verification','unsafe_or_incorrect_extraction'].includes(r.baseline.status) ||
    ['false_verification','unsafe_or_incorrect_extraction'].includes(r.candidate?.status)).map(r => ({
      id:r.id, gold:r.gold, baseline:r.baseline, candidate:r.candidate,
    })),
  coverageMisses: rows.filter(r => r.gold !== 'abstain' && r.baseline.status === 'abstained')
    .map(r => ({ id:r.id, category:r.category, reason:r.baseline.reason })),
};
if (process.argv.includes('--json')) console.log(JSON.stringify({ summary, rows, mutationRows }, null, 2));
else if (confirmation) {
  const { failures: _hiddenFailures, coverageMisses: _hiddenCoverageMisses, ...aggregate } = summary;
  console.log(JSON.stringify({ ...aggregate, hiddenFailureCases: summary.failures.length,
    hiddenCoverageMisses: summary.coverageMisses.length }, null, 2));
} else console.log(JSON.stringify(summary, null, 2));
// The baseline is intentionally audited, not blessed. A nonzero exit flags
// demonstrable unsafe acceptance or an invalid tamper guard. Coverage misses
// are measured as gaps, not false safety passes.
if (summary.baseline.unsafeAcceptances || summary.candidate?.unsafeAcceptances ||
    mutationRows.some(row => !row.rejected)) process.exitCode = 1;
