export const RUNTIME_CONTEXT_TOKENS = 4096;
export const MAX_GENERATION_TOKENS = 1024;

export function boundedGenerationBudget(requested, promptTokens, contextTokens = RUNTIME_CONTEXT_TOKENS) {
  if (!Number.isSafeInteger(promptTokens) || promptTokens < 0) throw new Error('invalid prompt token count');
  if (!Number.isSafeInteger(contextTokens) || contextTokens < 2) throw new Error('invalid runtime context limit');
  const available = contextTokens - promptTokens - 1;
  if (available < 1) throw new Error(`prompt exceeds the ${contextTokens}-token runtime context`);
  const value = Number(requested);
  const wanted = Number.isFinite(value) && value > 0 ? Math.floor(value) : MAX_GENERATION_TOKENS;
  return Math.min(MAX_GENERATION_TOKENS, Math.max(1, wanted), available);
}
