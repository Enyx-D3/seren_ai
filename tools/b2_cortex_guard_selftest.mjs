import assert from 'node:assert/strict';
import { createCortexDependencyGuard, cortexGuardCalibrationRow } from '../app/js/b2-cortex-guard.mjs';
import { accumulateCheckedDirections } from '../app/js/b2-calibration-outcomes.mjs';

const source = '  "Unseal vessel" must finish before "Sample water". "Archive reading" depends on "Sample water". Give a valid order.';
const first = ['Archive reading', 'Sample water', 'Unseal vessel'];
const guard = createCortexDependencyGuard(source, first);
const base = guard.snapshot();
assert.equal(base.completed, false);
assert.equal(base.residuals.length, 2);
assert.ok(Object.isFrozen(base.residuals[0]));
assert.ok(Object.isFrozen(base.names));
assert.throws(() => { base.order[0] = 'destroy'; }, TypeError);

// One local/model-proposed edit solves only ONE prerequisite. Retain the
// independently checked prefix but never certify the entire goal.
const partial = guard.attempt(['Unseal vessel', 'Archive reading', 'Sample water']);
assert.equal(partial.receipt.status, 'checked_partial');
assert.equal(partial.receipt.wholeTaskVerified, false);
assert.equal(partial.receipt.checkedOutcome, true);
assert.equal(partial.receipt.residuals.length, 1);
assert.equal(partial.state.completed, false);
assert.equal(partial.receipt.preserved.length, 0);

// Reordering that fixes the second edge while destroying the first checked
// edge is rejected even when the number of total wrong edges falls no lower.
const regression = guard.attempt(['Sample water', 'Unseal vessel', 'Archive reading']);
assert.equal(regression.receipt.status, 'rejected');
assert.equal(regression.receipt.reason, 'candidate_corrupts_previously_satisfied_constraints');
assert.equal(regression.receipt.checkedOutcome, true);
assert.deepEqual(regression.state.order, partial.state.order);
assert.equal(regression.receipt.preserved.length, 1);

const complete = guard.attempt(['Unseal vessel', 'Sample water', 'Archive reading']);
assert.equal(complete.receipt.status, 'verified');
assert.equal(complete.receipt.wholeTaskVerified, true);
assert.equal(complete.receipt.residuals.length, 0);
assert.equal(complete.state.completed, true);
assert.equal(complete.state.braked, true);
assert.deepEqual(complete.state.order, ['Unseal vessel', 'Sample water', 'Archive reading']);
assert.equal(guard.attempt(first).receipt.status, 'already_complete');
assert.equal(guard.snapshot().history.length, 3);

// Only guard-issued, independently checked receipts may reach the calibration
// reducer. Invalid formats/errors must be retained as unchecked, not failures.
const unknown = createCortexDependencyGuard(source, first);
const invalid = unknown.attempt(['invented model action']);
assert.equal(invalid.receipt.status, 'unverified');
assert.equal(invalid.receipt.checkedOutcome, false);
const invalidRow = cortexGuardCalibrationRow(invalid.receipt);
assert.equal(invalidRow.checkedOutcome, false);
assert.equal(invalidRow.verificationStatus, 'unverified');
let profiles = accumulateCheckedDirections({}, [invalidRow]);
assert.equal(profiles.cortex_dependency_repair.verifiedFailures, 0);
assert.equal(profiles.cortex_dependency_repair.verifiedSuccesses, 0);
assert.equal(profiles.cortex_dependency_repair.uncheckedRuns, 1);

profiles = accumulateCheckedDirections(profiles, [cortexGuardCalibrationRow(partial.receipt),
  cortexGuardCalibrationRow(complete.receipt)]);
assert.equal(profiles.cortex_dependency_repair.verifiedSuccesses, 1);
assert.equal(profiles.cortex_dependency_repair.verifiedFailures, 1);
assert.equal(profiles.cortex_dependency_repair.verifiedComponents, 1);
assert.throws(() => cortexGuardCalibrationRow({ ...complete.receipt }), /untrusted_cortex_receipt/);
assert.throws(() => cortexGuardCalibrationRow(JSON.parse(JSON.stringify(complete.receipt))), /untrusted_cortex_receipt/);

// Version mismatch is never treated as a failed model calculation and cannot
// alter the current verified component or use up a legitimate repair attempt.
const versioned = createCortexDependencyGuard(source, first);
const stale = versioned.attempt(['Unseal vessel', 'Sample water', 'Archive reading'], {
  sourceHash: 'stale_document_hash', });
assert.equal(stale.receipt.status, 'stale_source');
assert.equal(stale.receipt.checkedOutcome, false);
assert.equal(stale.state.attempts, 0);
assert.deepEqual(stale.state.order, first);
const afterStale = versioned.attempt(['Unseal vessel', 'Sample water', 'Archive reading'], {
  sourceHash: versioned.sourceHash, });
assert.equal(afterStale.receipt.status, 'verified');
const protectedHistory = versioned.snapshot().history.length;
for (let i = 0; i < 40; i++) versioned.attempt(first, { sourceHash: 'stale' });
assert.equal(versioned.snapshot().history.length, protectedHistory);

// The guard cannot be tricked into treating unsupported clauses as absent.
assert.throws(() => createCortexDependencyGuard(
  '"A" must precede "B". "B" may start before "A". Find an order.', ['A', 'B']),
  /unsupported_or_untrusted/);
assert.throws(() => createCortexDependencyGuard(
  '"A" depends on "B". "B" depends on "A". Find an order.', ['A', 'B']),
  /infeasible_source_constraints/);
assert.throws(() => createCortexDependencyGuard(source, ['Unseal vessel']), /invalid_initial_order/);
assert.throws(() => createCortexDependencyGuard(source, first, { maxAttempts: 100 }), /invalid_cortex_guard_contract/);

// A repair cannot trade away any previously satisfied independent edge even
// when the new candidate fixes a different one.
const twoIndependent = '"A" must precede "B". "C" must precede "D". Find an order.';
const preservation = createCortexDependencyGuard(twoIndependent, ['A','B','D','C']);
const traded = preservation.attempt(['C','D','B','A']);
assert.equal(traded.receipt.status, 'rejected');
assert.equal(traded.receipt.preserved.length, 1);
assert.deepEqual(traded.state.order, ['A','B','D','C']);
assert.equal(preservation.attempt(['A','B','C','D']).receipt.wholeTaskVerified, true);

// Bound repeat/no-progress loops while retaining receipt diagnostics.
const brake = createCortexDependencyGuard(source, first, { maxAttempts: 3, maxNoProgress: 2 });
assert.equal(brake.attempt(first).receipt.status, 'no_progress');
assert.equal(brake.attempt(first).receipt.status, 'no_progress');
assert.equal(brake.snapshot().braked, true);
assert.equal(brake.attempt(['Unseal vessel', 'Sample water', 'Archive reading']).receipt.status, 'braked');
assert.equal(brake.snapshot().attempts, 2);

// An oversized untrusted candidate is not copied into a durable trace.
const large = createCortexDependencyGuard(source, first);
const oversized = large.attempt(Array(100_000).fill('Unseal vessel'));
assert.equal(oversized.receipt.status, 'unverified');
assert.equal(oversized.receipt.proposal, null);
assert.equal(large.snapshot().attempts, 1);

console.log('Cortex source-bound repair, preserved components, no-progress, scoped verification and calibration gate PASS');
