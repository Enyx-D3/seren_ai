# Seren-7 V1 — deterministic product development

## User-facing scope (approved November 17, 2026)

1. **Smart Research:** enter a question, search the internet, inspect retrieved evidence, and follow source links.
2. **Perfect Summaries:** paste or import text, then get a shorter, source-referenced version.
3. **Professional Reports:** turn source material into a structured, evidence-referenced report.

**Constraint:** zero AI/LLM model calls and zero model downloads for V1. Preserve the existing responsive web UI. The three modes share one conversation/history system.

## Build sequence and acceptance criteria

| Stage | Deliverable | Acceptance test | Current state |
| --- | --- | --- | --- |
| S1 | Mode switcher, model-free submit, text import | Chat works without GGUF; conversations persist | Implemented; browser-level test still blocked by sandbox |
| S2 | Deterministic extraction and summaries | No invented sentences; citations point to exact source text | Initial baseline implemented and unit-tested; quality calibration pending |
| S3 | Live web research | Live source titles, excerpts, links; clear empty/offline behavior | Brave backend adapter plus Wikipedia fallback implemented; end-to-end provider integration pending |
| S4 | Professional report writing | Structured sections, numbers, provenance and limitations | Initial extractive draft implemented; depth and quality calibration pending |
| S5 | Integration and usability | UI smoke tests, long-source handling, download/export, accessibility | Pending |
| S6 | Release readiness | Comparative quality evaluation on unfamiliar texts; deployed live search; zero-model proof | Pending |

## What is true today

- Summaries/reports are **extractive baselines**, not verified “perfect” quality. They preserve source sentences instead of paraphrasing or inventing.
- Smart Research shows **retrieved source excerpts**, not a synthesized answer or independent fact-check.
- The backend general-search adapter uses the official Brave Search Web API and requires a server-side `BRAVE_SEARCH_API_KEY`. It is available through the local Node server or the included Vercel `/api/research` function. No API key is shipped to browsers.
- If that route is unavailable, the browser attempts a **Wikipedia-only** search. Wikipedia is not a replacement for full web search.
- Offline or unavailable search is reported as unavailable; the product never pretends it searched.
- The historical Falcon/model-based implementation remains in Git history and unused in deterministic V1.

## Run locally

```bash
npm ci
npm run serve
npm run test:deterministic:v1
npm run build:web
```

Optional full web provider:

```bash
BRAVE_SEARCH_API_KEY=YOUR_SERVER_SIDE_KEY npm run serve
```

The static bundle contains the Vercel function, but plain static file hosting cannot execute it. On a non-Vercel static host, the browser uses the Wikipedia fallback unless the host provides a compatible `/api/research?q=...` route.

## Quality definition

Measure source fidelity, key-point recall, redundancy, readability, traceable citations, numeric accuracy, and user usefulness separately. A passing unit test verifies code properties, **not** perfect summary/report quality. Compare on held-out documents and improve the deterministic ranking and structured writing before release.
