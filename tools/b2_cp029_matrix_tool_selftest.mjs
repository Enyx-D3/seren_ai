/* CP029 Node/Worker-contract verification. The browser Worker and native
 * TinyLinux process are NOT proven by this model-free test. */
import assert from 'node:assert/strict';
import { multiplySquareIntegerMatrices, MATRIX_TOOL_POLICY } from '../app/js/b2-matrix-tools.mjs';
import { executeToolCall, parseToolFabric } from '../app/js/tools.mjs';
import { createB2ToolCapabilitySession, capabilityEnvelopeFromParsedTool } from '../app/js/b2-tool-capability.mjs';

let completed = 0;
const test = (name, callback) => {
  callback();
  completed++;
};
const mat = rows => JSON.stringify(rows);
const result = (a, b) => JSON.parse(multiplySquareIntegerMatrices(mat(a), mat(b)).text);

test('known 2x2 with non-commuting multiplication', () => {
  const a = [[1, 2], [3, 4]], b = [[5, 6], [7, 8]];
  assert.deepEqual(result(a, b), [['19', '22'], ['43', '50']]);
  assert.deepEqual(result(b, a), [['23', '34'], ['31', '46']]);
});
test('negative entries and exact 1e18 products', () => {
  assert.deepEqual(result([[0, -1], [1, 0]], [[2, 3], [4, 5]]), [['-4', '-5'], ['2', '3']]);
  assert.deepEqual(result([[1e9, 1e9], [1e9, 1e9]], [[1e9, 1e9], [1e9, 1e9]]),
    [['2000000000000000000', '2000000000000000000'],
      ['2000000000000000000', '2000000000000000000']]);
});
test('3x3 and 4x4 identity', () => {
  for (const dimension of [3, 4]) {
    const source = Array.from({ length: dimension }, (_, i) =>
      Array.from({ length: dimension }, (_, j) => (i - j) * 7));
    const identity = Array.from({ length: dimension }, (_, i) =>
      Array.from({ length: dimension }, (_, j) => Number(i === j)));
    assert.deepEqual(result(source, identity), source.map(row => row.map(String)));
    assert.deepEqual(result(identity, source), source.map(row => row.map(String)));
  }
});

test('deterministic randomized 2..4 dimension oracle', () => {
  let seed = 7831921;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % 21 - 10; };
  for (let n = 2; n <= 4; n++) {
    for (let trial = 0; trial < 80; trial++) {
      const a = Array.from({ length: n }, () => Array.from({ length: n }, rand));
      const b = Array.from({ length: n }, () => Array.from({ length: n }, rand));
      const expected = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) =>
        Array.from({ length: n }, (_, k) => BigInt(a[i][k]) * BigInt(b[k][j]))
          .reduce((sum, product) => sum + product, 0n).toString()));
      assert.deepEqual(result(a, b), expected);
    }
  }
});
test('malformed matrices fail closed', () => {
  const invalid = ['{}', '[]', '[[1]]', '[[1,2,3],[4,5,6]]', '[[1,2],[3]]',
    '[[1.2,2],[3,4]]', '[[null,2],[3,4]]', '[[true,2],[3,4]]',
    '[[1000000001,2],[3,4]]', '[[1e50,2],[3,4]]', '[[-1,2],[3,"process.exit(1)"]]'];
  for (const bad of invalid) assert.throws(() => multiplySquareIntegerMatrices(bad, '[[1,0],[0,1]]'));
  assert.throws(() => multiplySquareIntegerMatrices('x'.repeat(257), '[[1,0],[0,1]]'));
  assert.throws(() => multiplySquareIntegerMatrices('[[1,2],[3,4]]', '[[1,0,0],[0,1,0],[0,0,1]]'));
});
test('actual registry scopes only the arithmetic result', () => {
  const check = executeToolCall({ name: 'matrix_multiply_exact',
    arguments: { a: '[[1,2],[3,4]]', b: '[[5,6],[7,8]]' } });
  assert.deepEqual(check, { ok: true, value: '[["19","22"],["43","50"]]',
    verification: 'independently_verified_exact' });
  assert.equal(MATRIX_TOOL_POLICY, 'b2-matrix-int-v1');
});

const probe = { name: 'matrix_multiply_exact', arguments: { a: '[[1,2],[3,4]]', b: '[[5,6],[7,8]]' } };
const parsed = parseToolFabric(`<tool_call>${JSON.stringify(probe)}</tool_call>`).calls;
assert.equal(parsed.length, 1);
assert.deepEqual(capabilityEnvelopeFromParsedTool(parsed[0]), probe);

let allocations = 0, terminations = 0, dispatches = 0;
const workerFactory = () => {
  allocations++;
  return {
    onmessage: null, onerror: null,
    postMessage(payload) {
      dispatches++;
      queueMicrotask(() => this.onmessage?.({ data: { id: 1,
        result: executeToolCall(payload.call, { allowLocalCompute: payload.permissionScope === 'local_compute_only' }) } }));
    },
    terminate() { terminations++; },
  };
};

async function runCapabilityTests() {
  const denied = createB2ToolCapabilitySession({ workerFactory });
  assert.equal((await denied.run(probe)).status, 'denied');
  assert.equal(allocations, 0);

  const allowed = createB2ToolCapabilitySession({ allowLocalCompute: true,
    allowedTools: ['matrix_multiply_exact'], workerFactory, maxCalls: 1 });
  const checked = await allowed.run(capabilityEnvelopeFromParsedTool(parsed[0]));
  assert.equal(checked.ok, true);
  assert.equal(checked.verification, 'independently_verified_exact');
  assert.equal(checked.value, '[["19","22"],["43","50"]]');
  assert.equal((await allowed.run(probe)).reason, 'call_budget_exhausted');
  allowed.close();

  const rejection = createB2ToolCapabilitySession({ allowLocalCompute: true,
    allowedTools: ['matrix_multiply_exact'], workerFactory });
  assert.equal((await rejection.run({ ...probe, arguments: { ...probe.arguments, extra: '1' } })).status, 'denied');
  const forged = JSON.parse('{"a":"[[1,2],[3,4]]","b":"[[5,6],[7,8]]","__proto__":"unsafe"}');
  assert.equal((await rejection.run({ ...probe, arguments: forged })).reason, 'argument_schema_mismatch');
  assert.equal((await rejection.run(probe)).status, 'succeeded');
  // A malformed in-schema numeric matrix reaches the Worker but fails safely.
  const failed = await rejection.run({ ...probe, arguments: { ...probe.arguments, a: '[[1,2],[3,NaN]]' } });
  assert.equal(failed.ok, false);
  rejection.close();

  const abort = new AbortController(); abort.abort();
  const cancelled = createB2ToolCapabilitySession({ allowLocalCompute: true,
    allowedTools: ['matrix_multiply_exact'], workerFactory, signal: abort.signal });
  assert.equal((await cancelled.run(probe)).status, 'cancelled');

  let hungTerminated = false;
  const hanging = createB2ToolCapabilitySession({ allowLocalCompute: true,
    allowedTools: ['matrix_multiply_exact'], maxPerCallMs: 15,
    workerFactory: () => ({ postMessage() {}, terminate() { hungTerminated = true; } }) });
  const timeout = await hanging.run(probe);
  assert.equal(timeout.status, 'timeout');
  assert.equal(hungTerminated, true);
  assert.ok(allocations >= 3 && terminations >= 3 && dispatches >= 3);
  console.log('CP029 bounded exact square matrix Worker-tool selftest PASS',
    { cases: completed, randomized: 240, allocations, terminations, dispatches, browserExecuted: false, nativeTinyLinuxProven: false });
}
await runCapabilityTests();
