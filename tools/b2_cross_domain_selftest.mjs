import assert from 'node:assert/strict';
import { SpiralController } from '../app/js/spiral.mjs';
import { interpretCrossDomain, executeCrossDomainPath, verifyCodeRepair } from '../app/js/b2-cross-domain.mjs';
import { rankDirections } from '../app/js/b2-direction.mjs';

const noFalcon = () => { throw new Error('unexpected model call'); };
const logic = 'Mira is ready. Mira is not ready. Are these statements contradictory?';
const code = 'Debug this JavaScript:\n```js\nfunction add(a, b) { return a + b;\n```\nFind the syntax error.';
const controller = new SpiralController();
const l = await controller.run(logic, { scope: 'cross-dev', generate: noFalcon });
assert.equal(l.verification.status, 'verified');
assert.equal(l.trace.find(row => row.step === 'direction').chosen, 'logic_direct');
assert.equal(l.trace.find(row => row.step === 'cross_domain_operation').receipts[0].enumerated, true);
assert.equal(l.state.graph.nodes.find(row => row.id === 'fact-2').status, 'assumed_input');
const c = await controller.run(code, { scope: 'cross-dev', generate: noFalcon });
assert.equal(c.verification.status, 'unverified');
assert.equal(c.state.verifiedFacts.some(row => row.component === 'delimiter_diagnostic'), true);
assert.equal(c.trace.find(row => row.step === 'direction').candidates.length >= 2, true);
assert.equal(c.state.graph.nodes.find(row => row.id === 'syntax-diagnostic').status, 'partially_checked');
const repaired = verifyCodeRepair(interpretCrossDomain(code), 'function add(a, b) { return a + b;}',
  { kind: 'missing_close', expected: '}' });
assert.equal(repaired.ok, true);
assert.equal(verifyCodeRepair(interpretCrossDomain(code), 'function add(a, b) { return a - b;}',
  { kind: 'missing_close', expected: '}' }).ok, false);
const modelRepair = await controller.run(code, { scope: 'cross-repair', deeper: true,
  generate: async () => ({ text: 'function add(a, b) { return a + b;}', tokens: 17 }) });
assert.equal(modelRepair.trace.find(row => row.step === 'falcon_code_repair').checkedRepair.ok, true);
assert.equal(modelRepair.state.verifiedFacts.some(row => row.component === 'delimiter_patch'), true);
assert.equal(modelRepair.verification.status, 'unverified');

let failed = false;
const rotated = await new SpiralController({ crossExecute(problem, kind) {
  if (kind === 'logic_direct' && !failed) { failed = true; throw new Error('controlled first-path failure'); }
  return executeCrossDomainPath(problem, kind);
} }).run(logic, { scope: 'cross-rotation', generate: noFalcon });
assert.equal(rotated.verification.status, 'verified');
assert.deepEqual(rotated.trace.filter(row => row.step === 'direction').map(row => row.chosen), ['logic_direct', 'logic_enumerate']);
assert.equal(rotated.state.residuals[0].resolvedBy !== null, true);

const candidates = interpretCrossDomain(logic).paths;
const evidence = Object.fromEntries(candidates.map(row => [row.kind, row]));
const before = rankDirections(candidates.map(row => row.kind), { category: 'contradiction', candidateEvidence: evidence });
const calibration = { contradiction: { operations: {
  logic_direct: { runs: 4, verifiedSuccesses: 0, verifiedFailures: 4, elapsedMs: 100, informationGainSum: 0 },
  logic_enumerate: { runs: 4, verifiedSuccesses: 4, verifiedFailures: 0, elapsedMs: 100, informationGainSum: 4 },
} } };
const after = rankDirections(candidates.map(row => row.kind), { category: 'contradiction', candidateEvidence: evidence, calibration });
assert.equal(before[0].kind, 'logic_direct');
assert.equal(after[0].kind, 'logic_enumerate');
assert.equal(interpretCrossDomain('Mira might be ready. Mira is not ready. Are these statements contradictory?'), null);
assert.equal(interpretCrossDomain('Debug this JavaScript:\n```js\nconst x = `hello ${who}`;\n```\nFind the syntax error.')?.domain, 'code');
assert.throws(() => executeCrossDomainPath(interpretCrossDomain('Debug this JavaScript:\n```js\nconst x = `hello ${who}`;\n```\nFind the syntax error.'), 'code_forward_scan'));
console.log('cross-domain B2 selftest PASS');
