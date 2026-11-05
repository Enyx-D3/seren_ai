/* Source-grounded ordering experiment. Unsupported clauses abstain; quoted
   action names are identifiers, not permission to execute those actions. */
import { createBrowserGraphSnapshot } from './b2-graphos-browser-shadow.mjs';

export function interpretDependencyTask(source) {
  if (typeof source !== 'string' || source.length > 4000 || !/\b(order|sequence|schedule|plan)\b/i.test(source)) return null;
  const facts = [], names = [];
  const q = '"([^"\n]{1,60})"';
  const patterns = [
    [new RegExp(`^${q} (?:must |should )?(?:finish |happen |be completed )?before ${q}(?: (?:starts|begins))?$`, 'i'), false],
    [new RegExp(`^${q} (?:must |should )?precede ${q}$`, 'i'), false],
    [new RegExp(`^${q} (?:happens |comes |must happen )?after ${q}(?: (?:finishes|is complete))?$`, 'i'), true],
    [new RegExp(`^${q} (?:cannot start|must wait) until ${q} (?:is complete|finishes)$`, 'i'), true],
    [new RegExp(`^Before ${q}(?: (?:starts|begins))?, ${q} must (?:finish|be completed)$`, 'i'), true],
    [new RegExp(`^${q} (?:requires|depends on) ${q}$`, 'i'), true],
  ];
  const goalList = /(?:order|sequence|schedule|plan)\s+(?:for|of|using)\s+([^.!?]+)[.!?]?$/i.exec(source);
  if (goalList) {
    const listed = goalList[1].split(/,\s*|\s+and\s+/).map(x => x.trim());
    if (listed.length >= 2 && listed.every(x => /^[a-z][a-z -]{0,59}$/i.test(x))) names.push(...new Set(listed));
  }
  const unknowns = [];
  for (const match of source.matchAll(/[^.!?\n;]+[.!?;]?/g)) {
    const quote = match[0].trim(), sourceOffset = match.index + match[0].indexOf(quote);
    if (!quote.includes('"')) continue;
    const clause = quote.replace(/[.!?;]$/, '');
    let parsed;
    for (const [pattern, reverse] of patterns) {
      const m = pattern.exec(clause);
      if (m) { parsed = { before: reverse ? m[2] : m[1], after: reverse ? m[1] : m[2] }; break; }
    }
    if (!parsed || /\b(?:unless|except|maybe|might|or|not necessarily)\b/i.test(quote)) {
      unknowns.push({ quote, sourceOffset, reason: 'unsupported_dependency_clause' }); continue;
    }
    for (const name of [parsed.before, parsed.after]) if (!names.includes(name)) names.push(name);
    facts.push({ ...parsed, quote, sourceOffset, provenance: 'observed_source', status: 'assumed_input' });
  }
  const proseCovered = new Set();
  if (goalList) for (const match of source.matchAll(/[^.!?\n;]+[.!?;]?/g)) {
    const quote = match[0].trim(), sourceOffset = match.index + match[0].indexOf(quote);
    if (sourceOffset >= goalList.index || quote.includes('"')) continue;
    const found = names.flatMap(name => {
      const start = quote.toLowerCase().indexOf(name.toLowerCase());
      return start < 0 ? [] : [{ name, start, end: start + name.length }];
    }).sort((a,b) => a.start - b.start);
    if (found.length !== 2 || found[0].end > found[1].start) continue;
    const [a,b] = found;
    const between = quote.slice(a.end,b.start).trim().toLowerCase();
    const prefix = quote.slice(0,a.start).trim().toLowerCase();
    let reverse;
    if (/^(?:must |should )?(?:finish |happen |be completed )?before$/.test(between) && !prefix) reverse = false;
    if (/^(?:happens |comes |must happen )?after$/.test(between) && !prefix) reverse = true;
    if (/^(?:has to wait for|must wait for|depends on|requires|follows)$/.test(between) && !prefix) reverse = true;
    if (/^(?:cannot start until|is allowed once)$/.test(between) && !prefix) reverse = true;
    if (prefix === 'before' && /^(?:(?:starts|begins),?|,)\s*$/.test(between) && /must (?:finish|be completed)[.!?;]?$/.test(quote.slice(b.end))) reverse = true;
    if (typeof reverse !== 'boolean') continue;
    const fact = { before: reverse ? b.name : a.name, after: reverse ? a.name : b.name,
      quote, sourceOffset, provenance: 'observed_source', status: 'assumed_input',
      relationEvidence: { left: a, right: b, connector: between, prefix } };
    if (checkSourceRelationship(source, fact)) { facts.push(fact); proseCovered.add(sourceOffset); }
  }
  if (!facts.length || names.length > 7 || facts.length > 16) return null;
  // Reject every substantive clause outside the checked relation/goal contracts.
  for (const match of source.matchAll(/[^.!?\n;]+[.!?;]?/g)) {
    const quote = match[0].trim();
    if (!quote.includes('"') && !proseCovered.has(match.index + match[0].indexOf(quote)) &&
      !(goalList && match.index <= goalList.index && match.index + match[0].length >= goalList.index) && !/^(?:give|find|return|produce) (?:a |an |the )?(?:valid |feasible |execution )?(?:order|sequence|schedule|plan)[.!?]?$/i.test(quote))
      unknowns.push({ quote, sourceOffset: match.index + match[0].indexOf(quote), reason: 'uninterpreted_clause' });
  }
  const graph = createBrowserGraphSnapshot({ frame_id: 'dependency-task',
    nodes: names.map((label, i) => ({ id: `task-${i}`, label, kind: 'action', evidence_class: 'OBSERVED' })),
    edges: facts.map((fact, i) => ({ id: `edge-${i}`, src: `task-${names.indexOf(fact.before)}`,
      dst: `task-${names.indexOf(fact.after)}`, relation: 'requires', source_refs: [`input:${fact.sourceOffset}`], attrs: fact })),
    metadata: { source, goal: 'find a total order satisfying all stated prerequisites' } });
  return { intent: 'dependency_order', source, names, facts, constraints: facts,
    unknowns, graph, goal: 'a feasible total order or a checked infeasibility result',
    paths: ['dependency_forward', 'dependency_backward'] };
}

export function executeDependencyPath(problem, kind) {
  const names = problem.names;
  const labels = new Map(problem.graph.nodes.map(node => [node.id, node.label]));
  const facts = problem.graph.edges.map(edge => ({ before: labels.get(edge.src), after: labels.get(edge.dst) }));
  if (!problem.paths.includes(kind)) throw Error('ineligible dependency direction');
  const order = [], pending = new Set(names);
  if (kind === 'dependency_forward') {
    while (pending.size) {
      const next = [...pending].find(name => facts.every(f => f.after !== name || order.includes(f.before)));
      if (!next) return null;
      order.push(next); pending.delete(next);
    }
  } else {
    const visiting = new Set(), done = new Set();
    function prerequisites(name) {
      if (visiting.has(name)) throw Error('cycle');
      if (done.has(name)) return;
      visiting.add(name);
      for (const f of facts.filter(f => f.after === name)) prerequisites(f.before);
      visiting.delete(name); done.add(name); order.push(name);
    }
    try { for (const name of [...names].reverse()) prerequisites(name); }
    catch (error) { if (error.message === 'cycle') return null; throw error; }
  }
  return order;
}

// Independent oracle: enumerate all permutations and check positional inequalities.
export function verifyDependencyOrder(problem, candidate) {
  const { names, facts } = problem;
  const valid = order => Array.isArray(order) && order.length === names.length && new Set(order).size === names.length &&
    names.every(name => order.includes(name)) && facts.every(f => order.indexOf(f.before) < order.indexOf(f.after));
  if (candidate !== null) {
    const residuals = !Array.isArray(candidate) ? ['invalid_order_format'] :
      facts.filter(f => candidate.indexOf(f.before) < 0 || candidate.indexOf(f.after) < 0 ||
        candidate.indexOf(f.before) >= candidate.indexOf(f.after)).map(f => ({ before: f.before, after: f.after, quote: f.quote }));
    return { ok: valid(candidate), residuals, method: 'independent_position_inequalities' };
  }
  let witness = null;
  function permute(prefix, rest) {
    if (witness) return;
    if (!rest.length) { if (valid(prefix)) witness = prefix; return; }
    for (let i = 0; i < rest.length; i++) permute([...prefix, rest[i]], rest.filter((_, j) => j !== i));
  }
  permute([], names);
  return { ok: !witness, residuals: witness ? ['feasible_order_exists'] : [], witness,
    method: 'independent_exhaustive_counterexample_search' };
}

export function parseOrderProposal(text) {
  try { const value = JSON.parse(text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, '$1')); return Array.isArray(value) && value.every(x => typeof x === 'string') ? value : undefined; }
  catch { return undefined; }
}

// Check source identity and the polarity of admitted relation cues independently
// from graph traversal. Unsupported modality is never converted to an edge.
export function checkSourceRelationship(source, fact) {
  if (source.slice(fact.sourceOffset, fact.sourceOffset + fact.quote.length) !== fact.quote) return false;
  const e = fact.relationEvidence;
  if (!e) return false;
  if (/\b(?:unless|except|maybe|might|either|or|not|never|optional)\b/i.test(fact.quote)) return false;
  const { left:a, right:b } = e;
  if (fact.quote.slice(a.start,a.end).toLowerCase() !== a.name.toLowerCase() ||
      fact.quote.slice(b.start,b.end).toLowerCase() !== b.name.toLowerCase()) return false;
  const middle = fact.quote.slice(a.end,b.start).toLowerCase();
  const backwards = /\b(after|follows|requires|depends on|wait for|until|once)\b/.test(middle) || e.prefix === 'before';
  const forwards = /\bbefore\b/.test(middle) && !e.prefix;
  if (backwards === forwards) return false;
  const suffix = fact.quote.slice(b.end).trim();
  if (e.prefix !== 'before' && !/^(?:is (?:complete|done)|finishes|starts|begins)?[.!?;]?$/i.test(suffix)) return false;
  return fact.before === (backwards ? b.name : a.name) && fact.after === (backwards ? a.name : b.name);
}

export function repairOrderFromChoice(problem, order, before, after, text) {
  const choice = String(text || '').trim().replace(/^['"]|['".!]$/g, '');
  if (choice.toLowerCase() !== before.toLowerCase()) return { ok: false, reason: 'model_did_not_identify_prerequisite' };
  if (!Array.isArray(order) || order.length !== problem.names.length || new Set(order).size !== order.length ||
      !problem.names.every(n => order.includes(n))) return { ok: false, reason: 'invalid_component_order' };
  const earlier = order.filter(n => n !== before);
  earlier.splice(earlier.indexOf(after), 0, before);
  const later = order.filter(n => n !== after);
  later.splice(later.indexOf(before) + 1, 0, after);
  const preserved = problem.facts.filter(f => order.indexOf(f.before) < order.indexOf(f.after));
  const candidate = [earlier,later].find(next => preserved.every(f => next.indexOf(f.before) < next.indexOf(f.after)));
  if (!candidate) return { ok: false, reason: 'edit_would_corrupt_checked_relationship' };
  return { ok: true, order: candidate, preserved: preserved.length, wholeTask: verifyDependencyOrder(problem,candidate) };
}
