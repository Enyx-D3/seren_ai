/* CP034 optional Linux-namespace research lane.
 *
 * This is NOT a TinyLinux VM or a browser tool. It deliberately executes only
 * the constant, audited Python program below. Do not send model-generated
 * code, file paths or shell commands to this interface.
 *
 * Required kernel/environment features: user+network namespaces, bubblewrap,
 * process namespace, prlimit. Missing capabilities fail closed. No fallback
 * to an ordinary unisolated child process is permitted.
 */
import { spawn } from 'node:child_process';
import { existsSync, readlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const CP034_NAMESPACE_POLICY = 'b2-cp034-namespaced-fixed-kernel-v1';
const EXE = Object.freeze({
  prlimit: '/usr/bin/prlimit',
  unshare: '/usr/bin/unshare',
  bwrap: '/usr/bin/bwrap',
  python: '/usr/bin/python3',
});
const PYTHON_KERNEL = `
import json, os, sys
request = json.load(sys.stdin)
kind = request["kind"]
if kind == "sum_squares":
    n = request["n"]
    total = sum(i * i for i in range(n + 1))
    print(json.dumps({"kind": kind, "value": str(total)}))
elif kind == "environment_probe":
    with open("/proc/net/route", encoding="ascii") as routes:
        route_count = max(0, sum(1 for row in routes) - 1)
    print(json.dumps({
        "kind": kind,
        "networkNamespace": os.readlink("/proc/self/ns/net"),
        "pidNamespace": os.readlink("/proc/self/ns/pid"),
        "hostWorkspaceVisible": os.path.exists("/workspace"),
        "hostHomeVisible": os.path.exists("/home/agent"),
        "routeCount": route_count
    }))
elif kind == "kill_probe":
    while True:
        pass
else:
    raise ValueError("unsupported fixed task")
`;
const KERNEL_SHA256 = createHash('sha256').update(PYTHON_KERNEL).digest('hex');
const FIXED_ARGS = Object.freeze([
  '--unshare-pid', '--unshare-ipc', '--unshare-uts', '--die-with-parent', '--new-session',
  '--clearenv', '--setenv', 'HOME', '/tmp', '--setenv', 'PATH', '/usr/bin',
  '--ro-bind', '/usr', '/usr', '--ro-bind', '/lib', '/lib',
  '--ro-bind', '/lib64', '/lib64', '--proc', '/proc', '--dev', '/dev',
  '--tmpfs', '/tmp', '--chdir', '/tmp',
]);
const REQUIRED = [EXE.prlimit, EXE.unshare, EXE.bwrap, EXE.python, '/lib', '/lib64'];

export function cp034NamespacePrerequisites() {
  const missing = REQUIRED.filter(p => !existsSync(p));
  return {
    available: process.platform === 'linux' && missing.length === 0,
    missing,
    platform: process.platform,
    capability: 'linux_namespaces_only_not_a_vm',
  };
}

function validateTask(task, { allowStressTest = false } = {}) {
  if (!task || typeof task !== 'object' || Array.isArray(task))
    return 'invalid_task';
  if (task.kind === 'sum_squares') {
    if (Object.keys(task).sort().join(',') !== 'kind,n' ||
        !Number.isSafeInteger(task.n) || task.n < 0 || task.n > 100000)
      return 'invalid_bounded_sum_squares';
    return null;
  }
  if (task.kind === 'environment_probe') {
    return Object.keys(task).length === 1 ? null : 'invalid_probe_args';
  }
  if (task.kind === 'kill_probe') {
    return allowStressTest && Object.keys(task).length === 1 ? null : 'stress_probe_not_authorized';
  }
  return 'unsupported_task';
}

function killGroup(child) {
  if (!Number.isSafeInteger(child.pid)) return;
  // detached:true creates a new process group. Terminate the entire nested
  // unshare/bwrap/Python tree, not merely a JavaScript timeout promise.
  try { process.kill(-child.pid, 'SIGKILL'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
}

export async function runCp034NamespacedFixedTask(task, {
  maxMs = 1000,
  maxMemoryMiB = 256,
  signal = null,
  allowStressTest = false,
} = {}) {
  const invalid = validateTask(task, { allowStressTest });
  if (invalid) return { ok: false, reason: invalid, spawned: false, policy: CP034_NAMESPACE_POLICY };
  if (signal?.aborted) return { ok: false, reason: 'aborted_before_start', spawned: false, policy: CP034_NAMESPACE_POLICY };
  if (!Number.isSafeInteger(maxMs) || maxMs < 25 || maxMs > 5000 ||
      !Number.isSafeInteger(maxMemoryMiB) || maxMemoryMiB < 128 || maxMemoryMiB > 512)
    return { ok: false, reason: 'invalid_resource_budget', spawned: false, policy: CP034_NAMESPACE_POLICY };
  const prerequisites = cp034NamespacePrerequisites();
  if (!prerequisites.available)
    return { ok: false, reason: 'sandbox_prerequisites_unavailable', prerequisites, spawned: false, policy: CP034_NAMESPACE_POLICY };
  const expected = task.kind === 'sum_squares'
    ? (BigInt(task.n) * (BigInt(task.n) + 1n) * (2n * BigInt(task.n) + 1n) / 6n).toString()
    : null;
  const args = [
    '--as=' + (maxMemoryMiB * 1024 * 1024), '--cpu=3', '--nofile=64', '--nproc=32', '--',
    EXE.unshare, '-Urn', EXE.bwrap, ...FIXED_ARGS, '--', EXE.python, '-I', '-S', '-c', PYTHON_KERNEL,
  ];
  const started = performance.now();
  return await new Promise(resolve => {
    const child = spawn(EXE.prlimit, args, {
      detached: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
      env: { PATH: '/usr/bin:/bin', LANG: 'C' },
    });
    let stdout = '', stderr = '', terminatedFor = null, failedToSpawn = null;
    let finished = false;
    const terminate = reason => {
      if (terminatedFor || finished) return;
      terminatedFor = reason;
      killGroup(child);
    };
    const timer = setTimeout(() => terminate('hard_timeout_killed'), maxMs);
    const onAbort = () => terminate('aborted_killed');
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    child.on('error', error => { failedToSpawn = error.message; });
    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8');
      if (stdout.length > 8192) terminate('stdout_limit_killed');
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 8192) terminate('stderr_limit_killed');
    });
    child.on('close', (code, exitSignal) => {
      finished = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      const common = {
        spawned: !failedToSpawn, policy: CP034_NAMESPACE_POLICY,
        kernelSha256: KERNEL_SHA256, elapsedMs: Math.round((performance.now() - started) * 1000) / 1000,
        maxMs, maxMemoryMiB, exitCode: code, exitSignal,
        nativeTinyLinuxGuestProven: false, browserRuntimeProven: false,
      };
      if (terminatedFor) return resolve({ ok: false, reason: terminatedFor, ...common });
      if (failedToSpawn || code !== 0) return resolve({
        ok: false, reason: failedToSpawn ? 'spawn_error' : 'isolated_process_failed',
        details: (failedToSpawn || stderr).slice(0, 300), ...common,
      });
      let output;
      try { output = JSON.parse(stdout); }
      catch { return resolve({ ok: false, reason: 'invalid_fixed_kernel_output', ...common }); }
      if (output.kind !== task.kind ||
          (expected !== null && output.value !== expected))
        return resolve({ ok: false, reason: 'independent_result_mismatch', ...common });
      if (task.kind === 'environment_probe') {
        const hostNet = readlinkSync('/proc/self/ns/net');
        if (output.hostWorkspaceVisible !== false || output.hostHomeVisible !== false ||
            output.networkNamespace === hostNet || output.routeCount !== 0)
          return resolve({ ok: false, reason: 'isolation_probe_failed', output, ...common });
      }
      return resolve({ ok: true, output, independentlyChecked: true, ...common });
    });
    child.stdin.on('error', () => { /* child termination owns the receipt */ });
    child.stdin.end(JSON.stringify(task));
  });
}
