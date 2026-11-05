/* CP027 developer-only Node CPU/WASM adapter for the exact browser Falcon model.
 * This exists to obtain real local model observations where Chromium cannot
 * launch. It is NOT browser/offline/device acceptance and grants no tools.
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Worker as ThreadWorker } from 'node:worker_threads';
import { resolveObjectURL } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import { EXPECTED_SHA256 } from '../app/js/model-receipts.mjs';
import { buildChatPrompt } from '../app/js/prompts.mjs';
import { buildExperimentalCoderFIM } from '../app/js/b2-coder-experiment.mjs';

const MODEL = new URL('../workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf', import.meta.url);
const CODER_MODEL = new URL('../workspace/parts/Falcon-H1-Tiny-Coder-Q4_K_M.gguf', import.meta.url);
const WASM = new URL('../app/vendor/wllama/wllama-single.wasm', import.meta.url);
const VENDOR = new URL('../app/vendor/wllama/index.js', import.meta.url);
const EXPECTED_WASM = 'aced0c759f668e17d618114b8688bf55b32289dbdbd08b6e3254b0bc75838ad5';
const EXPECTED_VENDOR = '08e0fad5c9efdf4414ca2e27d0d8d5bdfa54d91a8054b40d9d9c90c9ce870b9d';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let activeSession = false;

// The upstream browser runtime generates a Blob URL Worker. This tiny bridge
// forwards only the browser postMessage contract to an isolated Node Worker.
// Its Emscripten code must use the browser Worker fetch/wasm path, because the
// separate Node FS branch cannot read a data URL as a filesystem pathname.
const bootstrap = `
const { parentPort } = require('node:worker_threads');
globalThis.self = globalThis;
globalThis.WorkerGlobalScope = class WorkerGlobalScope {};
globalThis.location = {href:'blob:nodedata:node-wllama-worker'};
globalThis.process = undefined;
globalThis.postMessage = (data, transfer) => parentPort.postMessage(data, transfer);
parentPort.on('message', data => globalThis.onmessage?.({data}));
`;

class NodeBlobWorker {
  onmessage = null;
  onerror = null;
  thread = null;
  ready;
  queue = [];
  constructor(url) {
    const blob = resolveObjectURL(url);
    if (!blob) throw Error('Invalid locally generated Wllama Worker Blob URL');
    this.ready = blob.text().then(code => {
      this.thread = new ThreadWorker(bootstrap + '\n' + code, { eval: true });
      this.thread.on('message', data => this.onmessage?.({ data }));
      this.thread.on('error', error => this.onerror?.(error));
      for (const [data, transfer] of this.queue) this.thread.postMessage(data, transfer);
      this.queue.length = 0;
    });
  }
  postMessage(data, transfer) {
    if (this.thread) this.thread.postMessage(data, transfer);
    else this.queue.push([data, transfer]);
  }
  terminate() { this.ready.then(() => this.thread?.terminate()); }
}

function assertInteger(value, min, max, field) {
  if (!Number.isInteger(value) || value < min || value > max)
    throw TypeError(`Invalid ${field}, require integer ${min}–${max}`);
}

export async function createPinnedFalconNodeSession({ nCtx = 1024, seed = 42, maxLoadMs = 60000,
  modelId = 'falcon_instruct', experimentalCoder = false } = {}) {
  if (activeSession) throw Error('Only one pinned Falcon Node session may be resident');
  const coderMode = modelId === 'falcon_coder' && experimentalCoder === true;
  if (modelId !== 'falcon_instruct' && !coderMode)
    throw Error('Node Falcon Coder mode requires explicit experimental opt-in');
  assertInteger(nCtx, 128, 4096, 'nCtx');
  assertInteger(seed, 0, 2147483647, 'seed');
  assertInteger(maxLoadMs, 1000, 120000, 'maxLoadMs');
  activeSession = true;
  let modelBytes, wasmBytes, vendorBytes, modelSha256, wasmSha256, vendorSha256;
  try {
    [modelBytes, wasmBytes, vendorBytes] = await Promise.all([
      readFile(coderMode ? CODER_MODEL : MODEL), readFile(WASM), readFile(VENDOR),
    ]);
    modelSha256 = sha(modelBytes);
    wasmSha256 = sha(wasmBytes);
    vendorSha256 = sha(vendorBytes);
    if (modelSha256 !== EXPECTED_SHA256[modelId] || wasmSha256 !== EXPECTED_WASM ||
        vendorSha256 !== EXPECTED_VENDOR) throw Error('Pinned Falcon / Wllama artifact SHA mismatch');
  } catch (error) { activeSession = false; throw error; }

  const oldWorker = globalThis.Worker;
  const oldDocument = globalThis.document;
  globalThis.Worker = NodeBlobWorker;
  globalThis.document = { baseURI: 'file:///wllama/node-diagnostic/' };
  let wllama = null, busy = false, closed = false;
  const started = performance.now();
  try {
    const { Wllama } = await import(VENDOR);
    const logger = { ...console, debug() {} };
    const wasmUri = `data:application/wasm;base64,${wasmBytes.toString('base64')}`;
    wllama = new Wllama({ 'single-thread/wllama.wasm': wasmUri }, {
      suppressNativeLog: true, logger,
    });
    let loadTimer;
    try {
      await Promise.race([
        wllama.loadModel([new Blob([modelBytes])], { n_ctx: nCtx, n_threads: 1, seed }),
        new Promise((_, reject) => {
          loadTimer = setTimeout(() => reject(Error('Wllama load timeout')), maxLoadMs);
        }),
      ]);
    } finally { clearTimeout(loadTimer); }
  } catch (error) {
    await wllama?.exit().catch(() => {});
    globalThis.Worker = oldWorker;
    globalThis.document = oldDocument;
    activeSession = false;
    throw error;
  }
  const loadedMs = performance.now() - started;
  return Object.freeze({
    platform: 'node_cpu_wasm_only', modelId, modelSha256, wasmSha256, vendorSha256,
    modelBytes: modelBytes.length, loadedMs, nCtx,
    async generate({ turns = [], maxTokens = 64, temperature = 0.2,
      maxGenerateMs = 60000, prefix, suffix = '' } = {}) {
      if (closed) throw Error('Falcon Node session is closed');
      if (busy) throw Error('Falcon Node session does not allow concurrent generation');
      assertInteger(maxTokens, 1, 128, 'maxTokens');
      assertInteger(maxGenerateMs, 1000, 120000, 'maxGenerateMs');
      if (typeof temperature !== 'number' || temperature < 0 || temperature > 2)
        throw TypeError('Invalid sampling temperature');
      if (coderMode && turns.length) throw TypeError('Coder FIM cannot use Instruct chat turns');
      if (!coderMode && (!Array.isArray(turns) || turns.length === 0)) throw TypeError('Missing model turns');
      busy = true;
      const begin = performance.now();
      let tokens = 0, ttftMs = null;
      const tokenTrace = [];
      const tokenDecoder = new TextDecoder();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), maxGenerateMs);
      try {
        const prompt = coderMode ? buildExperimentalCoderFIM({ prefix, suffix, maxTokens,
          taskKind: 'python_fim', experimentalCoder: true }) : buildChatPrompt('falcon_instruct', turns);
        const text = await wllama.createCompletion(prompt.prompt, {
          nPredict: maxTokens, stopTokens: prompt.stops,
          sampling: { temp: temperature, top_p: 0.95, top_k: 40 },
          abortSignal: controller.signal,
          onNewToken: (token, piece) => {
            tokens++;
            const elapsedMs = performance.now() - begin;
            if (ttftMs === null) ttftMs = elapsedMs;
            if (tokenTrace.length < 16) tokenTrace.push({ tokenId: token,
              piece: piece instanceof Uint8Array ? tokenDecoder.decode(piece).slice(0, 80) : String(piece || '').slice(0, 80), elapsedMs });
          },
        });
        if (!text || tokens < 1 || ttftMs === null) throw Error('Actual Falcon produced no token output');
        return { text, tokens, tokenTrace, ttftMs, elapsedMs: performance.now() - begin,
          modelId, mode: coderMode ? 'unverified_python_fim' : 'instruct_chat',
          platform: 'node_cpu_wasm_only' };
      } finally { clearTimeout(timer); busy = false; }
    },
    async close() {
      if (closed) return;
      if (busy) throw Error('Cannot close Falcon Node session during generation');
      closed = true;
      try { await wllama.exit(); }
      finally {
        globalThis.Worker = oldWorker;
        globalThis.document = oldDocument;
        activeSession = false;
      }
    },
  });
}

/** Developer-only explicit Coder opt-in. V1's Instruct factory remains default. */
export function createPinnedFalconCoderNodeSession(options = {}) {
  return createPinnedFalconNodeSession({ ...options, modelId: 'falcon_coder', experimentalCoder: true });
}
