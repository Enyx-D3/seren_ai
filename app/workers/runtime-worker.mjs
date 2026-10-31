/* Seren 7 — inference worker over the vendored wllama (llama.cpp b8948 WASM).
   Exactly one model resident at a time (memory discipline). Completion option
   names match this vendored build byte-for-byte: nPredict, stopTokens,
   sampling{temp, top_p, top_k}, onNewToken(token, piece, currentText, {abortSignal}),
   abortSignal. Output flows out as TRD event envelopes; persistence happens on
   the main thread. */
globalThis.document = { baseURI: self.location.href }; /* wllama resolves relative asset paths via document.baseURI, which only exists in DOM windows — documented adapter shim for worker context */
import { Wllama } from "../vendor/wllama/index.js";
import { sha256Blob } from "../js/sha256.mjs";
import { EXPECTED_SHA256 } from "../js/model-receipts.mjs";
import { boundedGenerationBudget, RUNTIME_CONTEXT_TOKENS } from "../js/runtime-limits.mjs";

const PATHS = {
  "single-thread/wllama.wasm": "../vendor/wllama/wllama-single.wasm",
  "multi-thread/wllama.wasm": "../vendor/wllama/wllama-multi.wasm",
};
const N_CTX = RUNTIME_CONTEXT_TOKENS; /* bounded context: one 90M model on constrained hardware */

let wllama = null;
let loadedModelId = null;
let loadSeq = 0;
const running = new Map(); /* reqId -> {ac, prevLen, made} */
const eventSequence = new Map();

function post(msg) {
  if (msg.type === "event") {
    const sequence = (eventSequence.get(msg.request_id) || 0) + 1;
    eventSequence.set(msg.request_id, sequence);
    msg.schema_version = 1;
    msg.sequence = sequence;
    msg.timestamp_ms = Date.now();
  }
  self.postMessage(msg);
  if (msg.type === "event" && ["complete", "cancelled", "error"].includes(msg.kind)) eventSequence.delete(msg.request_id);
  if (msg.type === "reply") eventSequence.delete(msg.reqId);
}

async function cmdLoad(data) {
  const { reqId, modelId, blob, expectedSha256 } = data;
  if (!blob || !blob.size) throw new Error("no model bytes received");
  const pinnedSha256 = EXPECTED_SHA256[modelId];
  if (!pinnedSha256 || (expectedSha256 && expectedSha256 !== pinnedSha256)) throw new Error("model is not in the approved hash roster");
  if (loadedModelId === modelId && wllama) {
    post({ type: "reply", reqId, ok: true, alreadyLoaded: true, modelId });
    return;
  }
  post({ type: "event", request_id: reqId, kind: "model_loading", payload: { modelId, stage: "verify" } });
  const actualSha256 = await sha256Blob(blob);
  if (actualSha256 !== pinnedSha256) throw new Error("stored model bytes failed SHA-256 verification for " + modelId);
  loadSeq += 1;
  const mySeq = loadSeq;
  if (wllama) {
    try { await wllama.exit(); } catch (e) { /* previous instance may already be exiting */ }
    wllama = null;
    loadedModelId = null;
    if (mySeq !== loadSeq) return; /* a newer load superseded this one */
  }
  post({ type: "event", request_id: reqId, kind: "model_loading", payload: { modelId, stage: "wasm" } });
  wllama = new Wllama(PATHS, { allowOffline: true });
  await wllama.loadModel([blob], { n_ctx: N_CTX });
  if (mySeq !== loadSeq) return;
  loadedModelId = modelId;
  post({ type: "reply", reqId, ok: true, alreadyLoaded: false, modelId, n_ctx: N_CTX });
}

async function cmdComplete(data) {
  const { reqId, modelId, prompt, stops, maxTokens, temperature, topP, topK } = data;
  if (!wllama || loadedModelId !== modelId) {
    throw new Error('model "' + modelId + '" is not loaded in the runtime worker');
  }
  const ac = new AbortController();
  const state = { ac, prevText: "", made: 0 };
  running.set(reqId, state);
  post({ type: "event", request_id: reqId, kind: "model_loading", payload: { modelId, stage: "decode" } });
  let endReason = "eog"; /* EOG or stop-token reached */
  try {
    const promptText = String(prompt || "");
    const promptTokens = await wllama.tokenize(promptText, true);
    const nPredict = boundedGenerationBudget(maxTokens, promptTokens.length, N_CTX);
    await wllama.createCompletion(promptText, {
      nPredict,
      stopTokens: Array.isArray(stops) ? stops : [],
      sampling: {
        temp: Number.isFinite(temperature) ? temperature : 0.8,
        top_p: Number.isFinite(topP) ? topP : 0.95,
        top_k: Number.isFinite(topK) ? topK : 40,
      },
      abortSignal: ac.signal,
      onNewToken: (token, piece, currentText, opts) => {
        const st = running.get(reqId);
        if (!st) return;
        st.made += 1;
        const text = String(currentText || "");
        const replace = !text.startsWith(st.prevText);
        const delta = replace ? text : text.slice(st.prevText.length);
        st.prevText = text;
        if (delta) post({ type: "event", request_id: reqId, kind: "token", payload: { text: delta, replace, token_id: token, token_count: st.made } });
        if (st.ac.signal.aborted && opts && typeof opts.abortSignal === "function") opts.abortSignal();
      },
    });
  } catch (err) {
    running.delete(reqId);
    if (ac.signal.aborted) {
      post({ type: "event", request_id: reqId, kind: "cancelled", payload: { reason: "user stop" } });
      return;
    }
    throw err;
  }
  const st = running.get(reqId);
  running.delete(reqId);
  if (ac.signal.aborted) {
    post({ type: "event", request_id: reqId, kind: "cancelled", payload: { reason: "user stop", tokens: st ? st.made : 0 } });
    return;
  }
  post({
    type: "event", request_id: reqId, kind: "complete",
    payload: { reason: endReason, tokens: st ? st.made : 0, modelId, n_ctx: N_CTX },
  });
}

async function cmdUnload(data) {
  const prev = wllama;
  wllama = null;
  loadedModelId = null;
  if (prev) await prev.exit();
  post({ type: "reply", reqId: data.reqId, ok: true });
}

self.onmessage = async (e) => {
  const data = e.data || {};
  if (!data.cmd) return;
  try {
    if (data.cmd === "ping") {
      post({ type: "reply", reqId: data.reqId, ok: true, loadedModelId, pending: running.size });
    } else if (data.cmd === "load") {
      await cmdLoad(data);
    } else if (data.cmd === "complete") {
      await cmdComplete(data);
    } else if (data.cmd === "abort") {
      const st = running.get(data.reqId);
      if (st) st.ac.abort();
    } else if (data.cmd === "unload") {
      await cmdUnload(data);
    }
  } catch (err) {
    post({ type: "event", request_id: data.reqId || "worker", kind: "error", payload: { message: String((err && err.message) || err), stage: data.cmd } });
    if (data.cmd !== "complete") post({ type: "reply", reqId: data.reqId, ok: false, message: String((err && err.message) || err) });
  }
};
