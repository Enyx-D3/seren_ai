import assert from 'node:assert/strict';
import { exactArithmetic } from '../app/js/exact-arithmetic.mjs';
import { B2_FLOW_POLICY, runB2FlowPlan, verifyB2FlowReceipt } from '../app/js/b2-flow-processor.mjs';

let checks = 0;
const check = (condition, label) => { assert.equal(condition, true, label); checks++; };
const recipe = (a, b, version = 1) => ({ version: 1, sourceVersion: version,
  requested: ['d'], tasks: [
    { id: 'd', expression: '@c*2', dependsOn: ['c'] },
    { id: 'b', expression: String(b), dependsOn: [] },
    { id: 'c', expression: '@a+@b', dependsOn: ['b', 'a'] },
    { id: 'a', expression: String(a), dependsOn: [] },
  ] });

const baseline = recipe(17, -9);
const serial = await runB2FlowPlan(baseline, { maxConcurrent: 1 });
const bounded = await runB2FlowPlan(baseline, { maxConcurrent: 2 });
check(serial.status === 'verified' && bounded.status === 'verified', 'whole DAG verified');
check(serial.targetValues[0].value === '16' && bounded.targetValues[0].value === '16', 'full result');
check(serial.metrics.maxScheduledTogether === 1 && bounded.metrics.maxScheduledTogether === 2,
  'bounded scheduling changes eligible batch size');
check(verifyB2FlowReceipt(serial, baseline).ok && verifyB2FlowReceipt(bounded, baseline).ok,
  'independent full replay');
check(serial.sourceHash === bounded.sourceHash, 'order independent source identity');
check(serial.policy === B2_FLOW_POLICY && serial.capabilities.physicalParallelismMeasured === false,
  'no physical hardware claim');

// Independent BigInt oracle: it does not reuse the candidate expression parser.
let state = 0x12345678;
const rand = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0; };
for (let i = 0; i < 120; i++) {
  const a = (rand() % 200001) - 100000, b = (rand() % 200001) - 100000;
  const input = recipe(a, b, 1 + i);
  const receipt = await runB2FlowPlan(input, { maxConcurrent: (i % 3) + 1 });
  check(receipt.status === 'verified', `random graph ${i} verified`);
  check(receipt.targetValues[0].value === String((BigInt(a) + BigInt(b)) * 2n),
    `random graph ${i} independent arithmetic`);
  check(verifyB2FlowReceipt(receipt, input).ok, `random graph ${i} replay`);
}

const updated = recipe(18, -9, 2);
check(!verifyB2FlowReceipt(serial, updated).ok, 'source version/data change invalidates receipt');
const forged = JSON.parse(JSON.stringify(serial));
forged.rows[0].value = '999';
check(!verifyB2FlowReceipt(forged, baseline).ok, 'copied receipt cannot borrow authority');
check(!verifyB2FlowReceipt({ ...serial, status: 'verified' }, baseline).ok,
  'shallow forged receipt rejected');

const invalid = [
  { ...baseline, unknown: 'extra' },
  { ...baseline, requested: ['unknown'] },
  { ...baseline, tasks: [...baseline.tasks, { id: 'evil', expression: '1', dependsOn: [] }] },
  { ...baseline, tasks: baseline.tasks.map(task => task.id === 'c' ?
    { ...task, expression: '@a+@b+@unknown' } : task) },
  { ...baseline, tasks: baseline.tasks.map(task => task.id === 'c' ?
    { ...task, dependsOn: ['a'] } : task) },
  { ...baseline, tasks: baseline.tasks.map(task => task.id === 'a' ?
    { ...task, expression: '2;process.exit(1)' } : task) },
];
for (const [i, candidate] of invalid.entries()) {
  await assert.rejects(() => runB2FlowPlan(candidate), undefined, `unsafe plan ${i}`);
  checks++;
}
const cyclic = { ...baseline, tasks: baseline.tasks.map(task => task.id === 'a' ?
  { ...task, expression: '@d', dependsOn: ['d'] } : task) };
check((await runB2FlowPlan(cyclic)).status === 'unverified',
  'cyclic graph stops without verified result');
const fractional = recipe(2, 3);
fractional.tasks.find(task => task.id === 'a').expression = '1/2';
check((await runB2FlowPlan(fractional)).status === 'unverified', 'fractional result remains unverified');
const failed = await runB2FlowPlan(baseline, { executor: async () => '100000' });
check(failed.status === 'unverified' && failed.reason.startsWith('flow_independent_mismatch'),
  'untrusted executor output denied');
const cancelled = new AbortController(); cancelled.abort();
check((await runB2FlowPlan(baseline, { signal: cancelled.signal })).status === 'unverified',
  'aborted execution denied');

let inFlight = 0, highest = 0, calls = 0;
const coordinated = await runB2FlowPlan(baseline, { maxConcurrent: 2,
  executor: async ({expression}) => {
    calls++; inFlight++; highest = Math.max(highest, inFlight);
    await new Promise(resolve => setTimeout(resolve, 5));
    inFlight--;
    return exactArithmetic(expression).text;
  },
});
check(coordinated.status === 'verified' && calls === 4 && highest === 2,
  'only independent eligible async operations overlap');
check(verifyB2FlowReceipt(coordinated, baseline).ok,
  'overlapping tool results are separately verified');

console.log(JSON.stringify({
  checkpoint: 'CP032_FLOW_MODEL_FREE', status: 'PASS_SCOPED', checks,
  randomGraphs: 120, invalidPlansDenied: invalid.length, faultDenied: 1,
  maxScheduledTogether: bounded.metrics.maxScheduledTogether,
  fakeAsyncOverlaps: highest, actualPhysicalParallelSpeedupProven: false,
  browserExecuted: false, nativeTinyLinuxProven: false,
  independentOracle: 'BigInt for random graph outputs, exact arithmetic for source replay',
}));
