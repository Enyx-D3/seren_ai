/* Seren 7 — GGUF v2/v3 metadata parser (browser/worker-safe, no deps).
   Reads the KV metadata section + tokens array; evidence-driven model
   identity (arch, markers, dims) per DEC-005. Byte layout verified against
   the four Falcon-H1-Tiny-90M GGUFs in tools/gguf_inspect.mjs. */

const T = { 0: "u8", 1: "i8", 2: "u16", 3: "i16", 4: "u32", 5: "i32", 6: "f32", 7: "bool", 8: "str", 9: "arr", 10: "u64", 11: "i64", 12: "f64" };

export function parseGGUFMetadata(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const isGGUF = u8.length >= 4 && u8[0] === 0x47 && u8[1] === 0x47 && u8[2] === 0x55 && u8[3] === 0x46;
  if (!isGGUF) throw new Error("not GGUF");
  const version = dv.getUint32(4, true);
  const tensorCount = Number(dv.getBigUint64(8, true));
  const kvCount = Number(dv.getBigUint64(16, true));
  let o = 24;
  const need = n => { if (o + n > dv.byteLength) throw new Error(`metadata slice exhausted at o=${o} (+${n}) — increase slice size`); };

  const str = () => { const n = Number(dv.getBigUint64(o, true)); o += 8; need(n); const b = u8.subarray(o, o + n); o += n; return new TextDecoder().decode(b); };
  const plain = t => {
    need(8); /* worst case */
    switch (T[t]) {
      case "u8": case "bool": need(1); const v8 = dv.getUint8(o); o += 1; return t === "bool" ? !!v8 : v8;
      case "i8": need(1); const s8 = dv.getInt8(o); o += 1; return s8;
      case "u16": need(2); const u16 = dv.getUint16(o, true); o += 2; return u16;
      case "i16": need(2); const i16 = dv.getInt16(o, true); o += 2; return i16;
      case "u32": need(4); const u32 = dv.getUint32(o, true); o += 4; return u32;
      case "i32": need(4); const i32 = dv.getInt32(o, true); o += 4; return i32;
      case "f32": need(4); const f32 = dv.getFloat32(o, true); o += 4; return f32;
      case "u64": need(8); const u64 = dv.getBigUint64(o, true); o += 8; return Number(u64);
      case "i64": need(8); const i64 = dv.getBigInt64(o, true); o += 8; return Number(i64);
      case "f64": need(8); const f64 = dv.getFloat64(o, true); o += 8; return f64;
      case "str": return str();
      default: throw new Error(`unknown gguf value type ${t}`);
    }
  };
  const val = t => {
    if (T[t] === "arr") {
      const et = dv.getUint32(o, true); o += 4;
      const n = Number(dv.getBigUint64(o, true)); o += 8;
      if (T[et] === "str") {
        const out = new Array(Math.min(n, 65536));
        for (let i = 0; i < n; i++) out[i] = str();
        return out;
      }
      /* numeric arrays: memory-bounded scan, keep first 256 for diagnostics */
      const sizes = { u8: 1, i8: 1, u16: 2, i16: 2, u32: 4, i32: 4, f32: 4, u64: 8, i64: 8, f64: 8, bool: 1 };
      const es = sizes[T[et]]; if (!es) throw new Error("unknown arr elem " + et);
      const keep = Math.min(n, 256), head = new Array(keep);
      for (let i = 0; i < n; i++) { const v = plain(et); if (i < keep) head[i] = v; }
      return { type: `${T[et]}[${n}]`, head };
    }
    return plain(t);
  };

  const kv = {};
  for (let i = 0; i < kvCount; i++) {
    const nStr = Number(dv.getBigUint64(o, true)); o += 8; need(nStr);
    const k = new TextDecoder().decode(u8.subarray(o, o + nStr)); o += nStr;
    const t = dv.getUint32(o, true); o += 4;
    kv[k] = val(t);
  }
  return { version, tensorCount, kvCount, kv, tokens: kv["tokenizer.ggml.tokens"] || null, metaBytes: o };
}

/* Turn metadata into a validated Seren model descriptor (DEC-005 identity). */
export function describeModel(u8) {
  const g = parseGGUFMetadata(u8);
  const kv = g.kv, tokens = g.tokens || [];
  if (kv["general.architecture"] !== "falcon-h1") {
    throw new Error(`unsupported architecture ${kv["general.architecture"] || "??"} — only falcon-h1 is allowed`);
  }
  const markerIds = names => {
    const out = {};
    for (const nm of names) nm.forEach(name => { const i = tokens.indexOf(name); if (i !== -1) out[name] = i; });
    return out;
  };
  const markers = markerIds([["<|begin_of_text|>"], ["<|end_of_text|>"], ["<|im_start|>"], ["<|im_end|>"], ["<|eot_id|>"], ["<|eom_id|>"], ["<|start_header_id|>"], ["<|end_header_id|>"], ["<|pad|>"]]);
  markers[">>PREFIX<<"] = tokens.indexOf(">>PREFIX<<") !== -1 ? tokens.indexOf(">>PREFIX<<") : null;
  markers[">>MIDDLE<<"] = tokens.indexOf(">>MIDDLE<<") !== -1 ? tokens.indexOf(">>MIDDLE<<") : null;
  markers[">>SUFFIX<<"] = tokens.indexOf(">>SUFFIX<<") !== -1 ? tokens.indexOf(">>SUFFIX<<") : null;
  const a = kv["general.architecture"] /* falcon-h1 (dash form) */;
  const dims = {
    blocks: kv[`${a}.block_count`], ctx: kv[`${a}.context_length`], emb: kv[`${a}.embedding_length`],
    heads: kv[`${a}.attention.head_count`], kvHeads: kv[`${a}.attention.head_count_kv`],
    ssmState: kv[`${a}.ssm.state_size`], ssmConv: kv[`${a}.ssm.conv_kernel`], vocab: tokens.length,
  };
  return {
    version: g.version, tensorCount: g.tensorCount, kvCount: g.kvCount, metaBytes: g.metaBytes,
    arch: a, name: kv["general.name"] || null, sizeLabel: kv["general.size_label"] || null,
    fileType: kv["general.file_type"], quantVersion: kv["general.quantization_version"],
    chatTemplate: typeof kv["tokenizer.chat_template"] === "string" ? kv["tokenizer.chat_template"] : null,
    chatTemplatePresent: typeof kv["tokenizer.chat_template"] === "string" && kv["tokenizer.chat_template"].length > 4,
    bosId: kv["tokenizer.ggml.bos_token_id"], eosId: kv["tokenizer.ggml.eos_token_id"],
    pre: kv["tokenizer.ggml.pre"] || null, markers, dims,
  };
}
