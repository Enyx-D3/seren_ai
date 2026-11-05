/* CP030 exact pinned Coder GGUF, isolated Node/WASM Worker smoke.
 * No Chromium, browser acceptance, native code execution, or auto-routing.
 * Token text is a provisional candidate; this smoke does not judge correctness.
 */
import { createPinnedFalconCoderNodeSession } from './b2_node_wllama_runtime.mjs';

const mib = bytes => Math.round(bytes / 1024 / 1024 * 100) / 100;
const memory = () => mib(process.memoryUsage().rss);
const rssBefore = memory();
let peakRssMiB = rssBefore;
const sampler = setInterval(() => { peakRssMiB = Math.max(peakRssMiB, memory()); }, 25);
let session;
try {
  session = await createPinnedFalconCoderNodeSession({ nCtx: 256, seed: 42, maxLoadMs: 90000 });
  const rssAfterLoad = memory();
  const result = await session.generate({
    prefix: 'def add(a: int, b: int) -> int:\n    ',
    suffix: '\n\nprint(add(2, 3))',
    maxTokens: 24, temperature: 0.1, maxGenerateMs: 60000,
  });
  const rssAfterGeneration = memory();
  peakRssMiB = Math.max(peakRssMiB, rssAfterLoad, rssAfterGeneration);
  console.log(JSON.stringify({
    status: 'OBSERVED_ACTUAL_TOKENS_NOT_QUALITY_ACCEPTANCE', platform: session.platform,
    modelId: session.modelId, modelSha256: session.modelSha256,
    wasmSha256: session.wasmSha256, vendorSha256: session.vendorSha256,
    modelBytes: session.modelBytes, nCtx: session.nCtx,
    loadMs: session.loadedMs, firstTokenMs: result.ttftMs,
    generationMs: result.elapsedMs, tokens: result.tokens,
    provisionalText: result.text.slice(0, 512), tokenTrace: result.tokenTrace,
    processRssMiB: { before: rssBefore, afterLoad: rssAfterLoad,
      afterGeneration: rssAfterGeneration, sampledPeak: peakRssMiB },
    noCodeExecution: true, verifiedCorrectCode: false,
    browserOrPhysicalPhoneAccepted: false,
  }, null, 2));
} catch (error) {
  console.error('CP030 pinned Coder Node WASM smoke BLOCKED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  if (session) await session.close().catch(error => {
    console.error('CP030 pinned Coder Node WASM close failed:', error.message);
    process.exitCode = 1;
  });
  clearInterval(sampler);
}
