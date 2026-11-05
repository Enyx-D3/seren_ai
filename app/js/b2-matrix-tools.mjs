/* CP029 / L1 experimental exact square-integer matrix calculator.
 * No model weights, code evaluation, native guest, filesystem or network.
 * A caller may treat only this arithmetic result as independently checked;
 * the supplied matrices and any surrounding prose remain unverified.
 */
export const MATRIX_TOOL_POLICY = 'b2-matrix-int-v1';

const MAX_DIMENSION = 4;
const MAX_ABS_INTEGER = 1_000_000_000n;
const DECIMAL_INTEGER = /^-?(?:0|[1-9][0-9]{0,9})$/;

function asInteger(value) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('matrix entry must be a safe integer');
    value = String(value);
  }
  if (typeof value !== 'string' || !DECIMAL_INTEGER.test(value))
    throw new Error('matrix entry must be a bounded integer');
  const parsed = BigInt(value);
  if (parsed > MAX_ABS_INTEGER || parsed < -MAX_ABS_INTEGER)
    throw new Error('matrix entry exceeds integer bound');
  return parsed;
}

function parseMatrix(source, side) {
  if (typeof source !== 'string' || source.length > 256)
    throw new Error(`${side} matrix exceeds input limit`);
  let data;
  try { data = JSON.parse(source); }
  catch { throw new Error(`${side} matrix must be JSON`); }
  if (!Array.isArray(data) || data.length < 2 || data.length > MAX_DIMENSION ||
      !data.every(row => Array.isArray(row) && row.length === data.length))
    throw new Error(`${side} matrix must be square with dimension 2..4`);
  return data.map(row => row.map(asInteger));
}

function rowDot(left, right) {
  const n = left.length;
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => {
    let sum = 0n;
    for (let k = 0; k < n; k++) sum += left[i][k] * right[k][j];
    return sum;
  }));
}

// Independent execution order / indexing contract: rank-one outer products.
function outerProducts(left, right) {
  const n = left.length;
  const result = Array.from({ length: n }, () => Array(n).fill(0n));
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      const coefficient = left[i][k];
      for (let j = 0; j < n; j++) result[i][j] += coefficient * right[k][j];
    }
  }
  return result;
}

/** Pure bounded matrix multiplication; decimal strings preserve BigInt precision. */
export function multiplySquareIntegerMatrices(aJson, bJson) {
  const a = parseMatrix(aJson, 'left');
  const b = parseMatrix(bJson, 'right');
  if (a.length !== b.length) throw new Error('matrix dimensions do not match');
  const primary = rowDot(a, b);
  const independent = outerProducts(a, b);
  for (let i = 0; i < primary.length; i++) {
    for (let j = 0; j < primary.length; j++) {
      if (primary[i][j] !== independent[i][j])
        throw new Error('independent matrix multiplication verification failed');
    }
  }
  return Object.freeze({
    text: JSON.stringify(primary.map(row => row.map(cell => String(cell)))),
    dimension: primary.length, verification: 'row_dot_and_outer_product_bigint',
    policy: MATRIX_TOOL_POLICY,
  });
}
