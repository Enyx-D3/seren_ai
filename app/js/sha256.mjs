/* Seren 7 — SHA-256 adapter over the vendored js-sha256 0.11.1 (MIT),
   app/vendor/jssha256/. Honesty note (DEC-008): two independent hand-written
   pipeline drafts here produced digests that disagreed with verified system
   shasum results, so this battle-tested library is the single source of truth
   for hashing. This module only preserves the streaming API workers use. */
import LIB from "../vendor/jssha256/sha256.mjs";

const S = LIB && LIB.sha256;
if (!S || !S.create) throw new Error("vendored js-sha256 adapter failed to initialize");

/* Streaming hasher: update(Uint8Array) as many times as needed, then
   digest() returns the lowercase hex string. Constant memory. */
export class Sha256 {
  constructor() { this.impl = S.create(); }
  update(u8) { this.impl.update(u8); return this; }
  digest() { return this.impl.hex(); }
}

/* Hash a Blob/File chunk by chunk with optional progress callback (0..1).
   Used by the ingest worker so a full GGUF is hashed without loading it
   entirely into RAM. */
export async function sha256Blob(blob, onProgress) {
  const h = S.create();
  const CHUNK = 8 * 1024 * 1024;
  for (let off = 0; off < blob.size; off += CHUNK) {
    const buf = new Uint8Array(await blob.slice(off, off + CHUNK).arrayBuffer());
    h.update(buf);
    if (onProgress) onProgress(Math.min(off + CHUNK, blob.size) / blob.size);
  }
  return h.hex();
}
