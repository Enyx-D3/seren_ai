/* Seren 7 Compass conservative policy. The CP006/CP007 browser evidence did
   not qualify a specialist for automatic promotion. Classification is an
   explanation signal only; manual specialist selection remains explicit. */
export const COMPASS_POLICY_VERSION = 'compass-conservative-1';
export const SPECIALISTS = ['falcon_instruct', 'falcon_reason', 'falcon_coder', 'falcon_tools'];

export function classifyTask(text) {
  const value = String(text || '');
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
  const modelId = selected === 'auto'
    ? ready.has('falcon_instruct') ? 'falcon_instruct' : null
    : ready.has(selected) ? selected : null;
  const maxTokens = selected === 'falcon_tools' ? 64 : opts.think ? 512 : 256;
  return {
    modelId,
    category,
    policyVersion: COMPASS_POLICY_VERSION,
    mode: selected === 'auto' ? 'conservative_fallback' : 'manual',
    reason: selected === 'auto'
      ? modelId ? `No specialist route passed the CP007 correctness and latency gate; Instruct remains the verified fallback for ${category}.`
        : 'Instruct is unavailable; import its verified GGUF to use Auto.'
      : modelId ? `Manually selected ${selected} for ${category}.` : `Selected ${selected} is unavailable in this browser.`,
    budget: { maxTokens, activeModels: modelId ? 1 : 0 },
  };
}

export const MODEL_META = {
  falcon_instruct: { display: 'Seren 7', html: 'Seren 7', desc: 'Everyday conversation. Balanced depth and speed.' },
  falcon_reason: { display: 'Seren 7 Reasoning', html: 'Seren 7 <i>Reasoning</i>', desc: 'Careful multi-step and why-counting work.' },
  falcon_coder: { display: 'Seren 7 Coder', html: 'Seren 7 <i>Coder</i>', desc: 'Code and raw continuation.' },
  falcon_tools: { display: 'Seren 7 Tools', html: 'Seren 7 <i>Tools</i>', desc: 'Structured operations and tool calls.' },
  auto: { display: 'Auto', html: 'Auto', desc: 'Conservative Instruct route until a specialist passes measured promotion gates.' },
};
