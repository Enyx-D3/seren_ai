# UI_Spec — Preserve Seren 7, Connect Real Local Intelligence

> Current scope/status reconciliation: 2026-11-04. See [SRS.md](SRS.md) §§9–18 and [Seren7_V2_Recovery_Coverage.md](Seren7_V2_Recovery_Coverage.md). Earlier checkpoint sections retain their historical cutoff; they do not override this dated reconciliation.

## 2026-11-03 — V2 visual/interaction addendum (CP023-DOCS)
**Preservation rule:** Original uploaded Seren 7 HTML, animated planet/orb, glass visual identity, layout, sidebar/history, chat/composer/streaming/Stop and accessibility remain the acceptance reference. Do not replace the UI or silently remove orbital rotation. Respect reduced-motion and phone power limits.

**Truthful states:** Run details may show B2 goal, plan branches, Compass's eligible/selected operation, actual Instruct/Coder/model-worker identity, calculator/tool calls, GraphOS reuse/invalidation, verified components, residuals, CPU/RAM/time and terminal reason. Each displayed item must originate from a real event/receipt; no decorative agents or invented progress.

**Visibility and feature flags:** V1 users continue to see only the supported single Instruct model. Experimental Coder, dual-mode and TinyLinux UI controls remain hidden/disabled unless tested and enabled by explicit internal rollout. Never label an external native tool as "browser-local" without deployment and privacy proof; differentiate CPU/WASM, WebGPU, native optional, and unavailable.

**Response badges:** `Verified local result` only for the exact checked proposition; `Partially verified` and `Unverified explanation` must not be collapsed into a single successful green badge. A failed source/search operation is not proof that an item does not exist. User-visible error/fallback language must be specific and actionable.

**UI acceptance:** full keyboard/ARIA, 320–1440px responsive layouts, drawer/long code wrapping, original orb animation and reduced-motion, model missing/corrupt/evicted handling, loading/retry, cancellation, offline local history, safe import/export/delete, dynamic hardware capability labels. Verify screenshot/behavior parity with the original reference and on at least one physical phone before release.

**B2 diagnostic status (2026-11-01):** Run details may show `logic_direct`, `logic_enumerate`, `code_forward_scan` or `code_reverse_scan` only after execution. A checked JavaScript delimiter location or patch is partial evidence: the response and run remain `unverified` until independent program-behavior checks exist. Failed Falcon patch proposals do not replace the preserved diagnostic. No visual control is added by this slice.

**Calibration UI boundary (2026-11-01):** The measured shadow trial is a developer-only research API, not an active background agent or a visible improvement label. Retain current UI unchanged. Run details may show checked operation failures but must distinguish a failed independent comparison from an unchecked runtime error; neither justifies displaying a Level 3 animation or a general-intelligence claim.

**2026-11-01 development slice:** The bounded inventory-transfer solver uses the existing chat display and Run details. Only real `transfer_direct` / `transfer_conserve` trace events and conditional exact-arithmetic verification may appear; no dedicated Level 3 animation, selector or claimed measured acceleration is authorized. The magnetic route hypothesis is opt-in for development and must not be shown as a shipped capability.

**B2 progress presentation contract:** Run details should display the goal, checked task count, remaining requirements, verified components, selected operation, actual model/calculator cost and the latest residual. `Verified` applies to a whole answer only when every required part has an independent applicable receipt; a checked component must be labeled partial. A failed or unverified operation must appear as unresolved, and a no-progress stop must be clear. Do not animate or label inner/outer spirals, Level 3, B2CCP or reverse search as active before browser execution evidence. The current UI is only partially aligned with this target; preserve its existing layout and interaction vocabulary.

The grouped word-math path uses the existing chat answer and Run details, with actual `word_multiply`/`word_repeated` direction and calculator receipts in stored trace. It adds no new visible animation or selector. A parser rejection must retain the ordinary provisional response label.

**ADR-002/ADR-003 active UI:** Settings shows one verified Falcon Instruct weight. Auto is the B2 Spiral controller; Think deeper expands a bounded state/direction/repair budget. Run details should show selected operation and actual score evidence, established versus unresolved work, inference/calculator calls, verification status and limits. A missing evidence field stays unknown; no fictitious “magnetic” activity is shown.

**Version:** 1.1 Web-only · **Source:** uploaded `Seren 7(1).html` (~78 KB, 1,160 lines) · **Status:** partial browser implementation; release UI unverified. Current evidence: `CHECKPOINT_LOG.md`.

## 1. Design intent and non-negotiable fidelity

Keep the original quiet, premium **ChatGPT-like browser web** design: near-black/soft-light themes, a 288px sidebar, max ~720px focused conversation column, large animated gradient orb, soft translucency and typography. The orb is the single dominant accent and visually docks into the header when chat begins. Do not replace it with a generic ChatGPT clone, introduce a dense admin dashboard, or change the branding without a separate user decision. The production website adds honest local model diagnostics with restrained progressive disclosure; no app-install screens.

### Original visual system to preserve

| Token / source behavior | Current value/intent |
|---|---|
| `--ink` | Dark background `#0B0B11`, light theme overrides |
| `--ink-2` | Sidebar secondary background `#101018` |
| `--text`, `--text-2`, `--text-3` | Main/secondary/muted text |
| `--iris-a/b/c/d` | Peach, pink, purple, teal gradient family |
| `--live` | Mint status accent |
| `--side` | 288px desktop sidebar |
| `--orb` | 148px default, 188px at >=900px |
| Display type | Fraunces (fallback serif) |
| UI type | Onest (fallback system sans-serif) |
| Monospaced | DM Mono (fallback system monospace) |
| Motion | CSS easing and WebGL gradient orb; respect reduced motion |

Font assets must be locally bundled or replaced with visually tested fallbacks for true network-free operation. The existing Google Fonts CDN links are incompatible with a fully self-contained offline build unless cached as approved assets.

## 2. Existing DOM anchors and required changes

| Element | Original ID/class | Production requirement |
|---|---|---|
| Shell and app mode | `#app[data-state]` | Extend state machine without breaking layout transitions |
| Sidebar/drawer | `#sidebar`, `#scrim` | Genuine threads and local tasks, accessible mobile menu |
| Model selector | `#modelBtn`, `#modelMenu`, `#modelName` | Select actual route/preset; expose exact worker in diagnostics |
| Live workers | `#agentList`, `#agentCount`, `#agentsPill` | Derive only from real task registry; empty state by default |
| Conversation | `#thread`, `#scroller` | Persisted messages, sequence-safe streaming, scroll anchoring |
| Composer | `#composer`, `#prompt`, `#sendBtn` | Browser Worker request, real stop cancellation, keyboard support |
| Think mode | `#thinkBtn` | Actual bounded B2 reasoning budget |
| Orb | `#orb`, `#orbCanvas`, `#orbSlot`, `#orbAnchor` | Map genuine runtime states to energy, with CPU/GPU budget caps |
| Footnote | `#footnote` | Replace Claude concept text with truthful local runtime status |
| Suggestions | `[data-sugg]` | Keep as editable prompts; never pretend sample response is model output |
| Share | `#shareBtn` | Currently copy-conversation: label accurately |
| Theme | `[data-theme-set]` | Preserve system/light/dark with local persistence |

Original current implementation uses `MODELS` (`seren`, `swift`, `muse`), `AGENTS` demo entries, `S.turns` in-memory state, `SUGGESTIONS` scripted answers, and `window.claude?.use('sample')` for streamed replies. These are **migration points**, not live production systems. Preserve input responsiveness and orbs but remove demo behavior from production.

## 3. Application views

### A. First-run local setup

- Use the same panel aesthetic, orb, typography, and minimal copy.
- Show `Prepare Falcon Instruct in this browser`, integrity progress, projected browser storage requirement and verified active runtime; no app installation language.
- Show only the active Instruct model. Historical R/Coder/Tool-Calling weights are not preparation options or fallback models.
- No sign-in or subscription. Do not request personal data for model use.

### B. Empty/new chat

- Retain hero greeting, orb and four suggestions; suggestions insert user prompts, not AI claims.
- Display concise `Private · Runs on this device` and measured offline readiness.
- Model selector may offer `Auto/B2 Spiral` and presentation styles, but every language route must disclose the same Falcon Instruct model. A style must not imply another neural model.

### C. Active chat

- User bubble; assistant answer with Markdown, code block copy and accessible status.
- Show `Falcon Instruct · CPU/WASM` or a WebGPU label only when confirmed by the runtime. A local calculator path can say `Verified calculator` without implying that Falcon generated its result.
- `Thinking deeper` triggers real bounded B2 work; operation selection, model load, verification and residual repair appear as succinct, event-backed status stages.
- Response footer: copy, read-aloud (if a local speech voice exists), regenerate. Cancel immediately stops token reception and sends cancellation to engine.

### D. B2 direction inspector (collapsed by default)

- No full-screen 3D search visual in MVP; use a small expandable detail panel.
- Fields: request ID, one model identity, problem category, selected eligible operation, reason and evidence scope, candidate score factors (goal attraction, expected progress, information gain, cost, risk, exact reuse) **only when measured**, rejected directions, calculator calls, verified derivations, unresolved residuals, shared-state reuse, latency, memory footprint and fallback.
- Distinguish `verified`, `provisional`, `shadow` and `unavailable` capabilities. Matrix, Level 3 psychological/magnetic, virtual and B2CCP operations are not marked ready without browser proof.
- Never expose fabricated intermediate reasoning or internal chain-of-thought. Show only factual task/verification summaries.

### E. Real agent sidebar

- `Working for you` only when actual local tasks exist.
- Task card: name, state, percent only when grounded in completed work count, last event, cancel/retry action.
- Replace static fare-watch/CRISPR/memo demos with real tasks or empty state.

### F. Settings/storage

- Select compute preference: Auto / WebGPU / CPU-WASM / Browser B2CCP (only enabled when an actual browser-compatible port is verified).
- View Instruct storage footprint, actual load/unload and cache clearing.
- Local data export/delete, theme, reduced-motion and diagnostics privacy toggles.

## 4. Responsive behavior

- Preserve mobile-first composer dock, touch targets >=44 CSS px where practical, safe-area insets, and viewport keyboard behavior.
- Sidebar is overlay drawer at narrow widths, anchored desktop column at wide widths; scrim closes it.
- No horizontal overflow on long code or URLs; scroll code panels inside messages.
- Maintain readable line widths and scroll anchoring while tokens arrive.
- Test at 320, 360, 390, 768, 1024, and 1440px and on actual target phone/browser.
- Do not infer WebGPU support from CSS/browser name: capability probe determines compute labels.

## 5. Motion and performance budget

Orb should respond to **actual** `idle`, `loading`, `generating`, `verifying`, `complete`, `error` events; it must not imply activity after cancellation. Throttle animation and WebGL while generating or under thermal pressure; pause when hidden; fall back to static CSS gradient on context loss or reduced-motion preference. Model inference must run in a **browser Worker**, never block UI thread. The orb's WebGL canvas is visual-only and must not be described as a compute backend.

## 6. Accessibility and content safety

- Announce stream completion, failure and cancellation through restrained `aria-live` regions; avoid reading every token aloud automatically.
- Mode/presentation picker must support keyboard opening, arrow selection, Escape, focus return and semantic menu states.
- Persist accessible labels for icon-only buttons and prevent focus loss on model switch.
- Sanitize Markdown and link targets; continue escaping user/AI text before any HTML insertion. Never render arbitrary model-produced HTML/scripts.
- Use local fonts, SVG icons, and other assets for offline test; record any external asset request as a bug.

## 7. UI acceptance list

1. Baseline screenshots captured before refactor (light/dark, empty/chat, desktop/mobile).
2. Post-integration screenshot diffs reviewed at designated breakpoints.
3. Actual first token and complete response visible; old sample code disabled in production.
4. Stop interrupts underlying inference; partial response labeled stopped.
5. 50+ turn scroll stability and refresh persistence checked.
6. Theme, sidebar, suggestions, voice availability, copy and regenerate all tested.
7. No fake `3 agents working`; model identity, selected operation, verification and local/offline status truthful.
8. Reduced-motion and context-lost orb fallback tested.

## 8. Mapping decisions pending user approval

Preserve `Seren 7`, `Swift`, `Muse` as **style presets** or rename selector to actual B2 modes. The existing `Muse` style is **not** the external Muse coding agent and **not** an active Falcon variant. The user should see the one actual model identity in an accessible details panel regardless of preset label.


### 2026-11-03 — CP024 local browser/source hardening

No visual controls or layout were added for CP024. Developer-only URL `?b2_chain=1` uses existing chat, verification labels and Run details. A static desktop screenshot was inspected in the browser test; animation motion and physical mobile acceptance were not newly measured.


## Restored UI and research-control boundary — 2026-11-04

Keep the original `reference/Seren_7_original.html` appearance, animated rotating Jupiter/orb, responsive desktop/mobile layout, stream/Stop, history/sidebar, Settings, model loading/verification, storage/export/delete/reset, keyboard, screen reader and reduced-motion behavior. An internal intelligence upgrade must not look like a replacement product. Orb motion needs a real visual/motion regression, not merely the presence of a canvas or static screenshot.

Current local CP024 control is developer URL `?b2_chain=1`; no new model/tool/network control is added by this doc. Future controls must truthfully identify active model/resource, permissions, load progress, verified components, unresolved uncertainty and cancellation/failure. Never display a whole-answer verified badge from one checked subresult, fabricate background agents or expose raw internal reasoning as proof. Zero-model structured math is historical prototype behavior; unsupported conversation still requires a language model. Follow [SRS §§9,17](SRS.md#9-restored-v2-master-scope-and-precedence-2026-11-04) for release gates.
