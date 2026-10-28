# ADR-001 — Preserve the existing browser database during schema convergence

**Status:** Accepted by user, 2026-10-26. **Date:** 2026-10-26.

## Decision needed

`docs/Schema.md` proposes a new IndexedDB database named `seren-local-v1` with 14 primary stores. The working application already stores imported model descriptors, OPFS references, conversations, messages, settings and event receipts in an IndexedDB database named `seren7` (version 2). Renaming the database without a cross-database migration would make existing local data appear missing.

## Decision

Keep the physical database name `seren7`. Upgrade it forward from version 2, adding the missing stores and indexes as each feature reaches an independently tested checkpoint. Keep the logical entity/field contract in `Schema.md`, while documenting the physical key mappings (`id` for `conversation_id`, `content` for `text`, `kv` for settings, etc.). Treat the old V1 `events` store as read-only legacy data until an explicit migration or retention decision; new events use `run_events`. Never delete existing browser data as part of the upgrade.

## Migration and acceptance plan

1. Export a V2 database fixture containing model descriptors, 60+ messages, and two run-event streams.
2. Open the fixture with the new version; check all existing records and OPFS model handles remain readable.
3. Create required new stores in `onupgradeneeded` and make the upgrade idempotent on repeat open. Add tests for interrupted transactions and a newer unsupported database version.
4. Add run/tool/verification/state/policy records only with their corresponding implemented feature and tests. Keep unimplemented fields absent rather than fabricating data.
5. Verify user deletion removes all conversation-local records while preserving global model packages. Verify export/import and quota or eviction recovery.
6. Update `docs/Schema.md`, `docs/TRD.md`, `docs/Plan.md`, and `CHECKPOINT_LOG.md` with the approved physical name, mappings, migration receipt and remaining gates.

## Alternative considered

Create `seren-local-v1` and copy records from `seren7` across two databases. That adds a failure window and duplicate storage for large local histories while retaining no product benefit. It should be chosen only if a separate database boundary is required for a concrete compatibility or privacy reason.

## Approval effect

Approval permits the documented physical-name divergence and forward-only migration work. V3 now creates the listed stores/indexes; `tools/browser_schema_migration.mjs` demonstrates V2 preservation, deletion cascade, transaction rollback, repeat open, and future-version rejection. This does **not** promote CP005, CP009 or CP010 without their remaining acceptance evidence.
