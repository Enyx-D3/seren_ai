/* CP030 EXPERIMENTAL_ONLY — typed recursive residual solver research.
 * A bounded 4x4 Sudoku toy, not official Tiny Recursive Model weights, a
 * general-language reasoner, or an active normal-chat inference route.
 * Clues are assumptions scoped to exact source text; only a separate final
 * grid oracle can mark a whole puzzle solved. */
import { Sha256 } from './sha256.mjs';

export const TRM_RESIDUAL_POLICY = 'b2-trm-sudoku4-residual-research-1';
const HEADER = 'SUDOKU4\n';
const SOURCE_PATTERN = /^SUDOKU4\n([1-4.]{4})\n([1-4.]{4})\n([1-4.]{4})\n([1-4.]{4})$/;
const ALL = [1, 2, 3, 4];
const sourceHash = text => new Sha256().update(new TextEncoder().encode(text)).digest();

function frozen(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}

export function parseSudoku4Source(source) {
  if (typeof source !== 'string' || source.length !== HEADER.length + 19)
    return null;
  const matched = SOURCE_PATTERN.exec(source);
  if (!matched) return null;
  const grid = [], clues = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const quote = matched[r + 1][c];
    const value = quote === '.' ? 0 : Number(quote);
    const index = r * 4 + c;
    const sourceOffset = HEADER.length + r * 5 + c;
    if (source[sourceOffset] !== quote) return null;
    grid.push(value);
    if (value) clues.push({ cell: index, row: r, col: c, value, quote, sourceOffset,
      provenance: 'assumed_input', truthScope: 'puzzle_clue_from_supplied_source' });
  }
  return frozen({ schemaVersion: 1, policy: TRM_RESIDUAL_POLICY, source,
    sourceHash: sourceHash(source), grid, clues });
}

/** Independently reconstructs all givens from original text, and checks an
 * entire proposed grid by row, column and 2x2 subgrid. It intentionally does
 * not use the recursive solver's candidate-generation or propagation code. */
export function independentlyVerifySudoku4(source, candidate) {
  const input = typeof source === 'string' ? SOURCE_PATTERN.exec(source) : null;
  if (!input) return { ok: false, reason: 'source_grammar_mismatch' };
  if (!Array.isArray(candidate) || candidate.length !== 16 ||
      candidate.some(value => !Number.isInteger(value) || value < 1 || value > 4))
    return { ok: false, reason: 'invalid_finished_grid' };
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const sourceDigit = input[r + 1][c];
    if (sourceDigit !== '.' && candidate[r * 4 + c] !== Number(sourceDigit))
      return { ok: false, reason: 'source_clue_changed', row: r, col: c };
  }
  const isSet = values => values.slice().sort((a, b) => a - b).join('') === '1234';
  for (let r = 0; r < 4; r++) {
    if (!isSet(candidate.slice(r * 4, r * 4 + 4))) return { ok: false, reason: 'row_duplicate', row: r };
    if (!isSet([0, 1, 2, 3].map(i => candidate[i * 4 + r])))
      return { ok: false, reason: 'column_duplicate', col: r };
  }
  for (let r = 0; r < 4; r += 2) for (let c = 0; c < 4; c += 2) {
    if (!isSet([candidate[r * 4 + c], candidate[r * 4 + c + 1],
      candidate[(r + 1) * 4 + c], candidate[(r + 1) * 4 + c + 1]]))
      return { ok: false, reason: 'box_duplicate', row: r, col: c };
  }
  return { ok: true, method: 'independent_row_column_box_and_source_replay',
    scope: 'solution_conditional_on_supplied_4x4_sudoku_clues' };
}

function candidates(grid, cell) {
  if (grid[cell]) return [];
  const r = Math.floor(cell / 4), c = cell % 4, forbidden = new Set();
  for (let i = 0; i < 4; i++) {
    forbidden.add(grid[r * 4 + i]);
    forbidden.add(grid[i * 4 + c]);
  }
  const r0 = r - (r % 2), c0 = c - (c % 2);
  for (let dr = 0; dr < 2; dr++) for (let dc = 0; dc < 2; dc++)
    forbidden.add(grid[(r0 + dr) * 4 + c0 + dc]);
  return ALL.filter(value => !forbidden.has(value));
}

function partialConsistent(grid) {
  for (let r = 0; r < 4; r++) {
    const row = grid.slice(r * 4, r * 4 + 4).filter(Boolean);
    if (new Set(row).size !== row.length) return false;
    const col = [0, 1, 2, 3].map(i => grid[i * 4 + r]).filter(Boolean);
    if (new Set(col).size !== col.length) return false;
  }
  for (let r = 0; r < 4; r += 2) for (let c = 0; c < 4; c += 2) {
    const block = [grid[r * 4 + c], grid[r * 4 + c + 1],
      grid[(r + 1) * 4 + c], grid[(r + 1) * 4 + c + 1]].filter(Boolean);
    if (new Set(block).size !== block.length) return false;
  }
  return true;
}

function selectResidual(grid) {
  let selected = null;
  for (let cell = 0; cell < 16; cell++) if (!grid[cell]) {
    const values = candidates(grid, cell);
    if (!selected || values.length < selected.values.length) selected = { cell, values };
    if (values.length === 0) return { cell, values };
  }
  return selected;
}

function validProblem(problem) {
  const reparse = parseSudoku4Source(problem?.source);
  return !!reparse && problem?.policy === TRM_RESIDUAL_POLICY &&
    problem.sourceHash === reparse.sourceHash &&
    JSON.stringify(problem.grid) === JSON.stringify(reparse.grid) &&
    JSON.stringify(problem.clues) === JSON.stringify(reparse.clues);
}

function checkLimits({ maxNodes, maxDepth, maxRounds }) {
  if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 4096 ||
      !Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 16 ||
      !Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 64)
    throw new Error('invalid_trm_research_budget');
}

/** A typed symbolic stand-in for recursive residual correction: a local
 * constraint propagation pass can update only empty cells; no-progress either
 * branches under a finite depth/node budget or brakes. Every complete answer
 * receives the independent source-aware whole-grid check. */
export function runTrmSudoku4(problem, { maxNodes = 256, maxDepth = 16, maxRounds = 32 } = {}) {
  checkLimits({ maxNodes, maxDepth, maxRounds });
  if (!validProblem(problem)) return frozen({ status: 'rejected', reason: 'stale_or_untrusted_source' });
  const metrics = { nodes: 0, propagationRounds: 0, branchingChoices: 0, locallyConsistentSteps: 0 };
  const trace = [], traceLimit = Math.min(4096, maxNodes * 20);
  const log = event => { if (trace.length < traceLimit) trace.push(event); };
  const startBlanks = problem.grid.filter(x => !x).length;
  if (!partialConsistent(problem.grid)) return frozen({ status: 'infeasible', reason: 'contradictory_source_clues',
    sourceHash: problem.sourceHash, order: null, metrics, trace, fullAnswerVerified: false });

  function visit(input, depth) {
    if (metrics.nodes >= maxNodes) return { kind: 'braked', reason: 'node_budget' };
    metrics.nodes++;
    let grid = input.slice();
    let count = 0;
    while (count < maxRounds) {
      const residual = selectResidual(grid);
      if (!residual) {
        const receipt = independentlyVerifySudoku4(problem.source, grid);
        return receipt.ok ? { kind: 'solved', grid, receipt } : { kind: 'dead', reason: receipt.reason };
      }
      if (!residual.values.length) return { kind: 'dead', reason: 'zero_candidate_residual' };
      let single = null;
      for (let cell = 0; cell < 16; cell++) {
        if (grid[cell]) continue;
        const values = candidates(grid, cell);
        if (values.length === 1) { single = { cell, value: values[0] }; break; }
      }
      if (!single) break;
      const before = grid.filter(x => !x).length;
      grid[single.cell] = single.value;
      metrics.propagationRounds++;
      count++;
      if (!partialConsistent(grid)) return { kind: 'dead', reason: 'local_constraint_conflict' };
      metrics.locallyConsistentSteps++;
      log({ kind: 'residual_progress', depth, cell: single.cell, value: single.value,
        before, after: before - 1, provenance: 'derived_from_source_constraints',
        status: 'locally_consistent_not_whole_verified' });
    }
    const residual = selectResidual(grid);
    if (!residual) {
      const receipt = independentlyVerifySudoku4(problem.source, grid);
      return receipt.ok ? { kind: 'solved', grid, receipt } : { kind: 'dead', reason: receipt.reason };
    }
    if (count === maxRounds) return { kind: 'braked', reason: 'round_budget' };
    log({ kind: 'no_singleton_progress', depth, residualCell: residual.cell,
      remaining: grid.filter(x => !x).length, action: depth >= maxDepth ? 'brake' : 'bounded_branch' });
    if (depth >= maxDepth) return { kind: 'braked', reason: 'no_progress_depth_brake' };
    let incomplete = false;
    for (const value of residual.values) {
      metrics.branchingChoices++;
      const next = grid.slice();
      next[residual.cell] = value;
      if (!partialConsistent(next)) continue;
      log({ kind: 'branch_proposal', depth, cell: residual.cell, value,
        sourceHash: problem.sourceHash, status: 'provisional' });
      const branch = visit(next, depth + 1);
      if (branch.kind === 'solved') return branch;
      if (branch.kind === 'braked') incomplete = true;
    }
    return incomplete ? { kind: 'braked', reason: 'unresolved_budget_exhaustion' } :
      { kind: 'dead', reason: 'all_constraint_branches_exhausted' };
  }

  const result = visit(problem.grid, 0);
  return frozen({ schemaVersion: 1, policy: TRM_RESIDUAL_POLICY, sourceHash: problem.sourceHash,
    status: result.kind === 'solved' ? 'verified' : result.kind === 'braked' ? 'braked' : 'infeasible',
    reason: result.kind === 'solved' ? 'independent_whole_grid_oracle_passed' : result.reason,
    grid: result.kind === 'solved' ? result.grid : null,
    verification: result.receipt || null,
    fullAnswerVerified: result.kind === 'solved' && result.receipt?.ok === true,
    metrics: { ...metrics, sourceClues: problem.clues.length, initialResiduals: startBlanks }, trace });
}

/** Exact non-recursive-heuristic baseline for the same typed puzzle. It uses
 * ordinary MRV depth-first enumeration with no inner propagation loop. */
export function runExactSudoku4Baseline(problem, { maxNodes = 4096 } = {}) {
  if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 4096)
    throw new Error('invalid_exact_baseline_budget');
  if (!validProblem(problem)) return { status: 'rejected', reason: 'stale_or_untrusted_source' };
  if (!partialConsistent(problem.grid)) return { status: 'infeasible', reason: 'contradictory_source_clues', nodes: 0 };
  let nodes = 0;
  function dfs(grid) {
    if (nodes >= maxNodes) return { kind: 'braked' };
    nodes++;
    const residual = selectResidual(grid);
    if (!residual) {
      const receipt = independentlyVerifySudoku4(problem.source, grid);
      return receipt.ok ? { kind: 'solved', grid, receipt } : { kind: 'dead' };
    }
    if (!residual.values.length) return { kind: 'dead' };
    let incomplete = false;
    for (const value of residual.values) {
      const next = grid.slice();
      next[residual.cell] = value;
      const result = dfs(next);
      if (result.kind === 'solved') return result;
      if (result.kind === 'braked') incomplete = true;
    }
    return { kind: incomplete ? 'braked' : 'dead' };
  }
  const result = dfs(problem.grid);
  return { status: result.kind === 'solved' ? 'verified' : result.kind === 'braked' ? 'braked' : 'infeasible',
    grid: result.grid || null, verification: result.receipt || null,
    fullAnswerVerified: result.kind === 'solved' && result.receipt?.ok === true, nodes };
}
