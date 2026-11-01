/* A deliberately bounded transfer-of-inventory relation. The source wording
   is a user assumption, never independent evidence that the stated event
   happened. Arithmetic results are checked by the exact dual-parser tool. */
import { exactArithmetic } from './exact-arithmetic.mjs';

const PERSON = '([A-Za-z][A-Za-z-]{0,29})';
const QUANTITY = '(\\d{1,4})';
const ITEM = '([a-z][a-z-]{0,29})';
const FIRST = new RegExp(`^${PERSON} has ${QUANTITY} ${ITEM}\\.\\s*`, 'i');
const SECOND = new RegExp(`^${PERSON} has ${QUANTITY} ${ITEM}\\.\\s*`, 'i');
const GIFT = new RegExp(`^${PERSON} gives ${PERSON} ${QUANTITY} ${ITEM}\\.\\s*`, 'i');
const QUESTION = new RegExp(`^How many ${ITEM} does ${PERSON} have(?: now)?\\?$`, 'i');
const normalizeUnit = unit => unit.toLowerCase().replace(/([^aeiou])ies$/, '$1y')
  .replace(/(ch|sh|x|z)es$/, '$1').replace(/s$/, '');

export function parseInventoryTransfer(source) {
  if (typeof source !== 'string' || source.length > 450) return null;
  const text = source.trim();
  let cursor = 0;
  const first = FIRST.exec(text.slice(cursor));
  if (!first) return null;
  cursor += first[0].length;
  const second = SECOND.exec(text.slice(cursor));
  if (!second) return null;
  cursor += second[0].length;
  const gift = GIFT.exec(text.slice(cursor));
  if (!gift) return null;
  cursor += gift[0].length;
  const question = QUESTION.exec(text.slice(cursor));
  if (!question) return null;
  const names = [first[1].toLowerCase(), second[1].toLowerCase()];
  if (names[0] === names[1] || gift[1].toLowerCase() !== names[0] ||
      gift[2].toLowerCase() !== names[1]) return null;
  if (![first[3], second[3], gift[4], question[1]].every(unit =>
    normalizeUnit(unit) === normalizeUnit(first[3]))) return null;
  const target = names.indexOf(question[2].toLowerCase());
  if (target < 0) return null;
  const from = Number(first[2]), to = Number(second[2]), moved = Number(gift[3]);
  if ([from, to, moved].some(value => !Number.isSafeInteger(value)) || moved > from) return null;
  const positions = [text.indexOf(first[2], first[1].length),
    text.indexOf(second[2], first[0].length + second[1].length),
    text.indexOf(gift[3], first[0].length + second[0].length + gift[1].length + gift[2].length)];
  const quantities = [['giver_initial', first[2]], ['receiver_initial', second[2]], ['transfer_count', gift[3]]]
    .map(([role, value], index) => ({ role, value, quote: value, sourceOffset: positions[index] }));
  if (quantities.some(row => row.sourceOffset < 0 ||
      text.slice(row.sourceOffset, row.sourceOffset + row.quote.length) !== row.quote)) return null;
  return {
    schemaVersion: 1, source: text, names: [first[1], second[1]], itemUnit: first[3], quantities,
    target: target === 0 ? 'giver' : 'receiver',
    unknown: { role: 'target_final', quote: question[0], sourceOffset: cursor },
    dependencies: [
      { from: 'giver_initial', to: 'target_final' },
      { from: 'receiver_initial', to: 'target_final' },
      { from: 'transfer_count', to: 'target_final' },
    ],
    status: 'source_grounded_interpretation',
    verification: 'arithmetic_only_under_stated_transfer_assumptions',
  };
}

export function candidateTransferPaths(problem) {
  if (!problem || problem.schemaVersion !== 1) return [];
  return [
    { kind: 'transfer_direct', operations: 1, verification: 'dual_exact_each_step' },
    { kind: 'transfer_conserve', operations: 3, verification: 'dual_exact_each_step' },
  ];
}

export function executeTransferPath(problem, path, calculate = exactArithmetic) {
  if (!problem || !['transfer_direct', 'transfer_conserve'].includes(path?.kind)) throw new Error('invalid transfer path');
  const [from, to, moved] = problem.quantities.map(row => row.value);
  const receipts = [];
  let attempted = 0;
  const checked = expression => {
    attempted++;
    try {
      const proposed = calculate(expression);
      const independent = exactArithmetic(expression);
      if (String(proposed?.text) !== independent.text) {
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
  const targetReceiver = problem.target === 'receiver';
  const directExpression = targetReceiver ? `${to}+${moved}` : `${from}-${moved}`;
  const answer = path.kind === 'transfer_direct' ? checked(directExpression) : (() => {
    const total = checked(`${from}+${to}`);
    const other = checked(targetReceiver ? `${from}-${moved}` : `${to}+${moved}`);
    return checked(`${total}-${other}`);
  })();
  // Independent conservation check, distinct from the selected path's
  // operations; the arithmetic engine itself has two parser implementations.
  if (answer !== exactArithmetic(directExpression).text) {
    const error = new Error('transfer conservation mismatch');
    error.independentCheckFailed = true;
    error.operationsAttempted = attempted;
    error.verifiedReceipts = [...receipts];
    throw error;
  }
  return { answer, receipts, method: 'bounded_inventory_transfer_v1', path: path.kind };
}
