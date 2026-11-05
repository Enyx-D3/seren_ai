# CP030 local selective retrieval prototype — bounded evidence

**Status:** PASS for source-grounded in-memory lexical retrieval; **not integrated**
into the browser chat routing or full Context/ASIF/RapidRetrieve systems.

**Source baseline:** Seren 7 local integration commit ca69551. The user
authorized CP030 retrieval as one isolated continuation workstream; this
candidate does not change the active V1 chat or deploy a search service.

## Implemented

- Explicit per-call local-read grant with a stable scope ID and allowed source
  IDs. Absent permission, mismatched scope and unknown source IDs fail closed.
- 1–12 caller-provided text documents, version IDs v1…v999999, a bounded
  32,768 UTF-16 code-unit limit per source and 512 nonempty line blocks total.
- SHA-256 of the actual source bytes and immutable snapshot root; optional
  expected input SHA must match. This hash establishes identity **not**
  real-world truth or document-origin authenticity.
- Exact lowercased whole-token conjunction and exact-phrase modes with
  deterministic short-block-first ranking. No embeddings, semantic claims,
  network request, crawler, web search, model call or executable instructions.
- Returned source ID, version, original quote, UTF-16 and UTF-8 byte offsets,
  content hash, query hash and explicit untrusted-data classification.
- Independent source-text replay validates top-ranked block coordinates and
  exact query match; forged or stale receipts fail.
- Source edits require monotone version advance. Update computes invalidated
  source blocks, preserves untouched blocks and returns a rollback root.

## Reproduction

Command:

    node tools/b2_cp030_local_retrieval_selftest.mjs

Result: **PASS**; 44 explicit assertions, two sources and seven indexed
blocks. Tests include unauthorized reads, scope swapping, wrong input hash,
duplicate source identity, malformed queries, forged index/receipt, stale
current-source hash, changed text without version bump, version regression,
bad update base, preserved block IDs and byte-level coordinates following
non-ASCII source text. A trap installed as global fetch recorded **0 network
calls** even when source content contained a hostile URL/instruction.

No Falcon inference, browser UI reload, native TinyLinux guest, network
permission prompt, large-corpus throughput or storage migration was run.

## Minimal API

    const permission = {
      allowLocalRead: true,
      scopeId: 'case-1',
      allowedSourceIds: ['source-a', 'source-b']
    };
    const sourceDocuments = [
      { id: 'source-a', version: 'v1', text: 'Inspect brakes before launch.' },
      { id: 'source-b', version: 'v1', text: 'Launch only after approval.' }
    ];
    const index = createLocalSelectiveIndex(sourceDocuments, { permission });
    const receipt = searchLocalSelectiveIndex(index, 'brakes', {
      permission, currentSources: sourceDocuments
    });
    const checked = verifyLocalSelectiveReceipt(index, receipt, {
      permission, currentSources: sourceDocuments
    });

This guarantees only that retrieved quotes are present in those exact
user-supplied source bytes. It cannot certify the underlying statements,
handle arbitrary PDFs/media, infer paraphrases, establish remote freshness or
provide general answer synthesis.

## Next admission criteria

1. Test binary-safe source adapters (PDF/OCR/images/.ASIF) separately, with
   origin/policy/expiry metadata and hashes.
2. Verify browser Worker/IndexedDB or OPFS persistence, cancellation, memory
   budgets and changes under a real browser before enabling chat routing.
3. Add provenance-safe model interpretation only as untrusted source input;
   retrieved commands never grant tool execution.
4. Compare scoped retrieval against a fixed baseline on independently
   authored documents; measure source precision, misses, latency and RAM.

Rollback: remove the new module, this selftest and its evidence note. Existing
V1/CP026 code and frozen held-out fixtures remain untouched.
