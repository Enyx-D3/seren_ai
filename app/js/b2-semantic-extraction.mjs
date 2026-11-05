/* CP025 research candidate: strictly source-grounded dependency paraphrases.
 * A successful parse is conditional on the user's premises, not proof of their
 * real-world truth. Nothing here authorizes executing the named actions.
 * This module is wired only into SpiralController's developer-opt-in
 * `experimentalDependency` fallback. Ordinary chat keeps it disabled.
 */

import { createBrowserGraphSnapshot } from './b2-graphos-browser-shadow.mjs';

export const SEMANTIC_EXTRACTION_POLICY = 'b2-semantic-dependency-candidate-1';

const MAX_SOURCE = 4000;
const MAX_ACTIONS = 7;
const MAX_EDGES = 16;
const UNCERTAIN = /\b(?:unless|except|perhaps|maybe|might|may|could|possibly|optional|sometimes|either|or|not|never|without|if|independent|alternatively)\b|\bcan't\b|\bwon't\b/i;

const RULES = [
  ['precedes', /^@1 (?:must |should )?(?:precede|precedes|come before|comes before|happen before|happens before|take place before|takes place before|occur before|occurs before|be finished before|be completed before|finish before|is required before|is a prerequisite for|is the prerequisite for) @2(?: (?:starts|begins))?$/i, 'forward'],
  ['prior', /^@1 (?:must |should )?(?:finish|be finished|be completed|be done|happen|occur) (?:prior to|ahead of) @2(?: (?:starts|begins))?$/i, 'forward'],
  ['follows', /^@1 (?:must |should )?(?:follow|follows|come after|comes after|happen after|happens after|occur after|occurs after|depend on|depends on|require|requires|wait for|waits for|has to wait for|must wait for) @2(?: (?:finishes|ends|is complete|is done))?$/i, 'reverse'],
  ['prerequisite', /^@1 (?:is|serves as) (?:a |the )?(?:prerequisite|required predecessor) (?:for|of) @2$/i, 'forward'],
  ['needs_completion', /^@1 (?:needs|requires) (?:completion|the completion) of @2(?: (?:first|before starting))?$/i, 'reverse'],
  ['blocked_until', /^@1 (?:cannot|can't) (?:start|begin|proceed) until @2(?: (?:finishes|ends|is complete|is done))?$/i, 'reverse'],
  ['blocked_until', /^@1 (?:is blocked|must wait|has to wait) until @2(?: (?:finishes|ends|is complete|is done))?$/i, 'reverse'],
  ['only_after', /^@1 (?:can |must |will )?(?:start|begin|proceed) only after @2 (?:finishes|ends|is complete|is done)$/i, 'reverse'],
  ['only_once', /^@1 (?:can |must |will )?(?:start|begin|proceed) only once @2 (?:finishes|ends|is complete|is done)$/i, 'reverse'],
  ['only_once', /^@1 may (?:start|begin|proceed) only (?:after|once) @2 (?:finishes|ends|is complete|is done)$/i, 'reverse'],
  ['before_prefix', /^before @1 (?:starts|begins),? @2 (?:must|should|has to) (?:finish|be finished|be completed)$/i, 'reverse'],
  ['after_prefix', /^after @1 (?:finishes|ends|is complete|is done),? @2 (?:starts|begins|can start|can begin|may begin)$/i, 'forward'],
  ['once_prefix', /^once @1 (?:finishes|ends|is complete|is done),? @2 (?:starts|begins|can start|can begin)$/i, 'forward'],
  ['simple_before', /^@1 (?:must |should )?(?:finish |happen |be completed )?before @2(?: (?:starts|begins))?$/i, 'forward'],
  ['simple_after', /^@1 (?:must |should )?(?:happen |come |be completed )?after @2(?: (?:finishes|is complete))?$/i, 'reverse'],
];

// A narrow three-action conjunction is two mandatory prerequisite edges,
// never a choice. Ambiguous coordination, disjunction and conditions abstain.
const CONJUNCTIVE_RULES = [
  ['requires_both', /^@1 requires (?:both )?@2 and @3 (?:to (?:finish|be complete|be completed)|completed first)?$/i, 'last_two'],
  ['depends_on_both', /^@1 depends on @2 and @3$/i, 'last_two'],
  ['only_after_both', /^@1 (?:can |must |will )?start only after @2 and @3 finish$/i, 'last_two'],
  ['needs_both', /^@1 needs @2 and @3 completed first$/i, 'last_two'],
  ['prerequisites_before', /^(?:both )?@1 and @2 (?:must |should )?(?:finish|be completed|be finished|happen) before @3(?: starts)?$/i, 'first_two'],
  ['prerequisites_for', /^(?:both )?@1 and @2 are (?:the |both )?prerequisites for @3$/i, 'first_two'],
];

// Goal matching is conservative: unsupported additional requests are residuals.
const GOAL = /^(?:give|find|produce|return|show) (?:a |an |the )?(?:valid |feasible |execution )?(?:order|sequence|schedule|plan)(?: (?:for|of|using) .+)?$/i;
const NAMED_GOAL = /^(?:give|find|produce|return|show) (?:a |an |the )?(?:valid |feasible |execution )?(?:order|sequence|schedule|plan) (?:for|of|using) (.+)$/i;
const UNSUPPORTED_GOAL_MODIFIER = /\b(?:unless|except|ignore|override|regardless|despite|perhaps|maybe|might|optional|alternatively|or|but|if|without|instead|assuming|provided)\b/i;
const isGoalClause = text => GOAL.test(text) && !UNSUPPORTED_GOAL_MODIFIER.test(text);

function cleanClause(value) {
  return value.trim().replace(/[.!?;]$/, '').replace(/["`]/g, '').replace(/\s+/g, ' ').trim();
}

function splitClauses(source) {
  const clauses = [];
  let start = 0, quote = null;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') quote = quote === '"' ? null : '"';
    if (!quote && (/[.!?;\n]/.test(char) || i === source.length - 1)) {
      const end = i + 1;
      const raw = source.slice(start, end);
      const quoteText = raw.trim();
      if (quoteText) {
        const sourceOffset = start + raw.indexOf(quoteText);
        clauses.push({ quote: quoteText, sourceOffset, sourceEnd: sourceOffset + quoteText.length });
      }
      start = end;
    }
  }
  if (start < source.length) {
    const raw = source.slice(start), quoteText = raw.trim();
    if (quoteText) {
      const sourceOffset = start + raw.indexOf(quoteText);
      clauses.push({ quote: quoteText, sourceOffset, sourceEnd: sourceOffset + quoteText.length });
    }
  }
  return clauses;
}

function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function isWord(char) { return char !== undefined && /[\p{L}\p{N}_]/u.test(char); }

function findActionMentions(quote, names) {
  const matches = [];
  for (const name of names) {
    const regex = new RegExp(escapeRegExp(name), 'gi');
    const candidates = [];
    for (const match of quote.matchAll(regex)) {
      const start = match.index, end = start + match[0].length;
      if (!isWord(quote[start - 1]) && !isWord(quote[end]))
        candidates.push({ name, start, end, quoted: quote[start - 1] === '"' && quote[end] === '"' });
    }
    const preferred = candidates.some(candidate => candidate.quoted)
      ? candidates.filter(candidate => candidate.quoted) : candidates;
    matches.push(...preferred.map(({ quoted: _ignored, ...mention }) => mention));
  }
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  // Overlapping action names could conceal a more specific meaning.
  if (matches.some((row, i) => i && row.start < matches[i - 1].end)) return [];
  return matches;
}

function templateFor(quote, mentions) {
  if (mentions.length < 2 || mentions.length > 3) return null;
  let cursor = 0, template = '';
  for (const [i, mention] of mentions.entries()) {
    template += quote.slice(cursor, mention.start) + `@${i + 1}`;
    cursor = mention.end;
  }
  return cleanClause(template + quote.slice(cursor));
}

function normalizedNames(actionNames) {
  if (!Array.isArray(actionNames)) return [];
  const result = [];
  for (const item of actionNames) {
    if (typeof item !== 'string' || item.length < 1 || item.length > 60 || !item.trim() || /[\n\r;]/.test(item)) return [];
    const name = item.trim();
    if (!result.some(value => value.toLowerCase() === name.toLowerCase())) result.push(name);
  }
  return result.length <= MAX_ACTIONS ? result : [];
}

function inferNames(source, clauses) {
  const quoted = [...source.matchAll(/"([^"\n]{1,60})"/g)].map(match => match[1]);
  const candidates = normalizedNames(quoted);
  const goals = clauses.map(clause => NAMED_GOAL.exec(cleanClause(clause.quote))).filter(Boolean);
  if (goals.length !== 1) return candidates;
  const list = goals[0][1].split(/,\s*|\s+and\s+/i).map(name => name.trim());
  const listed = list.length >= 2 && list.every(name => /^[a-z][a-z0-9 -]{0,59}$/i.test(name)) ? normalizedNames(list) : [];
  return normalizedNames([...candidates, ...listed]);
}

function goalInventory(clauses) {
  const goalClauses = clauses.filter(clause => isGoalClause(cleanClause(clause.quote)));
  if (goalClauses.length !== 1) return [];
  const match = NAMED_GOAL.exec(cleanClause(goalClauses[0].quote));
  if (!match) return [];
  const listed = match[1].split(/,\s*|\s+and\s+/i).map(name => name.trim());
  return listed.length >= 2 && listed.every(name => /^[a-z][a-z0-9 -]{0,59}$/i.test(name)) ? normalizedNames(listed) : [];
}

function inferRule(template) {
  const necessaryMay = /^@1 may (?:start|begin|proceed) only (?:after|once) @2 (?:finishes|ends|is complete|is done)$/i.test(template);
  if (UNCERTAIN.test(template) && !/\bcannot\b|\bcan't\b/.test(template) && !necessaryMay) return null;
  for (const [rule, pattern, direction] of RULES) if (pattern.test(template)) return { rule, direction };
  return null;
}

function findEvidences(quote, names) {
  const mentions = findActionMentions(quote, names);
  const template = templateFor(quote, mentions);
  if (mentions.length === 3 && template && !UNCERTAIN.test(template)) {
    const matched = CONJUNCTIVE_RULES.find(([, pattern]) => pattern.test(template));
    if (matched) return [0, 1].map(edgeIndex => ({
      before: mentions[matched[2] === 'first_two' ? edgeIndex : edgeIndex + 1].name,
      after: mentions[matched[2] === 'first_two' ? 2 : 0].name,
      relationEvidence: { rule: matched[0], template, edgeIndex, edgeTotal: 2,
        actionSpans: mentions.map(({ name, start, end }) => ({ name, start, end })) },
    }));
  }
  if (mentions.length !== 2) return null;
  const inferred = template && inferRule(template);
  if (!inferred) return null;
  const [a, b] = mentions;
  const { direction, rule } = inferred;
  return [{
    before: direction === 'forward' ? a.name : b.name,
    after: direction === 'forward' ? b.name : a.name,
    relationEvidence: { rule, template, actionSpans: mentions.map(({ name, start, end }) => ({ name, start, end })) },
  }];
}

export function extractDependencyRelations(source, { actionNames = [] } = {}) {
  if (typeof source !== 'string' || source.length > MAX_SOURCE || !source.trim()) return {
    policy: SEMANTIC_EXTRACTION_POLICY, status: 'abstain', source, names: [], facts: [],
    unknowns: [{ quote: '', sourceOffset: 0, reason: 'invalid_source_or_budget' }], coveredSpans: [],
  };
  const clauses = splitClauses(source);
  const names = actionNames.length ? normalizedNames(actionNames) : inferNames(source, clauses);
  if (names.length < 1) return { policy: SEMANTIC_EXTRACTION_POLICY, status: 'abstain', source,
    names, facts: [], coveredSpans: [], unknowns: [{ quote: '', sourceOffset: 0, reason: 'ambiguous_action_inventory' }] };
  const facts = [], unknowns = [], coveredSpans = [];
  const listed = goalInventory(clauses);
  // A named task list is a closed-world contract: a prerequisite outside that
  // list cannot silently enlarge what the user asked to order.  The old
  // subset check only caught missing listed actions, not extra inferred ones.
  if (listed.length && names.some(name => !listed.some(requested => requested.toLowerCase() === name.toLowerCase())))
    unknowns.push({ quote: '', sourceOffset: 0, reason: 'prerequisite_outside_requested_inventory' });
  if (listed.some(name => !names.some(known => known.toLowerCase() === name.toLowerCase())))
    unknowns.push({ quote: '', sourceOffset: 0, reason: 'action_inventory_incomplete' });
  if (names.some(name => !findActionMentions(source, [name]).length))
    unknowns.push({ quote: '', sourceOffset: 0, reason: 'unmentioned_action' });
  let goals = 0;
  for (const clause of clauses) {
    const clean = cleanClause(clause.quote);
    if (isGoalClause(clean)) {
      goals++;
      coveredSpans.push({ ...clause, kind: 'goal' });
      continue;
    }
    const evidences = findEvidences(clause.quote, names);
    if (!evidences) {
      unknowns.push({ ...clause, reason: 'unsupported_or_ambiguous_clause' });
      continue;
    }
    facts.push(...evidences.map(evidence => ({ ...evidence, ...clause,
      provenance: 'observed_source', status: 'assumed_input' })));
    coveredSpans.push({ ...clause, kind: 'relation' });
  }
  if (!goals) unknowns.push({ quote: '', sourceOffset: source.length, reason: 'missing_explicit_order_goal' });
  if (goals !== 1) unknowns.push({ quote: '', sourceOffset: source.length, reason: 'goal_count_not_one' });
  if (!facts.length) unknowns.push({ quote: '', sourceOffset: source.length, reason: 'no_supported_relationships' });
  if (facts.length > MAX_EDGES) unknowns.push({ quote: '', sourceOffset: source.length, reason: 'too_many_relationships' });
  return { policy: SEMANTIC_EXTRACTION_POLICY, status: unknowns.length ? 'abstain' : 'parsed',
    source, names, facts, unknowns, coveredSpans };
}

// Separately reconstructs the factual orientation from exact original spans.
// This checks source fidelity, not whether the source's assertions are true.
function independentlyCheckFact(source, fact, names) {
  if (typeof fact?.quote !== 'string' || !Number.isInteger(fact.sourceOffset) ||
      source.slice(fact.sourceOffset, fact.sourceOffset + fact.quote.length) !== fact.quote ||
      fact.sourceEnd !== fact.sourceOffset + fact.quote.length) return 'source_mismatch';
  const spans = findActionMentions(fact.quote, names);
  if (spans.length !== 2 && spans.length !== 3) return 'action_span_mismatch';
  const evidenceSpans = fact.relationEvidence?.actionSpans;
  if (!Array.isArray(evidenceSpans) || evidenceSpans.length !== spans.length || spans.some((span, i) =>
    span.name !== evidenceSpans[i]?.name || span.start !== evidenceSpans[i]?.start || span.end !== evidenceSpans[i]?.end))
    return 'reported_action_span_mismatch';
  const template = templateFor(fact.quote, spans);
  if (!template || fact.relationEvidence?.template !== template) return 'relation_template_mismatch';
  if (spans.length === 3) {
    // Independent checker table: exact source grammar + explicit edge identity
    // must validate BOTH prerequisite edges of the one source sentence.
    const admitted = {
      requires_both: [/^@1 requires (?:both )?@2 and @3 (?:(?:to (?:finish|be complete|be completed))|completed first)?$/i, 'last_two'],
      depends_on_both: [/^@1 depends on @2 and @3$/i, 'last_two'],
      only_after_both: [/^@1 (?:can |must |will )?start only after @2 and @3 finish$/i, 'last_two'],
      needs_both: [/^@1 needs @2 and @3 completed first$/i, 'last_two'],
      prerequisites_before: [/^(?:both )?@1 and @2 (?:must |should )?(?:finish|be completed|be finished|happen) before @3(?: starts)?$/i, 'first_two'],
      prerequisites_for: [/^(?:both )?@1 and @2 are (?:the |both )?prerequisites for @3$/i, 'first_two'],
    };
    const rule = fact.relationEvidence?.rule;
    const edgeIndex = fact.relationEvidence?.edgeIndex;
    if (UNCERTAIN.test(template) || !Object.hasOwn(admitted, rule) || !admitted[rule][0].test(template))
      return 'unsupported_or_ambiguous_conjunction';
    if (fact.relationEvidence?.edgeTotal !== 2 || !Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex > 1)
      return 'conjunction_edge_identity_mismatch';
    const orientation = admitted[rule][1];
    const before = spans[orientation === 'first_two' ? edgeIndex : edgeIndex + 1].name;
    const after = spans[orientation === 'first_two' ? 2 : 0].name;
    return fact.before === before && fact.after === after
      ? null : 'conjunction_relation_direction_mismatch';
  }
  const parserRule = inferRule(template);
  if (!parserRule || parserRule.rule !== fact.relationEvidence?.rule) return 'reported_rule_mismatch';
  // An independent anchored-check table keeps false direction promotions out.
  const forwardChecks = [
    /^@1 (?:must |should )?(?:precede|precedes|come before|comes before|happen before|happens before|take place before|takes place before|occur before|occurs before|be finished before|be completed before|finish before|is required before|is a prerequisite for|is the prerequisite for) @2(?: (?:starts|begins))?$/i,
    /^@1 (?:must |should )?(?:finish|be finished|be completed|be done|happen|occur) (?:prior to|ahead of) @2(?: (?:starts|begins))?$/i,
    /^@1 (?:is|serves as) (?:a |the )?(?:prerequisite|required predecessor) (?:for|of) @2$/i,
    /^@1 (?:must |should )?(?:finish |happen |be completed )?before @2(?: (?:starts|begins))?$/i,
    /^after @1 (?:finishes|ends|is complete|is done),? @2 (?:starts|begins|can start|can begin|may begin)$/i,
    /^once @1 (?:finishes|ends|is complete|is done),? @2 (?:starts|begins|can start|can begin)$/i,
  ];
  const reverseChecks = [
    /^@1 (?:must |should )?(?:follow|follows|come after|comes after|happen after|happens after|occur after|occurs after|depend on|depends on|require|requires|wait for|waits for|has to wait for|must wait for) @2(?: (?:finishes|ends|is complete|is done))?$/i,
    /^@1 (?:needs|requires) (?:completion|the completion) of @2(?: (?:first|before starting))?$/i,
    /^@1 (?:cannot|can't) (?:start|begin|proceed) until @2(?: (?:finishes|ends|is complete|is done))?$/i,
    /^@1 (?:is blocked|must wait|has to wait) until @2(?: (?:finishes|ends|is complete|is done))?$/i,
    /^@1 (?:can |must |will )?(?:start|begin|proceed) only (?:after|once) @2 (?:finishes|ends|is complete|is done)$/i,
    /^@1 may (?:start|begin|proceed) only (?:after|once) @2 (?:finishes|ends|is complete|is done)$/i,
    /^before @1 (?:starts|begins),? @2 (?:must|should|has to) (?:finish|be finished|be completed)$/i,
    /^@1 (?:must |should )?(?:happen |come |be completed )?after @2(?: (?:finishes|is complete))?$/i,
  ];
  const allowedNegative = /^@1 (?:cannot|can't) (?:start|begin|proceed) until @2(?: (?:finishes|ends|is complete|is done))?$/i.test(template);
  const necessaryMay = /^@1 may (?:start|begin|proceed) only (?:after|once) @2 (?:finishes|ends|is complete|is done)$/i.test(template);
  if (UNCERTAIN.test(template) && !allowedNegative && !necessaryMay) return 'uncertainty_or_negation';
  const fwd = forwardChecks.some(pattern => pattern.test(template));
  const rev = reverseChecks.some(pattern => pattern.test(template));
  if (fwd === rev) return 'unsupported_or_ambiguous_relation';
  const before = fwd ? spans[0].name : spans[1].name;
  const after = fwd ? spans[1].name : spans[0].name;
  return fact.before === before && fact.after === after ? null : 'relation_direction_mismatch';
}

export function verifyExtractedDependencyFacts(source, extraction) {
  const residuals = [];
  if (typeof source !== 'string' || !extraction || extraction.source !== source) return { ok: false, residuals: ['source_identity_mismatch'] };
  const names = normalizedNames(extraction.names);
  if (names.length !== extraction.names?.length || names.length < 1) residuals.push('invalid_action_inventory');
  const clauses = splitClauses(source), seen = new Set();
  if (!Array.isArray(extraction.coveredSpans) || extraction.coveredSpans.length !== clauses.length)
    residuals.push('source_coverage_incomplete');
  for (const clause of clauses) {
    const expectedKind = isGoalClause(cleanClause(clause.quote)) ? 'goal' : 'relation';
    const matching = (extraction.coveredSpans || []).filter(span =>
      span.sourceOffset === clause.sourceOffset && span.sourceEnd === clause.sourceEnd &&
      span.quote === clause.quote && span.kind === expectedKind);
    if (matching.length !== 1) residuals.push('covered_span_mismatch');
  }
  const inventory = goalInventory(clauses);
  if (inventory.length && names.some(name => !inventory.some(requested => requested.toLowerCase() === name.toLowerCase())))
    residuals.push('prerequisite_outside_requested_inventory');
  if (inventory.some(name => !names.some(known => known.toLowerCase() === name.toLowerCase())))
    residuals.push('reported_action_inventory_incomplete');
  for (const fact of extraction.facts || []) {
    const key = `${fact.sourceOffset}:${fact.relationEvidence?.edgeIndex ?? 0}`;
    if (seen.has(key)) residuals.push('duplicate_claim');
    seen.add(key);
    const reason = independentlyCheckFact(source, fact, names);
    if (reason) residuals.push(reason);
  }
  let goalCount = 0;
  for (const clause of clauses) {
    if (isGoalClause(cleanClause(clause.quote))) { goalCount++; continue; }
    const matching = (extraction.facts || []).filter(f => f.sourceOffset === clause.sourceOffset && f.quote === clause.quote);
    const mentions = findActionMentions(clause.quote, names);
    const template = templateFor(clause.quote, mentions);
    const supportedConjunction = mentions.length === 3 && template && !UNCERTAIN.test(template) &&
      /^(?:@1 requires (?:both )?@2 and @3 (?:(?:to (?:finish|be complete|be completed))|completed first)?|@1 depends on @2 and @3|@1 (?:can |must |will )?start only after @2 and @3 finish|@1 needs @2 and @3 completed first|(?:both )?@1 and @2 (?:must |should )?(?:finish|be completed|be finished|happen) before @3(?: starts)?|(?:both )?@1 and @2 are (?:the |both )?prerequisites for @3)$/i.test(template);
    if (matching.length !== (supportedConjunction ? 2 : 1))
      residuals.push('uncovered_or_duplicate_source_clause');
  }
  if (goalCount !== 1) residuals.push('goal_contract_failed');
  if (!extraction.facts?.length || extraction.facts.length > MAX_EDGES) residuals.push('edge_count_invalid');
  if (extraction.unknowns?.length || extraction.status !== 'parsed') residuals.push('extraction_not_complete');
  return { ok: residuals.length === 0, residuals };
}

/* Adapter for the existing opt-in dependency solver. The new grammar has no
 * authority until both extraction and the independently reconstructed whole
 * source contract pass. An unsupported clause yields null, never a partial
 * graph that could be mistaken for a verified complete answer. */
export function interpretSemanticDependencyTask(source) {
  const extraction = extractDependencyRelations(source);
  if (extraction.status !== 'parsed' || !verifyExtractedDependencyFacts(source, extraction).ok) return null;
  const { names, facts } = extraction;
  const graph = createBrowserGraphSnapshot({ frame_id: 'semantic-dependency-candidate',
    nodes: names.map((label, i) => ({ id: `task-${i}`, label, kind: 'action', evidence_class: 'OBSERVED' })),
    edges: facts.map((fact, i) => ({ id: `edge-${i}`, src: `task-${names.indexOf(fact.before)}`,
      dst: `task-${names.indexOf(fact.after)}`, relation: 'requires', source_refs: [`input:${fact.sourceOffset}`], attrs: fact })),
    metadata: { source, goal: 'find a total order satisfying all stated prerequisites', policy: SEMANTIC_EXTRACTION_POLICY },
  });
  return { intent: 'dependency_order', source, names, facts, constraints: facts,
    unknowns: [], graph, goal: 'a feasible total order or a checked infeasibility result',
    paths: ['dependency_forward', 'dependency_backward'], interpretationPolicy: SEMANTIC_EXTRACTION_POLICY };
}
