/* Seren 7 — local persistence. IndexedDB (state) + OPFS (weights), per docs/Schema.md.
   Everything is on-device; versioned writes carry schema_version + timestamps. */

export const SCHEMA_VERSION = 3;
// ADR-001 keeps the existing physical DB name to preserve browser-local data.
const DB_NAME = "seren7", DB_VERSION = 3;
let dbPromise = null;

const id = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + crypto.getRandomValues(new Uint8Array(12)).join(""));

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("conversations")) {
        db.createObjectStore("conversations", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("messages")) {
        const m = db.createObjectStore("messages", { keyPath: "id" });
        m.createIndex("conv", "conversation_id");
      }
      if (!db.objectStoreNames.contains("models")) {
        db.createObjectStore("models", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("blobs")) {
        db.createObjectStore("blobs", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("kv")) {
        db.createObjectStore("kv", { keyPath: "k" });
      }
      if (!db.objectStoreNames.contains("events")) {
        const e = db.createObjectStore("events", { keyPath: "seq", autoIncrement: true });
        e.createIndex("request", "request_id");
        e.createIndex("kind", "kind");
      }
      /* V1 used per-request seq as the global key, so different runs could
         overwrite each other. V2 keeps a global row ID and request sequence. */
      if (!db.objectStoreNames.contains("run_events")) {
        const e = db.createObjectStore("run_events", { keyPath: "id", autoIncrement: true });
        e.createIndex("request", "request_id");
        e.createIndex("conversation", "conversation_id");
      }
      // V3 adds the logical Schema.md entities without inventing records for
      // features that have not passed their own checkpoints.
      const stores = {
        competence_profiles: ["model_task_hardware", ["model_id", "task_family", "hardware_profile_id"]],
        runs: ["conversation_created", ["conversation_id", "started_at"]],
        tool_calls: ["run", "run_id"],
        verifications: ["run", "run_id"],
        shared_states: ["identity_scope", ["content_identity", "scope"]],
        state_edges: ["from", "from_state_id"],
        joint_policies: ["status", "status"],
        joint_trials: ["policy_benchmark", ["policy_id", "benchmark_id"]],
        asset_receipts: ["artifact", "artifact_id"],
      };
      for (const [name, [indexName, keyPath]] of Object.entries(stores)) {
        if (!db.objectStoreNames.contains(name)) {
          const s = db.createObjectStore(name, { keyPath: "id" });
          s.createIndex(indexName, keyPath);
        }
      }
      const indexes = [
        ["messages", "by_conversation_created", ["conversation_id", "created_at"]],
        ["messages", "by_run", "run_id"],
        ["run_events", "by_run_seq", ["request_id", "sequence"]],
        ["runs", "by_conversation", "conversation_id"],
        ["shared_states", "by_scope", "scope"],
        ["state_edges", "by_to", "to_state_id"],
        ["models", "by_status", "status"],
        ["conversations", "by_updated", "updated_at"],
      ];
      for (const [name, indexName, keyPath] of indexes) {
        const s = req.transaction.objectStore(name);
        if (!s.indexNames.contains(indexName)) s.createIndex(indexName, keyPath);
      }
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => { req.result.close(); dbPromise = null; };
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Seren storage upgrade blocked by another open tab; close other Seren tabs and retry"));
  });
}
async function db() {
  if (!dbPromise) dbPromise = openDB().catch(e => { dbPromise = null; throw e; });
  return dbPromise;
}
function tx(store, mode, fn) {
  return db().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    if (fn) out = fn(s);
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/* ---------------- OPFS helpers (weight storage) ---------------- */
export function opfsAvailable() {
  return !!(navigator.storage && navigator.storage.getDirectory);
}
async function opfsRoot() { return navigator.storage.getDirectory(); }
export async function opfsPut(name, blob) {
  const root = await opfsRoot();
  let existed = true;
  try { await root.getFileHandle(name); }
  catch (error) { if (error.name === 'NotFoundError') existed = false; else throw error; }
  let writable;
  try {
    const fh = await root.getFileHandle(name, { create: true });
    writable = await fh.createWritable();
    await writable.write(blob); await writable.close();
    return true;
  } catch (error) {
    if (writable) try { await writable.abort(); } catch { /* original write error takes precedence */ }
    if (!existed) try { await root.removeEntry(name); } catch { /* may already be absent */ }
    throw error;
  }
}
export async function opfsGet(name) {
  try {
    const root = await opfsRoot();
    const fh = await root.getFileHandle(name);
    return await fh.getFile();
  } catch (e) { return null; }
}
export async function opfsDel(name) {
  try { const root = await opfsRoot(); await root.removeEntry(name); return true; } catch (e) { return false; }
}

/* ---------------- conversations ---------------- */
function stamp(c) {
  c.schema_version = SCHEMA_VERSION;
  c.updated_at = Date.now();
  if (!c.created_at) c.created_at = c.updated_at;
}
export const conv = {
  async put(meta) { stamp(meta); return tx("conversations", "readwrite", s => s.put(meta)); },
  async get(idv) { const d = await db(); return reqP(d.transaction("conversations").objectStore("conversations").get(idv)); },
  async list() {
    const d = await db();
    const all = await reqP(d.transaction("conversations").objectStore("conversations").getAll());
    return all.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
  },
  async del(idv) {
    const msgs = await msg.byConv(idv);
    const d = await db();
    const allBy = async (store, index, key) => reqP(d.transaction(store).objectStore(store).index(index).getAll(key));
    const runs = await allBy("runs", "by_conversation", idv);
    const runIds = new Set(runs.map(run => run.id));
    const toolCalls = (await reqP(d.transaction("tool_calls").objectStore("tool_calls").getAll()))
      .filter(call => call.conversation_id === idv || runIds.has(call.run_id));
    const verifications = (await Promise.all(runs.map(r => allBy("verifications", "run", r.id)))).flat();
    const states = await allBy("shared_states", "by_scope", idv);
    const edges = (await Promise.all(states.flatMap(s => [
      allBy("state_edges", "from", s.id), allBy("state_edges", "by_to", s.id),
    ]))).flat();
    await new Promise((res, rej) => {
      const t = d.transaction(["messages", "conversations", "run_events", "runs", "tool_calls", "verifications", "shared_states", "state_edges"], "readwrite");
      const ms = t.objectStore("messages");
      for (const m of msgs) ms.delete(m.id);
      t.objectStore("conversations").delete(idv);
      for (const r of runs) t.objectStore("runs").delete(r.id);
      for (const c of toolCalls) t.objectStore("tool_calls").delete(c.id);
      for (const v of verifications) t.objectStore("verifications").delete(v.id);
      for (const s of states) t.objectStore("shared_states").delete(s.id);
      for (const e of edges) t.objectStore("state_edges").delete(e.id);
      const idx = t.objectStore("run_events").index("conversation");
      idx.openKeyCursor(IDBKeyRange.only(idv)).onsuccess = e => {
        const cursor = e.target.result;
        if (cursor) { t.objectStore("run_events").delete(cursor.primaryKey); cursor.continue(); }
      };
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
    return msgs.length;
  },
  async rename(idv, title) { const c = await this.get(idv); if (!c) return null; c.title = title; stamp(c); return tx("conversations", "readwrite", s => s.put(c)); },
  async touch(idv) { const c = await this.get(idv); if (!c) return null; stamp(c); return tx("conversations", "readwrite", s => s.put(c)); },
};

/* ---------------- messages ---------------- */
export const msg = {
  async add(conversation_id, fields) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const transaction = d.transaction(["conversations", "messages"], "readwrite");
      const conversations = transaction.objectStore("conversations");
      const messages = transaction.objectStore("messages");
      let result, failure;
      const request = conversations.get(conversation_id);
      request.onsuccess = () => {
        const conversation = request.result;
        if (!conversation) { failure = new Error("conversation no longer exists"); transaction.abort(); return; }
        const insert = sequence => {
          result = { id: id(), conversation_id, schema_version: SCHEMA_VERSION, sequence,
            created_at: Date.now(), role: fields.role, content: fields.content || "", status: fields.status || "done",
            model_id: fields.model_id || null, meta: fields.meta || {} };
          conversation.next_message_sequence = sequence + 1;
          stamp(conversation);
          conversations.put(conversation);
          messages.put(result);
        };
        if (Number.isSafeInteger(conversation.next_message_sequence) && conversation.next_message_sequence >= 0) {
          insert(conversation.next_message_sequence);
        } else {
          // Existing V2/V3 conversations have no counter; initialize it inside
          // this same transaction so concurrent tabs cannot choose the same ID.
          const all = messages.index("conv").getAll(conversation_id);
          all.onsuccess = () => insert(all.result.reduce((max, message) => Math.max(max, message.sequence ?? -1), -1) + 1);
        }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(failure || transaction.error || new Error("message write aborted"));
    });
  },
  async byConv(conversation_id) {
    const idx = (await db()).transaction("messages").objectStore("messages").index("conv");
    const all = await reqP(idx.getAll(conversation_id));
    return all.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0) || (a.created_at ?? 0) - (b.created_at ?? 0) || a.id.localeCompare(b.id));
  },
  async count(conversation_id) { return (await this.byConv(conversation_id)).length; },
  async delByConv(conversation_id) {
    const all = await this.byConv(conversation_id);
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction("messages", "readwrite");
      for (const m of all) t.objectStore("messages").delete(m.id);
      t.oncomplete = () => res(all.length); t.onerror = () => rej(t.error);
    });
  },
  async get(idv) { const d = await db(); return reqP(d.transaction("messages").objectStore("messages").get(idv)); },
  async update(idv, fields) {
    const current = await this.get(idv);
    if (!current) throw new Error("message missing: " + idv);
    const updated = { ...current, ...fields, schema_version: SCHEMA_VERSION, updated_at: Date.now() };
    await tx("messages", "readwrite", s => s.put(updated));
    return updated;
  },
  async del(idv) { return tx("messages", "readwrite", s => s.delete(idv)); },
};

/* ---------------- model registry ---------------- */
export const models = {
  async put(desc) { desc.schema_version = SCHEMA_VERSION; if (!desc.added_at) desc.added_at = Date.now(); return tx("models", "readwrite", s => s.put(desc)); },
  async get(idv) { const d = await db(); return reqP(d.transaction("models").objectStore("models").get(idv)); },
  async all() { const d = await db(); return reqP(d.transaction("models").objectStore("models").getAll()); },
  async remove(idv) {
    const desc = await this.get(idv);
    if (desc) {
      if (desc.storage === "opfs") await opfsDescRemove(desc.file_id);
      else await tx("blobs", "readwrite", s => s.delete(desc.file_id));
    }
    await tx("models", "readwrite", s => s.delete(idv));
    return desc || null;
  },
};
async function opfsDescRemove(file_id) {
  try { const root = await opfsRoot(); await root.removeEntry(file_id); } catch (e) { /* already gone */ }
}
/* Store weight bytes (OPFS preferred, IndexedDB Blob fallback) and return storage descriptor fields. */
export async function modelPut(model_id, blob, { file_name } = {}) {
  const fid = file_name || `${model_id}.gguf`;
  if (opfsAvailable()) {
    await opfsPut(fid, blob);
    return { storage: "opfs", file_id: fid, bytes: blob.size };
  }
  await tx("blobs", "readwrite", s => s.put({ id: fid, blob }));
  return { storage: "idb", file_id: fid, bytes: blob.size };
}
export async function modelFile(desc) {
  if (!desc) return null;
  if (desc.storage === "opfs") return opfsGet(desc.file_id);
  const rec = await (async () => { const d = await db(); return reqP(d.transaction("blobs").objectStore("blobs").get(desc.file_id)); })();
  return rec ? rec.blob : null;
}

/* ---------------- kv settings ---------------- */
export const kv = {
  async get(k) { const d = await db(); const r = await reqP(d.transaction("kv").objectStore("kv").get(k)); return r ? r.v : undefined; },
  async set(k, v) { return tx("kv", "readwrite", s => s.put({ k, v, updated_at: Date.now(), schema_version: SCHEMA_VERSION })); },
  async del(k) { return tx("kv", "readwrite", s => s.delete(k)); },
};

/* ---------------- event envelope (TRD §streaming) ----------------
   {schema_version:1, request_id, sequence, kind, timestamp_ms, payload}
   kinds: token | route_selected | model_loading | complete | cancelled | error */
let seqMem = new Map();
export const events = {
  envelope(request_id, sequence, kind, payload) {
    return { schema_version: SCHEMA_VERSION, request_id, sequence, kind, timestamp_ms: Date.now(), payload };
  },
  async next(request_id) {
    let n = (seqMem.get(request_id) ?? 0) + 1;
    seqMem.set(request_id, n);
    return n;
  },
  async append(request_id, kind, payload, conversation_id = null) {
    const e = this.envelope(request_id, await this.next(request_id), kind, payload);
    e.conversation_id = conversation_id;
    await tx("run_events", "readwrite", s => s.add(e));
    return e;
  },
  async recent(limit = 200) {
    const idx = (await db()).transaction("run_events").objectStore("run_events").index("request");
    return idx; /* caller iterates via cursor */
  },
  async latest(limit = 50) {
    const d = await db();
    const all = await reqP(d.transaction("run_events").objectStore("run_events").getAll());
    return all.slice(-limit);
  },
  async prune(keep = 800) {
    const d = await db();
    const all = await reqP(d.transaction("run_events").objectStore("run_events").getAll());
    const excess = all.length - keep;
    if (excess <= 0) return 0;
    const drop = all.slice(0, excess).map(e => e.id);
    return new Promise((res, rej) => {
      const t = d.transaction("run_events", "readwrite");
      for (const s of drop) t.objectStore("run_events").delete(s);
      t.oncomplete = () => res(drop.length); t.onerror = () => rej(t.error);
    });
  },
};

/* Model proposals and their bounded local execution results. Raw model output
   is not stored here; each receipt is linked to the run and conversation. */
export const toolCalls = {
  async add({ runId, conversationId, proposerModelId, call, result }) {
    const row = { id: id(), schema_version: SCHEMA_VERSION, run_id: runId,
      conversation_id: conversationId, proposer_model_id: proposerModelId,
      tool_name: String(call.name), arguments_json: JSON.stringify(call.arguments ?? {}),
      permission_scope: 'local_compute_only', status: result.status,
      result_json: JSON.stringify(result.ok ? { value: result.value } : { error: result.error }),
      verification: result.verification || 'none', elapsed_ms: result.elapsed_ms,
      created_at: Date.now(), updated_at: Date.now() };
    await tx('tool_calls', 'readwrite', store => store.add(row));
    return row;
  },
};

/* CP009 exact shared-state rows. A digest is only an index: callers must also
   compare the stored canonical expression and verified value receipt. */
export const sharedStates = {
  async find(contentIdentity, scope) {
    const d = await db();
    return reqP(d.transaction('shared_states').objectStore('shared_states')
      .index('identity_scope').getAll([contentIdentity, scope]));
  },
  async byScope(scope) {
    const d = await db();
    return reqP(d.transaction('shared_states').objectStore('shared_states')
      .index('by_scope').getAll(scope));
  },
  async put(row) { await tx('shared_states', 'readwrite', store => store.put(row)); return row; },
  async reuse(idv) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const transaction = d.transaction('shared_states', 'readwrite');
      const store = transaction.objectStore('shared_states');
      let updated = null;
      const request = store.get(idv);
      request.onsuccess = () => {
        if (!request.result) return;
        updated = { ...request.result, reuse_count: (request.result.reuse_count || 0) + 1,
          last_reused_at: Date.now(), updated_at: Date.now() };
        store.put(updated);
      };
      transaction.oncomplete = () => resolve(updated);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  },
  async incrementReuse(idv, count) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const transaction = d.transaction('shared_states', 'readwrite');
      const store = transaction.objectStore('shared_states');
      const request = store.get(idv);
      request.onsuccess = () => {
        if (!request.result || request.result.confidence_kind !== 'exact') return;
        store.put({ ...request.result, reuse_count: (request.result.reuse_count || 0) + count,
          last_reused_at: Date.now(), updated_at: Date.now() });
      };
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  },
  async linkEquivalent(source, target, proofRef) {
    const row = { id: `${source.id}->${target.id}`, schema_version: SCHEMA_VERSION,
      from_state_id: source.id, to_state_id: target.id, relation_kind: 'equivalent_to',
      proof_ref: proofRef, residual: '0', policy_version: 'spiral-exact-1', created_at: Date.now() };
    await tx('state_edges', 'readwrite', store => store.put(row));
    return row;
  },
};

/* Versioned Joint policies are local release/evaluation records. A trial may
   be written only by an explicit evaluator with known ground truth. */
export const jointRecords = {
  async policy(idv) { const d = await db(); return reqP(d.transaction('joint_policies').objectStore('joint_policies').get(idv)); },
  async putPolicy(row) {
    if (!row || typeof row.id !== 'string' || !['active', 'shadow', 'braked', 'rejected', 'candidate'].includes(row.status))
      throw new Error('invalid joint policy record');
    await tx('joint_policies', 'readwrite', store => store.put(row)); return row;
  },
  async putTrial(row) {
    if (!row || typeof row.id !== 'string' || typeof row.policy_id !== 'string' || typeof row.benchmark_id !== 'string')
      throw new Error('invalid joint trial record');
    await tx('joint_trials', 'readwrite', store => store.put(row)); return row;
  },
  async trials(policyId) {
    const d = await db();
    const all = await reqP(d.transaction('joint_trials').objectStore('joint_trials').getAll());
    return all.filter(row => row.policy_id === policyId);
  },
};

/* ---------------- export / import (explicit, per Schema.md) ---------------- */
export async function exportConversation(convId) {
  const c = await conv.get(convId), ms = await msg.byConv(convId);
  const modelsAll = await models.all();
  return JSON.stringify({
    seren_export: { schema_version: SCHEMA_VERSION, generated: Date.now() },
    conversation: c,
    messages: ms,
    models_referenced: modelsAll.map(m => ({ id: m.id, name: m.name })),
  }, null, 1);
}
export async function exportAllConversations() {
  const conversations = await conv.list();
  const records = [];
  for (const c of conversations) records.push({ conversation: c, messages: await msg.byConv(c.id) });
  return JSON.stringify({ seren_export: { schema_version: SCHEMA_VERSION, generated: Date.now(), scope: "all_conversations" }, records }, null, 2);
}
export async function deleteAllConversations() {
  const conversations = await conv.list();
  for (const c of conversations) await conv.del(c.id);
  await kv.del("active_conversation");
  return conversations.length;
}
export async function factoryReset() {
  const d = await db();
  const modelRows = await models.all();
  const conversationRows = await conv.list();
  if (opfsAvailable()) {
    const root = await opfsRoot();
    const names = new Set(modelRows.filter(row => row.storage === "opfs").map(row => row.file_id));
    for (const modelId of ["falcon_instruct", "falcon_reason", "falcon_coder", "falcon_tools"]) names.add(modelId + ".gguf");
    for (const name of names) {
      try { await root.removeEntry(name); }
      catch (error) { if (error.name !== "NotFoundError") throw error; }
    }
  }
  await new Promise((resolve, reject) => {
    const names = [...d.objectStoreNames];
    const transaction = d.transaction(names, "readwrite");
    for (const name of names) transaction.objectStore(name).clear();
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  return { models: modelRows.length, conversations: conversationRows.length };
}
export async function importConversations(json) {
  if (typeof json !== "string" || json.length > 50_000_000) throw new Error("conversation export is too large");
  const obj = JSON.parse(json);
  const version = obj?.seren_export?.schema_version;
  if (!Number.isInteger(version) || version < 2 || version > SCHEMA_VERSION) throw new Error("unsupported Seren export version");
  const records = obj.seren_export.scope === "all_conversations" ? obj.records :
    obj.conversation ? [{ conversation: obj.conversation, messages: obj.messages }] : null;
  if (!Array.isArray(records) || records.length > 1000) throw new Error("invalid Seren conversation export");
  const prepared = [];
  let totalMessages = 0;
  for (const record of records) {
    const source = record?.conversation, messages = record?.messages;
    if (!source || typeof source.title !== "string" || !Array.isArray(messages)) throw new Error("invalid conversation record");
    totalMessages += messages.length;
    if (totalMessages > 10_000) throw new Error("too many messages in export");
    const c = { id: id(), title: source.title.slice(0, 200) || "Imported thread", active_mode: source.active_mode || "auto",
      imported_from: "json", schema_version: SCHEMA_VERSION, created_at: Date.now(), updated_at: Date.now() };
    const ms = messages.map((sourceMessage, sequence) => {
      if (!sourceMessage || !["user", "assistant"].includes(sourceMessage.role) ||
          typeof sourceMessage.content !== "string" || sourceMessage.content.length > 1_000_000 ||
          (sourceMessage.model_id && !["falcon_instruct", "falcon_reason", "falcon_coder", "falcon_tools"].includes(sourceMessage.model_id))) {
        throw new Error("invalid message in export");
      }
      return { id: id(), conversation_id: c.id, sequence, role: sourceMessage.role,
        content: sourceMessage.content, status: sourceMessage.status === "streaming" ? "stopped" : sourceMessage.status || "done",
        model_id: sourceMessage.model_id || null, meta: sourceMessage.meta || {},
        schema_version: SCHEMA_VERSION, imported: true, created_at: Date.now() };
    });
    prepared.push({ conversation: c, messages: ms });
  }
  const d = await db();
  await new Promise((resolve, reject) => {
    const transaction = d.transaction(["conversations", "messages"], "readwrite");
    for (const record of prepared) {
      transaction.objectStore("conversations").put(record.conversation);
      for (const message of record.messages) transaction.objectStore("messages").put(message);
    }
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  return prepared.map(record => record.conversation);
}
export async function importConversation(json) {
  const obj = JSON.parse(json);
  if (!obj.conversation || obj.seren_export?.scope === "all_conversations") throw new Error("expected one conversation");
  return (await importConversations(json))[0];
}

/* ---- boot ---- */
export async function init() { const d = await db(); return d; }

/* Estimate local storage usage (for settings/status display). */
export async function storageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try { const e = await navigator.storage.estimate(); return { usage: e.usage, quota: e.quota }; } catch (e) { return null; }
}
