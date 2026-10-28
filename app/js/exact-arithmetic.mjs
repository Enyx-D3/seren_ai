/* Bounded exact decimal/fraction arithmetic. Two parsers must agree before a
   result is released; neither executes user or model text as JavaScript. */
const MAX_BITS = 2048;
const abs = n => n < 0n ? -n : n;
function gcd(a, b) { a = abs(a); b = abs(b); while (b) [a, b] = [b, a % b]; return a || 1n; }
function rational(n, d = 1n) {
  if (d === 0n) throw new Error('division by zero');
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d); n /= g; d /= g;
  if (n.toString(2).length > MAX_BITS || d.toString(2).length > MAX_BITS) throw new Error('exact result exceeds size limit');
  return { n, d };
}
function decimal(s) {
  const dot = s.indexOf('.');
  return dot < 0 ? rational(BigInt(s)) : rational(BigInt(s.replace('.', '')), 10n ** BigInt(s.length - dot - 1));
}
function apply(op, a, b) {
  if (op === '+') return rational(a.n * b.d + b.n * a.d, a.d * b.d);
  if (op === '-') return rational(a.n * b.d - b.n * a.d, a.d * b.d);
  if (op === '*') return rational(a.n * b.n, a.d * b.d);
  if (op === '/') return rational(a.n * b.d, a.d * b.n);
  throw new Error('unknown operator');
}
function tokenize(source) {
  if (typeof source !== 'string' || source.length > 256) throw new Error('expression too long');
  const tokens = []; let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i])) { i++; continue; }
    const m = /^(?:\d+(?:\.\d+)?|[()+\-*/])/.exec(source.slice(i));
    if (!m) throw new Error('invalid exact arithmetic token');
    tokens.push(m[0]); i += m[0].length;
    if (tokens.length > 128) throw new Error('too many arithmetic tokens');
  }
  if (!tokens.length) throw new Error('empty expression');
  return tokens;
}
function recursive(tokens) {
  let i = 0;
  function primary() {
    const t = tokens[i++];
    if (t === '-') { const v = primary(); return rational(-v.n, v.d); }
    if (t === '+') return primary();
    if (t === '(') { const v = expr(); if (tokens[i++] !== ')') throw new Error('missing )'); return v; }
    if (!t || !/^\d/.test(t)) throw new Error('expected number');
    return decimal(t);
  }
  function term() {
    let v = primary();
    while (tokens[i] === '*' || tokens[i] === '/') { const op = tokens[i++]; v = apply(op, v, primary()); }
    return v;
  }
  function expr() {
    let v = term();
    while (tokens[i] === '+' || tokens[i] === '-') { const op = tokens[i++]; v = apply(op, v, term()); }
    return v;
  }
  const value = expr();
  if (i !== tokens.length) throw new Error('unexpected trailing token');
  return value;
}
function rpn(tokens) {
  const output = [], operators = [];
  const prec = { '+': 1, '-': 1, '*': 2, '/': 2, 'u+': 3, 'u-': 3 };
  let operand = true;
  for (const t of tokens) {
    if (/^\d/.test(t)) {
      if (!operand) throw new Error('missing operator');
      output.push(t); operand = false;
    } else if (t === '(') {
      if (!operand) throw new Error('missing operator');
      operators.push(t);
    } else if (t === ')') {
      if (operand) throw new Error('empty parentheses');
      while (operators.length && operators.at(-1) !== '(') output.push(operators.pop());
      if (operators.pop() !== '(') throw new Error('unmatched )');
      operand = false;
    } else {
      if (operand && (t === '+' || t === '-')) { operators.push('u' + t); continue; }
      if (operand) throw new Error('expected number');
      while (operators.length && operators.at(-1) !== '(' && prec[operators.at(-1)] >= prec[t]) output.push(operators.pop());
      operators.push(t); operand = true;
    }
  }
  if (operand) throw new Error('expression ends with operator');
  while (operators.length) { const op = operators.pop(); if (op === '(') throw new Error('missing )'); output.push(op); }
  const stack = [];
  for (const t of output) {
    if (/^\d/.test(t)) stack.push(decimal(t));
    else if (t === 'u+' || t === 'u-') { const v = stack.pop(); if (!v) throw new Error('missing operand'); stack.push(t === 'u-' ? rational(-v.n, v.d) : v); }
    else { const b = stack.pop(), a = stack.pop(); if (!a || !b) throw new Error('missing operand'); stack.push(apply(t, a, b)); }
  }
  if (stack.length !== 1) throw new Error('invalid expression');
  return stack[0];
}
export function exactArithmetic(source) {
  const tokens = tokenize(source);
  const primary = recursive(tokens), check = rpn(tokens);
  if (primary.n !== check.n || primary.d !== check.d) throw new Error('independent arithmetic verification failed');
  return { numerator: String(primary.n), denominator: String(primary.d),
    text: primary.d === 1n ? String(primary.n) : `${primary.n}/${primary.d}` };
}

// Solve a*x + b = c for bounded rational coefficients. The substitution is
// evaluated through the independent two-parser expression path above.
export function solveLinear(aText, bText, cText) {
  const coefficient = /^-?\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?$/;
  for (const value of [aText, bText, cText]) {
    if (typeof value !== 'string' || value.length > 64 || !coefficient.test(value))
      throw new Error('coefficient must be a bounded decimal or fraction');
  }
  const [a, b, c] = [aText, bText, cText].map(value => {
    const parsed = exactArithmetic(value);
    return { n: BigInt(parsed.numerator), d: BigInt(parsed.denominator) };
  });
  if (a.n === 0n) throw new Error('no unique solution');
  const difference = rational(c.n * b.d - b.n * c.d, c.d * b.d);
  const answer = rational(difference.n * a.d, difference.d * a.n);
  const text = answer.d === 1n ? String(answer.n) : `${answer.n}/${answer.d}`;
  const verified = exactArithmetic(`(${aText})*(${text})+(${bText})`);
  if (BigInt(verified.numerator) * c.d !== c.n * BigInt(verified.denominator))
    throw new Error('linear solution verification failed');
  return { text, verification: 'substitution passed' };
}
