import assert from 'node:assert/strict';
import { cp034NamespacePrerequisites, runCp034NamespacedFixedTask,
  CP034_NAMESPACE_POLICY } from './b2_cp034_tinylinux_namespace.mjs';

const denied = await Promise.all([
  runCp034NamespacedFixedTask({ kind: 'shell', command: 'id' }),
  runCp034NamespacedFixedTask({ kind: 'sum_squares', n: 100001 }),
  runCp034NamespacedFixedTask({ kind: 'sum_squares', n: -1 }),
  runCp034NamespacedFixedTask({ kind: 'sum_squares', n: 3, extra: true }),
  runCp034NamespacedFixedTask({ kind: 'kill_probe' }),
  runCp034NamespacedFixedTask({ kind: 'environment_probe', path: '/workspace' }),
  runCp034NamespacedFixedTask({ kind: 'sum_squares', n: 1 }, { maxMemoryMiB: 2048 }),
  runCp034NamespacedFixedTask({ kind: 'sum_squares', n: 1 }, { maxMs: 60000 }),
]);
assert.ok(denied.every(row => row.ok === false && row.spawned === false));
const controller = new AbortController();
controller.abort();
const before = await runCp034NamespacedFixedTask({ kind: 'sum_squares', n: 5 }, { signal: controller.signal });
assert.equal(before.reason, 'aborted_before_start');
assert.equal(before.spawned, false);

const preflight = cp034NamespacePrerequisites();
if (!preflight.available) {
  const unavailable = await runCp034NamespacedFixedTask({ kind: 'sum_squares', n: 3 });
  assert.equal(unavailable.reason, 'sandbox_prerequisites_unavailable');
  assert.equal(unavailable.spawned, false);
  console.log(JSON.stringify({
    status: 'BLOCKED_MISSING_NAMESPACED_SANDBOX_PREREQUISITES',
    checks: 9, preflight,
    browserIntegrated: false, nativeTinyLinuxGuestProven: false,
  }, null, 2));
  process.exit(0);
}

const numbers = [0, 1, 3, 7, 97, 10000];
const results = [];
for (const n of numbers) {
  const result = await runCp034NamespacedFixedTask({ kind: 'sum_squares', n }, { maxMs: 2500 });
  assert.equal(result.ok, true, `bounded namespaced sum n=${n}: ${JSON.stringify(result)}`);
  assert.equal(result.policy, CP034_NAMESPACE_POLICY);
  assert.equal(result.independentlyChecked, true);
  assert.equal(result.nativeTinyLinuxGuestProven, false);
  results.push({ n, elapsedMs: result.elapsedMs, value: result.output.value });
}
const probe = await runCp034NamespacedFixedTask({ kind: 'environment_probe' }, { maxMs: 2500 });
assert.equal(probe.ok, true, JSON.stringify(probe));
assert.equal(probe.output.hostWorkspaceVisible, false);
assert.equal(probe.output.hostHomeVisible, false);
assert.equal(probe.output.routeCount, 0);
const killed = await runCp034NamespacedFixedTask(
  { kind: 'kill_probe' }, { maxMs: 125, allowStressTest: true },
);
assert.equal(killed.ok, false);
assert.equal(killed.reason, 'hard_timeout_killed');
assert.equal(killed.exitSignal, 'SIGKILL');
const activeAbort = new AbortController();
const stopTimer = setTimeout(() => activeAbort.abort(), 250);
const aborted = await runCp034NamespacedFixedTask(
  { kind: 'kill_probe' }, { maxMs: 2000, signal: activeAbort.signal, allowStressTest: true },
);
clearTimeout(stopTimer);
assert.equal(aborted.ok, false);
assert.equal(aborted.reason, 'aborted_killed');
assert.equal(aborted.exitSignal, 'SIGKILL');

console.log(JSON.stringify({
  status: 'PASS_SCOPED_LINUX_NAMESPACE_FIXED_TASK_LANE',
  source: 'actual isolated Linux subprocesses; no mock execution',
  checks: denied.length + 1 + numbers.length + 1 + 2,
  namespaceProbe: probe.output,
  independentlyVerifiedRuns: results,
  hardTimeoutKilled: killed.exitSignal === 'SIGKILL',
  abortKilled: aborted.exitSignal === 'SIGKILL',
  nativeTinyLinuxGuestProven: false,
  arbitraryGeneratedCodeAllowed: false,
  browserIntegrated: false,
  hostProgramPathsAllowed: false,
}, null, 2));
