/* CP027 experimental source-grounded free-form ordering clauses.
 * NOT a general English parser and NOT enabled in ordinary chat. This is an
 * explicitly opt-in, fail-closed addition to the existing B2 dependency path.
 * Every source clause must be an exact inventory, order goal or checked edge.
 */
import { createBrowserGraphSnapshot } from './b2-graphos-browser-shadow.mjs';

export const PROSE_V2_POLICY = 'b2-source-grounded-prose-replay-v2';
const MAX_SOURCE = 4000, MAX_ACTIONS = 7, MAX_FACTS = 16;

const INTAKE = /^(?:(?:the )?(?:planned )?(?:jobs|tasks|steps|actions) (?:are|include):|(?:jobs|tasks|steps|actions):)\s*(.+)$/i;
const GOAL = /^(?:give|find|return|show|produce) (?:a |an |the )?(?:valid |feasible |safe |execution )?(?:execution )?(?:order|schedule|sequence)$/i;
const ALLOWED_NAME = /^[a-z0-9][a-z0-9 -]{0,59}$/i;

// These are deliberately strict requirement phrases, not bag-of-words
// predictions. 'may happen before', 'if', 'either/or' and unknown actions
// cannot be safely promoted to prerequisites.
const RELATIONS = [
  ['done_before_begin', /^@1 has to be completed before @2 can begin$/i, 'fwd'],
  ['needed_before', /^@1 is needed before @2$/i, 'fwd'],
  ['gated_by', /^@1 is gated by @2$/i, 'rev'],
  ['finished_for', /^@1 must be finished for @2 to proceed$/i, 'fwd'],
  ['before_may', /^before @1 may start,? @2 must finish$/i, 'rev'],
  ['after_complete', /^after @1 is complete,? @2 can begin$/i, 'fwd'],
  ['hard_prerequisite', /^@1 is a hard prerequisite to @2$/i, 'fwd'],
  ['proceed_after', /^@1 must proceed after @2 has finished$/i, 'rev'],
  ['for_to_begin', /^for @1 to begin,? @2 must already be complete$/i, 'rev'],
  ['follows_sequence', /^@1 follows @2 in the planned sequence$/i, 'rev'],
  ['downstream', /^@1 is downstream of @2$/i, 'rev'],
  ['depends_completion', /^@1 depends on the completion of @2$/i, 'rev'],
  ['scheduled_earlier', /^@1 is scheduled earlier than @2$/i, 'fwd'],
  ['happens_ahead', /^@1 must happen ahead of @2$/i, 'fwd'],
  ['completion_unlocks', /^completion of @1 unlocks @2$/i, 'fwd'],
  ['start_only_after', /^@1 can start only after @2 is complete$/i, 'rev'],
  ['first_then', /^@1 comes first,? then @2 can begin$/i, 'fwd'],
  ['must_follow', /^@1 must follow @2$/i, 'rev'],
  ['required_advance', /^@1 is required in advance of @2$/i, 'fwd'],
  ['cannot_before', /^@1 cannot proceed before @2 has finished$/i, 'rev'],
  ['occur_prior', /^@1 has to occur prior to @2$/i, 'fwd'],
  ['happen_after', /^@1 must happen after @2 finishes$/i, 'rev'],
  ['dependency_of', /^@1 is a dependency of @2$/i, 'fwd'],
  ['complete_when', /^@1 must be complete when @2 starts$/i, 'fwd'],
  ['happens_before', /^@1 happens before @2$/i, 'fwd'],
  ['finish_for_begin', /^@1 must finish for @2 to begin$/i, 'fwd'],
  ['depends_on_completion', /^@1 depends on completion of @2$/i, 'rev'],
  ['happen_ahead', /^@1 has to happen ahead of @2$/i, 'fwd'],
  ['not_allowed_until', /^@1 is not allowed to start until @2 is done$/i, 'rev'],
  ['required_predecessor', /^@1 is a required predecessor of @2$/i, 'fwd'],
  ['finish_before_start', /^@1 must finish before @2 starts$/i, 'fwd'],
  ['no_until', /^no @1 may start until @2 finishes$/i, 'rev'],
  ['scheduled_subsequent', /^@1 is scheduled subsequent to @2$/i, 'rev'],
  ['occur_earlier', /^@1 must occur earlier than @2$/i, 'fwd'],
  ['dependent_upon', /^@1 is dependent upon @2$/i, 'rev'],
  ['must_before', /^@1 must happen before @2$/i, 'fwd'],
  ['only_after_done', /^@1 must take place only after @2 is done$/i, 'rev'],
  ['predecessor_for', /^@1 is the predecessor for @2$/i, 'fwd'],
  ['necessary_before', /^@1 is necessary before @2$/i, 'fwd'],
];

function clausesOf(source) {
  const clauses = [];
  let start = 0, quoted = false;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '"') quoted = !quoted;
    if (!quoted && /[.!?;\n]/.test(source[i])) {
      const raw = source.slice(start, i + 1);
      const text = raw.trim();
      if (text) {
        const sourceOffset = start + raw.indexOf(text);
        clauses.push({ quote: text, sourceOffset, sourceEnd: sourceOffset + text.length });
      }
      start = i + 1;
    }
  }
  const raw = source.slice(start), text = raw.trim();
  if (text) {
    const sourceOffset = start + raw.indexOf(text);
    clauses.push({ quote: text, sourceOffset, sourceEnd: sourceOffset + text.length });
  }
  return quoted ? [] : clauses;
}
const normalized = quote => quote.trim().replace(/[.!?;]$/, '').replace(/\s+/g, ' ').trim();
const mentions = text => [...text.matchAll(/"([^"\n]+)"/g)]
  .map(match => ({ name: match[1], start: match.index, end: match.index + match[0].length }));

function inventoryOf(clause) {
  const match = INTAKE.exec(normalized(clause));
  if (!match) return null;
  const rows = mentions(match[1]);
  const frame = match[1].replace(/"[^"\n]+"/g, '#');
  if (rows.length < 2 || rows.length > MAX_ACTIONS ||
      !/^#(?:,\s*#)*(?:\s+and\s+#)?$/i.test(frame) ||
      rows.some(row => !ALLOWED_NAME.test(row.name)) ||
      new Set(rows.map(row => row.name.toLowerCase())).size !== rows.length)
    return null;
  return rows.map(row => row.name);
}

function relationOf(clause, names) {
  const all = mentions(clause.quote);
  if (all.length !== 2 || all.some(row => !names.includes(row.name)) || all[0].name === all[1].name)
    return null;
  let template = '', cursor = 0;
  for (const [i, row] of all.entries()) {
    template += clause.quote.slice(cursor, row.start) + `@${i + 1}`;
    cursor = row.end;
  }
  template = normalized(template + clause.quote.slice(cursor));
  const matching = RELATIONS.filter(([, pattern]) => pattern.test(template));
  if (matching.length !== 1) return null;
  const [rule, , direction] = matching[0];
  return { before: direction === 'fwd' ? all[0].name : all[1].name,
    after: direction === 'fwd' ? all[1].name : all[0].name,
    ...clause, provenance: 'observed_source', status: 'assumed_input',
    relationEvidence: { rule, template, direction,
      actionSpans: all.map(({name, start, end}) => ({name,start,end})) } };
}

export function extractProseDependencyRelations(source) {
  const failure = reason => ({ policy: PROSE_V2_POLICY, status: 'abstain', source,
    names: [], facts: [], unknowns: [{reason}], coveredSpans: [] });
  if (typeof source !== 'string' || source.length > MAX_SOURCE || !source.trim()) return failure('invalid_source');
  const clauses = clausesOf(source);
  if (!clauses.length) return failure('invalid_quoting_or_empty_clauses');
  const inventories = clauses.map(clause => inventoryOf(clause.quote)).filter(Boolean);
  if (inventories.length !== 1) return failure('missing_or_duplicate_closed_inventory');
  const names = inventories[0], facts = [], unknowns = [], coveredSpans = [];
  let inventoryCount = 0, goalCount = 0;
  for (const clause of clauses) {
    if (inventoryOf(clause.quote)) {
      inventoryCount++;
      coveredSpans.push({...clause,kind:'inventory'});
      continue;
    }
    if (GOAL.test(normalized(clause.quote))) {
      goalCount++;
      coveredSpans.push({...clause,kind:'goal'});
      continue;
    }
    const fact = relationOf(clause, names);
    if (!fact) unknowns.push({...clause, reason:'unsupported_or_unknown_relationship'});
    else { facts.push(fact); coveredSpans.push({...clause,kind:'relation'}); }
  }
  if (inventoryCount !== 1 || goalCount !== 1) unknowns.push({reason:'source_contract_count_mismatch'});
  if (!facts.length || facts.length > MAX_FACTS) unknowns.push({reason:'invalid_edge_count'});
  if (names.some(name => !facts.some(fact => fact.before === name || fact.after === name)))
    unknowns.push({reason:'action_not_grounded_in_relationship'});
  return { policy: PROSE_V2_POLICY, source, names, facts, coveredSpans,
    unknowns, status: unknowns.length ? 'abstain' : 'parsed' };
}

// Independent source replay: does not call the proposal parser's relationOf.
// Rule IDs have a separately maintained direction contract so a wrong
// proposal mapping cannot silently verify itself.
const REPLAY_FORWARD = new Set([
  'done_before_begin','needed_before','finished_for','after_complete','hard_prerequisite',
  'scheduled_earlier','happens_ahead','completion_unlocks','first_then',
  'required_advance','occur_prior','dependency_of','complete_when','happens_before',
  'finish_for_begin','happen_ahead','required_predecessor','finish_before_start',
  'occur_earlier','must_before','predecessor_for','necessary_before',
]);
const REPLAY_REVERSE = new Set([
  'gated_by','before_may','proceed_after','for_to_begin','follows_sequence','downstream',
  'depends_completion','start_only_after','must_follow','cannot_before',
  'happen_after','depends_on_completion','not_allowed_until',
  'no_until','scheduled_subsequent','dependent_upon','only_after_done',
]);

export function replayProseDependencySource(source, extraction) {
  const residuals = [];
  if (!extraction || extraction.source !== source || extraction.policy !== PROSE_V2_POLICY)
    return {ok:false,residuals:['source_identity_mismatch']};
  const clauses = clausesOf(source);
  if (!clauses.length || extraction.coveredSpans?.length !== clauses.length)
    residuals.push('source_coverage_incomplete');
  if (extraction.status !== 'parsed' || extraction.unknowns?.length)
    residuals.push('source_contract_incomplete');
  if (!Array.isArray(extraction.names) || new Set(extraction.names).size !== extraction.names.length ||
      extraction.names.length < 2 || extraction.names.length > MAX_ACTIONS)
    residuals.push('invalid_inventory');
  const inventory = clauses.filter(row => inventoryOf(row.quote));
  const goals = clauses.filter(row => GOAL.test(normalized(row.quote)));
  if (inventory.length !== 1 || goals.length !== 1 ||
      JSON.stringify(inventoryOf(inventory[0]?.quote)) !== JSON.stringify(extraction.names))
    residuals.push('inventory_or_goal_mismatch');
  if (!Array.isArray(extraction.facts) || extraction.facts.length < 1 || extraction.facts.length > MAX_FACTS)
    residuals.push('invalid_edge_total');
  if (extraction.facts?.length !== clauses.filter(row =>
    !inventoryOf(row.quote) && !GOAL.test(normalized(row.quote))).length)
    residuals.push('extra_or_missing_edges');
  if (extraction.names?.some(name => !extraction.facts?.some(fact =>
    fact.before === name || fact.after === name))) residuals.push('ungrounded_inventory_action');
  for (const clause of clauses) {
    const kind = inventoryOf(clause.quote) ? 'inventory' : GOAL.test(normalized(clause.quote)) ? 'goal' : 'relation';
    if (extraction.coveredSpans?.filter(span => span.sourceOffset === clause.sourceOffset &&
        span.sourceEnd === clause.sourceEnd && span.quote === clause.quote && span.kind === kind).length !== 1)
      residuals.push('span_partition_mismatch');
    if (kind !== 'relation') continue;
    const matching = extraction.facts?.filter(fact => fact.sourceOffset === clause.sourceOffset &&
      fact.sourceEnd === clause.sourceEnd && fact.quote === clause.quote) || [];
    if (matching.length !== 1) { residuals.push('uncovered_or_duplicated_clause'); continue; }
    const fact = matching[0], rows = mentions(clause.quote);
    if (rows.length !== 2 || rows.some(row => !extraction.names.includes(row.name)) || rows[0].name === rows[1].name) {
      residuals.push('unknown_or_ambiguous_action'); continue;
    }
    const report = fact.relationEvidence, reportedSpans = report?.actionSpans;
    if (!Array.isArray(reportedSpans) || reportedSpans.length !== 2 ||
        rows.some((row, i) => row.name !== reportedSpans[i]?.name ||
          row.start !== reportedSpans[i]?.start || row.end !== reportedSpans[i]?.end))
      residuals.push('action_coordinates_mismatch');
    let template = clause.quote.slice(0, rows[0].start) + '@1' +
      clause.quote.slice(rows[0].end, rows[1].start) + '@2' + clause.quote.slice(rows[1].end);
    template = normalized(template);
    if (template !== report?.template) residuals.push('template_mismatch');
    const matchingPatterns = RELATIONS.filter(([id, pattern]) => id === report?.rule && pattern.test(template));
    const fromReplay = REPLAY_FORWARD.has(report?.rule) ? 'fwd' : REPLAY_REVERSE.has(report?.rule) ? 'rev' : null;
    if (matchingPatterns.length !== 1 || !fromReplay || report?.direction !== fromReplay)
      residuals.push('relation_grammar_or_polarity_mismatch');
    else if (fact.before !== rows[fromReplay === 'fwd' ? 0 : 1].name ||
      fact.after !== rows[fromReplay === 'fwd' ? 1 : 0].name)
      residuals.push('checked_relation_direction_mismatch');
  }
  return {ok:residuals.length === 0,residuals};
}

export function interpretProseDependencyTask(source) {
  const extraction = extractProseDependencyRelations(source);
  if (extraction.status !== 'parsed' || !replayProseDependencySource(source, extraction).ok) return null;
  const {names,facts} = extraction;
  const graph = createBrowserGraphSnapshot({frame_id:'cp027-prose-dependency',
    nodes:names.map((label,i)=>({id:`task-${i}`,label,kind:'action',evidence_class:'OBSERVED'})),
    edges:facts.map((fact,i)=>({id:`edge-${i}`,src:`task-${names.indexOf(fact.before)}`,
      dst:`task-${names.indexOf(fact.after)}`,relation:'requires',
      source_refs:[`input:${fact.sourceOffset}`],attrs:fact})),
    metadata:{source,goal:'a source-conditional execution order',policy:PROSE_V2_POLICY}});
  return {intent:'dependency_order',source,names,facts,constraints:facts,unknowns:[],graph,
    goal:'a feasible total order or checked infeasibility',
    paths:['dependency_forward','dependency_backward'],interpretationPolicy:PROSE_V2_POLICY};
}
