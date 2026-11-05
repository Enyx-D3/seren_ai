/* Independent CP027–031 release guard.
 *
 * This is a model-free adversarial test, not real Falcon/browser acceptance.
 * It uses separately stated source requirements, not candidate graph edges,
 * as its ground-truth oracle. The gate ledger is deliberately fail-closed.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { composeDependencySources, executeComposedDependencyPath,
  verifyComposedDependencyOrder, updateComposedDependencySources } from '../app/js/b2-graphos-composition.mjs';
import { createCortexDependencyGuard, cortexGuardCalibrationRow } from '../app/js/b2-cortex-guard.mjs';
import { capabilityEnvelopeFromParsedTool, createB2ToolCapabilitySession } from '../app/js/b2-tool-capability.mjs';
import { SPECIALISTS, route } from '../app/js/compass.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gateFile = resolve(root, 'evidence/b2_cp027_031_release_gates.json');
const gates = JSON.parse(readFileSync(gateFile, 'utf8'));
const allowed = new Set(['PASS_SCOPED', 'PASS_RELEASE', 'PARTIAL', 'BLOCKED', 'NOT_RUN']);
assert.equal(gates.schemaVersion, 1);
assert.equal(gates.target, 'SEREN7_FULL_MRS_APPLICATION');
assert.ok(Array.isArray(gates.gates) && gates.gates.length >= 15);
const seen = new Set();
for (const gate of gates.gates) {
  assert.match(gate.id, /^S7_CP0[2-3][0-9]_[A-Z0-9_]+$/);
  assert.equal(seen.has(gate.id), false, 'duplicate release gate');
  seen.add(gate.id);
  assert.equal(allowed.has(gate.status), true, `bad status on ${gate.id}`);
  assert.equal(typeof gate.requiredForFullMRS, 'boolean');
  assert.equal(typeof gate.requiredForBrowserMVP, 'boolean');
  assert.ok(typeof gate.acceptance === 'string' && gate.acceptance.length > 15);
  assert.ok(Array.isArray(gate.evidence));
  if (gate.status === 'PASS_SCOPED') {
    assert.ok(gate.evidence.length > 0, 'scoped pass without evidence path');
    assert.ok(gate.scope && !/full|general|all intelligence/i.test(gate.scope),
      'unbounded pass scope is prohibited');
  }
  // A future full-gate promotion requires an immutable, machine-readable
  // receipt; changing only this ledger's status string cannot mark release.
  if (gate.status === 'PASS_RELEASE') {
    assert.ok(gate.releaseReceipt && typeof gate.releaseReceipt.path === 'string' &&
      /^[a-f0-9]{64}$/.test(gate.releaseReceipt.sha256 || ''), 'missing pinned release receipt');
    const receiptPath = gate.releaseReceipt.path;
    assert.ok(!receiptPath.startsWith('/') && !receiptPath.includes('..'));
    const bytes = readFileSync(resolve(root, receiptPath));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), gate.releaseReceipt.sha256);
    const receipt = JSON.parse(bytes.toString('utf8'));
    assert.equal(receipt.status, 'PASS');
    assert.ok(Array.isArray(receipt.gateIds) && receipt.gateIds.includes(gate.id));
  }
  for (const source of gate.evidence) {
    assert.ok(!source.startsWith('/') && !source.includes('..'), 'evidence must be a local relative path');
    assert.equal(existsSync(resolve(root, source)), true, `missing receipt: ${source}`);
  }
}
const browserMVPReady = gates.gates.filter(gate => gate.requiredForBrowserMVP)
  .every(gate => gate.status === 'PASS_RELEASE');
const fullMRSReady = gates.gates.filter(gate => gate.requiredForFullMRS)
  .every(gate => gate.status === 'PASS_RELEASE');

// Independent two-document schedule, separate from previously tested shipping
// examples. Wrong order, stale sources, forged bundle and unsupported semantics
// must never receive a whole-task verified result.
const sources = [
  { id: 'plant', version: 'v1', text: '"Inspect motor" must finish before "Align shaft".' },
  { id: 'safety', version: 'v1', text: '"Align shaft" must finish before "Apply power".' },
];
const bundle = composeDependencySources(sources);
const expected = ['Inspect motor', 'Align shaft', 'Apply power'];
const sourceEdges = [['Inspect motor', 'Align shaft'], ['Align shaft', 'Apply power']];
function independentlyCheck(order) {
  return Array.isArray(order) && order.length === expected.length &&
    new Set(order).size === expected.length && expected.every(x => order.includes(x)) &&
    sourceEdges.every(([first, second]) => order.indexOf(first) < order.indexOf(second));
}
for (const direction of bundle.paths) {
  const result = executeComposedDependencyPath(bundle, direction);
  assert.equal(result.ok, true);
  assert.equal(independentlyCheck(result.candidate), true);
}
assert.equal(verifyComposedDependencyOrder(bundle, [...expected].reverse()).ok, false);
assert.equal(verifyComposedDependencyOrder(bundle, null).ok, false);
assert.throws(() => verifyComposedDependencyOrder({ ...bundle }, expected), /untrusted_composition/);
assert.throws(() => verifyComposedDependencyOrder(bundle, expected, {
  currentSources: [sources[0], { ...sources[1], text: '"Apply power" before "Align shaft".' }],
}), /stale_composed_sources/);
assert.throws(() => updateComposedDependencySources(bundle, [
  sources[0], { ...sources[1], text: '"Apply power" before "Align shaft".' },
]), /source_version_not_advanced/);
const newer = updateComposedDependencySources(bundle, [
  sources[0], { ...sources[1], version: 'v2', text: '"Apply power" before "Align shaft".' },
]);
assert.equal(newer.delta.proofStatus, 'requires_fresh_independent_verification');
assert.equal(verifyComposedDependencyOrder(newer.next, expected).ok, false);
assert.throws(() => verifyComposedDependencyOrder(bundle, expected, {
  currentSources: [sources[0], { ...sources[1], version: 'v2' }],
}), /stale_composed_sources/);

// Verified component is not permission to overwrite a previously satisfied
// edge during Falcon-led repair. Only checked whole-task completion is success.
const source = '"Check feed" must finish before "Start mixer". "Start mixer" must finish before "Seal batch". Give a valid order.';
const guard = createCortexDependencyGuard(source, ['Seal batch', 'Check feed', 'Start mixer']);
const before = guard.snapshot();
const rejected = guard.attempt(['Start mixer', 'Check feed', 'Seal batch']);
assert.equal(rejected.receipt.accepted, false);
assert.equal(rejected.receipt.status, 'rejected');
assert.deepEqual(guard.snapshot().order, before.order);
assert.notEqual(cortexGuardCalibrationRow(rejected.receipt).verificationStatus, 'verified');
const stale = guard.attempt(['Check feed', 'Start mixer', 'Seal batch'], { sourceHash: '0'.repeat(64) });
assert.equal(stale.receipt.accepted, false);
assert.equal(stale.receipt.status, 'stale_source');
assert.equal(guard.snapshot().attempts, 1, 'stale source must not consume a budgeted repair');
const accepted = guard.attempt(['Check feed', 'Start mixer', 'Seal batch']);
assert.equal(accepted.receipt.wholeTaskVerified, true);
assert.equal(cortexGuardCalibrationRow(accepted.receipt).verificationStatus, 'verified');
assert.equal(guard.attempt(['Start mixer', 'Check feed', 'Seal batch']).receipt.status, 'already_complete');

// Denied tool traffic must allocate zero Workers even if model text embeds
// an unknown tool, a dangerous extra field or unusual object prototypes.
let workerAllocations = 0;
const session = createB2ToolCapabilitySession({
  workerFactory: () => { workerAllocations++; throw new Error('unexpected_worker_created'); },
});
assert.equal((await session.run({ name: 'exact_arithmetic', arguments: { expression: '2+2' } })).ok, false);
assert.equal((await session.run({ name: '__proto__', arguments: {} })).ok, false);
assert.equal((await session.run({ name: 'shell', arguments: { command: 'whoami' } })).ok, false);
assert.equal(workerAllocations, 0);
assert.equal(capabilityEnvelopeFromParsedTool({ name: 'exact_arithmetic',
  arguments: { expression: '2+2' }, raw: 'audited', permission: 'native' }), null);
session.close();

// Protected V1 default remains one model. Optional future Coder, TRM and
// native TinyLinux admission cannot be inferred from registry nomenclature.
assert.ok(SPECIALISTS.includes('falcon_instruct'));
assert.equal(new Set(SPECIALISTS).size, SPECIALISTS.length);
assert.equal(route('Hello', { ready: new Set(['falcon_instruct', 'falcon_coder']) }).modelId, 'falcon_instruct');
if (!SPECIALISTS.includes('falcon_coder'))
  assert.throws(() => route('Hello', { selected: 'falcon_coder' }), /unknown model selection/);

console.log(JSON.stringify({
  selftest: 'PASS_MODEL_FREE_NARROW', workerAllocations,
  gatedBrowserMVP: browserMVPReady ? 'READY' : 'BLOCKED',
  gatedFullMRS: fullMRSReady ? 'READY' : 'BLOCKED',
  statusCounts: Object.fromEntries([...allowed].map(status =>
    [status, gates.gates.filter(g => g.status === status).length])),
  realFalconRunsInThisSelftest: 0, nativeTinyLinuxRunsInThisSelftest: 0,
  physicalDeviceRunsInThisSelftest: 0,
}, null, 2));
