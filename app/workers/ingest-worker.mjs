/* Seren 7 — ingest worker (DEC-005): verify, then store, a GGUF weight file.
   Only the Falcon-H1-Tiny 90M Instruct model is accepted; identity is
   decided by GGUF metadata bytes, not by filename. Hashing streams in chunks
   so the UI never stalls. Everything stays on this device. */
import { sha256Blob } from "../js/sha256.mjs";
import { describeModel } from "../js/gguf.mjs";
import { modelFile, modelPut, models } from "../js/store.mjs";
import { stopsFor } from "../js/prompts.mjs";
import { EXPECTED_SHA256 } from "../js/model-receipts.mjs";

const NAME_TO_ID = new Map([
  ["90m Instruct", "falcon_instruct"],
]);
const QUANT_FILE_TYPE = 15; /* Q4_K_M — the distributed build (CP001 manifest) */
const MIN_BYTES = 10 * 1024 * 1024;
const MAX_BYTES = 300 * 1024 * 1024;
const HEAD_BYTES = 6 * 1024 * 1024; /* metadata segment + margin */

function post(msg) { self.postMessage(msg); }

function fail(reqId, err) {
  post({ type: "error", reqId, message: String((err && err.message) || err) });
}

async function ingest(reqId, file) {
  if (!file || typeof file.size !== "number") throw new Error("no file received");
  if (file.size < MIN_BYTES || file.size > MAX_BYTES) {
    throw new Error("file size " + file.size + " bytes is outside the expected range for a 90M Q4_K_M GGUF");
  }

  /* 1. content hash, streamed */
  let lastFrac = -1;
  const sha256 = await sha256Blob(file, (frac) => {
    const f = Math.round(frac * 20) / 20;
    if (f !== lastFrac) { lastFrac = f; post({ type: "progress", reqId, stage: "hash", frac: frac }); }
  });

  /* 2. metadata identity from real bytes (metadata lives at the file head) */
  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  const d = describeModel(head); /* throws for any non falcon-h1 input */
  const id = NAME_TO_ID.get(d.name);
  if (!id) {
    throw new Error('only Falcon-H1-Tiny 90M Instruct is approved: general.name is "' + d.name + '"');
  }
  if (sha256 !== EXPECTED_SHA256[id]) {
    throw new Error("GGUF SHA-256 does not match the CP001 receipt for " + id);
  }
  if (d.fileType !== QUANT_FILE_TYPE) {
    throw new Error("only the distributed Q4_K_M builds are accepted (file_type was " + d.fileType + ")");
  }
  if (!d.dims || d.dims.blocks !== 24 || d.dims.emb !== 512 || d.dims.vocab !== 32768) {
    throw new Error("GGUF dimensions do not match Falcon-H1-Tiny 90M: " + JSON.stringify(d.dims));
  }

  /* 3. unchanged file already stored? identity contract, no redundant rewrite */
  const existing = await models.get(id);
  if (existing && existing.sha256 === sha256) {
    const stored = await modelFile(existing);
    if (stored && stored.size === file.size) {
      post({ type: "done", reqId, unchanged: true, desc: existing });
      return;
    }
  }
  if (existing && existing.sha256 !== sha256) {
    await models.remove(id); /* same slot, different bytes — replace explicitly */
  }

  /* 4. store bytes (OPFS preferred, IndexedDB Blob fallback) */
  const estimate = await navigator.storage?.estimate?.();
  if (estimate && Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage) &&
      estimate.quota - estimate.usage < file.size) {
    throw new Error("not enough browser storage space for this model; free space and retry");
  }
  const sourceName = file.name || (id + ".gguf");
  const stored = await modelPut(id, file, { file_name: id + ".gguf" });

  /* 5. register the honest descriptor (Schema.md fields) */
  const desc = {
    id, arch: "falcon-h1", name: d.name, sizeLabel: d.sizeLabel,
    quant: "Q4_K_M", file_type: QUANT_FILE_TYPE,
    sha256, bytes: stored.bytes, source_name: sourceName,
    storage: stored.storage, file_id: stored.file_id,
    gguf: {
      markers: d.markers, eosId: d.eosId, bosId: d.bosId,
      blocks: d.dims.blocks, emb: d.dims.emb, ctx: d.dims.ctx,
      vocab: d.dims.vocab, heads: d.dims.heads, kvHeads: d.dims.kvHeads,
      ssmState: d.dims.ssmState, ssmConv: d.dims.ssmConv,
      fileVersion: d.version, chatTemplatePresent: d.chatTemplatePresent,
    },
    stops: stopsFor({ id, gguf: { markers: d.markers, eosId: d.eosId } }),
    chatTemplatePresent: d.chatTemplatePresent,
    added_at: Date.now(),
  };
  /* models.put stamps schema_version + added_at (store contract) */
  await models.put(desc);

  post({ type: "done", reqId, unchanged: false, desc });
}

self.onmessage = async (e) => {
  const data = e.data || {};
  if (!data.cmd) return;
  if (data.cmd === "ping") { post({ type: "reply", reqId: data.reqId, ok: true }); return; }
  if (data.cmd === "ingest") {
    try { await ingest(data.reqId, data.file); }
    catch (err) { fail(data.reqId, err); }
  }
};
