// tools/gguf_inspect.mjs — stream-parse GGUF v2/v3 metadata (no non-trivial deps).
import { openSync, readSync, closeSync, statSync } from "node:fs";

const path = process.argv[2];
if (!path) { console.error("usage: gguf_inspect <file>"); process.exit(1); }
const fd = openSync(path, "r");
const size = statSync(path).size;

const T = { 0: "u8", 1: "i8", 2: "u16", 3: "i16", 4: "u32", 5: "i32", 6: "f32", 7: "bool", 8: "str", 9: "arr", 10: "u64", 11: "i64", 12: "f64" };
const SZ = { "u8": 1, "i8": 1, "u16": 2, "i16": 2, "u32": 4, "i32": 4, "f32": 4, "bool": 1, "u64": 8, "i64": 8, "f64": 8 };

let off = 24;
function u64() { const b = Buffer.alloc(8); readSync(fd, b, 0, 8, off); off += 8; return Number(b.readBigUint64LE(0)); }
function u32() { const b = Buffer.alloc(4); readSync(fd, b, 0, 4, off); off += 4; return b.readUint32LE(0); }
function str() { const n = u64(); const b = Buffer.alloc(n); readSync(fd, b, 0, n, off); off += n; return b.toString("utf8"); }
function val(type) {
  const t = T[type];
  if (t === "str") return str();
  if (t === "arr") {
    const et = u32(); const n = u64();
    if (T[et] === "str") {
      const out = [];
      for (let i = 0; i < n && i < 24; i++) out.push(str());
      if (n > 24) for (let i = 0; i < n - 24; i++) str();
      return out;
    }
    const es = SZ[T[et]];
    const b = Buffer.alloc(es * Math.min(n, 4096));
    readSync(fd, b, 0, b.length, off); off += es * n;
    const xs = new Float64Array(Math.min(n, 4096));
    for (let i = 0; i < Math.min(n, 4096); i++) xs[i] = ["f32", "f64"].includes(T[et]) ? (es === 4 ? b.readFloatLE(i * 4) : b.readDoubleLE(i * 8)) : b.readInt32LE(i * 4) & 0xffffffff;
    return { type: `${T[et]}[${n}]`, head: Array.from(xs.slice(0, 8)) };
  }
  const es = SZ[t]; const b = Buffer.alloc(es); readSync(fd, b, 0, es, off); off += es;
  if (t === "f32") return b.readFloatLE(0);
  if (t === "f64") return b.readDoubleLE(0);
  if (t === "u8") return b.readUInt8(0);
  if (t === "i8") return b.readInt8(0);
  if (t === "u16") return b.readUInt16LE(0);
  if (t === "i16") return b.readInt16LE(0);
  if (t === "u32") return b.readUint32LE(0);
  if (t === "i32") return b.readInt32LE(0);
  if (t === "u64") return u64b(b);
  if (t === "i64") return Number(b.readBigInt64LE(0));
  if (t === "bool") return b.readUInt8(0) ? true : false;
  throw new Error("unknown " + t);
}
function u64b(b) { return Number(b.readBigUint64LE(0)); }

const head = Buffer.alloc(64); readSync(fd, head, 0, 64, 0);
if (head.toString("ascii", 0, 4) !== "GGUF") throw new Error("not GGUF");
const version = head.readUint32LE(4);
const tensorCount = Number(head.readBigUint64LE(8));
const kvCount = Number(head.readBigUint64LE(16));

const kvs = {};
for (let i = 0; i < kvCount; i++) {
  if (off >= size) throw new Error(`overrun at kv ${i} (off=${off})`);
  const k = str();
  const vt = u32();
  kvs[k] = val(vt);
}
console.log(`# ${path}  version=${version} tensors=${tensorCount} kvs=${kvCount} metaEnd=${off}`);
const order = ["general.architecture", "general.name", "general.quantization_version", "general.file_type",
  "falcon_h1.block_count", "falcon_h1.context_length", "falcon_h1.embedding_length", "falcon_h1.feed_forward_length",
  "falcon_h1.attention.head_count", "falcon_h1.attention.head_count_kv", "falcon_h1.key_length", "falcon_h1.value_length",
  "falcon_h1.layer_norm_rms_epsilon", "falcon_h1.rope.freq_base", "falcon_h1.ssm.state_size", "falcon_h1.ssm.conv_kernel",
  "falcon_h1.ssm.num_groups", "falcon_h1.ssm.inner_size", "falcon_h1.ssm.time_step_rank", "falcon_h1.mamba2.chunk_size",
  "falcon_h1.mixer_kind", "falcon_h1.attention.ssm_layers", "falcon_h1.decoder_start_layer", "tokenizer.ggml.model",
  "tokenizer.ggml.bos_token_id", "tokenizer.ggml.eos_token_id", "tokenizer.ggml.eot_token_id",
  "tokenizer.ggml.add_bos_token", "tokenizer.ggml.pre", "identity", "derivative", "names", "tokenizer.ggml.add_padding_token",
  "falcon_h1.add_bos_token", "falcon_h1.vocab_size", "vocabulary_size"];
const seen = new Set();
for (const k of order) if (k in kvs) { seen.add(k); console.log(`${k} = ${JSON.stringify(kvs[k])}`.replaceAll('"', "'")); }
for (const [k, v] of Object.entries(kvs)) if (!seen.has(k)) console.log(`${k} = ${JSON.stringify(v).replaceAll('"', "'")}`);
closeSync(fd);
