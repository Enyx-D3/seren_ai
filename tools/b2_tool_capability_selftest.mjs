import assert from 'node:assert/strict';
import { executeToolCall } from '../app/js/tools.mjs';
import { createB2ToolCapabilitySession, B2_BROWSER_TOOL_NAMES,
  B2_TOOL_CAPABILITY_POLICY } from '../app/js/b2-tool-capability.mjs';

let allocations = 0, terminations = 0, dispatches = 0;
function realMathMockWorker() {
  allocations++;
  let dead = false;
  return {
    onmessage: null, onerror: null,
    postMessage({ id, call, permissionScope }) {
      dispatches++;
      queueMicrotask(() => {
        if (!dead) this.onmessage?.({ data: { id,
          result: executeToolCall(call, { allowLocalCompute: permissionScope === 'local_compute_only' }) } });
      });
    },
    terminate() { terminations++; dead = true; },
  };
}
const exact = expression => ({ name: 'exact_arithmetic', arguments: { expression } });
const session = options => createB2ToolCapabilitySession({ workerFactory: realMathMockWorker, ...options });
const names = new Set(B2_BROWSER_TOOL_NAMES);
assert.deepEqual(names, new Set(['exact_arithmetic', 'calculator', 'unit_convert', 'now', 'solve_linear', 'matrix_multiply_exact']));

const disabled = session({ allowedTools: ['exact_arithmetic'] });
assert.equal((await disabled.run(exact('2+2'))).reason, 'local_compute_not_authorized');
assert.equal(allocations, 0, 'denial must happen before allocating a Worker');
assert.equal(disabled.available().nativeLinuxGuest, false);
assert.equal(disabled.available().backend, 'browser_worker_only');

const onlyExact = session({ allowLocalCompute: true, allowedTools: ['exact_arithmetic'], maxCalls: 2 });
const safe = await onlyExact.run(exact('17*19'));
assert.equal(safe.policy, B2_TOOL_CAPABILITY_POLICY);
assert.equal(safe.status, 'succeeded');
assert.equal(safe.value, '323');
assert.equal(safe.verification, 'independently_verified_exact');
assert.equal(safe.checkedScope, 'tool_result_only');
assert.equal(safe.ok, true);
assert.equal((await onlyExact.run({ name: 'calculator', arguments: { expression: '1+1' } })).reason, 'capability_not_granted');
assert.equal((await onlyExact.run({ name: 'fs_write', arguments: { path: '/tmp/x' } })).reason, 'unknown_tool');
assert.equal((await onlyExact.run({ name: 'constructor', arguments: {} })).reason, 'unknown_tool');
assert.equal((await onlyExact.run({ name: '__proto__', arguments: {} })).reason, 'unknown_tool');
assert.equal((await onlyExact.run({ name: 'toString', arguments: {} })).reason, 'unknown_tool');
assert.equal((await onlyExact.run({ name: 'exact_arithmetic', arguments: { expression: '1+1', shell: 'ls' } })).reason,
  'argument_schema_mismatch');
assert.equal((await onlyExact.run({ ...exact('2+2'), permissionScope: 'shell_and_network' })).reason,
  'invalid_tool_envelope');
assert.equal((await onlyExact.run({ name: 'exact_arithmetic', arguments: { expression: 12 } })).reason,
  'argument_type_mismatch');
assert.equal((await onlyExact.run(exact('x'.repeat(257)))).reason, 'argument_size_limit');
assert.equal((await onlyExact.run({ name: 'exact_arithmetic', arguments: JSON.parse('{"__proto__":"pwn"}') })).reason,
  'argument_schema_mismatch');
assert.equal((await onlyExact.run({ name: 'exact_arithmetic',
  arguments: JSON.parse('{"constructor":"pwn","expression":"2+2"}') })).reason, 'argument_schema_mismatch');
assert.equal((await onlyExact.run({ name: 'exact_arithmetic',
  arguments: Object.assign(Object.create({ shell: 'ls' }), { expression: '2+2' }) })).reason, 'invalid_arguments');
assert.equal((await onlyExact.run(Object.assign(Object.create({ elevated: true }), exact('2+2')))).reason,
  'invalid_tool_envelope');
assert.equal((await onlyExact.run({ name: 'exact_arithmetic', arguments: null })).reason, 'invalid_arguments');
assert.equal((await onlyExact.run({ name: 'exact_arithmetic', arguments: { expression: '2+2' }, raw: 'secret' })).reason,
  'invalid_tool_envelope');
assert.equal(allocations, 1, 'invalid proposals must not start workers or consume calls');
assert.equal((await onlyExact.run(exact('1/3'))).value, '1/3');
assert.equal((await onlyExact.run(exact('9+9'))).reason, 'call_budget_exhausted');
assert.equal(onlyExact.available().remainingCalls, 0);
assert.equal(allocations, 2);
assert.equal(terminations, 2);

const approximate = session({ allowLocalCompute: true, allowedTools: ['calculator'], maxCalls: 1 });
const approxResult = await approximate.run({ name: 'calculator', arguments: { expression: 'sqrt(2)' } });
assert.equal(approxResult.status, 'succeeded');
assert.equal(approxResult.verification, 'approximate', 'tool success does not imply an exact result');

let logicalTime = 0;
const elapsed = session({ allowLocalCompute: true, allowedTools: ['exact_arithmetic'], maxTotalMs: 100,
  clock: () => logicalTime });
logicalTime = 101;
assert.equal((await elapsed.run(exact('1+1'))).reason, 'time_budget_exhausted');
assert.equal(elapsed.available().remainingMs, 0);

assert.throws(() => session({ allowLocalCompute: true, allowedTools: ['python_eval'] }), /invalid B2 tool/);
assert.throws(() => session({ allowLocalCompute: true, allowedTools: ['exact_arithmetic', 'exact_arithmetic'] }),
  /invalid B2 tool/);
assert.throws(() => session({ maxCalls: Infinity }), /invalid B2 tool/);
assert.throws(() => session({ maxTotalMs: 30000 }), /invalid B2 tool/);
assert.throws(() => session({ maxInputBytes: 200000 }), /invalid B2 tool/);

const stalled = () => {
  allocations++;
  return { postMessage() { dispatches++; }, terminate() { terminations++; } };
};
const timed = session({ allowLocalCompute: true, allowedTools: ['exact_arithmetic'],
  workerFactory: stalled, maxPerCallMs: 10 });
assert.equal((await timed.run(exact('1+1'))).status, 'timeout');
assert.ok(terminations >= 4, 'timeout must terminate actual Worker object');

const controller = new AbortController();
controller.abort();
const aborted = session({ allowLocalCompute: true, allowedTools: ['exact_arithmetic'], signal: controller.signal });
assert.equal((await aborted.run(exact('1+1'))).status, 'cancelled');

const closing = session({ allowLocalCompute: true, allowedTools: ['exact_arithmetic'] });
closing.close();
assert.equal((await closing.run(exact('1+1'))).reason, 'session_closed');

// Requests in one capability session are serialized to prevent budget races.
let finishFirst;
const pendingWorker = () => {
  allocations++;
  return {
    postMessage({ id }) { finishFirst = () => this.onmessage?.({ data: { id, result: { ok: true,
      value: '2', verification: 'independently_verified_exact' } } }); },
    terminate() { terminations++; },
  };
};
const serial = session({ allowLocalCompute: true, allowedTools: ['exact_arithmetic'], workerFactory: pendingWorker });
const first = serial.run(exact('1+1'));
const simultaneous = await serial.run(exact('1+1'));
assert.equal(simultaneous.reason, 'concurrent_call_not_allowed');
finishFirst();
assert.equal((await first).value, '2');

const killable = session({ allowLocalCompute: true, allowedTools: ['exact_arithmetic'], workerFactory: pendingWorker });
const active = killable.run(exact('1+1'));
const beforeClose = terminations;
killable.close();
assert.equal((await active).status, 'cancelled', 'closing a session cancels its active Worker');
assert.equal(terminations, beforeClose + 1, 'close must terminate the executing Worker');
assert.equal((await killable.run(exact('1+1'))).reason, 'session_closed');

console.log('PASS b2-tool-capability: default-deny, strict schema, budgets, isolation hook, abort, timeout, serialization');
console.log(JSON.stringify({ mockedWorkerAllocations: allocations, mockedWorkerTerminations: terminations,
  mockedWorkerDispatches: dispatches, environment: 'Node policy tests using Worker-contract doubles',
  nativeTinyLinuxProven: false }));
