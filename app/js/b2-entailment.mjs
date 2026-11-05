/* CP024 experimental: bounded source-grounded transitive entailment.
   The checker proves derivability from stated "All A are B" premises only,
   never real-world category membership or the converse. No eval or model. */
const MAX_SOURCE = 960;
const MAX_FACTS = 6;
const term = value => value.trim().toLowerCase().replace(/\s+/g, ' ');
const reserved = /\b(?:not|no|some|none|only|might|may|most|few|can|cannot|unless|except|if|or|and)\b/i;
const entity = /^[a-z][a-z -]{0,59}$/i;

function sentences(source) {
  const rows = [];
  let start = 0;
  while (start < source.length) {
    while (/\s/.test(source[start] || '') && start < source.length) start++;
    if (start >= source.length) break;
    const relativeEnd = source.slice(start).search(/[.!?]/);
    if (relativeEnd < 0) return null;
    const end = start + relativeEnd + 1;
    rows.push({ quote: source.slice(start, end), sourceOffset: start });
    start = end;
  }
  return rows;
}

export function parseEntailmentProblem(input) {
  const source = String(input || '');
  if (source.length > MAX_SOURCE || source.length < 20) return null;
  const rows = sentences(source);
  if (!rows || rows.length < 3 || rows.length > MAX_FACTS + 1) return null;
  const clauses = rows.slice(0, -1);
  const facts = [];
  for (const row of clauses) {
    const m = /^All ([a-z][a-z -]{0,59}?) are ([a-z][a-z -]{0,59}?)\.$/i.exec(row.quote);
    if (!m) return null;
    const from = term(m[1]), to = term(m[2]);
    if (!entity.test(from) || !entity.test(to) || from === to ||
        reserved.test(from) ||
        reserved.test(to)) return null;
    facts.push({ id: "chain-fact-" + (facts.length + 1), from, to,
      quote: row.quote, sourceOffset: row.sourceOffset, provenance: 'user_input',
      status: 'assumed_input' });
  }
  if (facts.length < 2) return null;
  const questionRow = rows.at(-1);
  const q = /^Are all ([a-z][a-z -]{1,120})\?$/i.exec(questionRow.quote);
  if (!q) return null;
  const qBody = term(q[1]);
  const names = [...new Set(facts.flatMap(f => [f.from, f.to]))];
  const matches = [];
  for (const from of names) for (const to of names)
    if (from !== to && (from + ' ' + to) === qBody) matches.push({ from, to });
  if (matches.length !== 1) return null; // ambiguous word boundaries
  const goal = matches[0];
  return {
    source, domain: 'entailment', intent: 'stated_universal_entailment',
    facts, goal,
    unknown: { id: 'chain-entailment', question: questionRow.quote,
      sourceOffset: questionRow.sourceOffset },
    constraints: ['universal_all_are_only', 'within_stated_premises', 'no_converse_inference'],
    dependencies: facts.map(f => ({ from: f.id, to: 'chain-entailment',
      relation: 'requires_stated_fact' })),
    knowledgeGaps: ['world_knowledge_not_checked'],
    verifier: 'independent_forward_and_backward_graph_traversal',
    paths: [
      { kind: 'chain_forward', operations: facts.length, verification: 'independent_entailment',
        steps: ['forward_reachability', 'backward_crosscheck'] },
      { kind: 'chain_backward', operations: facts.length * 2, verification: 'independent_entailment',
        steps: ['backward_goal_search', 'forward_crosscheck'] },
    ],
  };
}

// Each traversal has its own queue, direction, predecessor construction and
// visited set; bounded by the unique names in the explicitly parsed facts.
function forwardProof(facts, start, target) {
  const queue = [{ at: start, proof: [] }], visited = new Set([start]);
  for (let head = 0; head < queue.length; head++) {
    const row = queue[head];
    for (const fact of facts) {
      if (fact.from !== row.at || visited.has(fact.to)) continue;
      const proof = [...row.proof, fact.id];
      if (fact.to === target) return proof;
      visited.add(fact.to);
      queue.push({ at: fact.to, proof });
    }
  }
  return null;
}
function backwardProof(facts, start, target) {
  const queue = [{ at: target, proof: [] }], visited = new Set([target]);
  for (let head = 0; head < queue.length; head++) {
    const row = queue[head];
    for (let index = facts.length - 1; index >= 0; index--) {
      const fact = facts[index];
      if (fact.to !== row.at || visited.has(fact.from)) continue;
      const proof = [fact.id, ...row.proof];
      if (fact.from === start) return proof;
      visited.add(fact.from);
      queue.push({ at: fact.from, proof });
    }
  }
  return null;
}
function validProof(facts, start, target, proof) {
  if (!Array.isArray(proof) || proof.length === 0 || proof.length > facts.length) return false;
  let current = start;
  for (const id of proof) {
    const fact = facts.find(row => row.id === id);
    if (!fact || fact.from !== current) return false;
    current = fact.to;
  }
  return current === target;
}

export function executeEntailmentPath(problem, kind) {
  if (problem?.domain !== 'entailment' || !problem.paths?.some(row => row.kind === kind))
    throw new Error('ineligible entailment path');
  const grounded = parseEntailmentProblem(problem.source);
  if (!grounded || JSON.stringify(grounded.facts) !== JSON.stringify(problem.facts) ||
      JSON.stringify(grounded.goal) !== JSON.stringify(problem.goal))
    throw new Error('entailment source evidence changed');
  const { facts, goal } = problem;
  if (!Array.isArray(facts) || facts.length < 2 || facts.length > MAX_FACTS ||
      !facts.every(f => typeof f.id === 'string' && entity.test(f.from) && entity.test(f.to) &&
        typeof f.quote === 'string')) throw new Error('invalid entailment evidence');
  const executionOrder = kind === 'chain_forward' ? ['forward', 'backward'] : ['backward', 'forward'];
  const proofs = {};
  for (const direction of executionOrder)
    proofs[direction] = (direction === 'forward' ? forwardProof : backwardProof)(facts, goal.from, goal.to);
  const { forward, backward } = proofs;
  if (!!forward !== !!backward) throw new Error('independent graph traversal disagreement');
  if ((forward && !validProof(facts, goal.from, goal.to, forward)) ||
      (backward && !validProof(facts, goal.from, goal.to, backward)))
    throw new Error('invalid entailment proof chain');
  const selected = kind === 'chain_forward' ? forward : backward;
  const receipts = [{
    executionOrder, forward: forward || [], backward: backward || [], derived: !!selected,
    sourceFacts: (selected || []).map(id => {
      const f = facts.find(x => x.id === id);
      return { id, quote: f.quote, sourceOffset: f.sourceOffset };
    }), scope: 'derivability_from_explicit_all_are_premises_only',
  }];
  if (!selected) return {
    answer: 'The stated facts do not establish that all ' + goal.from + ' are ' + goal.to +
      '. This does not prove the opposite.',
    verifiedValue: false, fullAnswerVerified: true,
    verification: 'independent_scoped_non_entailment_v1', receipts,
  };
  const trail = selected.map(id => facts.find(f => f.id === id).quote).join(' ');
  return {
    answer: 'Yes, from the stated premises: ' + trail +
      ' Therefore all ' + goal.from + ' are ' + goal.to + '.',
    verifiedValue: true, fullAnswerVerified: true,
    verification: 'independent_transitive_entailment_v1', receipts,
  };
}
