import { exactArithmetic } from './exact-arithmetic.mjs';

const NUMBER = '(-?\\d+(?:\\.\\d+)?)';
const REF = '(?:that|the previous|the earlier|the first)\\s+(?:result|answer|value)';
const SUFFIX = '(?:\\s+exactly)?[.!?]*';
const GRAMMARS = [
  { kind: 'multiply', operator: '*', pattern: new RegExp(`^multiply\\s+${REF}\\s+by\\s+${NUMBER}${SUFFIX}$`, 'i') },
  { kind: 'add', operator: '+', pattern: new RegExp(`^add\\s+${NUMBER}\\s+to\\s+${REF}${SUFFIX}$`, 'i') },
  { kind: 'subtract', operator: '-', pattern: new RegExp(`^subtract\\s+${NUMBER}\\s+from\\s+${REF}${SUFFIX}$`, 'i') },
  { kind: 'divide', operator: '/', pattern: new RegExp(`^divide\\s+${REF}\\s+by\\s+${NUMBER}${SUFFIX}$`, 'i') },
];

export function parseDependentArithmetic(question) {
  if (typeof question !== 'string' || question.length > 200) return null;
  const source = question.trim();
  for (const grammar of GRAMMARS) {
    const match = grammar.pattern.exec(source);
    if (match) return { kind: grammar.kind, operator: grammar.operator, operand: match[1],
      source, method: 'explicit_result_reference_v1' };
  }
  return null;
}

export function solveDependentArithmetic(spec, priorValue) {
  if (!spec || !GRAMMARS.some(row => row.kind === spec.kind && row.operator === spec.operator) ||
      typeof priorValue !== 'string' || priorValue.length > 100 ||
      !/^-?\d+(?:\.\d+)?(?:\/\d+)?$/.test(priorValue) ||
      !/^-?\d+(?:\.\d+)?$/.test(spec.operand)) throw new Error('invalid verified dependency');
  const expression = `(${priorValue})${spec.operator}(${spec.operand})`;
  return { answer: exactArithmetic(expression).text, expression, method: 'two_parser_exact_dependency_v1' };
}
