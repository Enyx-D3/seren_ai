/* CP032 developer-only, conservative unquoted-action prose interpretation.
 *
 * This is a bounded grammar, not general natural-language understanding. It
 * rejects every unrecognised source clause and requires one closed action
 * inventory. Source truth is conditional on what the user provided.
 */
import { createBrowserGraphSnapshot } from './b2-graphos-browser-shadow.mjs';

export const PROSE_V3_POLICY = 'b2-unquoted-prose-source-replay-v3';
const MAX_SOURCE = 5000;
const MAX_ACTIONS = 8;
const MAX_FACTS = 16;
const NAME = /^[A-Za-z][A-Za-z0-9 ]{0,47}$/;
const INVENTORY = /^(?:(?:the |our )?(?:tasks|actions|steps|operations)(?: to schedule| in this workflow| for this run| to arrange)?|workflow steps)\s*:\s*(.+)$/i;
const GOALS = [
  /^(?:please )?(?:give|find|provide|return|show) (?:me )?(?:a |the )?(?:valid |feasible |correct |execution )?(?:execution )?(?:order|schedule|sequence)$/i,
  /^what (?:is|would be) (?:a |the )?(?:valid |correct |safe )?(?:execution )?(?:order|schedule|sequence)$/i,
  /^can (?:you |we )?order (?:these |the )?(?:steps|actions|tasks)$/i,
  /^(?:find|return|provide) (?:a |the )?schedule that (?:honors|respects) (?:the |these )?(?:dependencies|prerequisites|requirements)$/i,
];

// First and second textual mentions are @1 and @2. Every admitted relation
// is an unambiguous explicit dependency, not an inference from world facts.
const RULES = [
  ['precedes', /^@1 (?:must |should )?(?:precede|precedes) @2$/i, 'forward'],
  ['before', /^@1 (?:must |has to |needs to )?(?:finish|complete|happen|occur|be done) before @2(?: (?:starts|begins|can start|can begin))?$/i, 'forward'],
  ['follows', /^@1 (?:must |has to )?(?:follow|follows) @2$/i, 'reverse'],
  ['depends', /^@1 (?:depends on|requires) @2(?: (?:first|beforehand))?$/i, 'reverse'],
  ['prerequisite', /^@1 (?:is|remains) (?:a |the )?(?:necessary |required )?prerequisite (?:for|to) @2$/i, 'forward'],
  ['only_after', /^@1 (?:may|can|must) (?:start|begin|happen|occur) only after @2 (?:finishes|is done|is complete)$/i, 'reverse'],
  ['no_before', /^no @1 (?:can|may|should) (?:start|begin|happen) before @2 (?:is done|finishes|is complete)$/i, 'reverse'],
  ['once', /^once @1 (?:finishes|is finished|is done|is complete),? @2 (?:may|can) (?:start|begin|proceed)$/i, 'forward'],
  ['unlock', /^@1 (?:unlocks|enables|permits) @2(?: to (?:start|begin|proceed))?$/i, 'forward'],
  ['wait_for', /^@1 (?:must |has to )?wait for @2(?: to (?:finish|complete))?$/i, 'reverse'],
  ['until', /^@1 cannot (?:start|begin|proceed) until @2 (?:finishes|is done|is complete)$/i, 'reverse'],
  ['after', /^after @1 (?:finishes|is finished|is complete),? @2 (?:can|may|must) (?:start|begin|proceed)$/i, 'forward'],
  ['prior', /^@1 (?:is|must be) (?:scheduled |done )?(?:prior to|ahead of) @2$/i, 'forward'],
  ['subsequent', /^@1 (?:is|must be) (?:scheduled )?(?:subsequent to|after) @2$/i, 'reverse'],
  ['first_then', /^@1 (?:goes|comes|happens) first,? then @2 (?:starts|begins|follows)$/i, 'forward'],
  ['arrow', /^@1\s*->\s*@2$/i, 'forward'],
  // CP034: additional *literal* dependency phrasings. Each still requires
  // exactly two closed-inventory action names, a whole-clause match, and a
  // separate source-coordinate replay before granting GraphOS authority.
  ['before_passive', /^@1 (?:must|has to|needs to) be (?:completed|finished|done) before @2(?: (?:starts|begins|can start|can begin))?$/i, 'forward'],
  ['cannot_before', /^@1 (?:cannot|can not|must not|may not|should not) (?:start|begin|proceed) before @2 (?:is complete|is finished|is done|finishes)$/i, 'reverse'],
  ['only_after_passive', /^@1 (?:may|can|must) only (?:start|begin|proceed) after @2 (?:finishes|is finished|is done|is complete)$/i, 'reverse'],
  ['before_can', /^before @1 (?:can|may|must) (?:start|begin|proceed),? @2 (?:must|has to|needs to) (?:finish|be finished|be completed)$/i, 'reverse'],
  ['required_before', /^@1 (?:is|remains) required before @2$/i, 'forward'],
  ['blocked_by', /^@1 (?:is|remains) blocked by @2$/i, 'reverse'],
  ['happens_after', /^@1 (?:happens|starts|begins|proceeds) after @2$/i, 'reverse'],
  ['needs_precede', /^@1 (?:needs to|has to) (?:precede|come before) @2$/i, 'forward'],
  ['starts_once', /^@1 (?:starts|begins|can start|can begin) once @2 (?:finishes|is finished|is done|is complete)$/i, 'reverse'],
  ['needed_for', /^@1 (?:is|remains) (?:needed|required) for @2$/i, 'forward'],
  ['first_then_done', /^@1 (?:needs to|must|has to) be done first,? then @2(?: (?:starts|begins))?$/i, 'forward'],
];

function normalized(value) {
  return value.trim().replace(/[.!?;]$/, '').replace(/\s+/g, ' ').trim();
}

function clausesOf(source) {
  const clauses = [];
  let start = 0, quoteOpen = false;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '"') quoteOpen = !quoteOpen;
    if (!quoteOpen && /[.!?;\n]/.test(source[i])) {
      const raw = source.slice(start, i + 1);
      const trimmed = raw.trim();
      if (trimmed) {
        const offset = start + raw.indexOf(trimmed);
        clauses.push({ quote: trimmed, sourceOffset: offset, sourceEnd: offset + trimmed.length });
      }
      start = i + 1;
    }
  }
  const raw = source.slice(start), tail = raw.trim();
  if (tail) {
    const offset = start + raw.indexOf(tail);
    clauses.push({ quote: tail, sourceOffset: offset, sourceEnd: offset + tail.length });
  }
  return quoteOpen ? [] : clauses;
}

function inventoryOf(quote) {
  const match = INVENTORY.exec(normalized(quote));
  if (!match) return null;
  const rawList = match[1].trim();
  // A closed list has comma separators and optionally a final "and". The
  // names are deliberately unquoted; quoted V2 contracts remain independent.
  if (/["'`]/.test(rawList) || !/(?:,|\sand\s)/i.test(rawList)) return null;
  const names = rawList.replace(/,\s*and\s+/i, ', ').split(/\s*,\s*|\s+and\s+/i).map(s => s.trim());
  if (names.length < 2 || names.length > MAX_ACTIONS ||
      names.some(name => !NAME.test(name) || /\s{2,}/.test(name))) return null;
  const lowered = names.map(name => name.toLowerCase());
  if (new Set(lowered).size !== lowered.length) return null;
  // Overlapping names can create ambiguous mention boundaries.
  if (lowered.some((a, i) => lowered.some((b, j) => i !== j &&
      (a.includes(b) || b.includes(a))))) return null;
  return names;
}

function goalOf(quote) { return GOALS.some(pattern => pattern.test(normalized(quote))); }

function sourceMentions(quote, names) {
  const matches = [];
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(^|[^A-Za-z0-9])(${escaped})(?=$|[^A-Za-z0-9])`, 'gi');
    for (const match of quote.matchAll(pattern)) {
      const start = match.index + match[1].length;
      matches.push({ name, start, end: start + match[2].length });
    }
  }
  matches.sort((a, b) => a.start - b.start || a.end - b.end);
  if (matches.some((row, i) => i && row.start < matches[i - 1].end)) return [];
  return matches;
}

function relationOf(clause, names) {
  // A user asking whether a prerequisite holds has not asserted that fact.
  // The goal parser may accept interrogative prompts, but source facts may not.
  if (/\?\s*$/.test(clause.quote)) return null;
  const rows = sourceMentions(clause.quote, names);
  if (rows.length !== 2 || rows[0].name === rows[1].name) return null;
  const template = normalized(clause.quote.slice(0, rows[0].start) + '@1' +
    clause.quote.slice(rows[0].end, rows[1].start) + '@2' +
    clause.quote.slice(rows[1].end));
  const matched = RULES.filter(([, pattern]) => pattern.test(template));
  if (matched.length !== 1) return null;
  const [rule, , direction] = matched[0];
  return { before: rows[direction === 'forward' ? 0 : 1].name,
    after: rows[direction === 'forward' ? 1 : 0].name,
    ...clause, relationEvidence: { rule, template, direction,
      actionSpans: rows.map(({ name, start, end }) => ({name, start, end})) },
    status: 'assumed_user_source', provenance: 'observed_exact_source_span' };
}

export function extractNamedProseConstraints(source) {
  const fail = reason => ({policy: PROSE_V3_POLICY, source, status: 'abstain', names: [],
    facts: [], coveredSpans: [], unknowns: [{reason}]});
  if (typeof source !== 'string' || source.length > MAX_SOURCE || !source.trim()) return fail('invalid_source');
  const clauses = clausesOf(source);
  if (!clauses.length) return fail('invalid_clause_partition');
  const inventories = clauses.map(clause => inventoryOf(clause.quote)).filter(Boolean);
  if (inventories.length !== 1) return fail('closed_inventory_missing_or_duplicated');
  const names = inventories[0], facts = [], coveredSpans = [], unknowns = [];
  let inventoryCount = 0, goalCount = 0;
  for (const clause of clauses) {
    if (inventoryOf(clause.quote)) {
      inventoryCount++;
      coveredSpans.push({...clause, kind:'closed_inventory'});
    } else if (goalOf(clause.quote)) {
      goalCount++;
      coveredSpans.push({...clause, kind:'goal'});
    } else {
      const fact = relationOf(clause, names);
      if (!fact) unknowns.push({...clause, reason:'unsupported_or_ambiguous_relation'});
      else { facts.push(fact); coveredSpans.push({...clause, kind:'relation'}); }
    }
  }
  if (inventoryCount !== 1 || goalCount !== 1) unknowns.push({reason:'unsupported_source_contract'});
  if (!facts.length || facts.length > MAX_FACTS) unknowns.push({reason:'unsupported_relation_count'});
  if (names.some(name => !facts.some(f => f.before === name || f.after === name)))
    unknowns.push({reason:'ungrounded_inventory_action'});
  return {policy:PROSE_V3_POLICY, source, names, facts, coveredSpans, unknowns,
    status:unknowns.length ? 'abstain' : 'parsed'};
}

// The replay checker does not trust the extractor's edges, direction, coverage
// or inventory. It replays each original source clause and checks a separate
// hard-coded polarity table against exact character coordinates.
const REPLAY_FORWARD = new Set(['precedes','before','prerequisite','once','unlock','after','prior','first_then','arrow',
  'before_passive','required_before','needs_precede','needed_for','first_then_done']);
const REPLAY_REVERSE = new Set(['follows','depends','only_after','no_before','wait_for','until','subsequent',
  'cannot_before','only_after_passive','before_can','blocked_by','happens_after','starts_once']);

export function replayNamedProseConstraints(source, extraction) {
  const residuals = [];
  if (!extraction || extraction.policy !== PROSE_V3_POLICY || extraction.source !== source)
    return {ok:false,residuals:['source_identity_mismatch']};
  const clauses = clausesOf(source);
  if (!clauses.length || extraction.coveredSpans?.length !== clauses.length) residuals.push('source_not_fully_partitioned');
  const inventories = clauses.filter(clause => inventoryOf(clause.quote));
  const goals = clauses.filter(clause => goalOf(clause.quote));
  if (inventories.length !== 1 || goals.length !== 1 ||
      JSON.stringify(inventoryOf(inventories[0]?.quote)) !== JSON.stringify(extraction.names))
    residuals.push('requested_action_inventory_mismatch');
  if (extraction.status !== 'parsed' || extraction.unknowns?.length) residuals.push('source_is_incomplete');
  if (!Array.isArray(extraction.facts) || extraction.facts.length > MAX_FACTS || !extraction.facts.length)
    residuals.push('invalid_fact_count');
  const sourceFacts = clauses.filter(clause => !inventoryOf(clause.quote) && !goalOf(clause.quote));
  if (sourceFacts.length !== extraction.facts?.length) residuals.push('missing_or_extra_clause_fact');
  for (const clause of clauses) {
    const kind = inventoryOf(clause.quote) ? 'closed_inventory' : goalOf(clause.quote) ? 'goal' : 'relation';
    const spans = extraction.coveredSpans?.filter(span => span.sourceOffset === clause.sourceOffset &&
      span.sourceEnd === clause.sourceEnd && span.quote === clause.quote && span.kind === kind) || [];
    if (spans.length !== 1) residuals.push('provenance_partition_mismatch');
    if (kind !== 'relation') continue;
    if (/\?\s*$/.test(clause.quote)) residuals.push('interrogative_is_not_an_asserted_fact');
    const facts = extraction.facts?.filter(fact => fact.quote === clause.quote &&
      fact.sourceOffset === clause.sourceOffset && fact.sourceEnd === clause.sourceEnd) || [];
    if (facts.length !== 1) { residuals.push('source_fact_omitted_or_duplicated'); continue; }
    const fact = facts[0], rows = sourceMentions(clause.quote, extraction.names || []);
    const proof = fact.relationEvidence;
    if (rows.length !== 2 || !proof || !Array.isArray(proof.actionSpans) ||
        JSON.stringify(proof.actionSpans) !== JSON.stringify(rows)) {
      residuals.push('action_mentions_or_spans_wrong'); continue;
    }
    const template = normalized(clause.quote.slice(0, rows[0].start) + '@1' +
      clause.quote.slice(rows[0].end, rows[1].start) + '@2' +
      clause.quote.slice(rows[1].end));
    const direction = REPLAY_FORWARD.has(proof.rule) ? 'forward' :
      REPLAY_REVERSE.has(proof.rule) ? 'reverse' : null;
    if (!direction || template !== proof.template || direction !== proof.direction ||
        RULES.filter(([id, re]) => id === proof.rule && re.test(template)).length !== 1)
      residuals.push('relation_grammar_or_polarity_mismatch');
    if (fact.before !== rows[direction === 'forward' ? 0 : 1]?.name ||
        fact.after !== rows[direction === 'forward' ? 1 : 0]?.name)
      residuals.push('edge_direction_mismatch');
  }
  if (extraction.names?.some(name => !extraction.facts?.some(fact => fact.before === name || fact.after === name)))
    residuals.push('orphan_action');
  return {ok:residuals.length === 0,residuals};
}

export function interpretNamedProseDependencyTask(source) {
  const extraction = extractNamedProseConstraints(source);
  if (extraction.status !== 'parsed' || !replayNamedProseConstraints(source, extraction).ok) return null;
  const {names, facts} = extraction;
  const graph = createBrowserGraphSnapshot({frame_id:'cp032-named-prose',
    nodes:names.map((label,i)=>({id:`task-${i}`,label,kind:'action',evidence_class:'OBSERVED'})),
    edges:facts.map((fact,i)=>({id:`edge-${i}`,src:`task-${names.indexOf(fact.before)}`,
      dst:`task-${names.indexOf(fact.after)}`,relation:'requires',
      source_refs:[`input:${fact.sourceOffset}`],attrs:fact})),
    metadata:{source,goal:'source-conditional action order',policy:PROSE_V3_POLICY}});
  return {intent:'dependency_order',source,names,facts,constraints:facts,unknowns:[],graph,
    goal:'a checked feasible order or checked infeasibility',
    paths:['dependency_forward','dependency_backward'], interpretationPolicy:PROSE_V3_POLICY};
}
