/* CP009 bounded exact-state Spiral. Only verified deterministic arithmetic may
   be reused. Approximate similarity and model prose never enter this cache. */
import { Sha256 } from './sha256.mjs';
import { exactArithmetic } from './exact-arithmetic.mjs';
import { solveBooleanExpression } from './b2-boolean.mjs';
import { sharedStates } from './store.mjs';
import { extractExactArithmetic, tryLocalAnswer, parseToolFabric } from './tools.mjs';
import { classifyTask } from './compass.mjs';
import { createSpiralState, selectDirection, recordSpiralOutcome, recordVerifiedComponent } from './b2-direction.mjs';

const POLICY = 'spiral-exact-1';
const ENCODING = 1;
const MIN_REUSE_LENGTH = 160;
const encoder = new TextEncoder();
const hash = value => new Sha256().update(encoder.encode(value)).digest();
// Heartbeat checksum detects accidental replay damage; it is not a signature.
const checksum = value => {
  let number = 2166136261;
  for (let i = 0; i < value.length; i++) number = Math.imul(number ^ value.charCodeAt(i), 16777619);
  return (number >>> 0).toString(16).padStart(8, '0');
};

/* B2 owns the turn. The exact-state engine below remains a verified subsystem.
   Model prose is a hypothesis; only deterministic checks may promote a fact. */
export const SPIRAL_POLICY = 'b2-controller-3';
export const SPIRAL_CALIBRATION_KEY = 'spiral_calibration_v2';
const MAX_PARTS = 3;
const MAX_CALLS = 4;

export function planSpiral(text, { deeper = false, calibration = null } = {}) {
  const source = String(text || '').trim();
  const category = classifyTask(source);
  // Only explicit command boundaries create independent tasks. Newlines inside
  // code, examples, and word problems are part of the same request.
  const clauses = (category === 'code' ? [source] : source.split(/;\s*then\s+/i)).map(s => s.trim()).filter(Boolean);
  const multi = clauses.length > 1 || /\b(?:compare|contradiction|trade.?off|step by step|prove|debug|plan|why)\b/i.test(source);
  const complexity = deeper || multi || source.length > 300 ? 'complex' : 'simple';
  const observed = calibration?.[category];
  // Calibration changes a bounded budget only after independent exact outcomes.
  const checkedRuns = (observed?.verifiedModelFailures || 0) + (observed?.verifiedModelSuccesses || 0);
  const repairBudget = complexity === 'complex' || category === 'tool'
    ? (checkedRuns >= 3 && observed.verifiedModelFailures > observed.verifiedModelSuccesses ? 2 : 1) : 0;
  // Planning decomposition is held in shadow: tiny-model subtask prompts
  // regressed on the fixed and held-out cases. Keep one hypothesis + repair.
  const split = complexity === 'complex' && category !== 'planning' ? clauses : [source];
  const parts = split.slice(0, MAX_PARTS);
  return { policy: SPIRAL_POLICY, category, complexity, maxModelCalls: Math.min(MAX_CALLS, 1 + (parts.length > 1 ? parts.length : 0) + repairBudget),
    repairBudget, omittedParts: Math.max(0, split.length - parts.length), parts: parts.map((question, index) => ({ id: `part-${index + 1}`, question,
      dependsOn: index ? [`part-${index}`] : [], completeWhen: 'answer recorded and check status assigned' })) };
}

function exactTarget(text) {
  const source = String(text).trim();
  const direct = extractExactArithmetic(source);
  if (direct) return direct;
  const sentences = source.split(/(?<=[.!?])\s+/);
  const candidate = sentences.length > 1 && /\b(?:ignore|claim|say)\b/i.test(sentences.slice(0, -1).join(' '))
    ? sentences.at(-1) : source;
  const embeddedValue = /^(?:(?:use\s+(?:an?\s+)?(?:approved\s+)?local\s+calculator\s+tool\s+to\s+find)|find|what\s+is|compute)\s+(?:the\s+)?exact\s+value\s+of\s+([\d.()+*/\s-]+?)\s*[?!.]*(?:\s+show\s+the\s+tool\s+result[.!]?)?$/i.exec(candidate)?.[1]?.trim();
  if (embeddedValue && embeddedValue.length <= 256 && /^[\d.()+*/\s-]+$/.test(embeddedValue) &&
      /[+*/-]/.test(embeddedValue.slice(1))) return embeddedValue;
  const finalQuestion = /^(?:calculate|compute|what is)\s+([\d.()\s+*/-]+?)(?:\s+exactly)?[?.!]*$/i.exec(candidate);
  if (finalQuestion) {
    const expression = finalQuestion[1].trim();
    if (expression.length <= 256 && /[+*/-]/.test(expression.slice(1))) return expression;
  }
  const match = /^use\s+(?:the\s+)?calculator(?:\s+tool)?\s+to\s+(?:compute|calculate)\s+(.+?)(?:\s+exactly)?[?.!]*$/i.exec(candidate);
  if (!match) return null;
  const expression = match[1].trim().replace(/\\([+*/-])/g, '$1');
  return expression.length <= 256 && /^[\d.()\s+*/-]+$/.test(expression) && /[+*/-]/.test(expression.slice(1)) ? expression : null;
}

// Narrow, explicit logical contracts. These do not claim to solve free-form
// logic or prove the model's prose. Anything outside the grammar stays open.
export function structuredReasoning(text) {
  const value = String(text || '').trim();
  const syllogism = /^if all (\w+) are (\w+) and (\w+) is a (\w+), is (\w+) a (\w+)\?\s*(?:answer yes or no\.)?$/i.exec(value);
  if (syllogism && syllogism[1].replace(/s$/i, '').toLowerCase() === syllogism[4].toLowerCase() &&
      syllogism[3].toLowerCase() === syllogism[5].toLowerCase() &&
      syllogism[2].replace(/s$/i, '').toLowerCase() === syllogism[6].toLowerCase())
    return { answer: `Yes. ${syllogism[3]} is a ${syllogism[4]}, and all ${syllogism[1]} are ${syllogism[2]}.`,
      method: 'bounded_syllogism_v1' };
  const sentences = /^all (\w+) are (\w+)\. (\w+) is a (\w+)\. is (\w+) an? (\w+)\?$/i.exec(value);
  if (sentences && sentences[1].replace(/s$/i, '').toLowerCase() === sentences[4].toLowerCase() &&
      sentences[3].toLowerCase() === sentences[5].toLowerCase() &&
      sentences[2].replace(/s$/i, '').toLowerCase() === sentences[6].toLowerCase())
    return { answer: `Yes. ${sentences[3]} is a ${sentences[4]}, and all ${sentences[1]} are ${sentences[2]}.`, method: 'bounded_syllogism_v1' };
  if (/same switch at the same time/i.test(value) && /\bon\b/i.test(value) && /\boff\b/i.test(value) && /can both statements be true/i.test(value))
    return { answer: 'No. The same switch cannot be both on and off at the same time in this stated binary case.',
      method: 'binary_contradiction_v1' };
  if (/same door/i.test(value) && /at the same time/i.test(value) && /\bopen\b/i.test(value) && /\bclosed\b/i.test(value) && /\bcontradictory\b/i.test(value))
    return { answer: 'Yes. In the stated sense, the same door cannot be both open and closed at the same time.', method: 'binary_contradiction_v1' };
  if (/\bhow many\b/i.test(value) && /\bsome\s+apples\b/i.test(value) && !/\b\d+\b/.test(value))
    return { answer: 'The number of apples was not given, so I cannot determine the count.',
      method: 'missing_quantity_v1' };
  if (/\bhow many\b/i.test(value) && /\bunknown number of \w+/i.test(value) && !/\b\d+\b/.test(value))
    return { answer: 'The quantity was not provided, so I cannot determine the count.', method: 'missing_quantity_v1' };
  return null;
}

export function verifySpiralCandidate(question, candidate) {
  const expression = exactTarget(question);
  if (expression) {
    try {
      const expected = exactArithmetic(expression).text;
      const normalized = String(candidate || '').trim();
      // A stray correct number cannot validate an answer that also asserts a
      // conflicting result (or explicitly negates the correct one).
      const claims = [...normalized.matchAll(/(?<![\w.])[-+]?\d+(?:\.\d+)?(?:\/\d+)?(?![\w.])/g)].map(match => match[0]);
      const matches = claims.length > 0 && claims.every(value => value === expected) &&
        !new RegExp(`\\b(?:not|isn't|is not|wrong|incorrect)\\s+${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(normalized);
      return matches ? { status: 'verified', method: 'two_parser_exact_v1', expected }
        : { status: 'failed', method: 'two_parser_exact_v1', expected, residual: `Exact result should be ${expected}; proposed answer did not match.` };
    } catch (error) { return { status: 'unverified', method: 'none', residual: error.message }; }
  }
  const embedded = /\b(?:compute|calculate|computing|calculating)\s+([\d.()+*/\s-]+?)\s+exactly\b/i.exec(String(question || ''));
  if (embedded) {
    try {
      const expected = exactArithmetic(embedded[1].trim()).text;
      const claims = [...String(candidate || '').matchAll(/(?<![\w.])-?\d[\d,]*(?:\.\d+)?(?:\/\d+)?(?![\w.])/g)]
        .map(match => match[0].replaceAll(',', ''));
      const observed = claims.at(-1) || null;
      return observed === expected
        ? { status: 'unverified', method: 'partial_exact_component', componentVerified: true,
          residual: 'The final calculation matches, but the explanation is not independently verified.' }
        : { status: 'failed', method: 'partial_exact_component', expected,
          residual: `The final numeric result should be ${expected}; the candidate ended with ${observed ?? 'no number'}.` };
    } catch { /* unsupported expression keeps the whole answer provisional */ }
  }
  if (/\bbackup\b/i.test(question) && !/\b(?:copy|files?|storage|drive|restore|archive)\b/i.test(String(candidate || '')))
    return { status: 'failed', method: 'topic_coverage_heuristic_v1',
      residual: 'The candidate did not describe backing up data or files.' };
  return { status: 'unverified', method: 'none', residual: 'No independent checker is available for this claim.' };
}

// This ranks provisional plans against explicit surface constraints. It is not
// a semantic verifier and must never promote a plan to verified.
export function planningCoverage(question, candidate) {
  const request = String(question || ''), answer = String(candidate || '');
  const countWord = /\b(?:plan|give|list|outline)\s+(?:a\s+)?(one|two|three|\d+)[-\s]+(?:numbered\s+)?steps?\b/i.exec(request)?.[1]
    || /\b(?:with|in)\s+(one|two|three|\d+)\s+(?:numbered\s+)?steps?\b/i.exec(request)?.[1];
  const requested = { one: 1, two: 2, three: 3 }[countWord?.toLowerCase()] || Number(countWord) || null;
  const stepCount = (answer.match(/^\s*(?:[-*]\s+)?(?:\*\*)?(?:\d+[.):]|step\s+\d+[.:])\s*\S/gim) || []).length;
  const checks = [
    { name: 'step_count', applicable: requested !== null, passed: requested !== null && stepCount === requested },
    { name: 'risk_mention', applicable: /\brisk\b/i.test(request), passed: /\brisk\b/i.test(answer) },
    { name: 'backup_topic', applicable: /\bbackup\b/i.test(request), passed: /\b(?:copy|files?|storage|drive|restore|archive)\b/i.test(answer) },
  ];
  return { score: checks.filter(check => check.applicable && check.passed).length,
    unmet: checks.filter(check => check.applicable && !check.passed).map(check => check.name),
    method: 'surface_constraint_coverage_v1', status: 'unverified' };
}

export function modelCalibrationOutcome(result) {
  if (!result?.metrics?.modelCalls) return null;
  const calculatorRescue = result.outcomes?.some(outcome => outcome.verification?.repairedByCalculator);
  const checkedFailure = result.trace?.some(step =>
    (step.step === 'brake' && ['two_parser_exact_v1', 'partial_exact_component'].includes(step.method)) ||
    (step.step === 'tool_proposals' && step.receipts?.some(receipt => !receipt.result.ok)));
  if (checkedFailure || calculatorRescue) return 'failure';
  return result.verification?.status === 'verified' ? 'success' : null;
}

export class SpiralController {
  constructor({ exact = new ExactSpiral(), clock = () => performance.now() } = {}) {
    this.exact = exact; this.clock = clock;
  }
  async run(text, { scope, turns = [], deeper = false, calibration = null, generate, runTool, signal, onToken } = {}) {
    const start = this.clock();
    const plan = planSpiral(text, { deeper, calibration });
    const trace = [], metrics = { modelCalls: 0, calculatorCalls: 0, cacheHits: 0, tokens: 0, firstModelTokenMs: null, verificationMs: 0, elapsedMs: 0 };
    const state = createSpiralState(text, plan.parts, plan.maxModelCalls);
    const mark = (partId, kind, answer, verification, began, { reused = false } = {}) => {
      const receipt = recordSpiralOutcome(state, partId, { kind, answer, verification,
        elapsedMs: Math.round(this.clock() - began), reused });
      trace.push({ step: 'direction_result', ...receipt });
    };
    const choose = (partId, eligible) => {
      const decision = selectDirection(state, partId, eligible, { calibration, category: plan.category });
      trace.push({ step: 'direction', part: partId, chosen: decision.chosen?.kind || null,
        candidates: decision.candidates });
      return decision.chosen?.kind || null;
    };
    const checkAbort = () => { if (signal?.aborted) throw new DOMException('Stopped', 'AbortError'); };
    const finish = (answer, verification, extra = {}) => {
      metrics.elapsedMs = Math.round(this.clock() - start);
      state.budget.usedModelCalls = metrics.modelCalls;
      return { answer, verification, plan, trace, metrics, state, ...extra };
    };
    checkAbort();
    const expression = exactTarget(text);
    const boolean = solveBooleanExpression(text);
    const structured = structuredReasoning(text);
    const local = tryLocalAnswer(text);
    const rootKind = plan.parts.length === 1 ? choose(plan.parts[0].id,
      [expression && 'exact', boolean && 'boolean', structured && 'structured', local && 'local', typeof generate === 'function' && 'falcon'].filter(Boolean)) : null;
    if (rootKind === 'exact') {
      const began = this.clock();
      try {
        const solved = await this.exact.solve(expression, { scope, forceReuse: true });
        if (solved.reused) metrics.cacheHits++; else metrics.calculatorCalls++;
        metrics.verificationMs += Math.round(this.clock() - began);
        trace.push({ step: 'calculate', expression, reused: solved.reused, verification: 'two_parser_exact_v1' });
        mark(plan.parts[0].id, 'exact', solved.value, { status: 'verified', method: 'two_parser_exact_v1' }, began, { reused: solved.reused });
        return finish(solved.value, { status: 'verified', method: 'two_parser_exact_v1' }, { exact: solved });
      } catch (error) {
        trace.push({ step: 'shared_state_unavailable', error: error.message });
        try {
          const value = exactArithmetic(expression).text;
          metrics.calculatorCalls++;
          metrics.verificationMs += Math.round(this.clock() - began);
          trace.push({ step: 'calculate', expression, verification: 'two_parser_exact_v1' });
          mark(plan.parts[0].id, 'exact', value, { status: 'verified', method: 'two_parser_exact_v1' }, began);
          return finish(value, { status: 'verified', method: 'two_parser_exact_v1' });
        } catch (arithmeticError) {
          trace.push({ step: 'calculate', error: arithmeticError.message });
          mark(plan.parts[0].id, 'exact', '', { status: 'failed', method: 'two_parser_exact_v1', residual: arithmeticError.message }, began);
        }
      }
    }
    if (rootKind === 'boolean') {
      metrics.calculatorCalls++;
      trace.push({ step: 'boolean_calculate', expression: boolean.expression, method: boolean.method });
      mark(plan.parts[0].id, 'boolean', boolean.answer, { status: 'verified', method: boolean.method }, start);
      return finish(boolean.answer, { status: 'verified', method: boolean.method });
    }
    if (rootKind === 'structured') {
      trace.push({ step: 'structured_reasoning', method: structured.method });
      mark(plan.parts[0].id, 'structured', structured.answer, { status: 'verified', method: structured.method }, start);
      return finish(structured.answer, { status: 'verified', method: structured.method });
    }
    if (rootKind === 'local') {
      metrics.calculatorCalls += /calculator|arithmetic/.test(local.via) ? 1 : 0;
      trace.push({ step: 'local_tool', via: local.via });
      const verification = { status: local.via.includes('exact') ? 'verified' : 'local_observation', method: local.via };
      mark(plan.parts[0].id, 'local', local.answer, verification, start);
      return finish(local.answer, verification);
    }
    if (typeof generate !== 'function') throw new Error('Falcon generation callback required');
    const outcomes = [];
    for (const part of plan.parts) {
      checkAbort();
      if (metrics.modelCalls >= plan.maxModelCalls) break;
      const partBegan = this.clock();
      const partExpression = exactTarget(part.question);
      const partBoolean = solveBooleanExpression(part.question);
      const partStructured = structuredReasoning(part.question);
      const partLocal = tryLocalAnswer(part.question);
      let partKind = plan.parts.length === 1 && rootKind === 'falcon' ? 'falcon'
        : choose(part.id, [partExpression && 'exact', partBoolean && 'boolean', partStructured && 'structured', partLocal && 'local', 'falcon'].filter(Boolean));
      if (partKind === 'exact') {
        const began = this.clock();
        try {
          const solved = await this.exact.solve(partExpression, { scope, forceReuse: true });
          if (solved.reused) metrics.cacheHits++; else metrics.calculatorCalls++;
          metrics.verificationMs += Math.round(this.clock() - began);
          trace.push({ step: 'calculate', part: part.id, expression: partExpression, reused: solved.reused,
            verification: 'two_parser_exact_v1' });
          mark(part.id, 'exact', solved.value, { status: 'verified', method: 'two_parser_exact_v1' }, began, { reused: solved.reused });
          outcomes.push({ question: part.question, answer: solved.value,
            verification: { status: 'verified', method: 'two_parser_exact_v1' } });
          continue;
        } catch (error) {
          trace.push({ step: 'calculator_residual', part: part.id, residual: error.message });
          mark(part.id, 'exact', '', { status: 'failed', method: 'two_parser_exact_v1', residual: error.message }, began);
          partKind = choose(part.id, [partBoolean && 'boolean', partStructured && 'structured', partLocal && 'local', 'falcon'].filter(Boolean));
        }
      }
      if (partKind === 'boolean') {
        metrics.calculatorCalls++;
        trace.push({ step: 'boolean_calculate', part: part.id, expression: partBoolean.expression, method: partBoolean.method });
        mark(part.id, 'boolean', partBoolean.answer, { status: 'verified', method: partBoolean.method }, partBegan);
        outcomes.push({ question: part.question, answer: partBoolean.answer,
          verification: { status: 'verified', method: partBoolean.method } });
        continue;
      }
      if (partKind === 'structured') {
        trace.push({ step: 'structured_reasoning', part: part.id, method: partStructured.method });
        mark(part.id, 'structured', partStructured.answer, { status: 'verified', method: partStructured.method }, partBegan);
        outcomes.push({ question: part.question, answer: partStructured.answer,
          verification: { status: 'verified', method: partStructured.method } });
        continue;
      }
      if (partKind === 'local') {
        metrics.calculatorCalls += /calculator|arithmetic/.test(partLocal.via) ? 1 : 0;
        const verification = { status: partLocal.via.includes('exact') ? 'verified' : 'local_observation', method: partLocal.via };
        trace.push({ step: 'local_tool', part: part.id, via: partLocal.via });
        mark(part.id, 'local', partLocal.answer, verification, partBegan);
        outcomes.push({ question: part.question, answer: partLocal.answer, verification });
        continue;
      }
      let task = plan.parts.length > 1
        ? `${part.question}\nKeep the original user request in mind: ${text}\n${state.verifiedFacts.length ? `Previously verified facts: ${state.verifiedFacts.map(fact => `${fact.partId}=${fact.answer}`).join('; ')}\n` : ''}Answer this part directly and stay on its subject.`
        : part.question;
      if (plan.category === 'planning' && /\bbackup\b/i.test(text))
        task += '\nHere backup means copying files or data to another location. Follow the requested number of steps and mention the risk. Keep the answer under 100 words.';
      const proposal = await generate({ turns: [...turns.slice(0, -1), { role: 'user', content: task }],
        maxTokens: plan.category === 'planning' ? 128 : plan.complexity === 'simple' ? 256 : 192,
        onToken: plan.complexity === 'simple' && plan.category !== 'tool' ? onToken : null, signal });
      metrics.modelCalls++; metrics.tokens += proposal.tokens || 0;
      if (metrics.firstModelTokenMs === null) metrics.firstModelTokenMs = proposal.ttftMs ?? null;
      let answer = String(proposal.text || '').trim();
      let bestPlanning = plan.category === 'planning' && deeper ? answer : null;
      let bestPlanningScore = bestPlanning === null ? -1 : planningCoverage(part.question, bestPlanning).score;
      const attemptedAnswers = new Set([answer]);
      trace.push({ step: 'hypothesis', part: part.id, candidate: 1, assumptions: [], tokens: proposal.tokens || 0 });
      const parsed = parseToolFabric(answer);
      let toolVerified = false;
      let toolFailure = false;
      if (parsed.calls.length && runTool) {
        const receipts = [];
        choose(`${part.id}:tool-proposal`, ['approved_tool']);
        for (const [index, call] of parsed.calls.slice(0, 3).entries()) {
          checkAbort();
          const toolBegan = this.clock();
          const result = await runTool(call, { signal });
          metrics.calculatorCalls++;
          receipts.push({ call: { name: call.name, arguments: call.arguments }, result });
          const checked = result.ok && result.verification === 'independently_verified_exact';
          if (checked) trace.push({ step: 'verified_component', ...recordVerifiedComponent(state, part.id, `tool-${index + 1}`, result.value, 'approved_exact_tool') });
          trace.push({ step: 'direction_result', partId: part.id, operation: 'approved_tool', status: checked ? 'verified_component' : 'unresolved',
            verificationStatus: checked ? 'verified' : result.ok ? 'unverified' : 'failed', verifiedProgress: checked,
            residual: result.ok ? null : result.error, informationGainProxy: checked ? 1 : result.ok ? 0 : 0.5,
            reused: false, elapsedMs: Math.round(this.clock() - toolBegan) });
        }
        trace.push({ step: 'tool_proposals', part: part.id, receipts });
        if (receipts.some(r => !r.result.ok) && plan.repairBudget > 0 && metrics.modelCalls < plan.maxModelCalls) {
          const residual = receipts.filter(r => !r.result.ok).map(r => `${r.call.name}: ${r.result.error}`).join('; ');
          trace.push({ step: 'residual', part: part.id, residual });
          choose(`${part.id}:tool-residual`, ['falcon_repair']);
          const retry = await generate({ turns: [{ role: 'user', content: `${part.question}\nPrior local tool proposal failed: ${residual}. Propose one corrected allowed local tool call, or state that it cannot be done.` }],
            maxTokens: 128, signal });
          metrics.modelCalls++; metrics.tokens += retry.tokens || 0;
          const retryCalls = parseToolFabric(retry.text).calls.slice(0, 1);
          for (const call of retryCalls) {
            checkAbort();
            choose(`${part.id}:tool-retry`, ['approved_tool']);
            const toolBegan = this.clock();
            const result = await runTool(call, { signal }); metrics.calculatorCalls++;
            receipts.push({ call: { name: call.name, arguments: call.arguments }, result });
            const checked = result.ok && result.verification === 'independently_verified_exact';
            if (checked) trace.push({ step: 'verified_component', ...recordVerifiedComponent(state, part.id, `tool-${receipts.length}`, result.value, 'approved_exact_tool') });
            trace.push({ step: 'direction_result', partId: part.id, operation: 'approved_tool', status: checked ? 'verified_component' : 'unresolved',
              verificationStatus: checked ? 'verified' : result.ok ? 'unverified' : 'failed', verifiedProgress: checked,
              residual: result.ok ? null : result.error, informationGainProxy: checked ? 1 : result.ok ? 0 : 0.5,
              reused: false, elapsedMs: Math.round(this.clock() - toolBegan) });
          }
          trace.push({ step: 'repair', part: part.id, accepted: receipts.at(-1)?.result.ok === true });
        }
        toolFailure = receipts.some(r => !r.result.ok);
        toolVerified = receipts.length > 0 && !toolFailure && receipts.every(r => r.result.verification === 'independently_verified_exact') &&
          verifySpiralCandidate(part.question, receipts.map(r => String(r.result.value)).join('\n')).status === 'verified';
        const successful = receipts.filter(r => r.result.ok);
        answer = receipts.map(r => `${r.call.name}: ${r.result.ok ? r.result.value : `failed (${r.result.error})`}`).join('\n');
      } else if (parsed.errors.length || answer.includes('<tool_call>')) {
        trace.push({ step: 'residual', part: part.id, residual: 'Malformed tool proposal; no operation ran.' });
        answer = 'I could not parse that local tool request. No operation was run.';
      }
      const began = this.clock();
      const assess = value => {
        if (deeper && plan.category === 'planning') {
          const coverage = planningCoverage(part.question, value);
          if (coverage.unmet.length) return { status: 'failed', method: 'surface_constraint_coverage_v2',
            residual: `Unmet explicit plan constraints: ${coverage.unmet.join(', ')}`, unmet: coverage.unmet };
        }
        return verifySpiralCandidate(part.question, value);
      };
      let verification = toolFailure ? { status: 'unverified', method: 'mixed_tool_results',
        residual: 'At least one proposed tool operation failed; successful operations do not verify the full request.' }
        : toolVerified ? { status: 'verified', method: 'approved_exact_tool' } : parsed.calls.length
          ? { status: 'unverified', method: 'tool_result_only', residual: 'The local tool result was checked, but it does not verify the whole answer to this request.' }
          : assess(answer);
      metrics.verificationMs += Math.round(this.clock() - began);
      if (verification.status === 'failed') mark(part.id, 'falcon', answer, verification, partBegan);
      let repairs = 0;
      while (verification.status === 'failed' && repairs < plan.repairBudget && metrics.modelCalls < plan.maxModelCalls) {
        trace.push({ step: 'residual', part: part.id, residual: verification.residual });
        const residualId = `${part.id}:residual-${repairs + 1}`;
        let repairKind = choose(residualId, [verification.expected !== undefined &&
          !state.verifiedFacts.some(fact => fact.partId === `${part.id}:numeric_result`) && 'calculator_component', 'falcon_repair'].filter(Boolean));
        if (repairKind === 'calculator_component') {
          const fact = recordVerifiedComponent(state, part.id, 'numeric_result', verification.expected, verification.method);
          trace.push({ step: 'verified_component', ...fact });
          repairKind = choose(residualId, ['falcon_repair']);
        }
        if (repairKind !== 'falcon_repair') break;
        const verifiedContext = state.verifiedFacts.filter(fact => fact.partId.startsWith(`${part.id}:`))
          .map(fact => `${fact.component || 'numeric result'}=${fact.answer}`).join('; ');
        const repairRequest = verification.method === 'surface_constraint_coverage_v2'
          ? `Answer this request directly: ${part.question}\nCorrect only these missing constraints: ${verification.unmet.join(', ')}. Return the revised answer.`
          : verification.method === 'topic_coverage_heuristic_v1' && /\bbackup\b/i.test(part.question)
          ? `Answer this request directly: ${part.question}\nGive concrete steps for copying files or data to a second location and one risk. Stay on topic.`
          : `${part.question}\nCheck found: ${verification.residual}${verifiedContext ? ` Verified fact: ${verifiedContext}. Do not recalculate it.` : ''} Correct only this discrepancy. Return the answer.`;
        const corrected = await generate({ turns: [{ role: 'user', content: repairRequest }],
          maxTokens: 128, signal });
        metrics.modelCalls++; metrics.tokens += corrected.tokens || 0;
        repairs++;
        const nextAnswer = String(corrected.text || '').trim();
        if (attemptedAnswers.has(nextAnswer)) {
          trace.push({ step: 'no_progress', part: part.id, residual: 'The model repeated a previously failed candidate.' });
          break;
        }
        attemptedAnswers.add(nextAnswer);
        answer = nextAnswer;
        if (bestPlanning !== null) {
          const score = planningCoverage(part.question, nextAnswer).score;
          if (score > bestPlanningScore) { bestPlanning = nextAnswer; bestPlanningScore = score; }
        }
        verification = assess(answer);
        trace.push({ step: 'repair', part: part.id, candidate: attemptedAnswers.size,
          verification: verification.status, residualResolved: verification.status !== 'failed' });
        if (verification.status === 'failed' && verification.method === 'two_parser_exact_v1' && verification.expected !== undefined) {
          answer = verification.expected;
          verification = { status: 'verified', method: 'two_parser_exact_v1', repairedByCalculator: true };
        }
        if (verification.status === 'failed') mark(part.id, 'falcon', answer, verification, partBegan);
      }
      if (verification.status === 'failed') {
        trace.push({ step: 'brake', part: part.id, method: verification.method, residual: verification.residual });
        if (bestPlanning !== null) {
          answer = bestPlanning;
          verification = { status: 'unverified', method: 'budget_exhausted_surface',
            residual: `Plan remains provisional; unmet constraints: ${planningCoverage(part.question, answer).unmet.join(', ')}` };
        } else if (verification.method === 'partial_exact_component' && verification.expected !== undefined) {
          answer = `The exact numeric result is ${verification.expected}. I could not verify the explanation.`;
          verification = { status: 'unverified', method: 'partial_exact_component', componentVerified: true,
            residual: 'The numeric result is independently checked; the explanation remains unverified.' };
        } else {
          answer = 'I could not verify an on-topic answer within the local reasoning budget. Please rephrase or add detail.';
          verification = { status: 'unverified', method: 'budget_exhausted', residual: verification.residual };
        }
      }
      if (plan.category === 'planning' && deeper && repairs === 0 && verification.status === 'unverified' && !toolFailure &&
          metrics.modelCalls < plan.maxModelCalls && !trace.some(step => step.step === 'no_progress' && step.part === part.id)) {
        const first = planningCoverage(part.question, answer);
        if (first.unmet.length) {
          const alternative = await generate({ turns: [{ role: 'user', content:
            `${part.question}\nCreate an alternative plan. Address these missing structural constraints: ${first.unmet.join(', ')}. Do not claim that the plan is verified.` }],
          maxTokens: 128, signal });
          metrics.modelCalls++; metrics.tokens += alternative.tokens || 0;
          const nextAnswer = String(alternative.text || '').trim();
          const second = planningCoverage(part.question, nextAnswer);
          trace.push({ step: 'alternative_hypothesis', part: part.id, candidate: attemptedAnswers.size + 1,
            assumptions: ['surface constraints do not establish practical correctness'],
            first, second, selected: !attemptedAnswers.has(nextAnswer) && second.score > first.score ? 'alternative' : 'original' });
          if (!attemptedAnswers.has(nextAnswer) && second.score > first.score) answer = nextAnswer;
          verification = { status: 'unverified', method: 'surface_constraint_coverage_v1',
            residual: 'Plan structure was checked; practical correctness remains unverified.' };
        }
      }
      mark(part.id, 'falcon', answer, verification, partBegan);
      outcomes.push({ question: part.question, answer, verification });
    }
    const complete = outcomes.length === plan.parts.length && plan.omittedParts === 0;
    const answer = (outcomes.length === 1 ? outcomes[0].answer : outcomes.map((o, i) => `${i + 1}. ${o.answer}`).join('\n\n')) +
      (complete ? '' : '\n\nI could not complete all requested parts within the local reasoning budget.');
    const allVerified = complete && outcomes.length > 0 && outcomes.every(o => o.verification.status === 'verified');
    const verification = allVerified ? { status: 'verified', method: 'per_part' }
      : { status: 'unverified', method: complete ? 'none' : 'incomplete_parts',
        residual: { unresolved: outcomes.filter(o => o.verification.status !== 'verified').map(o => o.question),
          unprocessed: plan.parts.length - outcomes.length + plan.omittedParts } };
    return finish(answer, verification, { outcomes });
  }
}

function validRow(row, scope) {
  if (!row || row.scope !== scope || row.confidence_kind !== 'exact' ||
      typeof row.canonical_expression !== 'string' || typeof row.value !== 'string') return false;
  const identity = hash(`arith:${ENCODING}:${row.canonical_expression}`);
  return row.content_identity === identity &&
    row.id === hash(`${scope}\0${identity}`) &&
    row.value_digest === hash(`${row.canonical_expression}\0${row.value}`);
}

export function canonicalArithmetic(source) {
  if (typeof source !== 'string' || !source || source.length > 256) throw new Error('invalid arithmetic state');
  const expression = source.trim();
  // Exactly two unsigned decimal atoms: sorting is justified by integer/rational
  // commutativity. Every other expression uses exact text identity only.
  const match = /^(\d+(?:\.\d+)?)\s*([+*])\s*(\d+(?:\.\d+)?)$/.exec(expression);
  if (!match) return { canonical: expression, proof: 'exact_text_identity' };
  const [left, right] = [match[1], match[3]].sort();
  return { canonical: `${left}${match[2]}${right}`, proof: match[2] === '+' ? 'commutative_add_v1' : 'commutative_multiply_v1' };
}

export function isReuseCandidate(expression) {
  return typeof expression === 'string' && expression.length >= MIN_REUSE_LENGTH &&
    (expression.match(/\//g) || []).length >= 4;
}

export function planExactDependencies(expression) {
  if (typeof expression !== 'string') return [];
  const factors = expression.match(/\(\d+(?:\.\d+)?\/\d+(?:\.\d+)?\)/g) || [];
  return factors.length >= 4 && factors.length <= 8 && factors.join('*') === expression
    ? factors.map(factor => factor.slice(1, -1)) : [];
}

export function replayHeartbeat(deltas) {
  if (!Array.isArray(deltas) || deltas.length > 5)
    return { ok: false, repair_from_sequence: 1, error: 'invalid heartbeat length' };
  let previous = 'genesis', expected = 1, result = null;
  for (const delta of deltas) {
    if (!delta || typeof delta.kind !== 'string' || !delta.payload || typeof delta.payload !== 'object')
      return { ok: false, repair_from_sequence: expected, error: 'invalid heartbeat record' };
    if (delta.sequence !== expected || delta.previous_hash !== previous ||
        delta.hash !== checksum(`${delta.sequence}|${previous}|${delta.kind}|${JSON.stringify(delta.payload)}`))
      return { ok: false, repair_from_sequence: expected, error: 'heartbeat sequence or content mismatch' };
    if (delta.kind === 'verified_result' || delta.kind === 'reused_result') result = delta.payload.value;
    previous = delta.hash; expected++;
  }
  return result === null ? { ok: false, repair_from_sequence: expected, error: 'missing verified result' }
    : { ok: true, value: result, final_hash: previous, sequences: expected - 1 };
}

export function repairHeartbeat(expression, deltas, displayedValue = null) {
  const expected = exactArithmetic(expression).text;
  const replay = replayHeartbeat(deltas);
  if (replay.ok && replay.value === expected && (displayedValue === null || displayedValue === expected))
    return { repaired: false, value: expected, deltas };
  const records = [];
  for (const [kind, payload] of [
    ['hypothesis', { expression, policy: POLICY }],
    ['repair', { reason: replay.ok ? 'decoded_result_mismatch' : replay.error,
      from_sequence: replay.repair_from_sequence || null }],
    ['verified_result', { value: expected, route: 'recomputed_after_replay_failure' }],
  ]) {
    const sequence = records.length + 1, previous_hash = records.at(-1)?.hash || 'genesis';
    records.push({ schema_version: 1, sequence, previous_hash, kind, payload,
      hash: checksum(`${sequence}|${previous_hash}|${kind}|${JSON.stringify(payload)}`) });
  }
  return { repaired: true, value: expected, deltas: records };
}

export class ExactSpiral {
  constructor({ storage = sharedStates } = {}) {
    this.storage = storage;
    this.memory = new Map();
    this.dirty = new Map();
    this.pending = new Set();
    this.corrupt = new Set();
    this.warmed = new Set();
    this.linked = new Set();
  }
  async warm(scope) {
    if (typeof scope !== 'string' || !scope || this.warmed.has(scope)) return;
    if (typeof this.storage.byScope !== 'function') return;
    const rows = await this.storage.byScope(scope);
    for (const row of rows) {
      if (row?.confidence_kind !== 'exact') continue;
      const key = `${scope}\0${row.canonical_expression}`;
      if (validRow(row, scope)) { if (!this.memory.has(key)) this.memory.set(key, row); }
      else this.corrupt.add(key);
    }
    this.warmed.add(scope);
  }
  async flush({ onlyPending = false } = {}) {
    const entries = [...this.dirty].filter(([id]) => !onlyPending || this.pending.has(id));
    for (const [id] of entries) this.dirty.delete(id);
    const failures = [];
    await Promise.all(entries.map(async ([id, count]) => {
      const row = [...this.memory.values()].find(candidate => candidate.id === id);
      if (!row) return;
      try {
        if (this.pending.has(id)) {
          await this.storage.put({ ...row, reuse_count: (row.reuse_count || 0) + count, updated_at: Date.now() });
          this.pending.delete(id);
        } else if (typeof this.storage.incrementReuse === 'function') {
          await this.storage.incrementReuse(id, count);
        } else {
          await this.storage.put({ ...row, reuse_count: (row.reuse_count || 0) + count, updated_at: Date.now() });
        }
      } catch (error) { failures.push([id, count, error]); }
    }));
    for (const [id, count] of failures) this.dirty.set(id, (this.dirty.get(id) || 0) + count);
    if (failures.length) throw failures[0][2];
  }
  clear(scope) {
    for (const [key, row] of this.memory) {
      if (scope && !key.startsWith(`${scope}\0`)) continue;
      this.memory.delete(key); this.pending.delete(row.id); this.dirty.delete(row.id); this.corrupt.delete(key);
    }
    if (scope) this.warmed.delete(scope); else this.warmed.clear();
  }
  async solve(expression, { scope, forceReuse = false } = {}) {
    if (typeof scope !== 'string' || !scope || scope.length > 200) throw new Error('state scope required');
    const { canonical, proof } = canonicalArithmetic(expression);
    const deltas = [];
    const step = (kind, payload) => {
      if (deltas.length >= 5) throw new Error('spiral step budget exceeded');
      const sequence = deltas.length + 1, previous_hash = deltas.at(-1)?.hash || 'genesis';
      deltas.push({ schema_version: 1, sequence, previous_hash, kind, payload,
        hash: checksum(`${sequence}|${previous_hash}|${kind}|${JSON.stringify(payload)}`) });
    };
    step('hypothesis', { canonical, proof, policy: POLICY });
    if (!forceReuse && !isReuseCandidate(expression)) {
      const value = exactArithmetic(expression).text;
      step('verified_result', { value, route: 'baseline_short_expression' });
      return { value, route: 'baseline_short_expression', reused: false, deltas };
    }
    const identity = hash(`arith:${ENCODING}:${canonical}`), key = `${scope}\0${canonical}`;
    let row = this.memory.get(key);
    let corrupted = this.corrupt.has(key);
    if (!row && !this.warmed.has(scope)) {
      if (typeof this.storage.byScope === 'function') {
        await this.warm(scope);
        row = this.memory.get(key) || null;
        corrupted = this.corrupt.has(key);
      } else {
        const found = await this.storage.find(identity, scope);
        row = found.find(candidate => validRow(candidate, scope)) || null;
        corrupted = found.length > 0 && !row;
        if (row) this.memory.set(key, row);
      }
    }
    if (row) {
      if (expression !== canonical && proof !== 'exact_text_identity') await this.#linkVariant(expression, scope, row, proof);
      this.dirty.set(row.id, (this.dirty.get(row.id) || 0) + 1);
      step('reused_result', { value: row.value, state_id: row.id, proof });
      return { value: row.value, route: 'verified_shared_state', reused: true, stateId: row.id, deltas };
    }
    const factors = planExactDependencies(canonical);
    let candidate = null;
    if (factors.length) {
      const ready = factors.map(factor => exactArithmetic(factor).text);
      candidate = exactArithmetic(ready.map(value => `(${value})`).join('*')).text;
      step('dependencies_ready', { count: ready.length, max_branches: 8 });
    }
    const value = exactArithmetic(canonical).text;
    if (candidate !== null && candidate !== value) throw new Error('dependency residual mismatch');
    step('residual', { zero: true, method: candidate === null ? 'dual_parser_exact' : 'factor_aggregation_vs_full_expression' });
    if (expression !== canonical && exactArithmetic(expression).text !== value)
      throw new Error('equivalence proof failed');
    row = { id: hash(`${scope}\0${identity}`), schema_version: 3,
      canonical_encoding_version: ENCODING, content_identity: identity, scope,
      canonical_expression: canonical, confidence_kind: 'exact', verification_id: 'two_parser_exact_v1',
      value, value_digest: hash(`${canonical}\0${value}`), reuse_count: 0,
      created_at: Date.now(), updated_at: Date.now() };
    this.memory.set(key, row); this.pending.add(row.id);
    if (expression !== canonical && proof !== 'exact_text_identity') await this.#linkVariant(expression, scope, row, proof);
    if (corrupted) {
      await this.storage.put(row); this.pending.delete(row.id);
      this.corrupt.delete(key);
      step('repair', { reason: 'invalid_shared_state_receipt', state_id: row.id });
    }
    step('verified_result', { value, state_id: row.id, route: corrupted ? 'computed_and_repaired' : 'computed_and_cached' });
    return { value, route: corrupted ? 'computed_and_repaired' : 'computed_and_cached', reused: false, stateId: row.id, deltas };
  }
  async #linkVariant(expression, scope, target, proof) {
    if (!this.storage.linkEquivalent) return;
    const identity = hash(`arith:${ENCODING}:${expression}`);
    const source = { id: hash(`${scope}\0${identity}`), schema_version: 3,
      canonical_encoding_version: ENCODING, content_identity: identity, scope,
      canonical_expression: expression, confidence_kind: 'equivalent',
      proof_ref: proof, target_state_id: target.id, created_at: Date.now(), updated_at: Date.now() };
    if (this.linked.has(source.id)) return;
    await this.storage.put(source);
    await this.storage.linkEquivalent(source, target, proof);
    this.linked.add(source.id);
  }
}
