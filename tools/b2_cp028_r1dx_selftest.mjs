/* CP028 exact R1/R1D/R1DX research lane. No real browser, Falcon,
 * persistent physical storage, virtual capacity or TinyLinux claims. */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { executeR1DX, replayR1D, restoreR1D, R1DX_POLICY } from '../app/js/b2-r1dx-shared-state.mjs';

const base = () => ({ programVersion: 1,
  sources: [
    { id: 'a', version: 1, value: '2' },
    { id: 'b', version: 1, value: '3' },
    { id: 'c', version: 1, value: '5' },
    { id: 'd', version: 1, value: '7' },
  ],
  operations: [
    { id: 'ab', kind: 'add', left: 'a', right: 'b' },
    { id: 'cd', kind: 'multiply', left: 'c', right: 'd' },
    { id: 'ab2', kind: 'multiply', left: 'ab', right: 'a' },
    { id: 'join', kind: 'add', left: 'ab2', right: 'cd' },
  ], target: 'join' });
const mutate = (object, modify) => { const result = structuredClone(object); modify(result); return result; };
const json = object => JSON.parse(JSON.stringify(object));
function independentOracle(program) {
  const values = new Map(program.sources.map(s => [s.id, BigInt(s.value)]));
  for (const op of program.operations) {
    const left = values.get(op.left), right = values.get(op.right);
    values.set(op.id, op.kind === 'add' ? left + right : op.kind === 'subtract' ? left - right : left * right);
  }
  return String(values.get(program.target));
}

const p = base();
const first = executeR1DX(p);
assert.equal(first.policy, R1DX_POLICY);
assert.equal(first.value, '45');
assert.equal(first.metrics.computed, 8);
assert.equal(first.metrics.reused, 0);
assert.equal(first.nodes.length, first.deltas.length);
assert.equal(replayR1D(first, p).value, independentOracle(p));
assert.ok(Object.isFrozen(first) && Object.isFrozen(first.nodes[0]) && Object.isFrozen(first.deltas[0]));

const same = executeR1DX(p, { previous: first });
assert.equal(same.value, '45');
assert.equal(same.metrics.reused, 8);
assert.equal(same.metrics.computed, 0);
assert.deepEqual(same.metrics.invalidated, []);
assert.equal(replayR1D(same, p).value, '45');

const bumped = mutate(p, v => { v.sources[0].value = '11'; v.sources[0].version = 2; });
const changed = executeR1DX(bumped, { previous: same });
assert.equal(changed.value, independentOracle(bumped));
assert.equal(changed.value, '189');
assert.deepEqual(changed.metrics.invalidated, ['a', 'ab', 'ab2', 'join']);
assert.deepEqual(changed.metrics.preserved, ['b', 'c', 'd', 'cd']);
assert.equal(changed.parentRoot, same.root);
assert.equal(replayR1D(changed, bumped).value, '189');

const onlyProvenance = mutate(p, v => { v.sources[2].version = 2; });
const provenanceChanged = executeR1DX(onlyProvenance, { previous: same });
assert.equal(provenanceChanged.value, '45');
assert.deepEqual(provenanceChanged.metrics.invalidated, ['c', 'cd', 'join']);
assert.equal(replayR1D(provenanceChanged, onlyProvenance).value, '45');

const withoutBump = mutate(p, v => { v.sources[0].value = '11'; });
assert.throws(() => executeR1DX(withoutBump, { previous: first }), /changed_without_version/);
const staleVersion = mutate(bumped, v => { v.sources[0].version = 1; });
assert.throws(() => executeR1DX(staleVersion, { previous: changed }), /stale_r1_source_version/);
const changedStructure = mutate(p, v => { v.operations[0].kind = 'subtract'; });
assert.throws(() => executeR1DX(changedStructure, { previous: first }), /structure_changed_without_version/);
changedStructure.programVersion = 2;
const changedVersion = executeR1DX(changedStructure, { previous: first });
assert.equal(changedVersion.value, independentOracle(changedStructure));
assert.deepEqual(changedVersion.metrics.invalidated, ['ab', 'cd', 'ab2', 'join']);
assert.equal(replayR1D(changedVersion, changedStructure).ok, true);
assert.throws(() => replayR1D(changedVersion, p), /stale_program/);

const stored = json(changed);
const restored = restoreR1D(stored, bumped);
assert.equal(executeR1DX(bumped, { previous: restored }).metrics.reused, 8);
assert.throws(() => executeR1DX(bumped, { previous: stored }), /unverified_r1_previous_snapshot/);
for (const corrupted of [
  mutate(stored, v => { v.value = '999'; }),
  mutate(stored, v => { v.nodes[5].value = '999'; }),
  mutate(stored, v => { v.deltas[5].value = '999'; }),
  mutate(stored, v => { v.deltas[6].hash = 'bad'; }),
  mutate(stored, v => { v.deltas.pop(); }),
  mutate(stored, v => { v.sources[0].version = 1; }),
  mutate(stored, v => { v.operations[1].right = 'a'; }),
  mutate(stored, v => { delete v.verification.status; }),
]) assert.throws(() => replayR1D(corrupted, bumped));
assert.throws(() => replayR1D(stored, p), /stale_program|provenance_mismatch/);

for (const malformed of [
  mutate(p, v => { v.operations[0].left = 'unknown'; }),
  mutate(p, v => { v.operations[0].left = 'join'; }),
  mutate(p, v => { v.operations[0].kind = 'eval'; }),
  mutate(p, v => { v.sources[0].value = '1.3'; }),
  mutate(p, v => { v.sources[0].value = 'process.exit()'; }),
  mutate(p, v => { v.sources[0].value = '9999999999'; }),
  mutate(p, v => { v.operations[2].left = 'cd'; v.operations[3].left = 'cd'; }),
  mutate(p, v => { v.operations[1].id = 'ab'; }),
  mutate(p, v => { v.sources.push({ id: 'a', version: 1, value: '1' }); }),
  mutate(p, v => { v.sources[0].extra = true; }),
  mutate(p, v => { v.operations.push({ id: 'waste', kind: 'add', left: 'a', right: 'b' }); }),
]) assert.throws(() => executeR1DX(malformed), `must fail closed: ${JSON.stringify(malformed)}`);

// Independent random DAG family, all leaves consumed through a final sum:
// every complete result must equal the standalone BigInt oracle, and the
// separately replayed state must reconstruct exactly.
let seed = 137;
const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed % 31) - 15; };
for (let t = 0; t < 160; t++) {
  const program = base();
  for (const source of program.sources) source.value = String(rand());
  program.operations[0].kind = t % 3 === 0 ? 'subtract' : 'add';
  program.operations[1].kind = t % 2 ? 'multiply' : 'subtract';
  const fresh = executeR1DX(program);
  assert.equal(fresh.value, independentOracle(program));
  assert.equal(replayR1D(json(fresh), program).value, fresh.value);
}

// Measured end-to-end CPU cost of node construction + proofs + delta receipt.
// This is an in-process Node developer microbenchmark, not a browser,
// cross-hardware, throughput, or observed real-world speedup claim.
const rounds = 200;
for (let i = 0; i < 10; i++) { executeR1DX(p); executeR1DX(p, { previous: first }); }
const timer = (fn) => { const start = performance.now(); for (let i = 0; i < rounds; i++) fn(); return performance.now() - start; };
const plain = () => { const result = executeR1DX(p); assert.equal(result.value, '45'); };
const reused = () => { const result = executeR1DX(p, { previous: first }); assert.equal(result.value, '45'); };
const samples = [];
for (let batch = 0; batch < 7; batch++) {
  const a = batch % 2 ? timer(reused) : timer(plain);
  const b = batch % 2 ? timer(plain) : timer(reused);
  samples.push(batch % 2 ? { baselineMs: b, reuseMs: a } : { baselineMs: a, reuseMs: b });
}
const median = sorted => [...sorted].sort((a, b) => a - b)[Math.floor(sorted.length / 2)];
const baselineMs = median(samples.map(s => s.baselineMs));
const reuseMs = median(samples.map(s => s.reuseMs));
const improvement = baselineMs / reuseMs;
console.log('CP028 R1/R1D/R1DX bounded exact replay and invalidation PASS', {
  independentRandomCases: 160, sourceVersionAndTamperGates: 'PASS',
  medianBaselineMs: Number(baselineMs.toFixed(2)), medianReuseMs: Number(reuseMs.toFixed(2)),
  medianRatioBaselineOverReuse: Number(improvement.toFixed(3)),
  benchmarkRoundsPerBatch: rounds, pairedBatches: samples.length,
  measuredRatios: samples.map(s => Number((s.baselineMs / s.reuseMs).toFixed(3))),
  platform: `${process.platform}/${process.arch} Node ${process.version}`,
  browserExecuted: false, nativeTinyLinuxProven: false, physicalCapacityProven: false,
});
