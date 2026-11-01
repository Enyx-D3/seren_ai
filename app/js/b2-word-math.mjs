import { exactArithmetic } from './exact-arithmetic.mjs';

const MAX_INPUT = 500;
const WORD = '[a-z][a-z-]*';
const NUMBER = '(\\d{1,4})';
const GROUP = new RegExp(`^(?:there are|a [a-z-]+ has|the [a-z-]+ has)\\s+${NUMBER}\\s+(${WORD})[.!]?\\s+each\\s+(${WORD})\\s+(?:contains?|holds?|has|have)\\s+${NUMBER}\\s+(${WORD})[.!]?`, 'i');
const GROUP_ALT = new RegExp(`^(?:there are|a [a-z-]+ has|the [a-z-]+ has)\\s+${NUMBER}\\s+(${WORD})\\s+(?:with|containing|holding)\\s+${NUMBER}\\s+(${WORD})\\s+(?:in each|each)[.!]?`, 'i');
const CHANGE = new RegExp(`^${NUMBER}\\s+(${WORD})\\s+(?:are|were)\\s+(added|received|bought|removed|sold|given away|used)[.!]?`, 'i');
const QUESTION = new RegExp(`^how many\\s+(${WORD})\\s+(?:remain|are there(?: now)?|are left)\\?$`, 'i');
const normalize = value => value.toLowerCase()
  .replace(/([^aeiou])ies$/, '$1y')
  .replace(/(ch|sh|x|z)es$/, '$1')
  .replace(/s$/, '');

export function parseGroupedWordMath(source) {
  if (typeof source !== 'string' || source.length > MAX_INPUT) return null;
  const text = source.trim();
  const fullGroup = GROUP.exec(text);
  const group = fullGroup || GROUP_ALT.exec(text);
  if (!group) return null;
  if (fullGroup && normalize(group[2]) !== normalize(group[3])) return null;
  const groupCount = group[1], groupUnit = group[2], perGroupText = fullGroup ? group[4] : group[3];
  const itemUnit = fullGroup ? group[5] : group[4];
  const afterGroup = text.slice(group[0].length).trimStart();
  const change = CHANGE.exec(afterGroup);
  if (!change) return null;
  const afterChange = afterGroup.slice(change[0].length).trimStart();
  const question = QUESTION.exec(afterChange);
  if (!question || !Number.isSafeInteger(Number(groupCount)) || !Number.isSafeInteger(Number(perGroupText)) ||
      !Number.isSafeInteger(Number(change[1])) || normalize(itemUnit) !== normalize(change[2]) ||
      normalize(itemUnit) !== normalize(question[1])) return null;
  const groups = Number(groupCount), perGroup = Number(perGroupText), delta = Number(change[1]);
  if (groups < 1 || groups > 1000 || perGroup < 1 || perGroup > 1000 || delta > 1000000) return null;
  const changeKind = ['added', 'received', 'bought'].includes(change[3].toLowerCase()) ? 'add' : 'subtract';
  if (changeKind === 'subtract' && delta > groups * perGroup) return null;
  const groupOffset = text.indexOf(groupCount);
  const perOffset = text.indexOf(perGroupText, groupOffset + groupCount.length);
  const changeOffset = text.indexOf(change[1], group[0].length);
  const questionOffset = text.lastIndexOf(question[0]);
  const quantities = [
    { role: 'group_count', value: groupCount, quote: groupCount, sourceOffset: groupOffset },
    { role: 'items_per_group', value: perGroupText, quote: perGroupText, sourceOffset: perOffset },
    { role: 'change_count', value: change[1], quote: change[1], sourceOffset: changeOffset },
  ];
  if (quantities.some(row => row.sourceOffset < 0 || text.slice(row.sourceOffset, row.sourceOffset + row.quote.length) !== row.quote)) return null;
  return { schemaVersion: 1, source: text, quantities, groupUnit, itemUnit,
    changeKind, unknown: { role: 'final_item_count', quote: question[0], sourceOffset: questionOffset },
    dependencies: [{ from: 'group_count', to: 'initial_total' }, { from: 'items_per_group', to: 'initial_total' },
      { from: 'initial_total', to: 'final_item_count' }, { from: 'change_count', to: 'final_item_count' }],
    assumptions: ['Each named group has the stated item count.', 'The change applies to the same item unit.'],
    status: 'source_grounded_interpretation', verification: 'arithmetic_only; semantic interpretation is bounded by grammar' };
}

export function candidateWordPaths(problem) {
  if (!problem || problem.schemaVersion !== 1) return [];
  const count = Number(problem.quantities[0].value);
  const paths = [{ kind: 'word_multiply', operations: 2, steps: ['multiply', problem.changeKind],
    expectedProgress: 1, verification: 'dual_exact_each_step' }];
  if (count <= 12) paths.push({ kind: 'word_repeated', operations: count, steps: ['repeated_add', problem.changeKind],
    expectedProgress: 1, verification: 'dual_exact_each_step' });
  return paths;
}

export function executeWordPath(problem, path, calculate = exactArithmetic, { initialTotal = null } = {}) {
  const [groups, perGroup, change] = problem.quantities.map(row => row.value);
  if (!['word_multiply', 'word_repeated'].includes(path.kind)) throw new Error('unknown word path');
  const receipts = [];
  let attempted = 0;
  const checkedStep = expression => {
    attempted++;
    try {
      const result = calculate(expression);
      const independent = exactArithmetic(expression);
      if (String(result.text) !== independent.text) {
        const mismatch = new Error(`independent mismatch for ${expression}`);
        mismatch.independentCheckFailed = true;
        throw mismatch;
      }
      receipts.push({ expression, value: independent.text, verification: 'two_parser_exact_v1' });
      return independent.text;
    } catch (error) {
      error.operationsAttempted = attempted;
      error.verifiedReceipts = [...receipts];
      throw error;
    }
  };
  if (initialTotal !== null && !/^-?\d+(?:\.\d+)?(?:\/\d+)?$/.test(initialTotal)) throw new Error('invalid verified initial total');
  let total = initialTotal ?? (path.kind === 'word_repeated' ? perGroup : null);
  const initialSteps = initialTotal !== null ? 0 : path.kind === 'word_multiply' ? 1 : Number(groups) - 1;
  for (let index = 0; index < initialSteps; index++) {
    const expression = path.kind === 'word_multiply' ? `${groups}*${perGroup}` : `${total}+${perGroup}`;
    total = checkedStep(expression);
  }
  const finalExpression = `${total}${problem.changeKind === 'add' ? '+' : '-'}${change}`;
  try {
    const answer = checkedStep(finalExpression);
    return { answer, initialTotal: total, receipts, method: 'bounded_grouped_word_math_v1' };
  } catch (error) {
    error.verifiedInitialTotal = receipts.at(-1)?.value && receipts.length > 1 ? receipts.at(-1).value
      : receipts.length === 1 && initialSteps > 0 ? receipts[0].value : initialTotal;
    throw error;
  }
}
