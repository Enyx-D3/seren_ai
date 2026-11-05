/* Source-grounded, bounded operations shared by the B2 controller. These
   contracts check only what their parsers establish; no model text is a fact. */
import { parseEntailmentProblem, executeEntailmentPath } from './b2-entailment.mjs';
const word = '[A-Za-z][A-Za-z0-9_-]*(?: [A-Za-z][A-Za-z0-9_-]*){0,2}';
const statement = new RegExp(`(${word}) is (not )?(${word})[.!]`, 'gi');

function logicProblem(source) {
  if (!/\b(?:contradict\w*|both statements true|both be true)\b/i.test(source) || source.length > 500) return null;
  const rows = [...source.matchAll(statement)].slice(0, 3).map((match, index) => ({
    id: `fact-${index + 1}`, subject: match[1].toLowerCase(), predicate: match[3].toLowerCase(),
    polarity: !match[2], quote: match[0], sourceOffset: match.index,
    provenance: 'user_input', status: 'assumed_input',
  }));
  if (rows.length !== 2 || rows.some(row => source.slice(row.sourceOffset, row.sourceOffset + row.quote.length) !== row.quote)) return null;
  const remainder = source.replace(rows[0].quote, '').replace(rows[1].quote, '').trim();
  if (!/^(?:are|can|do|is)\b[^.!?]{0,120}\b(?:contradict\w*|both\b[^?]*\btrue)[?]$/i.test(remainder)) return null;
  return { domain: 'logic', intent: 'detect_contradiction', facts: rows,
    unknown: { id: 'contradiction', question: remainder, sourceOffset: source.indexOf(remainder) },
    constraints: ['same_subject_predicate', 'opposite_polarity', 'same_time_and_context_formal_reading'],
    dependencies: rows.map(row => ({ from: row.id, to: 'contradiction', relation: 'requires_stated_fact' })),
    knowledgeGaps: [], verifier: 'independent_direct_and_truth_table',
    paths: [{ kind: 'logic_direct', operations: 1, verification: 'independent_logic', steps: ['compare_propositions'] },
      { kind: 'logic_enumerate', operations: 4, verification: 'independent_logic', steps: ['enumerate_truth_assignments'] }],
  };
}

function codeProblem(source) {
  if (source.length > 1200 || !/\b(?:debug|syntax error|find the bug)\b/i.test(source) || !/\bjavascript\b/i.test(source)) return null;
  const match = /```(?:javascript|js)\s*\n([\s\S]{1,900}?)\n```/i.exec(source);
  if (!match) return null;
  const code = match[1], offset = source.indexOf(code);
  return { domain: 'code', intent: 'locate_javascript_delimiter_error',
    facts: [{ id: 'code-source', quote: code, sourceOffset: offset, provenance: 'user_input', status: 'assumed_input' }],
    unknown: { id: 'syntax-diagnostic', question: 'Find a delimiter mismatch in the supplied JavaScript.' },
    constraints: ['javascript_source', 'diagnostic_only'],
    dependencies: [{ from: 'code-source', to: 'syntax-diagnostic', relation: 'requires_source' }],
    knowledgeGaps: ['full_program_behavior'], verifier: 'independent_bidirectional_delimiter_scan',
    code, offset,
    paths: [{ kind: 'code_forward_scan', operations: code.length, verification: 'independent_code_structure', steps: ['scan_forward'] },
      { kind: 'code_reverse_scan', operations: code.length * 2, verification: 'independent_code_structure', steps: ['scan_reverse'] }],
  };
}

export function interpretCrossDomain(source, { experimentalChain = false } = {}) {
  const text = String(source || '').trim();
  return logicProblem(text) || codeProblem(text) || (experimentalChain ? parseEntailmentProblem(String(source || '')) : null);
}

// Strip string/comment contents while preserving every source offset. Template
// interpolation is excluded: its embedded expressions need a full JS parser.
function codeMask(code) {
  let state = 'normal', masked = '';
  for (let i = 0; i < code.length; i++) {
    const ch = code[i], next = code[i + 1];
    if (state === 'normal') {
      if (ch === '`') return null;
      if (ch === '"' || ch === "'") { state = ch; masked += ' '; continue; }
      if (ch === '/' && next === '/') { state = 'line'; masked += '  '; i++; continue; }
      if (ch === '/' && next === '*') { state = 'block'; masked += '  '; i++; continue; }
      if (ch === '/') return null; // Regex literals and division need a full lexer.
      masked += ch;
    } else if (state === 'line') { masked += ch === '\n' ? '\n' : ' '; if (ch === '\n') state = 'normal'; }
    else if (state === 'block') { masked += ' '; if (ch === '*' && next === '/') { masked += ' '; i++; state = 'normal'; } }
    else { masked += ' '; if (ch === '\\') { if (i + 1 < code.length) { masked += ' '; i++; } }
      else if (ch === state) state = 'normal'; }
  }
  return state === 'normal' || state === 'line' ? masked : null;
}

const pairs = { '(': ')', '[': ']', '{': '}' };
const closes = Object.fromEntries(Object.entries(pairs).map(([a, b]) => [b, a]));
function scanForward(masked) {
  const stack = [];
  for (let i = 0; i < masked.length; i++) {
    const ch = masked[i];
    if (pairs[ch]) stack.push({ ch, offset: i });
    else if (closes[ch]) {
      const top = stack.pop();
      if (!top || top.ch !== closes[ch]) return { kind: 'mismatched_close', offset: i, expected: top ? pairs[top.ch] : null, observed: ch };
    }
  }
  return stack.length ? { kind: 'missing_close', offset: stack.at(-1).offset, expected: pairs[stack.at(-1).ch] } : null;
}
function scanReverse(masked) {
  const stack = [];
  for (let i = masked.length - 1; i >= 0; i--) {
    const ch = masked[i];
    if (closes[ch]) stack.push({ ch, offset: i });
    else if (pairs[ch]) {
      const top = stack.pop();
      if (!top || top.ch !== pairs[ch]) return { kind: 'missing_close', offset: i, expected: pairs[ch] };
    }
  }
  return stack.length ? { kind: 'mismatched_close', offset: stack.at(-1).offset, observed: stack.at(-1).ch } : null;
}

export function executeCrossDomainPath(problem, kind) {
  if (!problem?.paths.some(path => path.kind === kind)) throw new Error('ineligible cross-domain path');
  if (problem.domain === 'entailment') return executeEntailmentPath(problem, kind);
  if (problem.domain === 'logic') {
    const [a, b] = problem.facts;
    const same = a.subject === b.subject && a.predicate === b.predicate;
    const direct = same && a.polarity !== b.polarity;
    // Independently ask whether any assignment can satisfy both clauses.
    const assignments = [false, true];
    const satisfiable = assignments.some(value =>
      (value === a.polarity) && (!same || value === b.polarity));
    const enumerated = same && !satisfiable;
    if (direct !== enumerated) throw new Error('logic verifier disagreement');
    const answer = (kind === 'logic_direct' ? direct : enumerated) ?
      'Yes, the two stated claims contradict each other under the same time and context.' :
      'No contradiction follows from these two stated claims under the same time and context.';
    return { answer, verifiedValue: direct, fullAnswerVerified: true,
      verification: 'direct_polarity_and_truth_assignment_v1', receipts: [{ direct, enumerated, sameProposition: same }] };
  }
  const masked = codeMask(problem.code);
  if (masked === null) throw new Error('unsupported JavaScript string or template syntax');
  const forward = scanForward(masked), reverse = scanReverse(masked);
  if (!forward || !reverse || forward.kind !== reverse.kind || forward.offset !== reverse.offset ||
      forward.expected !== reverse.expected) throw new Error('independent delimiter scans did not agree');
  const answer = `Delimiter issue near source offset ${problem.offset + forward.offset}: expected ${forward.expected || 'an opening delimiter'}.`;
  return { answer, fullAnswerVerified: false, verifiedValue: forward,
    verification: 'bidirectional_delimiter_structure_v1', receipts: [{ forward, reverse }],
    residual: 'Only delimiter structure was checked; JavaScript behavior and a complete fix remain unverified.' };
}

export function verifyCodeRepair(problem, proposal, diagnostic) {
  if (problem?.domain !== 'code' || diagnostic?.kind !== 'missing_close') return { ok: false, reason: 'unsupported repair contract' };
  const candidate = String(proposal || '').trim().replace(/^```(?:javascript|js)?\s*\n/i, '').replace(/\n```\s*$/, '').trim();
  const original = problem.code.trim();
  if (candidate.length !== original.length + 1) return { ok: false, reason: 'repair must insert exactly one delimiter' };
  let insertion = -1;
  for (let i = 0; i < candidate.length; i++) {
    if (candidate.slice(0, i) + candidate.slice(i + 1) === original) { insertion = i; break; }
  }
  if (insertion < 0 || candidate[insertion] !== diagnostic.expected)
    return { ok: false, reason: 'proposal changed established source or inserted a different character' };
  const masked = codeMask(candidate);
  if (masked === null || scanForward(masked) || scanReverse(masked))
    return { ok: false, reason: 'independent scans still find a structural error' };
  return { ok: true, code: candidate, inserted: diagnostic.expected, insertion,
    verification: 'single_edit_and_bidirectional_structure_v1',
    residual: 'The delimiter edit is checked; full JavaScript syntax and behavior remain unverified.' };
}
