/* Seren 7 — deterministic local tools + the tool-fabric contract (DEC-008/DEC-010).
   Arithmetic happens here in plain code, never inside the LLM. IEEE-754
   operations and transcendental functions are not exact decimal proofs. Tool-call text a
   model emits is a PROPOSAL: parsed, validated, then only whitelisted local
   functions may run. No network, no shell, no globals. */
import { exactArithmetic, solveLinear } from './exact-arithmetic.mjs';

const FN = {
  sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  log: Math.log10, ln: Math.log, abs: Math.abs, round: Math.round,
  floor: Math.floor, ceil: Math.ceil,
};
const CONSTS = { pi: Math.PI, e: Math.E };
const PREC = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 3 };

const TIMES_SIGN = String.fromCharCode(215); /* × */
const DIV_SIGN = String.fromCharCode(247);   /* ÷ */

/* Safe arithmetic evaluator: tokenizer + recursive descent; never uses eval(). */
export function evalExpr(src) {
  const t = String(src).split(TIMES_SIGN).join("*").split(DIV_SIGN).join("/").replace(/,/g, "");
  let i = 0;
  const ws = () => { while (i < t.length && /\s/.test(t[i])) i++; };
  function num() {
    const m = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(t.slice(i));
    if (!m) return null;
    const v = parseFloat(m[0]); i += m[0].length; return v;
  }
  function ident() {
    const m = /^[a-z_]+/i.exec(t.slice(i));
    if (!m) return null;
    const v = m[0].toLowerCase(); i += v.length; return v;
  }
  function primary() {
    ws();
    if (t[i] === "(") { i++; const v = expr(); ws(); if (t[i] !== ")") throw new Error("missing )"); i++; return v; }
    if (t[i] === "-") { i++; return -primary(); }
    if (t[i] === "+") { i++; return primary(); }
    const n = num(); if (n !== null) return n;
    const idv = ident();
    if (idv === null) throw new Error("unexpected '" + (t[i] || "end") + "'");
    if (Object.hasOwn(CONSTS, idv)) return CONSTS[idv];
    if (Object.hasOwn(FN, idv)) {
      ws(); if (t[i] !== "(") throw new Error(idv + " needs parentheses");
      i++; const v = expr(); ws(); if (t[i] !== ")") throw new Error("missing )"); i++;
      return FN[idv](v);
    }
    throw new Error("unknown symbol " + idv);
  }
  function power() {
    const b = primary(); ws();
    if (t[i] === "^") { i++; const e = unary(); return Math.pow(b, e); }
    return b;
  }
  function unary() { ws(); if (t[i] === "-") { i++; return -unary(); } return power(); }
  function term() {
    let v = unary();
    for (;;) {
      ws(); const op = t[i];
      if (op === "*" || op === "/" || op === "%") { i++; const r = unary(); if (op === "*") v = v * r; else if (op === "/") v = v / r; else v = v % r; }
      else break;
    }
    return v;
  }
  function expr() {
    let v = term();
    for (;;) {
      ws(); const op = t[i];
      if (op === "+" || op === "-") { i++; const r = term(); v = op === "+" ? v + r : v - r; }
      else break;
    }
    return v;
  }
  const out = expr(); ws();
  if (i < t.length) throw new Error("unexpected trailing '" + t[i] + "'");
  if (!Number.isFinite(out)) throw new Error("not a finite number");
  return out;
}

function fmt(v) {
  if (Number.isInteger(v)) return String(v);
  return (Math.abs(v) >= 1e15 || (Math.abs(v) < 1e-6 && v !== 0)) ? v.toExponential(6) : String(+v.toFixed(6));
}

/* ---- unit conversion (local table, both directions) ---------------------- */
const CONVERSIONS = {
  m: ["m", 1],
  km: ["m", 1000], cm: ["m", 0.01], mm: ["m", 0.001], mi: ["m", 1609.344], ft: ["m", 0.3048], in: ["m", 0.0254], yd: ["m", 0.9144],
  g: ["g", 1],
  kg: ["g", 1000], lb: ["g", 453.59237], oz: ["g", 28.34952],
  ml: ["ml", 1],
  l: ["ml", 1000], gal: ["ml", 3785.411784],
  b: ["b", 1], kb: ["b", 1000], mb: ["b", 1e6], gb: ["b", 1e9], tb: ["b", 1e12],
};
const ALIAS = {
  kilometer: "km", kilometers: "km", meter: "m", meters: "m", centimeter: "cm", centimeters: "cm",
  millimeter: "mm", millimeters: "mm", mile: "mi", miles: "mi", foot: "ft", feet: "ft", inch: "in", inches: "in", yard: "yd", yards: "yd",
  kilogram: "kg", kilograms: "kg", gram: "g", grams: "g", pound: "lb", pounds: "lb", lbs: "lb", ounce: "oz", ounces: "oz",
  liter: "l", liters: "l", litre: "l", litres: "l", gallon: "gal", gallons: "gal", milliliter: "ml", milliliters: "ml", byte: "b", bytes: "b",
  celsius: "c", fahrenheit: "f", kelvin: "k",
};
const TEMPS = {
  c: { toBase: v => v, fromBase: v => v },
  f: { toBase: v => (v - 32) * 5 / 9, fromBase: v => v * 9 / 5 + 32 },
  k: { toBase: v => v - 273.15, fromBase: v => v + 273.15 },
};
function norm(u0) {
  const u = String(u0).toLowerCase().replace(/[^a-z]/g, "");
  if (u in CONVERSIONS) return u;
  if (u in TEMPS) return u;
  if (u in ALIAS && ALIAS[u]) return ALIAS[u];
  return null;
}
export function convert(value, fromRaw, toRaw) {
  const from = norm(fromRaw), to = norm(toRaw);
  if (from === null || to === null) return null;
  if (from in TEMPS && to in TEMPS) return +TEMPS[to].fromBase(TEMPS[from].toBase(value)).toFixed(4);
  if (from in TEMPS || to in TEMPS) return null;
  if (CONVERSIONS[from][0] !== CONVERSIONS[to][0]) return null;
  return +(value * CONVERSIONS[from][1] / CONVERSIONS[to][1]).toFixed(6);
}

/* ---- local deterministic intercepts without touching the LLM ------------- */
export function extractExactArithmetic(text) {
  const s = String(text).trim();
  const expr = s.replace(/^(what(?:'s| is)|calculate|compute|solve|eval(?:uate)?|value of)\b[:\s]*/i, "")
    .replace(/[?.!]+$/, "").replace(/\bplus\b/gi, "+").replace(/\bminus\b/gi, "-")
    .replace(/\btimes\b/gi, "*").replace(/\bdivided by\b/gi, "/").replace(/\s/g, "");
  return /^[\d+\-*/().]+$/.test(expr) && /[+\-*/]/.test(expr.slice(1)) ? expr : null;
}
export function tryLocalAnswer(text) {
  const s = text.trim();

  /* percent of N */
  let m = /^what\s+is\s+(\d+(?:\.\d+)?)\s*(?:%|percent)\s+of\s+(\d+(?:\.\d+)?)\s*[?.!]*$/i.exec(s);
  if (m) return mk("deterministic", s, (parseFloat(m[1]) / 100) * parseFloat(m[2]), m[1] + "% of " + m[2]);

  /* unit conversion */
  m = /(?:^|\s)(?:convert\s+)?(-?\d+(?:\.\d+)?)\s*(?:deg(?:rees)?\s*)?([a-z]+)\s+(?:in|to|into|as)\s+(?:deg(?:rees)?\s*)?([a-z]+)\s*[?.!]*$/i.exec(s);
  if (m) {
    const v = convert(parseFloat(m[1]), m[2], m[3]);
    if (v !== null) return mk("deterministic", s, v, m[1] + " " + m[2] + " -> " + m[3]);
  }

  /* date / time */
  m = /what(?:'| i)?s? (?:is )?(?:the |current )(?:date|time)|what day is (?:it|today)|current (?:date|time)|what time is it/i.exec(s);
  if (m) {
    const d = new Date();
    const str = d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }) +
      ", " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return { kind: "deterministic", question: s, answer: "It's " + str + " (local time on this device).", via: "local clock", detail: null };
  }

  /* plain arithmetic */
  const expr = s.replace(/^(what(?:'s| is)|calculate|compute|solve|eval(?:uate)?|value of)\b[:\s]*/i, "").replace(/[?.!]+$/, "").replace(/\bplus\b/gi, "+").replace(/\bminus\b/gi, "-").replace(/\btimes\b/gi, "*").replace(/\bdivided by\b/gi, "/").replace(/\s/g, "");
  if (/^[\d+\-*/%^().e]+$/i.test(expr) && /[+\-*/%^]/.test(expr.slice(1))) {
    try {
      const exact = exactArithmetic(expr);
      return { kind: "deterministic", question: s, answer: exact.text, via: "verified exact arithmetic", detail: expr };
    } catch (e) {
      if (/division by zero/.test(e.message))
        return { kind: "deterministic", question: s, answer: "Undefined (division by zero).", via: "verified exact arithmetic", detail: expr };
      /* expressions outside exact + - * / decimals may use the approximate evaluator */
    }
    try {
      const v = evalExpr(expr);
      return { kind: "deterministic", question: s, answer: fmt(v), via: "approximate calculator", detail: expr };
    } catch (e) { /* fall through to the local model */ }
  }
  return null;

  function mk(kind, question, value, detail) {
    return { kind, question, answer: fmt(value), via: "deterministic calculator", detail };
  }
}

/* ---- tool-fabric parsing (DEC-010: proposals, not authority) -------------- */

/* Boundary strings assembled from parts so no exotic literals
   appear in one place. Output protocol: backtick + { json } + backtick. */
/* Boundary assembled from char codes: backtick + brace ... brace + backtick.
   The capture group INCLUDES the outer braces so JSON.parse works directly. */
const BQ = String.fromCharCode(96); /* backtick */
const FAB_RE = new RegExp(BQ + "\\s*(\\{[\\s\\S]*?\\})\\s*" + BQ, "g");
const TAG_RE = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;

/* Parse every ` {...} ` candidate emitted by a model. Parsing never executes.
   The envelope is backtick + brace ... brace + backtick; the captured body
   INCLUDES its outer braces, so it can be parsed directly. */
export function parseToolFabric(text) {
  const calls = [], errors = [];
  TAG_RE.lastIndex = 0;
  let tagged;
  while ((tagged = TAG_RE.exec(String(text))) !== null) {
    try {
      const parsed = JSON.parse(tagged[1]);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        if (item && typeof item.name === "string" && item.arguments && typeof item.arguments === "object" && !Array.isArray(item.arguments))
          calls.push({ name: item.name, arguments: item.arguments, raw: tagged[0] });
        else errors.push({ raw: tagged[0], error: "invalid tool proposal" });
      }
    } catch (e) { errors.push({ raw: tagged[0], error: "invalid tool JSON" }); }
  }
  FAB_RE.lastIndex = 0;
  let match;
  while ((match = FAB_RE.exec(String(text))) !== null) {
    const raw = match[0], body = match[1];
    try {
      const parsed = JSON.parse(body);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        if (item && typeof item.name === "string") {
          calls.push({ name: item.name, arguments: item.arguments == null ? {} : item.arguments, raw });
        } else errors.push({ raw: raw, error: "call missing name" });
      }
    } catch (e) {
      errors.push({ raw: raw, error: String((e && e.message) || e) });
    }
  }
  return { calls, errors };
}

/* ---- Whitelisted local tools --------------------------------------------- */
export const LOCAL_TOOLS = {
  exact_arithmetic: {
    description: "Verified exact arithmetic for decimal numbers, fractions and + - * / parentheses; returns an integer or reduced fraction.",
    parameters: { expression: { type: "string", description: "e.g. 0.1+0.2 or 1/3" } },
    execute(args) { return exactArithmetic(args.expression).text; },
  },
  calculator: {
    description: "Evaluate arithmetic locally. Basic decimal arithmetic is exact; functions, powers and remainders use approximate IEEE-754 numbers.",
    parameters: { expression: { type: "string", description: "e.g. 12*(3+4)" } },
    execute(args) {
      const expression = String((args && args.expression) || "");
      try { return exactArithmetic(expression).text; }
      catch (e) {
        if (!/invalid exact arithmetic token|unexpected trailing token|missing operator/.test(e.message)) throw e;
        return fmt(evalExpr(expression));
      }
    },
  },
  unit_convert: {
    description: "Convert between units (length, mass, volume, data, temperature).",
    parameters: { value: { type: "number" }, from: { type: "string" }, to: { type: "string" } },
    execute(args) {
      const v = convert(+args.value, args.from, args.to);
      if (v === null) throw new Error("unknown or mismatched units");
      return v + " " + String(args.to);
    },
  },
  now: {
    description: "Current local date and time.",
    parameters: {},
    execute() {
      const d = new Date();
      return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    },
  },
  solve_linear: {
    description: "Solve a*x+b=c exactly for rational coefficients; verifies the result by substitution.",
    parameters: { a: { type: "string" }, b: { type: "string" }, c: { type: "string" } },
    execute(args) { return `x = ${solveLinear(args.a, args.b, args.c).text}`; },
  },
};

/* JSON tool descriptions for the Tools-family prompt (their template's tojson). */
export function reachableToolsJSON() {
  return Object.entries(LOCAL_TOOLS).map(entry => ({
    name: entry[0],
    description: entry[1].description,
    parameters: entry[1].parameters,
  }));
}

/* Execution boundary (DEC-010): only registered names; failures are structured. */
export function executeToolCall(call, { allowLocalCompute = true } = {}) {
  if (!allowLocalCompute) return { ok: false, error: 'local tool permission denied' };
  if (!call || typeof call.name !== 'string') return { ok: false, error: 'tool name required' };
  const tool = Object.hasOwn(LOCAL_TOOLS, call.name) ? LOCAL_TOOLS[call.name] : null;
  if (!tool) return { ok: false, error: "unknown tool '" + call.name + "' - not whitelisted" };
  try {
    const args = call.arguments;
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("arguments must be an object");
    const params = tool.parameters;
    if (Object.keys(args).some(k => !Object.hasOwn(params, k))) throw new Error("unknown argument");
    for (const [name, spec] of Object.entries(params)) {
      if (typeof args[name] !== spec.type) throw new Error(name + " must be " + spec.type);
      if (spec.type === "string" && args[name].length > 1000) throw new Error(name + " too long");
      if (spec.type === "number" && !Number.isFinite(args[name])) throw new Error(name + " must be finite");
    }
    const value = tool.execute(args);
    let verification = 'local_observation';
    if (call.name === 'exact_arithmetic' || call.name === 'solve_linear') verification = 'independently_verified_exact';
    else if (call.name === 'calculator') {
      try { verification = exactArithmetic(args.expression).text === value ? 'independently_verified_exact' : 'unverified'; }
      catch { verification = 'approximate'; }
    } else if (call.name === 'unit_convert') verification = 'approximate';
    return { ok: true, value, verification };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/* Human label for an executed proposal. */
export function formatToolResult(name, result) {
  return result && result.ok
    ? "Tool " + name + " returned: " + result.value
    : "Tool " + name + " failed: " + ((result && result.error) || "unknown error");
}

/* Machine fragment to continue the tool loop (fed back as a user turn, which
   is exactly how the verified templates treat tool responses). */
export function renderToolResultBlock(results) {
  if (!results || !results.length) return "";
  const rows = results.map(function (r) {
    return r.ok
      ? { name: r.name, result: String(r.value) }
      : { name: r.name, error: String(r.error || "failed") };
  });
  return "\n\n" + JSON.stringify(rows);
}
