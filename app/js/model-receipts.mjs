// Active Instruct receipt plus optional CP030 research-only Coder receipt.
// A checksum roster entry does not grant runtime authority; Worker checks
// experimentalCoder on every Coder load and completion command.
export const EXPECTED_SHA256 = Object.freeze({
  falcon_instruct: 'e7d655345a876ecb073ea86f5ce68e412b99090c34a6bde8a2982bc48afb2612',
  falcon_coder: '1f769dd9cc450a4a080ebd623e1bf7c15d0a3ccdfb40e339e6640c53228cd019',
});

/** Keep the V1 browser Worker dependency tree unchanged for offline revisits. */
export function assertExperimentalModelCommand(modelId, { experimentalCoder = false } = {}) {
  if (modelId === 'falcon_instruct') return 'falcon_instruct';
  if (modelId === 'falcon_coder' && experimentalCoder === true) return 'falcon_coder';
  throw new Error(modelId === 'falcon_coder' ?
    'experimental Falcon Coder requires an explicit opt-in on every command' :
    'model is not in the authorized runtime roster');
}

/** The Coder is only approved as a bounded Python fill-in-the-middle trial. */
export function assertExperimentalCoderCompletion(data) {
  if (data.modelId !== 'falcon_coder') return;
  assertExperimentalModelCommand(data.modelId, data);
  const prompt = data.prompt;
  const prefix = '<|prefix|>', suffix = '<|suffix|>', middle = '<|middle|>';
  if (data.taskKind !== 'python_fim' || typeof prompt !== 'string' ||
      prompt.length < prefix.length + suffix.length + middle.length + 1 || prompt.length > 12328 ||
      !prompt.startsWith(prefix) || !prompt.endsWith(middle) ||
      prompt.split(prefix).length !== 2 || prompt.split(suffix).length !== 2 ||
      prompt.split(middle).length !== 2 ||
      prompt.indexOf(suffix) <= prefix.length || prompt.indexOf(suffix) >= prompt.length - middle.length ||
      !Number.isInteger(data.maxTokens) || data.maxTokens < 1 || data.maxTokens > 256 ||
      !Array.isArray(data.stops) || ![11, 15, 16].every(id => data.stops.includes(id)) ||
      data.grammar !== undefined) {
    throw new Error('experimental Coder completion must be bounded Python FIM with verified stops');
  }
}
