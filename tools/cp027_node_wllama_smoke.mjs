/* Developer-only real Falcon-WASM smoke in Node. Not a browser acceptance. */
import { createPinnedFalconNodeSession } from './b2_node_wllama_runtime.mjs';

let session;
try {
  session = await createPinnedFalconNodeSession({ nCtx: 256 });
  const result = await session.generate({
    turns: [{ role: 'user', content: 'Reply with the single word hello.' }],
    maxTokens: 24, temperature: 0.2,
  });
  console.log(JSON.stringify({ kind: 'cp027_node_only_actual_gguf_inference',
    modelSha256: session.modelSha256,
    wasmSha256: session.wasmSha256,
    vendorSha256: session.vendorSha256,
    modelBytes: session.modelBytes, loadedMs: session.loadedMs,
    firstTokenMs: result.ttftMs, generationMs: result.elapsedMs,
    completionTokens: result.tokens, output: result.text,
  }, null, 2));
} catch (error) {
  console.error('CP027 real Node WASM smoke BLOCKED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  if (session) await session.close().catch(error => {
    console.error('CP027 Wllama session close failed:', error.message);
    process.exitCode = 1;
  });
}
