/* Source-anchored interpretation hints. These describe input wording, not
   independently verified world facts or permission to run an operation. */
const MAX_SOURCE = 6000;
const MAX_RELATIONS = 32;
const RELATION_CUES = [
  ['per_unit', /\b(?:each|every|per)\b/gi, 'multiply_or_divide'],
  ['increase', /\b(?:receives?|gets?|gains?|adds?|buys?)\b/gi, 'add'],
  ['decrease', /\b(?:gives?|sells?|spends?|loses?|removes?)\b/gi, 'subtract'],
  ['total', /\b(?:total|altogether|sum)\b/gi, 'aggregate'],
  ['remaining', /\b(?:remain(?:s|ing)?|left)\b/gi, 'subtract_or_compare'],
  ['temporal', /\b(?:before|after|then)\b/gi, 'order'],
  ['code_filter', /\b(?:filter|even|odd|matching)\b/gi, 'filter'],
  ['code_sort', /\b(?:sort|sorted|ascending|descending)\b/gi, 'sort'],
  ['code_aggregate', /\b(?:sum|count|average|maximum|minimum)\b/gi, 'aggregate'],
  ['code_contract', /\b(?:should|must|return|returns)\b/gi, 'output_constraint'],
];

function sentenceAt(text, index) {
  let start = index, end = index;
  while (start > 0 && !/[.!?\n]/.test(text[start - 1])) start--;
  while (end < text.length && !/[.!?\n]/.test(text[end])) end++;
  const value = text.slice(start, end).trim();
  const offset = text.indexOf(value, start);
  return { value: value.slice(0, 240), sourceOffset: offset };
}

export function extractGroundedSemantics(source, category = '') {
  const text = String(source || '').slice(0, MAX_SOURCE);
  const isCode = category === 'code' || /\b(?:python|javascript|function|debug)\b|\bdef\s+\w+\s*\(/i.test(text);
  const quantities = [...text.matchAll(/(?<![\w.])-?\d+(?:\.\d+)?(?:[ \t]+[A-Za-z][\w-]*)?\b/g)]
    .slice(0, 24).map((match, index) => ({ id: `semantic-quantity-${index + 1}`, type: 'source_quantity',
      quote: match[0], sourceOffset: match.index, status: 'assumed_input', provenance: 'user_input' }));
  const signatures = isCode ? [...text.matchAll(/\b(?:def|function)\s+([A-Za-z_]\w*)\s*\(([^)\n]{0,160})\)/g)]
    .slice(0, 4).map((match, index) => ({ id: `semantic-signature-${index + 1}`, type: 'source_signature',
      quote: match[0], functionName: match[1], parameters: match[2].split(',').map(v => v.trim()).filter(Boolean),
      sourceOffset: match.index, status: 'assumed_input', provenance: 'user_input' })) : [];
  const relations = [];
  for (const [kind, pattern, operationHint] of RELATION_CUES) {
    if (kind.startsWith('code_') !== isCode && kind !== 'temporal') continue;
    for (const match of text.matchAll(pattern)) {
      if (relations.length >= MAX_RELATIONS) break;
      const span = sentenceAt(text, match.index);
      relations.push({ id: `semantic-relation-${relations.length + 1}`, type: 'source_relation', kind,
        cue: match[0], cueOffset: match.index, quote: span.value, sourceOffset: span.sourceOffset,
        operationHint, status: 'proposed_from_wording', provenance: 'source_span',
        verification: 'requires_independent_operation_check' });
    }
  }
  relations.sort((a, b) => a.cueOffset - b.cueOffset);
  const unknownMatch = isCode
    ? /\b(?:return|returns|output|produce)\b[^.!?\n]{0,180}/i.exec(text)
    : /\b(?:how many|how much|what(?: is| are)?|find|calculate)\b[^.!?\n]{0,180}/i.exec(text);
  const unknown = unknownMatch ? { id: 'semantic-unknown-1', type: 'source_unknown',
    quote: unknownMatch[0], sourceOffset: unknownMatch.index, status: 'unresolved', provenance: 'source_span' } : null;
  return { schemaVersion: 1, quantities, signatures, relations, unknown,
    limitation: 'lexical source hints; operation roles and causal dependencies remain unverified' };
}
