import assert from 'node:assert/strict';
import { SpiralController } from '../app/js/spiral.mjs';

const controller = new SpiralController();
const dependencySource = '"Unseal vessel" must finish before "Sample water". "Archive reading" depends on "Sample water". Give a valid order.';

// An asynchronous provider is allowed to resolve after Stop. Such a response
// must never become an accepted graph hypothesis, output or calibration row.
let dependencyCalls = 0;
const dependencyAbort = new AbortController();
await assert.rejects(controller.run(dependencySource, {
  scope: 'cp034/aborted-dependency', experimentalDependency: true,
  experimentalCortexGuard: true, signal: dependencyAbort.signal,
  generate: async () => {
    dependencyCalls++;
    dependencyAbort.abort();
    return { text: '["Unseal vessel","Sample water","Archive reading"]', tokens: 7 };
  },
}), error => error?.name === 'AbortError');
assert.equal(dependencyCalls, 1, 'real async boundary must be exercised');

const ordinaryAbort = new AbortController();
let chatCalls = 0;
await assert.rejects(controller.run('Say hello in one sentence.', {
  scope: 'cp034/aborted-chat', signal: ordinaryAbort.signal,
  generate: async () => {
    chatCalls++;
    ordinaryAbort.abort();
    return { text: 'Hello.', tokens: 2 };
  },
}), error => error?.name === 'AbortError');
assert.equal(chatCalls, 1);

const unblocked = await controller.run(dependencySource, {
  scope: 'cp034/unblocked-control', experimentalDependency: true,
  experimentalCortexGuard: true,
  generate: async () => ({ text: '["Unseal vessel","Sample water","Archive reading"]', tokens: 7 }),
});
assert.equal(unblocked.verification.status, 'verified', 'normal checked dependency behavior remains available');
assert.equal(unblocked.metrics.modelCalls, 1);

console.log('CP034 Spiral late-Stop regression PASS: dependency, ordinary chat and unaffected checked control; model doubles only');
