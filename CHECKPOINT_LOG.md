# Seren 7 — Checkpoint Evidence Log

Living ledger per `AGENTS.md` + `docs/Plan.md` §8. Entries are appended by the working agent.
Format: plan §8 receipt template. Evidence is reproducible or the checkpoint is not PASS.

---

## Audit — 2026-10-26 (project boot)

- Agent: Lead engineer (GLM / OpenCode session).
- Environment audited: macOS 27.0.1 darwin arm64 · Node v22.23.2 · Python 3.14.8 (urllib SSL store missing; curl has working CA) · git 2.54.0 · zip/unzip/curl present · no wget.
- Specs read in full: README, AGENTS (contract loaded), PRD, AppFlow, UI_Spec, TRD, Schema, Plan, and `reference/Seren_7_original.html` (1,160 lines, demo logic identified: `MODELS`/`AGENTS`/`SUGGESTIONS`/`THREADS` constants, `window.claude.use('sample')`, scripted simulate() streaming, Google Fonts CDN links — all migration points per UI_Spec §2).
- Repo state: no prior implementation exists → baseline commit `1042ac2` = clean spec package.
- Drive access: initially 401/sign-in wall (evidence: redirect to `accounts.google.com/v3/signin`); user made folders public on request → folder listing fetched successfully (title "HF Small AI Model Zoo — Canonical Packages", 114 entries).
- Directory discipline: `workspace/` holds model bytes + hash receipts; `app/` is the deliverable; `tools/` scripts; model bytes are gitignored, manifests/checksums are committed.

## CP001 — Four archive reconstruction and identity — 2026-10-26

- Status: **PASS** (with two members completed via documented gold-recovery; see Failures)
- Agent/session: Lead engineer (session of 2026-10-26).
- Input artifacts: 8 ZIP parts + 4 Q4_K_M GGUFs + 2 audit docs, all from publicly-opened Drive folder `1IZhJVobJhXeeotVLGW3g54Kz0dxYqajo`; per bytes = TRD §3 figures exactly.
- Commands: `workspace/tools/cp001_acquire.zsh` (curl `drive.usercontent.google.com/download`, immutable-copy policy) → `cat part000 part001 > recon.zip` → `unzip -t` → `unzip -p` extraction → `shasum -a 256` → HF API tree comparison (`/api/models/tiiuae/.../tree/main`) → `node tools/gguf_inspect.mjs` for GGUF metadata.
- Actual results:
  - **R-90M**: ZIP CRC-clean (34 members), recon sha256 `2256c92b…90b597e3a19004`, safetensors sha256 `1556cfc6…` == HF LFS oid. PASS.
  - **Tool-Calling-90M**: ZIP CRC-clean, recon sha256 `ecee57b8…d591ec817`, safetensors `b2778f0a…` == HF LFS oid. PASS.
  - **90M-Instruct**: part000 truncated at Drive (34,209,792 vs expected full 99,614,720; unzip missing 65,404,928 B). All small members recovered byte-identical to official repo sizes. `model.safetensors` recovered via owner-declared HF source; local gold sha256 `199e9960…80578` == HF LFS oid. Contents verified, provenance recorded. PASS with recovery receipt.
  - **90M-Coder**: part001 truncated (45,823,443 vs 46,675,411; missing 851,968 B). Same recovery route: gold `78bd74c8…626b1` == HF. The ZIP member list has NO `chat_template.jinja` — matching official repo and the prior repair audit's "no chat template" finding. PASS with recovery receipt.
  - All four Q4_K_M GGUFs: local sha256 == zoo-manifest documented sha256 (see MANIFEST_LOCAL.json); arch `falcon-h1`, 24 blocks, emb 512, GQA 8/2, Mamba2 state 64/conv 4, ctx 262,144, vocab 32,768. Instruct 386 tensors/91M label; others 387 tensors/108M label.
- Failures/counterexamples: source-part truncations (evidence: sizes + unzip missing bytes); duplicate Instruct Drive folder requires sign-in → gold-recovery from HF (repo named inside the archive's own `HF_URL.txt`).
- Files changed: `workspace/parts/*` (acquired copies; gitignored), `workspace/reconstructed/*.zip`, `workspace/models/falcon_*/` extracted files + `MANIFEST_LOCAL.json`, `tools/gguf_inspect.mjs`, `CHECKPOINT_LOG.md`.
- Verification: independent cross-checker = HuggingFace LFS oids (byte-identical match for 4 safetensors), official file-size comparison for every recovered JSON/jinja/tokens file.
- Rollback: originals immutable on Drive; delete `workspace/reconstructed/`, `workspace/parts/`, `workspace/models/` and re-run the script.
- Next checkpoint: CP002 (browser feasibility tournament).


---

(Per-checkpoint receipts added below as CP001…CP011 progress.)
