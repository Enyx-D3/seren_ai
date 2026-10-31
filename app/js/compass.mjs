/* B2 task classifier. route() is a compatibility helper for historical
   receipts; live orchestration happens only in SpiralController. */
export const COMPASS_POLICY_VERSION = 'compass-conservative-1';
export const SPECIALISTS = ['falcon_instruct'];

export function classifyTask(text) {
  const value = String(text || '');
  if (/\b(?:contradiction|contradict|inconsistent)\b|can both statements be true/i.test(value)) return 'contradiction';
  if (/\bhow many\b[\s\S]*\b(?:some|unknown|unspecified)\b|\b(?:not enough|insufficient) information\b/i.test(value)) return 'incomplete_information';
  if (/\b(?:plan|schedule|itinerary|roadmap)\b/i.test(value)) return 'planning';
  if (/\b(?:if all|therefore|entails|implies)\b/i.test(value)) return 'logic';
  if (/\b(?:tool|calculator|unit_convert|exact_arithmetic|solve_linear)\b/i.test(value)) return 'tool';
  if (/```|\b(?:code|function|javascript|typescript|python|regex|sql|html|css|bug|compile)\b/i.test(value)) return 'code';
  if (/\b(?:calculate|compute|math|sum|product|plus|minus|times|divided by)\b|\d\s*[+*\-/]\s*\d/i.test(value)) return 'arithmetic';
  if (/\b(?:why|reason|prove|derive|logic|step by step)\b/i.test(value)) return 'reasoning';
  return 'conversation';
}

export function route(text, opts = {}) {
  const ready = opts.ready || new Set();
  const selected = opts.selected || 'auto';
  const category = classifyTask(text);
  if (selected !== 'auto' && !SPECIALISTS.includes(selected)) throw new Error('unknown model selection');
  const modelId = ready.has('falcon_instruct') ? 'falcon_instruct' : null;
  const maxTokens = opts.think ? 512 : 256;
  return {
    modelId,
    category,
    policyVersion: COMPASS_POLICY_VERSION,
    mode: 'b2_spiral',
    reason: modelId ? `B2 Spiral controls ${category} with the single Falcon Instruct model.` : 'Falcon Instruct is unavailable; import its verified GGUF.',
    budget: { maxTokens, activeModels: modelId ? 1 : 0 },
  };
}

export const MODEL_META = {
  falcon_instruct: { display: 'Seren 7', html: 'Seren 7', desc: 'Everyday conversation. Balanced depth and speed.' },
  auto: { display: 'B2 Spiral', html: 'B2 Spiral', desc: 'One Falcon Instruct model, with local reasoning control.' },
};
