/* Seren V2 research lane: explicit, bounded browser-Worker tool capabilities.
 * This is NOT a native TinyLinux sandbox or permission to run generated code.
 * Every admitted call still goes through the existing terminating Worker.
 */
import { LOCAL_TOOLS } from './tools.mjs';
import { runToolProposal } from './tool-runner.mjs';

export const B2_TOOL_CAPABILITY_POLICY = 'b2-browser-tool-capability-1';
export const B2_BROWSER_TOOL_NAMES = Object.freeze(Object.keys(LOCAL_TOOLS));

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

/** The parser appends `raw` for audit evidence, but it is not part of the
 * executable envelope. Only this known metadata key may be dropped; all
 * unexpected keys remain invalid and tool arguments are still revalidated. */
export function capabilityEnvelopeFromParsedTool(call) {
  if (!plain(call) || Object.keys(call).some(key => !['name', 'arguments', 'raw'].includes(key)) ||
      (Object.hasOwn(call, 'raw') && typeof call.raw !== 'string')) return null;
  return { name: call.name, arguments: call.arguments };
}

function validateCall(call, permitted, maxInputBytes) {
  if (!plain(call) || Object.keys(call).some(key => key !== 'name' && key !== 'arguments'))
    return 'invalid_tool_envelope';
  if (typeof call.name !== 'string' || !Object.hasOwn(LOCAL_TOOLS, call.name))
    return 'unknown_tool';
  if (!permitted.has(call.name)) return 'capability_not_granted';
  const args = call.arguments;
  if (!plain(args)) return 'invalid_arguments';
  const schema = LOCAL_TOOLS[call.name].parameters;
  const keys = Object.keys(args);
  if (keys.length !== Object.keys(schema).length || keys.some(key => !Object.hasOwn(schema, key)))
    return 'argument_schema_mismatch';
  for (const [key, spec] of Object.entries(schema)) {
    const value = args[key];
    if (typeof value !== spec.type) return 'argument_type_mismatch';
    if (spec.type === 'string' && (value.length === 0 || value.length > 256)) return 'argument_size_limit';
    if (spec.type === 'number' && !Number.isFinite(value)) return 'non_finite_argument';
  }
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(call)).length;
    if (bytes > maxInputBytes) return 'input_byte_limit';
  } catch { return 'unserializable_arguments'; }
  return null;
}

/* A capability is an explicit per-request grant. Creation and execution are
 * deliberately separate: without allowLocalCompute=true and an allowed name,
 * nothing can allocate a Worker. Sessions are serial to avoid budget races.
 * A caller may inject a Worker factory for deterministic tests, not model text.
 */
export function createB2ToolCapabilitySession({
  allowLocalCompute = false, allowedTools = [], maxCalls = 3,
  maxTotalMs = 5000, maxPerCallMs = 2000, maxInputBytes = 1024,
  workerFactory, signal = null, clock = () => performance.now(),
} = {}) {
  if (typeof allowLocalCompute !== 'boolean' || !Array.isArray(allowedTools) ||
      allowedTools.some(name => typeof name !== 'string' || !Object.hasOwn(LOCAL_TOOLS, name)) ||
      new Set(allowedTools).size !== allowedTools.length ||
      !integer(maxCalls, 1, 16) || !integer(maxTotalMs, 1, 10000) ||
      !integer(maxPerCallMs, 1, 10000) || !integer(maxInputBytes, 64, 4096) ||
      typeof clock !== 'function' ||
      (signal !== null && (typeof signal !== 'object' || typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')))
    throw new TypeError('invalid B2 tool capability configuration');

  const permitted = new Set(allowLocalCompute ? allowedTools : []);
  const start = clock();
  let calls = 0, busy = false, closed = false, activeController = null;
  const receipt = (status, name, reason, extras = {}) => Object.freeze({
    policy: B2_TOOL_CAPABILITY_POLICY, tool: typeof name === 'string' ? name.slice(0, 48) : null,
    status, reason, ok: false, error: reason, checkedScope: 'tool_result_only', ...extras,
  });

  return Object.freeze({
    available() {
      return Object.freeze({ policy: B2_TOOL_CAPABILITY_POLICY,
        backend: 'browser_worker_only', nativeLinuxGuest: false,
        permitted: Object.freeze([...permitted]), remainingCalls: Math.max(0, maxCalls - calls),
        remainingMs: Math.max(0, maxTotalMs - (clock() - start)), closed });
    },
    close() { closed = true; activeController?.abort(); },
    async run(call) {
      const name = call?.name;
      if (closed) return receipt('denied', name, 'session_closed');
      if (signal?.aborted) return receipt('cancelled', name, 'request_cancelled');
      if (!allowLocalCompute) return receipt('denied', name, 'local_compute_not_authorized');
      const error = validateCall(call, permitted, maxInputBytes);
      if (error) return receipt('denied', name, error);
      if (busy) return receipt('denied', name, 'concurrent_call_not_allowed');
      if (calls >= maxCalls) return receipt('denied', name, 'call_budget_exhausted');
      const remainingMs = maxTotalMs - (clock() - start);
      if (remainingMs < 1) return receipt('denied', name, 'time_budget_exhausted');

      calls++;
      busy = true;
      const abort = new AbortController();
      activeController = abort;
      const forwardAbort = () => abort.abort();
      signal?.addEventListener('abort', forwardAbort, { once: true });
      if (signal?.aborted) forwardAbort();
      try {
        const timeoutMs = Math.max(1, Math.min(maxPerCallMs, Math.floor(remainingMs)));
        const result = await runToolProposal({ name, arguments: call.arguments },
          { workerFactory, signal: abort.signal, timeoutMs });
        const status = result.status || (result.ok ? 'succeeded' : 'failed');
        return receipt(status, name, result.ok ? null : String(result.error || 'execution_failed'), {
          ok: result.ok === true, elapsedMs: result.elapsed_ms,
          verification: result.verification || 'unverified',
          ...(result.ok ? { value: result.value } : {}),
        });
      } catch (error) {
        return receipt('failed', name, String(error?.message || error).slice(0, 160));
      } finally {
        busy = false;
        activeController = null;
        signal?.removeEventListener('abort', forwardAbort);
      }
    },
  });
}
