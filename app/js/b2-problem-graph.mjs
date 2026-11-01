/* A bounded evidence graph for B2. Edges mean an explicit input, constraint,
   ordering relation or verified-result dependency; a nearby sentence alone
   never becomes an inferred causal relation. */
import { extractGroundedSemantics } from './b2-grounded-semantics.mjs';
const MAX_SOURCE = 6000;
const MAX_GIVENS = 40;
const MAX_CONSTRAINTS = 16;
const DEPENDENT_REFERENCE = /\b(?:that|the|previous|earlier|above|first)\s+(?:result|answer|value|calculation)|\buse\s+(?:it|this|that)\s+(?:result|answer|value)\b/i;

export function explicitPartDependencies(questions) {
  return questions.map((question, index) => index > 0 && DEPENDENT_REFERENCE.test(question)
    ? [`part-${index}`] : []);
}

function intentFor(question, category) {
  const source = String(question).trim();
  const match = /\b(?:calculate|compute|find|solve|explain|compare|check|verify|plan|schedule|write|complete|debug|list|describe|answer|what|how|why|is|are)\b/i.exec(source);
  return { category, action: match?.[0].toLowerCase() || 'respond', source: source.slice(0, 300) };
}

function constraintsFor(question) {
  const patterns = [
    ['exact_result', /\bexact(?:ly)?\b/i],
    ['code_only', /\b(?:return|output|provide)\s+code\s+only\b/i],
    ['boolean_choice', /\b(?:answer\s+)?(?:true\s+or\s+false|yes\s+or\s+no)\b/i],
    ['step_count', /\b(?:one|two|three|\d+)\s*(?:numbered\s+)?steps?\b/i],
    ['risk_required', /\brisk\b/i],
    ['local_only', /\b(?:local|offline|without\s+(?:internet|network))\b/i],
  ];
  return patterns.flatMap(([kind, pattern]) => {
    const match = pattern.exec(question);
    return match ? [{ kind, value: match[0], sourceOffset: match.index }] : [];
  }).slice(0, MAX_CONSTRAINTS);
}

function verificationFor(part) {
  const ops = part.candidateOperations || [];
  if (ops.some(kind => /^(?:word_|transfer_)/.test(kind)))
    return { needed: 'dual_exact_arithmetic_on_source_grounded_contract', scope: 'bounded_grammar_only' };
  if (ops.includes('exact')) return { needed: 'two_independent_exact_evaluators', scope: 'full_answer_if_only_expression' };
  if (ops.includes('boolean')) return { needed: 'two_independent_boolean_evaluators', scope: 'full_answer_if_only_expression' };
  if (ops.includes('structured')) return { needed: 'bounded_rule_checker', scope: 'matched_rule_only' };
  if (part.category === 'code') return { needed: 'independent_executable_tests', scope: 'program_behavior' };
  if (part.category === 'planning' || part.category === 'conversation')
    return { needed: 'blinded_semantic_assessment', scope: 'response_quality' };
  return { needed: 'independent_claim_checker', scope: 'each_required_claim' };
}

export function buildProblemGraph(source, parts) {
  const text = String(source || '');
  const bounded = text.slice(0, MAX_SOURCE);
  const nodes = [], edges = [], knownFacts = [], requiredUnknowns = [], constraints = [], candidateOperations = [], missingKnowledge = [];
  const add = node => { nodes.push(node); return node; };
  const statements = bounded.split(/(?<=[.!?])\s+|\n+/).map(value => value.trim()).filter(Boolean).slice(0, 12);
  let searchFrom = 0;
  for (const value of statements) {
    const sourceOffset = bounded.indexOf(value, searchFrom);
    searchFrom = Math.max(searchFrom, sourceOffset + value.length);
    if (!/[.!?]$/.test(value) || /\?$/.test(value) ||
        /^(?:calculate|compute|find|solve|explain|plan|schedule|write|complete|debug|list|describe|answer|give|return)\b/i.test(value)) continue;
    const fact = add({ id: `given-statement-${knownFacts.length + 1}`, type: 'given', kind: 'source_statement',
      value: value.slice(0, 300), sourceOffset, provenance: 'user_input', status: 'assumed_input',
      trust: 'user_provided_unverified' });
    knownFacts.push(fact);
  }
  for (const match of bounded.matchAll(/(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])/g)) {
    if (knownFacts.length >= MAX_GIVENS) break;
    const fact = add({ id: `given-number-${knownFacts.filter(row => row.kind === 'numeric_literal').length + 1}`,
      type: 'given', kind: 'numeric_literal', value: match[0], sourceOffset: match.index,
      provenance: 'user_input', status: 'assumed_input', trust: 'user_provided_unverified' });
    knownFacts.push(fact);
  }
  let partCursor = 0;
  const semantic = extractGroundedSemantics(bounded, parts[0]?.category || '');
  for (const node of [...semantic.quantities, ...semantic.signatures, ...semantic.relations,
    ...(semantic.unknown ? [semantic.unknown] : [])]) add(node);
  for (const part of parts) {
    const partOffset = bounded.indexOf(part.question, partCursor);
    if (partOffset >= 0) partCursor = partOffset + part.question.length;
    const partNode = add({ id: part.id, type: 'task', status: 'unresolved', question: part.question.slice(0, 500),
      intent: intentFor(part.question, part.category), verification: verificationFor(part),
      dependsOn: [...part.dependsOn], orderAfter: [...(part.orderAfter || [])] });
    const unknown = add({ id: `${part.id}:unknown`, type: 'required_unknown', status: 'unresolved',
      value: part.question.slice(0, 300), verification: partNode.verification });
    requiredUnknowns.push(unknown);
    edges.push({ from: part.id, to: unknown.id, relation: 'requires_result' });
    for (const parentId of part.dependsOn) edges.push({ from: parentId, to: part.id, relation: 'requires_verified_result' });
    for (const parentId of part.orderAfter || []) edges.push({ from: parentId, to: part.id, relation: 'ordered_after' });
    if (partOffset >= 0) for (const fact of knownFacts) {
      if (fact.sourceOffset >= partOffset && fact.sourceOffset < partOffset + part.question.length)
        edges.push({ from: fact.id, to: part.id, relation: 'stated_input' });
    }
    if (partOffset >= 0) for (const relation of semantic.relations) {
      if (relation.sourceOffset >= partOffset && relation.sourceOffset < partOffset + part.question.length)
        edges.push({ from: relation.id, to: part.id, relation: 'proposes_operation_hint' });
    }
    if (partOffset >= 0) for (const signature of semantic.signatures) {
      if (signature.sourceOffset >= partOffset && signature.sourceOffset < partOffset + part.question.length)
        edges.push({ from: signature.id, to: part.id, relation: 'stated_code_contract' });
    }
    for (const [index, constraint] of constraintsFor(part.question).entries()) {
      const node = add({ id: `${part.id}:constraint-${index + 1}`, type: 'constraint',
        ...constraint, sourceOffset: partOffset < 0 ? null : partOffset + constraint.sourceOffset });
      constraints.push(node);
      edges.push({ from: node.id, to: part.id, relation: 'constrains' });
    }
    for (const kind of part.candidateOperations || ['falcon']) {
      const node = add({ id: `${part.id}:operation-${kind}`, type: 'candidate_operation', kind,
        status: 'eligible_unselected' });
      candidateOperations.push(node);
      edges.push({ from: part.id, to: node.id, relation: 'may_execute' });
    }
    if (partNode.verification.needed === 'independent_claim_checker' && !(part.candidateOperations || []).some(kind => kind !== 'falcon'))
      missingKnowledge.push({ partId: part.id, requirement: 'grounded_claim_verifier', status: 'unavailable' });
    if (['independent_executable_tests', 'blinded_semantic_assessment'].includes(partNode.verification.needed))
      missingKnowledge.push({ partId: part.id, requirement: partNode.verification.needed, status: 'not_available_in_browser_turn' });
  }
  const availableKnowledge = [
    { kind: 'user_stated_inputs', nodeIds: knownFacts.map(node => node.id), verification: 'assumed_input' },
    { kind: 'local_operations', nodeIds: candidateOperations.filter(node => node.kind !== 'falcon').map(node => node.id),
      verification: 'operation_specific' },
  ];
  return { schemaVersion: 2, truncated: text.length > MAX_SOURCE, nodes, edges, knownFacts, semantic,
    requiredUnknowns, constraints, candidateOperations, availableKnowledge, missingKnowledge };
}

export function readyPartIds(graph) {
  const verified = new Set(graph.nodes.filter(node => node.type === 'task' && node.status === 'verified').map(node => node.id));
  return graph.nodes.filter(node => node.type === 'task' && node.status === 'unresolved' &&
    node.dependsOn.every(id => verified.has(id))).map(node => node.id);
}

export function updateGraphTask(graph, partId, { status, derivationId = null } = {}) {
  const task = graph.nodes.find(node => node.id === partId && node.type === 'task');
  const target = graph.nodes.find(node => node.id === `${partId}:unknown` && node.type === 'required_unknown');
  if (!task || !target) throw new Error(`unknown graph task: ${partId}`);
  task.status = status === 'verified' ? 'verified' : 'unresolved';
  target.status = task.status;
  if (derivationId && task.status === 'verified') {
    task.verifiedBy = derivationId;
    target.verifiedBy = derivationId;
  }
}
