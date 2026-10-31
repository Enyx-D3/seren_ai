/* A bounded Boolean calculator. This grammar is intentionally smaller than
   natural-language logic: an exact expression gets a checked result, while
   prose, unknown symbols and malformed syntax remain for another direction. */
const MAX_SOURCE = 512;
const MAX_TOKENS = 128;
const MAX_DEPTH = 16;
const SUFFIX = /\s+is\s+Answer\s+True\s+or\s+False[.!?]?\s*$/i;
const PRECEDENCE = { or: 1, and: 2, not: 3 };

function tokenize(source) {
  const tokens = [];
  for (let i = 0; i < source.length;) {
    if (/\s/.test(source[i])) { i++; continue; }
    if (source[i] === '(' || source[i] === ')') { tokens.push(source[i++]); }
    else {
      const match = /^(?:true|false|not|and|or)\b/i.exec(source.slice(i));
      if (!match) return null;
      tokens.push(match[0].toLowerCase());
      i += match[0].length;
    }
    if (tokens.length > MAX_TOKENS) return null;
  }
  return tokens.length ? tokens : null;
}

// Recursive descent builds a syntax tree with explicit precedence.
function evaluateTree(tokens) {
  let cursor = 0;
  const atom = depth => {
    if (depth > MAX_DEPTH) throw new Error('Boolean nesting limit');
    const token = tokens[cursor++];
    if (token === 'true' || token === 'false') return { kind: 'literal', value: token === 'true' };
    if (token === 'not') return { kind: 'not', child: atom(depth + 1) };
    if (token === '(') {
      const child = or(depth + 1);
      if (tokens[cursor++] !== ')') throw new Error('Unclosed Boolean group');
      return child;
    }
    throw new Error('Expected Boolean literal, not, or opening group');
  };
  const and = depth => {
    let left = atom(depth);
    while (tokens[cursor] === 'and') { cursor++; left = { kind: 'and', left, right: atom(depth) }; }
    return left;
  };
  const or = depth => {
    let left = and(depth);
    while (tokens[cursor] === 'or') { cursor++; left = { kind: 'or', left, right: and(depth) }; }
    return left;
  };
  const tree = or(0);
  if (cursor !== tokens.length) throw new Error('Trailing Boolean syntax');
  const value = node => {
    if (node.kind === 'literal') return node.value;
    if (node.kind === 'not') return !value(node.child);
    if (node.kind === 'and') return value(node.left) && value(node.right);
    return value(node.left) || value(node.right);
  };
  return value(tree);
}

// Independent shunting-yard/RPN pass. Its state machine checks operator and
// operand order separately from the recursive parser above.
function evaluateRpn(tokens) {
  const output = [], operators = [];
  let wantsOperand = true, depth = 0;
  const pop = () => output.push(operators.pop());
  for (const token of tokens) {
    if (token === 'true' || token === 'false') {
      if (!wantsOperand) throw new Error('Adjacent Boolean literals');
      output.push(token); wantsOperand = false;
    } else if (token === '(') {
      if (!wantsOperand || ++depth > MAX_DEPTH) throw new Error('Invalid Boolean group');
      operators.push(token);
    } else if (token === ')') {
      if (wantsOperand || depth-- === 0) throw new Error('Invalid closing Boolean group');
      while (operators.length && operators.at(-1) !== '(') pop();
      if (operators.pop() !== '(') throw new Error('Unclosed Boolean group');
      wantsOperand = false;
    } else if (token === 'not') {
      if (!wantsOperand) throw new Error('Invalid not position');
      operators.push(token);
    } else {
      if (wantsOperand) throw new Error('Missing left Boolean operand');
      while (operators.length && operators.at(-1) !== '(' &&
          PRECEDENCE[operators.at(-1)] >= PRECEDENCE[token]) pop();
      operators.push(token); wantsOperand = true;
    }
  }
  if (wantsOperand || depth) throw new Error('Incomplete Boolean expression');
  while (operators.length) {
    if (operators.at(-1) === '(') throw new Error('Unclosed Boolean group');
    pop();
  }
  const stack = [];
  for (const token of output) {
    if (token === 'true' || token === 'false') stack.push(token === 'true');
    else if (token === 'not') {
      if (!stack.length) throw new Error('Missing Boolean operand');
      stack.push(!stack.pop());
    } else {
      if (stack.length < 2) throw new Error('Missing Boolean operand');
      const right = stack.pop(), left = stack.pop();
      stack.push(token === 'and' ? left && right : left || right);
    }
  }
  if (stack.length !== 1) throw new Error('Invalid Boolean stack');
  return stack[0];
}

export function solveBooleanExpression(input) {
  if (typeof input !== 'string' || !input.trim() || input.length > MAX_SOURCE) return null;
  const source = input.trim();
  const tagged = SUFFIX.test(source);
  const expression = tagged ? source.replace(SUFFIX, '').trim() : source;
  if (!expression || expression.length > MAX_SOURCE) return null;
  const tokens = tokenize(expression);
  if (!tokens || (!tagged && !tokens.some(token => token === 'not' || token === 'and' || token === 'or'))) return null;
  try {
    const treeValue = evaluateTree(tokens), rpnValue = evaluateRpn(tokens);
    if (treeValue !== rpnValue) throw new Error('Boolean evaluator disagreement');
    return { answer: treeValue ? 'True' : 'False', value: treeValue,
      expression, method: 'dual_boolean_expression_v1' };
  } catch { return null; }
}
