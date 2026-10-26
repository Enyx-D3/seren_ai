/* Seren 7 — local persistence. IndexedDB (state) + OPFS (weights), per docs/Schema.md.
   Everything is on-device; versioned writes carry schema_version + timestamps. */

export const SCHEMA_VERSION = 1;
const DB_NAME = "seren7", DB_VERSION = 1;
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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function db() { return (dbPromise ||= openDB()); }
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
  const fh = await root.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(blob); await w.close();
  return true;
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
    await new Promise((res, rej) => {
      const t = d.transaction(["messages", "conversations"], "readwrite");
      const ms = t.objectStore("messages");
      for (const m of msgs) ms.delete(m.id);
      t.objectStore("conversations").delete(idv);
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
    const m = { id: id(), conversation_id, schema_version: SCHEMA_VERSION, sequence: await this.count(conversation_id), created_at: Date.now(), role: fields.role, content: fields.content || "", status: fields.status || "done", model_id: fields.model_id || null, meta: fields.meta || {} };
    return tx("messages", "readwrite", s => s.put(m)).then(() => m);
  },
  async byConv(conversation_id) {
    const idx = (await db()).transaction("messages").objectStore("messages").index("conv");
    const all = await reqP(idx.getAll(conversation_id));
    return all.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
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
  async append(request_id, kind, payload) {
    const e = this.envelope(request_id, await this.next(request_id), kind, payload);
    await tx("events", "readwrite", s => s.put(e));
    return e;
  },
  async recent(limit = 200) {
    const idx = (await db()).transaction("events").objectStore("events").index("kind");
    return idx; /* caller iterates via cursor */
  },
  async latest(limit = 50) {
    const d = await db();
    const all = await reqP(d.transaction("events").objectStore("events").getAll());
    return all.slice(-limit);
  },
  async prune(keep = 800) {
    const d = await db();
    const all = await reqP(d.transaction("events").objectStore("events").getAll());
    const excess = all.length - keep;
    if (excess <= 0) return 0;
    const drop = all.slice(0, excess).map(e => e.seq);
    return new Promise((res, rej) => {
      const t = d.transaction("events", "readwrite");
      for (const s of drop) t.objectStore("events").delete(s);
      t.oncomplete = () => res(drop.length); t.onerror = () => rej(t.error);
    });
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
export async function importConversation(json) {
  const obj = JSON.parse(json);
  if (!obj.seren_export || !obj.conversation) throw new Error("not a Seren export file");
  const c = { ...obj.conversation, id: id(), title: (obj.conversation.title || "Imported thread"), imported_from: "json", updated_at: Date.now() };
  stamp(c);
  await tx("conversations", "readwrite", s => s.put(c));
  let seq = 0;
  for (const m of obj.messages || []) {
    await tx("messages", "readwrite", s => s.put({ ...m, id: id(), conversation_id: c.id, sequence: seq++, imported: true }));
  }
  return c;
}

/* ---- boot ---- */
export async function init() { const d = await db(); return d; }

/* Estimate local storage usage (for settings/status display). */
export async function storageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try { const e = await navigator.storage.estimate(); return { usage: e.usage, quota: e.quota }; } catch (e) { return null; }
}
