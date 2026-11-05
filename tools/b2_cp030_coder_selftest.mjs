import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SPECIALISTS, route } from '../app/js/compass.mjs';
import { buildChatPrompt } from '../app/js/prompts.mjs';
import { EXPECTED_SHA256, assertExperimentalCoderCompletion } from '../app/js/model-receipts.mjs';
import {
  CODER_MODEL_ID, CODER_SHA256, CODER_FIM, assertExperimentalModelCommand,
  describeApprovedCoderMetadata, buildExperimentalCoderFIM, proposeExperimentalCoderDirection,
} from '../app/js/b2-coder-experiment.mjs';

assert.deepEqual(SPECIALISTS, ['falcon_instruct'], 'production V1 roster changed');
assert.equal(route('Write a Python function', { ready: new Set(['falcon_instruct']) }).modelId, 'falcon_instruct');
assert.throws(() => buildChatPrompt('falcon_coder', [{role:'user',content:'hello'}]), /only Falcon Instruct/);
assert.equal(EXPECTED_SHA256.falcon_coder, CODER_SHA256);

assert.equal(assertExperimentalModelCommand('falcon_instruct'), 'falcon_instruct');
assert.throws(() => assertExperimentalModelCommand(CODER_MODEL_ID), /requires an explicit opt-in/);
assert.throws(() => assertExperimentalModelCommand('falcon_tools', { experimentalCoder: true }), /not in the authorized runtime roster/);
assert.equal(assertExperimentalModelCommand(CODER_MODEL_ID, { experimentalCoder: true }), CODER_MODEL_ID);
assert.throws(() => assertExperimentalModelCommand(CODER_MODEL_ID, { experimentalCoder: 'true' }), /explicit opt-in/);

const off = proposeExperimentalCoderDirection({ taskKind: 'python_fim', verifiedCoderSha256: CODER_SHA256 });
assert.equal(off.selected, 'falcon_instruct');
assert.equal(off.mayExecuteCode, false);
assert.equal(proposeExperimentalCoderDirection({ experimentalCoder: true, taskKind: 'general_chat',
  verifiedCoderSha256: CODER_SHA256 }).selected, 'falcon_instruct');
assert.equal(proposeExperimentalCoderDirection({ experimentalCoder: true, taskKind: 'python_fim',
  verifiedCoderSha256: '0'.repeat(64) }).reason, 'coder_not_verified');
const on = proposeExperimentalCoderDirection({ experimentalCoder: true, taskKind: 'python_fim',
  verifiedCoderSha256: CODER_SHA256 });
assert.equal(on.selected, CODER_MODEL_ID);
assert.equal(on.mode, 'sequential_coder_candidate');
assert.equal(on.requiresIndependentCodeVerification, true);
assert.equal(on.mayExecuteCode, false);

const req = buildExperimentalCoderFIM({ experimentalCoder: true,
  prefix: 'def add(a, b):\n    ', suffix: '\n\nprint(add(1, 2))' });
assert.equal(req.prompt, `${CODER_FIM.prefix}def add(a, b):\n    ${CODER_FIM.suffix}\n\nprint(add(1, 2))${CODER_FIM.middle}`);
assert.equal(req.verification, 'unverified_provisional_code');
assert.deepEqual(req.stops, [11,15,16]);
assert.equal(assertExperimentalCoderCompletion({ ...req, experimentalCoder: true }), undefined);
for (const overrides of [
  { experimentalCoder: false }, { taskKind: 'general_chat' },
  { prompt: 'Write Python code!' }, { prompt: req.prompt + '<|prefix|>' },
  { maxTokens: 257 }, { stops: [11] }, { grammar: 'root ::= "x"' },
]) assert.throws(() => assertExperimentalCoderCompletion({ ...req, experimentalCoder: true, ...overrides }));
for (const test of [
  () => buildExperimentalCoderFIM({ prefix: 'hi' }),
  () => buildExperimentalCoderFIM({ prefix: 'hi', experimentalCoder: true, taskKind: 'bash_shell' }),
  () => buildExperimentalCoderFIM({ prefix: '', experimentalCoder: true }),
  () => buildExperimentalCoderFIM({ prefix: 'a'.repeat(8193), experimentalCoder: true }),
  () => buildExperimentalCoderFIM({ prefix: 'a', experimentalCoder: true, maxTokens: 0 }),
  () => buildExperimentalCoderFIM({ prefix: 'a', experimentalCoder: true, maxTokens: 257 }),
]) assert.throws(test);

const modelPath = 'workspace/parts/Falcon-H1-Tiny-Coder-Q4_K_M.gguf';
let actualCoderVerified = false;
if (existsSync(modelPath)) {
  const bytes = readFileSync(modelPath);
  assert.equal(bytes.length, 68034464, 'Coder artifact byte size mismatch');
  const actual = createHash('sha256').update(bytes).digest('hex');
  assert.equal(actual, CODER_SHA256, 'Coder artifact SHA mismatch');
  const descriptor = describeApprovedCoderMetadata(bytes, actual);
  assert.deepEqual(descriptor.fimTokenIds, { prefix: 231, suffix: 232, middle: 230 });
  assert.throws(() => describeApprovedCoderMetadata(bytes, '0'.repeat(64)), /mismatch/);
  actualCoderVerified = true;
} else if (process.argv.includes('--require-coder')) {
  throw Error('Pinned Coder GGUF is not locally available; model-backed proof blocked');
}
console.log(JSON.stringify({ status: 'PASS', scope: 'CP030 opt-in model authorization and provisional Python FIM',
  v1Unchanged: true, experimentalCoderEnabledByDefault: false,
  checkedActualCoderBytes: actualCoderVerified,
  verifiedRealInference: false, nativeCodeExecutionEnabled: false }));
