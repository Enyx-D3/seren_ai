# CP032 — Opt-in local source → GraphOS/Spiral → R1DX (scoped PASS)

**Baseline:** `agent/integration-v2` commit `256d866`. New isolated branch `agent/cp032-source-integration`. No default UI hook, cloud model, native process, network, push or deployment was added.

## Contract

`runSourceGraphR1DX({sourceDocuments,permission,query,experimental:true})` accepts **exactly two** caller-supplied, bounded local documents under an explicit per-source read grant and a limited lexical query.

1. CP030 local selective retrieval computes a source/version/content-hashed index, matches bounded line blocks and separately replays every returned quote, byte position and scope.
2. The actual `SpiralController` runs its **existing experimental two-source GraphOS → Compass → elastic joint → independent verifier** path without Falcon calls. A separate source reparse validates its complete order or infeasibility. Both GraphOS traversal directions must agree on feasibility.
3. The integration derives four R1 numeric leaves (per-document supported prerequisite count and selected lexical-hit count) from those verified receipts. CP028 R1D independently replays the exact `add` DAG. This is an *evidence-unit counter*, not semantic relevance or mathematical inference about the outside world.
4. On source/version update, both source systems require new text and monotonic versioning. An R1DX source-versioned DAG reuses unaffected nodes and selectively invalidates changed-document paths. The old immutable result remains a rollback **reference**, not authority to treat stale documents as current.
5. `verifySourceGraphR1DX` replays current source bytes, exact retrieval and graph receipts, R1D arithmetic and an integrated provenance root. Forked/copied sessions are not admitted.

**Strict safety:** the exported API is developer opt-in only; it has no direct file I/O, `fetch`, model generation or arbitrary tool execution. All source content is untrusted and only conditional ordering relative to supported source statements is accepted. `sourceAuthenticity` remains `not_established`.

## Reproduction

```sh
node tools/b2_cp032_source_graph_r1dx_selftest.mjs
node tools/b2_cp030_local_retrieval_selftest.mjs
node tools/b2_cp028_r1dx_selftest.mjs
npm run test:v2:cp025
```

**Observed:**

- CP032 isolated end-to-end: **39 assertions PASS**. Initial 3-action order verified, local lexical query returns two exact source-linked blocks, R1D result `4` from two supported prerequisites plus two selected lexical hits.
- Versioned first-source change introduced a prerequisite: verified 4-action order, R1 result `5`, `3` unaffected R1 nodes reused, changed-document path invalidated, both graph and retrieval version deltas recorded. A subsequent second-source change extended the verified order to 5 actions and R1 result to `6`, with symmetric selective invalidation. Previous proofs fail against later source bytes and remain replayable against their original source bytes.
- Mismatched grant, unapproved scope, changed query and hit budget, stale base, unversioned edit, forged prior session, copied forged receipt, altered R1 value, unsupported instruction and source cycle all handled without unchecked acceptance. **0 network/model calls** recorded under a hostile-fetch trap.
- CP030 retrieval: **44 adversarial assertions PASS**, zero network traffic. CP028 R1: **160 randomized exact oracle cases PASS** (small Node microbenchmark is not generalized). CP025 controller: **27/27 supported and 13/13 conservative abstentions PASS** on its earlier independent model-free fixture.

## Limits / next gates

This verifies a narrow memory-resident integration, **not** full RAG, arbitrary document processing, browser UI/offline persistence, phone power/RAM, broader R1 recurrence, native TinyLinux, real Falcon-led repair, external unseen semantic quality or complete MRS. The new module has no automatic production chat activation. Browser and device quality remain blocked/unrun until authorized test hardware can execute this branch.

Rollback: remove the new module/test and keep existing CP028/CP030 primitives and V1 default untouched.
