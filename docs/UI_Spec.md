# UI_Spec — Preserve Seren 7, Connect Real Local Intelligence

**Version:** 1.1 Web-only · **Source:** uploaded `Seren 7(1).html` (~78 KB, 1,160 lines) · **Status:** inspected concept, no production backend

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
- Show `Import models to this browser`, per-part integrity, projected browser storage requirement and verified active runtime; no app installation language.
- Label roles: Instruct, Reasoning, Coder, Tool-Calling. Show unavailable until binary check succeeds.
- No sign-in or subscription. Do not request personal data for model use.

### B. Empty/new chat

- Retain hero greeting, orb and four suggestions; suggestions insert user prompts, not AI claims.
- Display concise `Private · Runs on this device` and measured offline readiness.
- Model selector may offer `Auto`, `Chat`, `Reason`, `Code`, `Tools` or retain Seren style presets with an explicit underlying model subtitle.

### C. Active chat

- User bubble; assistant answer with Markdown, code block copy and accessible status.
- Show `Falcon Instruct · CPU` or `Falcon R · WebGPU` only when confirmed by runtime.
- `Thinking deeper` triggers a real route; model load and verification appear as succinct status stages.
- Response footer: copy, read-aloud (if a local speech voice exists), regenerate. Cancel immediately stops token reception and sends cancellation to engine.

### D. Specialist and Compass inspector (collapsed by default)

- No full-screen 3D search visual in MVP; use a small expandable detail panel.
- Fields: request ID, selected model, route reason category, calculator calls, verification status, shared-state reuse, latency, memory footprint, and fallback.
- Never expose fabricated intermediate reasoning or internal chain-of-thought. Show only factual task/verification summaries.

### E. Real agent sidebar

- `Working for you` only when actual local tasks exist.
- Task card: name, state, percent only when grounded in completed work count, last event, cancel/retry action.
- Replace static fare-watch/CRISPR/memo demos with real tasks or empty state.

### F. Settings/storage

- Select compute preference: Auto / WebGPU / CPU-WASM / Browser B2CCP (only enabled when an actual browser-compatible port is verified).
- View model storage footprint, per-model load/unload and cache clearing.
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
- Model picker must support keyboard opening, arrow selection, Escape, focus return, semantic menu states.
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
7. No fake `3 agents working`; model identity and local/offline status truthful.
8. Reduced-motion and context-lost orb fallback tested.

## 8. Mapping decisions pending user approval

Preserve `Seren 7`, `Swift`, `Muse` as **style presets** or rename selector to actual specialist/mode names. The existing `Muse` style is **not** the external Muse coding agent and **not** a Drive Falcon variant. The user should see actual model identity in an accessible details panel regardless of preset label.
