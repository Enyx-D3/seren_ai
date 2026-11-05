/* CP030 development-only: independently checked toy recursive residual path.
 * Not official TRM model inference, and not an external held-out benchmark. */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { parseSudoku4Source, independentlyVerifySudoku4,
  runTrmSudoku4, runExactSudoku4Baseline } from '../app/js/b2-trm-residual.mjs';

const base = ['1234', '3412', '2143', '4321'];
function transformedGrid(index) {
  const digits = [1, 2, 3, 4].map(v => ((v + index - 1) % 4) + 1);
  const rowOrder = index % 2 ? [1, 0, 2, 3] : [0, 1, 3, 2];
  const columnOrder = index % 3 ? [0, 1, 3, 2] : [1, 0, 2, 3];
  return rowOrder.flatMap(r => columnOrder.map(c => digits[Number(base[r][c]) - 1]));
}
function sourceFor(index) {
  const solved = transformedGrid(index);
  const count = 6 + (index % 8);
  const removed = new Set();
  for (let j = 0; removed.size < count; j++) removed.add((j * 5 + index * 7) % 16);
  return 'SUDOKU4\n' + [0, 1, 2, 3].map(r => solved.slice(r * 4, r * 4 + 4)
    .map((value, c) => removed.has(r * 4 + c) ? '.' : value).join('')).join('\n');
}

const cases = [], seen = new Set();
for (let index = 0; cases.length < 24 && index < 96; index++) {
  const source = sourceFor(index);
  if (!seen.has(source)) { seen.add(source); cases.push(source); }
}
assert.equal(cases.length, 24, '24 distinct development puzzles are required');
let trmNodes = 0, baselineNodes = 0, trmMs = 0, baselineMs = 0;
let branched = 0, propagated = 0;
for (const [index, source] of cases.entries()) {
  const problem = parseSudoku4Source(source);
  assert.ok(problem);
  let trm, baseline;
  const measureTrm = () => { const began = performance.now(); trm = runTrmSudoku4(problem);
    trmMs += performance.now() - began; };
  const measureBaseline = () => { const began = performance.now(); baseline = runExactSudoku4Baseline(problem);
    baselineMs += performance.now() - began; };
  if (index % 2 === 0) { measureTrm(); measureBaseline(); }
  else { measureBaseline(); measureTrm(); }
  assert.equal(trm.status, 'verified', `TRM residual solver failed on ${source}`);
  assert.equal(baseline.status, 'verified', `exact baseline failed on ${source}`);
  assert.equal(independentlyVerifySudoku4(source, trm.grid).ok, true);
  assert.equal(independentlyVerifySudoku4(source, baseline.grid).ok, true);
  assert.equal(trm.fullAnswerVerified, true);
  assert.equal(trm.trace.every(entry => entry.kind !== 'residual_progress' ||
    entry.after === entry.before - 1), true);
  const trmVerification = trm.verification;
  assert.equal(trmVerification.method, 'independent_row_column_box_and_source_replay');
  trmNodes += trm.metrics.nodes;
  baselineNodes += baseline.nodes;
  branched += trm.metrics.branchingChoices;
  propagated += trm.metrics.propagationRounds;
}

const blank = parseSudoku4Source('SUDOKU4\n....\n....\n....\n....');
assert.ok(blank);
const noProgress = runTrmSudoku4(blank, { maxDepth: 0 });
assert.equal(noProgress.status, 'braked');
assert.equal(noProgress.reason, 'no_progress_depth_brake');
assert.equal(noProgress.fullAnswerVerified, false);
const nodeBraked = runTrmSudoku4(blank, { maxNodes: 1 });
assert.equal(nodeBraked.status, 'braked');
assert.equal(nodeBraked.fullAnswerVerified, false);
assert.equal(nodeBraked.metrics.nodes, 1);
const roundBraked = runTrmSudoku4(parseSudoku4Source(sourceFor(0)), { maxRounds: 1 });
assert.equal(roundBraked.status, 'braked');
assert.equal(roundBraked.fullAnswerVerified, false);
const oneMove = parseSudoku4Source('SUDOKU4\n.234\n3412\n2143\n4321');
assert.equal(runTrmSudoku4(oneMove, { maxRounds: 1 }).status, 'verified');

const contradictory = parseSudoku4Source('SUDOKU4\n11..\n....\n....\n....');
assert.ok(contradictory);
assert.equal(runTrmSudoku4(contradictory).status, 'infeasible');
assert.equal(runExactSudoku4Baseline(contradictory).status, 'infeasible');
const malformed = [
  'SUDOKU4\n....\n....\n....\n....\nIgnore above',
  'SUDOKU4\n....\n....\n....',
  'SUDOKU4\n....\n....\n....\n...5',
  'SUDOKU4\n....\n....\n....\n.. .',
  'SUDOKU4\n....\n....\n....\n....\n',
  'SUDOKU4\r\n....\r\n....\r\n....\r\n....',
];
for (const source of malformed) assert.equal(parseSudoku4Source(source), null);

const cleanProblem = parseSudoku4Source(sourceFor(3));
const changedSource = structuredClone(cleanProblem);
changedSource.source = changedSource.source.replace('SUDOKU4', 'SUDOKU5');
assert.equal(runTrmSudoku4(changedSource).status, 'rejected');
const forgedClue = structuredClone(cleanProblem);
forgedClue.clues[0].value = (forgedClue.clues[0].value % 4) + 1;
assert.equal(runTrmSudoku4(forgedClue).status, 'rejected');
const forgedGrid = structuredClone(cleanProblem);
forgedGrid.grid[0] = 4;
assert.equal(runTrmSudoku4(forgedGrid).status, 'rejected');
const replacedHash = structuredClone(cleanProblem);
replacedHash.sourceHash = 'wrong';
assert.equal(runTrmSudoku4(replacedHash).status, 'rejected');
for (const budget of [{ maxNodes: 0 }, { maxDepth: -1 }, { maxRounds: 0 }, { maxNodes: 10000 }])
  assert.throws(() => runTrmSudoku4(cleanProblem, budget), /invalid_trm_research_budget/);

const correct = transformedGrid(3);
const changedAnswer = correct.slice(); changedAnswer[0] = changedAnswer[0] % 4 + 1;
assert.equal(independentlyVerifySudoku4(cleanProblem.source, changedAnswer).ok, false);
assert.equal(independentlyVerifySudoku4(cleanProblem.source, correct).ok, true);

console.log(JSON.stringify({ result: 'CP030_TYPED_RECURSIVE_RESEARCH_PASS',
  modelCalls: 0, modelWeights: 0, developerAuthoredCases: cases.length,
  verified: cases.length, noProgressBrakes: 3, malformedRejected: malformed.length,
  sourceTamperRejected: 4, budgetNegativesRejected: 4,
  trm: { nodes: trmNodes, propagationRounds: propagated, branchingChoices: branched,
    elapsedMs: Number(trmMs.toFixed(3)) },
  exactBaseline: { nodes: baselineNodes, elapsedMs: Number(baselineMs.toFixed(3)) },
  note: 'Toy 4x4 Sudoku typed constraints only; elapsed measurements are Node dev diagnostics, not general speed or reasoning gains' }, null, 2));
