/* Run one model-proposed local tool in an isolated browser Worker. The caller
   can always terminate a stalled computation; no model text becomes code. */
export async function runToolProposal(call, { timeoutMs = 5000, workerFactory, signal } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000)
    throw new Error('invalid tool timeout');
  const create = workerFactory || (() => new Worker(new URL('../workers/tool-worker.mjs', import.meta.url), { type: 'module' }));
  const started = performance.now();
  let worker;
  try { worker = create(); }
  catch (error) { return { ok: false, error: `tool worker unavailable: ${error.message}`, status: 'failed', elapsed_ms: 0 }; }
  return new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
      resolve({ ...result, elapsed_ms: Math.round(performance.now() - started) });
    };
    const onAbort = () => finish({ ok: false, error: 'tool execution cancelled', status: 'cancelled' });
    const timer = setTimeout(() => finish({ ok: false, error: 'tool execution timed out', status: 'timeout' }), timeoutMs);
    worker.onmessage = event => {
      if (event.data?.id !== 1) return;
      const result = event.data.result;
      if (!result || typeof result.ok !== 'boolean') finish({ ok: false, error: 'invalid tool worker response', status: 'failed' });
      else finish({ ...result, status: result.ok ? 'succeeded' : 'denied' });
    };
    worker.onerror = () => finish({ ok: false, error: 'tool worker failed', status: 'failed' });
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }
    try { worker.postMessage({ id: 1, call, permissionScope: 'local_compute_only' }); }
    catch { finish({ ok: false, error: 'invalid tool proposal payload', status: 'denied' }); }
  });
}
