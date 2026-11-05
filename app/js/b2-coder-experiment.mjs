/* CP030 research-only Falcon Coder operation proposal.
 * The active Seren UI stays single-Instruct. A Coder completion is a provisional
 * Python FIM candidate, never authority to execute code or verify an answer.
 */
import { parseGGUFMetadata } from './gguf.mjs';
import { assertExperimentalModelCommand } from './model-receipts.mjs';
export { assertExperimentalModelCommand } from './model-receipts.mjs';

export const CODER_MODEL_ID = 'falcon_coder';
export const CODER_FILENAME = 'Falcon-H1-Tiny-Coder-Q4_K_M.gguf';
export const CODER_SHA256 = '1f769dd9cc450a4a080ebd623e1bf7c15d0a3ccdfb40e339e6640c53228cd019';
export const CODER_EXPERIMENT_POLICY = 'seren-cp030-coder-fim-v1';
export const CODER_FIM = Object.freeze({ prefix: '<|prefix|>', suffix: '<|suffix|>', middle: '<|middle|>' });

/** Metadata/header identity proof; independently hash the complete GGUF bytes. */
export function describeApprovedCoderMetadata(ggufHeaderBytes, fullFileSha256) {
  if (fullFileSha256 !== CODER_SHA256) throw new Error('Falcon Coder SHA-256 mismatch');
  const metadata = parseGGUFMetadata(ggufHeaderBytes);
  const kv = metadata.kv;
  if (kv['general.architecture'] !== 'falcon-h1' || kv['general.file_type'] !== 15 ||
      kv['falcon-h1.block_count'] !== 24 || kv['falcon-h1.embedding_length'] !== 512 ||
      kv['tokenizer.ggml.bos_token_id'] !== 17 || kv['tokenizer.ggml.eos_token_id'] !== 11)
    throw new Error('Falcon Coder GGUF metadata does not match approved model');
  const markers = Object.fromEntries(Object.entries(CODER_FIM).map(([name, token]) => [name, metadata.tokens.indexOf(token)]));
  if (markers.prefix !== 231 || markers.suffix !== 232 || markers.middle !== 230)
    throw new Error('Falcon Coder FIM token IDs do not match approved model');
  return Object.freeze({ policy: CODER_EXPERIMENT_POLICY, sha256: fullFileSha256,
    arch: 'falcon-h1', quantFileType: 15, mode: 'python_fim_only', fimTokenIds: Object.freeze(markers) });
}

/** An explicit developer request for a provisional FIM completion only. */
export function buildExperimentalCoderFIM({ prefix, suffix = '', taskKind = 'python_fim',
  experimentalCoder = false, maxTokens = 96 } = {}) {
  assertExperimentalModelCommand(CODER_MODEL_ID, { experimentalCoder });
  if (taskKind !== 'python_fim') throw new Error('Coder admission requires python_fim task kind');
  if (typeof prefix !== 'string' || !prefix.trim() || prefix.length > 8192 ||
      typeof suffix !== 'string' || suffix.length > 8192 ||
      prefix.length + suffix.length > 12288 || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 256)
    throw new Error('invalid bounded Python FIM request');
  return Object.freeze({ policy: CODER_EXPERIMENT_POLICY, modelId: CODER_MODEL_ID,
    mode: 'python_fim', taskKind: 'python_fim', prompt: `${CODER_FIM.prefix}${prefix}${CODER_FIM.suffix}${suffix}${CODER_FIM.middle}`,
    maxTokens, stops: Object.freeze([11, 15, 16]),
    verification: 'unverified_provisional_code', mayExecuteCode: false });
}

/** B2/MRS operation proposal. This does not load, run, or auto-promote a model. */
export function proposeExperimentalCoderDirection({ experimentalCoder = false,
  taskKind = null, verifiedCoderSha256 = null } = {}) {
  const fallback = Object.freeze({ policy: CODER_EXPERIMENT_POLICY, selected: 'falcon_instruct',
    mode: 'single_instruct', provisional: true, mayExecuteCode: false });
  if (!experimentalCoder || taskKind !== 'python_fim') return fallback;
  if (verifiedCoderSha256 !== CODER_SHA256) return Object.freeze({ ...fallback,
    reason: 'coder_not_verified' });
  return Object.freeze({ policy: CODER_EXPERIMENT_POLICY, selected: CODER_MODEL_ID,
    mode: 'sequential_coder_candidate', taskKind: 'python_fim', provisional: true,
    mayExecuteCode: false, requiresIndependentCodeVerification: true,
    modelSha256: CODER_SHA256 });
}
