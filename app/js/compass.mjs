/* Seren 7 — B2 Magnetic Compass v1 (rule-stage).
   Routes by prompt signals + audit-measured priors (DEC-004, DEC-007).
   Priors come from the owner-archived repair audit (SMALL_AI_ZOO_REPAIR_AUDIT_RUN2.md)
   measured on these exact GGUFs:
     - Coder promoted: 16/16 raw+FIM executable tasks
     - Tool-Calling 3/8 · Instruct weak · R 0/8 as chatbot
   These are starting priors only — CP006 replaces them with live tournament
   measurements; a prior never hard-promotes a model here. */

const SIGNALS = [
  { id: "code", model: "falcon_coder", w: 2.5,
    re: /(```|\bfunction\b|\bconst\b|\bclass\b|\bimport\b|\bdef\b|\bbug\b|stack trace|regex|\bsql\b|\bapi\b|\bcss\b|\bhtml\b|\bpython\b|\bjavascript\b|\btypescript\b|compile|\bnpm\b|\bjson\b|error message)/i },
  { id: "tools", model: "falcon_tools", w: 2.0,
    re: /\b(what(?:'|’)?s? (?:is )?the (?:date|time)|current (?:date|time)|convert|calculate|schedule|calendar|set a (?:timer|reminder)|uuid|random number)\b/i },
  { id: "reasoning", model: "falcon_reason", w: 1.6,
    re: /\b(why|explain|analy[sz]e|analy[sz]is|reason\w*|prove|derive|proof|logic|philosoph\w*|step[- ]by[- ]step|implication)\b/i },
  { id: "math", model: "falcon_reason", w: 1.2,
    re: /(^\s*[\d(]|[\d)]\s*[+\-*/^%]\s*[\d(]|\bmath\b|\bsum of\b|\baverage of\b|\bprobability\b)/i },
];

export function priorNote() {
  return "starting priors from zoo audit run-2 (Coder promoted on 16/16; Tools 3/8; Instruct weak; R 0/8 chatbot) — superseded by CP006 live measurements";
}

/* Score candidates and pick. `ready` = set of usable model ids (stored+validated).
   deterministic requests (exact calculator hits) never reach routing. */
export function route(text, opts) {
  opts = opts || {};
  const think = !!opts.think, ready = opts.ready || new Set();
  const scores = new Map([
    ["falcon_instruct", 0.6], /* default baseline */
    ["falcon_reason", 0], ["falcon_coder", 0], ["falcon_tools", 0],
  ]);
  const hits = [];
  for (const sig of SIGNALS) {
    if (sig.re.test(text)) {
      scores.set(sig.model, scores.get(sig.model) + sig.w);
      hits.push({ id: sig.id, model: sig.model, w: sig.w });
    }
  }
  if (think) scores.set("falcon_reason", scores.get("falcon_reason") + 1.2);

  /* availability gate: unusable models are heavily penalized, never picked */
  for (const [m, s] of scores) if (!ready.has(m)) scores.set(m, s - 100);

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const modelId = ranked[0][0], score = ranked[0][1];
  const second = ranked[1] ? ranked[1][1] : 0;
  if (score <= 0) {
    const fallback = ready.has("falcon_instruct") ? "falcon_instruct" : [...ready][0] || null;
    return {
      modelId: fallback,
      reason: "no strong signals — default conversation",
      confidence: 0.35,
      hits,
      alternates: ranked.slice(1).map(([m, s]) => [m, s]),
      scores: Object.fromEntries(scores),
    };
  }
  return {
    modelId,
    reason: (think ? "think mode (reasoning bias) + signals: " : "signals: ") + (hits.length ? hits.map(h => h.id).join(", ") : "default-vs-available"),
    confidence: Math.max(0.3, Math.min(0.95, 0.4 + (score - second) * 0.12)),
    hits,
    alternates: ranked.slice(1).filter(([, s]) => s > 0).map(([m, s]) => [m, s]),
    scores: Object.fromEntries(scores),
  };
}

/* Display metadata for the model menu / message meta (overrides the demo MODELS). */
export const MODEL_META = {
  falcon_instruct: { display: "Seren 7", html: "Seren 7", desc: "Everyday conversation. Balanced depth and speed." },
  falcon_reason: { display: "Seren 7 Reasoning", html: "Seren 7 <i>Reasoning</i>", desc: "Careful multi-step and why-counting work." },
  falcon_coder: { display: "Seren 7 Coder", html: "Seren 7 <i>Coder</i>", desc: "Code and raw continuation." },
  falcon_tools: { display: "Seren 7 Tools", html: "Seren 7 <i>Tools</i>", desc: "Structured operations and tool calls." },
  auto: { display: "Auto", html: "Auto", desc: "Compass picks the specialist from the prompt." },
};

export const SPECIALISTS = ["falcon_instruct", "falcon_reason", "falcon_coder", "falcon_tools"];
