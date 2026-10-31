/* Seren 7 browser shell. Every answer is either a labelled deterministic local
   calculation or tokens from the verified GGUF running in the WASM Worker. */
import { init, conv, msg, models, modelFile, kv, events, toolCalls, exportAllConversations, importConversations, deleteAllConversations, factoryReset, storageEstimate } from './store.mjs';
import { SPECIALISTS, MODEL_META } from './compass.mjs';
import { buildChatPrompt } from './prompts.mjs';
import { extractExactArithmetic, reachableToolsJSON } from './tools.mjs';
import { runToolProposal } from './tool-runner.mjs';
import { ExactSpiral, SpiralController, SPIRAL_POLICY, SPIRAL_CALIBRATION_KEY, planSpiral, repairHeartbeat, modelCalibrationOutcome } from './spiral.mjs';
import { md } from './md.mjs';
import { initOrb } from './orb.mjs';

const $ = id => document.getElementById(id);
const state = { conversation: null, messages: [], selected: 'auto', think: false,
  available: new Map(), failedModels: new Set(), autoPreparing: false, busy: null, worker: null, loadedModelId: null, ingest: null, orb: null, theme: 'system' };
const names = { falcon_instruct: 'Falcon Instruct' };
const localModelFiles = [
  'Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf',
];
const hostedModelFile = Object.fromEntries(SPECIALISTS.map((id, index) => [id, localModelFiles[index]]));
const suggestions = {
  kyoto: 'Plan a slow weekend in Kyoto. Two days, nothing rushed.',
  dark: 'Explain dark matter to a poet.',
  landlord: 'Help me write a kind but firm message to my landlord about the heater.',
  bakery: 'Name a bakery by the sea. Give ten names, each with a story.',
};
const newId = () => crypto.randomUUID();
const waiters = new Map();
const exactSpiral = new ExactSpiral();
const spiral = new SpiralController({ exact: exactSpiral });
let localSpeechVoice = null;
const selectedModel = () => state.selected === 'auto' ? 'falcon_instruct' : state.selected;
function updateSend() {
  $('sendBtn').disabled = !state.busy && (!state.available.has(selectedModel()) || !$('prompt').value.trim());
}
function updateModelLoadStatus(message = '') {
  const id = selectedModel();
  $('modelLoadStatus').textContent = message || (state.available.has(id) ? `${names[id]} ready in this browser` :
    `Waiting for ${names[id]} · open Settings to import a GGUF`);
  $('modelLoadStatus').dataset.loading = String(!!state.provisioning);
  updateSend();
}
function setProvisionProgress(progress) {
  if (state.provisionProgress === progress) return;
  state.provisionProgress = progress;
  if (!state.provisioning) return;
  const label = `${names[state.provisioning]} · ${progress}`;
  $('heroStatus').textContent = label;
  updateModelLoadStatus(label);
  const row = [...$('modelRows').children].find(item => item.dataset.modelId === state.provisioning);
  if (row) row.querySelector('.desc').textContent = progress;
}

function refreshLocalSpeechVoice() {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;
  const voice = speechSynthesis.getVoices().find(candidate => candidate.localService === true) || null;
  if (voice?.voiceURI !== localSpeechVoice?.voiceURI) {
    localSpeechVoice = voice;
    if (state.messages.length) renderConversation();
  }
}

function toast(text) {
  $('toast').textContent = text; $('toast').classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').classList.remove('show'), 3500);
}
function status(text, alert = false) {
  $('footnote').textContent = text;
  if (alert) $('statusAnnouncer').textContent = text;
}
function setBusy(run) {
  if (state.busy?.watchdog) clearTimeout(state.busy.watchdog);
  state.busy = run; $('app').classList.toggle('busy', !!run);
  updateSend();
  $('sendBtn').setAttribute('aria-label', run ? 'Stop generating' : 'Send');
  state.orb?.setEnergy(run ? 0.8 : 0);
}
function scrollEnd() {
  const scroller = $('scroller');
  scroller.style.scrollBehavior = 'auto';
  scroller.scrollTop = scroller.scrollHeight;
  scroller.style.removeProperty('scroll-behavior');
}
function placeOrb(animate = true) {
  const target = $('app').dataset.state === 'chat' ? $('orbSlot') : $('orbAnchor');
  const rect = target.getBoundingClientRect();
  const orb = $('orb');
  const size = orb.offsetWidth || 1;
  orb.classList.toggle('animate', animate && !matchMedia('(prefers-reduced-motion: reduce)').matches);
  orb.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0) scale(${rect.width / size})`;
}
function visibleOutput(modelId, raw) {
  return raw;
}
function closeDrawer() { $('app').classList.remove('nav-open'); }

function renderModels() {
  $('modelRows').replaceChildren(); $('modelMenu').replaceChildren();
  for (const id of SPECIALISTS) {
    const d = state.available.get(id);
    const row = document.createElement('div'); row.className = 'model-row'; row.dataset.modelId = id;
    row.innerHTML = '<b></b><span class="st"></span><span class="desc"></span>';
    row.querySelector('b').textContent = names[id];
    row.querySelector('.st').textContent = d ? 'Verified · ' + d.quant : state.provisioning === id ? 'Loading…' : state.failedModels.has(id) ? 'Import needed' : state.autoPreparing ? 'Queued' : 'Not ready';
    row.querySelector('.desc').textContent = d ? Math.round(d.bytes / 1048576) + ' MiB stored in this browser' : state.provisioning === id ? state.provisionProgress || 'Downloading and verifying locally' : state.autoPreparing && !state.failedModels.has(id) ? 'Automatic setup will start soon' : 'Import a GGUF if this site has no model file';
    $('modelRows').append(row);
  }
  for (const id of ['auto', ...SPECIALISTS]) {
    const item = document.createElement('button');
    item.type = 'button'; item.className = 'menu-item'; item.setAttribute('role', 'menuitemradio');
    item.setAttribute('aria-checked', String(state.selected === id));
    item.innerHTML = '<b></b><span></span>';
    item.querySelector('b').textContent = MODEL_META[id].display;
    item.querySelector('span').textContent = id === 'auto' ? 'B2 Spiral with Falcon Instruct' :
      (state.available.has(id) ? names[id] + ' · ready' : names[id] + ' · prepares from this site when used, if available');
    item.onclick = () => { state.selected = id; $('modelName').textContent = MODEL_META[id].display;
      $('modelMenu').hidden = true; $('modelBtn').setAttribute('aria-expanded', 'false'); renderModels(); $('modelBtn').focus();
      if (!state.available.has(selectedModel()) && !state.autoPreparing) void prepareSelectedModel(); };
    $('modelMenu').append(item);
  }
  $('heroStatus').textContent = state.provisioning ? `${names[state.provisioning]} · ${state.provisionProgress || 'preparing locally'}` :
    state.available.has('falcon_instruct') ? 'Falcon Instruct ready · B2 Spiral active' : 'Waiting for Falcon Instruct · import its GGUF in Settings';
  updateModelLoadStatus(state.provisioning ? `${names[state.provisioning]} · ${state.provisionProgress || 'preparing locally'}` : '');
}

async function refreshModels() {
  state.available = new Map();
  for (const d of await models.all()) {
    const file = await modelFile(d);
    if (file && file.size === d.bytes) state.available.set(d.id, d);
  }
  renderModels();
  const estimate = await storageEstimate();
  $('storageNote').textContent = estimate ? `Browser storage: ${Math.round(estimate.usage / 1048576)} MiB used of ${Math.round(estimate.quota / 1048576)} MiB quota.` : 'Storage quota unavailable in this browser.';
}

function renderThreads(filter = '') {
  conv.list().then(list => {
    $('threadList').replaceChildren();
    const visible = list.filter(c => (c.title || '').toLowerCase().includes(filter.toLowerCase()));
    for (const c of visible) {
      const row = document.createElement('div'); row.className = 'thread-link';
      const open = document.createElement('button'); open.type = 'button'; open.className = 'thread-open';
      open.textContent = c.title || 'New thread'; open.onclick = () => openConversation(c.id);
      const rename = document.createElement('button'); rename.type = 'button'; rename.className = 'thread-small';
      rename.textContent = '✎'; rename.setAttribute('aria-label', 'Rename ' + open.textContent);
      rename.onclick = async () => { const title = prompt('Rename thread', c.title || 'New thread');
        if (title?.trim()) { await conv.rename(c.id, title.trim()); renderThreads($('searchInput').value); } };
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'thread-small';
      remove.textContent = '×'; remove.setAttribute('aria-label', 'Delete ' + open.textContent);
      remove.onclick = () => confirmAction('Delete this conversation and its messages?', async () => {
        await exactSpiral.flush().catch(() => {}); await conv.del(c.id); exactSpiral.clear(c.id);
        if (state.conversation?.id === c.id) { state.conversation = null; state.messages = []; renderConversation(); }
        renderThreads($('searchInput').value);
      });
      row.append(open, rename, remove); $('threadList').append(row);
    }
  });
}

function renderConversation({ animate = true } = {}) {
  $('thread').replaceChildren();
  $('app').dataset.state = state.messages.length ? 'chat' : 'empty';
  state.messages.forEach((m, i) => {
    if (m.role === 'user') {
      const el = document.createElement('div'); el.className = 'msg-user'; el.textContent = m.content;
      $('thread').append(el); return;
    }
    const el = document.createElement('article'); el.className = 'msg-ai'; el.dataset.messageId = m.id;
    if (!animate) el.classList.add('no-rise');
    if (i === state.messages.length - 1) el.classList.add('last');
    const meta = document.createElement('div'); meta.className = 'msg-meta';
    const label = document.createElement('span'); label.className = 'm-name'; label.textContent = m.model_id ? (names[m.model_id] || 'Legacy response') : 'Seren 7';
    const detail = document.createElement('span'); detail.className = 'm-status';
    detail.textContent = m.status === 'streaming' ? 'Writing locally…' : m.status === 'stopped' ? 'Stopped · partial answer' :
      m.status === 'error' ? 'Generation failed' : m.meta?.via || 'Local response';
    meta.append(label, detail);
    const prose = document.createElement('div'); prose.className = 'prose';
    if (m.status === 'streaming') { prose.classList.add('streaming-text'); prose.textContent = m.content || ''; }
    else prose.innerHTML = md(m.content || '');
    const actions = document.createElement('div'); actions.className = 'actions';
    const copy = document.createElement('button'); copy.className = 'icon-btn'; copy.setAttribute('aria-label', 'Copy response');
    copy.innerHTML = '<svg width="17" height="17" aria-hidden="true"><use href="#i-copy"/></svg>';
    copy.onclick = () => navigator.clipboard.writeText(m.content).then(() => toast('Copied'));
    const redo = document.createElement('button'); redo.className = 'icon-btn'; redo.setAttribute('aria-label', 'Regenerate response');
    redo.innerHTML = '<svg width="17" height="17" aria-hidden="true"><use href="#i-redo"/></svg>';
    redo.onclick = () => regenerate(m);
    actions.append(copy);
    if (localSpeechVoice && m.content && m.status !== 'streaming') {
      const speak = document.createElement('button'); speak.className = 'icon-btn'; speak.setAttribute('aria-label', 'Read response aloud');
      speak.innerHTML = '<svg width="17" height="17" aria-hidden="true"><use href="#i-speak"/></svg>';
      speak.onclick = () => {
        if (speechSynthesis.speaking) { speechSynthesis.cancel(); speak.setAttribute('aria-label', 'Read response aloud'); return; }
        const utterance = new SpeechSynthesisUtterance(prose.textContent);
        utterance.voice = localSpeechVoice; utterance.lang = localSpeechVoice.lang;
        utterance.onend = utterance.onerror = () => speak.setAttribute('aria-label', 'Read response aloud');
        speak.setAttribute('aria-label', 'Stop reading response');
        speechSynthesis.speak(utterance);
      };
      actions.append(speak);
    }
    actions.append(redo);
    let details = null;
    if (m.meta?.run_id) {
      details = document.createElement('details'); details.className = 'inspector-details';
      const summary = document.createElement('summary'); summary.textContent = 'Run details'; details.append(summary);
      const residual = m.meta.spiral_verification?.residual;
      const values = [
        ['Model', m.model_id || 'deterministic'], ['Backend', m.meta.backend || 'local'],
        ['Route mode', m.meta.route_mode || 'unrecorded'],
        ['Task category', m.meta.route_category || 'unrecorded'],
        ['Route reason', m.meta.route_reason || 'unrecorded'],
        ['Policy', m.meta.policy_version || 'unrecorded'],
        ['Tokens', m.meta.tokens ?? 'unknown'], ['First visible answer', m.meta.ttft_ms == null ? 'unmeasured' : m.meta.ttft_ms + ' ms'],
        ['Elapsed', m.meta.elapsed_ms == null ? 'unmeasured' : m.meta.elapsed_ms + ' ms'],
        ['B2 complexity', m.meta.spiral_plan?.complexity || 'unrecorded'],
        ['B2 subtasks', m.meta.spiral_plan?.parts || 0],
        ['Unprocessed subtasks', m.meta.spiral_plan?.omittedParts || 0],
        ['Model calls', m.meta.spiral_metrics?.modelCalls ?? 'unmeasured'],
        ['Calculator calls', m.meta.spiral_metrics?.calculatorCalls ?? 'unmeasured'],
        ['Verified reuse hits', m.meta.spiral_metrics?.cacheHits ?? 'unmeasured'],
        ['Verification overhead', m.meta.spiral_metrics?.verificationMs == null ? 'unmeasured' : m.meta.spiral_metrics.verificationMs + ' ms'],
        ['Verification', m.meta.spiral_verification?.status || 'unverified'],
        ...(residual ? [['Unresolved', (typeof residual === 'string' ? residual : JSON.stringify(residual)).slice(0, 300)]] : []),
        ['Tool calls', m.meta.tool_receipts ? m.meta.tool_receipts.length : 0],
        ['Run ID', m.meta.run_id],
      ];
      for (const [name, value] of values) { const row = document.createElement('div'); row.textContent = name + ': ' + value; details.append(row); }
    }
    el.append(meta, prose, actions); if (details) el.append(details); $('thread').append(el);
  });
  requestAnimationFrame(() => placeOrb());
  scrollEnd();
}

function updateStreamMessage(message) {
  const prose = [...$('thread').querySelectorAll('article[data-message-id]')]
    .find(article => article.dataset.messageId === message.id)?.querySelector('.prose');
  if (!prose) { renderConversation(); return; }
  prose.textContent = message.content;
  scrollEnd();
}

async function openConversation(id) {
  if (state.busy) stopGeneration();
  state.conversation = await conv.get(id); state.messages = await msg.byConv(id);
  await exactSpiral.warm(id).catch(() => {});
  for (const m of state.messages.filter(m => m.status === 'streaming')) await msg.update(m.id, { status: 'stopped' });
  state.messages = await msg.byConv(id);
  let priorUser = null;
  for (const message of state.messages) {
    if (message.role === 'user') priorUser = message.content;
    if (message.role !== 'assistant' || !message.meta?.spiral_deltas) continue;
    try {
      const expression = message.meta.spiral_expression || extractExactArithmetic(priorUser);
      if (!expression) throw new Error('missing exact source expression');
      const checked = repairHeartbeat(expression, message.meta.spiral_deltas, message.content);
      if (checked.repaired) {
        message.content = checked.value;
        message.meta = { ...message.meta, via: 'verified exact arithmetic · repaired',
          spiral_deltas: checked.deltas, replay_repaired: true, spiral_replay_status: 'repaired' };
        await msg.update(message.id, { content: message.content, meta: message.meta });
      } else if (message.meta.spiral_replay_status !== 'verified_on_resume') {
        message.meta = { ...message.meta, spiral_replay_status: 'verified_on_resume' };
        await msg.update(message.id, { meta: message.meta });
      }
    } catch (error) {
      message.status = 'error';
      message.meta = { ...message.meta, replay_error: error.message };
      await msg.update(message.id, { status: 'error', meta: message.meta });
    }
  }
  renderConversation(); closeDrawer();
  await kv.set('active_conversation', id);
}
async function ensureConversation(firstText) {
  if (state.conversation) return;
  const c = { id: newId(), title: firstText.slice(0, 45) || 'New thread', active_mode: state.selected };
  await conv.put(c); state.conversation = c; await kv.set('active_conversation', c.id); renderThreads();
}
function runWorker() {
  if (state.worker) return state.worker;
  state.loadedModelId = null;
  const worker = new Worker(new URL('../workers/runtime-worker.mjs', import.meta.url), { type: 'module' });
  worker.onmessage = async ({ data }) => {
    if (data.type === 'reply') {
      const waiting = waiters.get(data.reqId); if (waiting) { waiters.delete(data.reqId); data.ok ? waiting.resolve(data) : waiting.reject(new Error(data.message)); }
      return;
    }
    if (data.type !== 'event') return;
    const run = state.busy, generation = run?.generation;
    if (!generation || data.request_id !== generation.id) return;
    if (data.schema_version !== 1 || !Number.isInteger(data.sequence) || data.sequence <= generation.lastSequence) return;
    generation.lastSequence = data.sequence;
    const receipt = data.kind === 'token'
      ? { token_id: data.payload.token_id, token_count: data.payload.token_count, replace: !!data.payload.replace }
      : data.payload;
    void events.append(run.id, data.kind, receipt, run.conversationId).catch(() => {});
    if (data.kind === 'token') {
      armGenerationWatchdog(run);
      if (!generation.firstTokenAt) generation.firstTokenAt = performance.now();
      generation.text = data.payload.replace ? data.payload.text : generation.text + data.payload.text;
      generation.onToken?.(generation.text);
    } else if (['complete', 'cancelled', 'error'].includes(data.kind)) {
      run.generation = null;
      if (data.kind === 'complete') generation.resolve({ text: generation.text, tokens: data.payload.tokens || 0,
        ttftMs: generation.firstTokenAt ? Math.round(generation.firstTokenAt - generation.startedAt) : null });
      else generation.reject(new Error(data.kind === 'cancelled' ? 'Stopped' : data.payload.message || 'Generation failed'));
    }
  };
  worker.onerror = async e => {
    const error = new Error('Runtime worker failed: ' + e.message);
    worker.terminate(); state.worker = null; state.loadedModelId = null;
    for (const waiter of waiters.values()) waiter.reject(error);
    waiters.clear();
    await failActiveRun(error.message);
  };
  state.worker = worker; return worker;
}
async function failActiveRun(message) {
  const run = state.busy;
  if (run) {
    run.generation?.reject(new Error(message)); run.generation = null;
    const m = state.messages.find(x => x.id === run.messageId) || await msg.get(run.messageId);
    if (m) {
      m.status = 'error'; m.content ||= message;
      await msg.update(m.id, { status: m.status, content: m.content });
    }
    try { await events.append(run.id, 'error', { message, stage: 'watchdog_or_worker' }, run.conversationId); }
    catch { /* storage failure must not leave the UI stuck in a busy state */ }
  }
  setBusy(null); renderConversation(); status(message, true);
}
function armGenerationWatchdog(run, ms = 180000) {
  if (run.watchdog) clearTimeout(run.watchdog);
  run.watchdog = setTimeout(async () => {
    if (state.busy !== run) return;
    const message = run.cancelled ? 'Stop timed out; local worker was terminated' : 'Generation stalled; local worker was terminated';
    state.worker?.terminate(); state.worker = null; state.loadedModelId = null;
    for (const waiter of waiters.values()) waiter.reject(new Error(message));
    waiters.clear();
    await failActiveRun(message);
  }, ms);
}
function request(cmd, fields) {
  const reqId = newId();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!waiters.has(reqId)) return;
      waiters.delete(reqId); state.worker?.terminate(); state.worker = null; state.loadedModelId = null;
      reject(new Error(cmd + ' timed out'));
    }, 180000);
    waiters.set(reqId, {
      resolve: value => { clearTimeout(timer); resolve(value); },
      reject: error => { clearTimeout(timer); reject(error); },
    });
    runWorker().postMessage({ cmd, reqId, ...fields });
  });
}
function stopGeneration() {
  if (!state.busy) return;
  state.busy.cancelled = true;
  state.busy.abortController.abort();
  if (state.busy.generation) state.worker?.postMessage({ cmd: 'abort', reqId: state.busy.generation.id });
  armGenerationWatchdog(state.busy, 10000);
  status('Stopping local generation…');
}

async function generateForSpiral(run, desc, { turns, maxTokens, onToken, signal, tools = false }) {
  if (signal?.aborted) return Promise.reject(new Error('Stopped'));
  if (state.loadedModelId !== 'falcon_instruct') {
    const blob = await modelFile(desc);
    if (!blob) throw new Error('Verified model bytes missing from browser storage');
    status('Loading Falcon Instruct locally…');
    await request('load', { modelId: 'falcon_instruct', blob, expectedSha256: desc.sha256 });
    state.loadedModelId = 'falcon_instruct';
    if (signal?.aborted) throw new Error('Stopped');
    status('B2 Spiral reasoning locally…');
  }
  const built = buildChatPrompt('falcon_instruct', turns, { think: false,
    tools: tools ? reachableToolsJSON() : null });
  return new Promise((resolve, reject) => {
    const generation = { id: newId(), text: '', lastSequence: 0, resolve, reject, onToken, startedAt: performance.now(), firstTokenAt: null };
    run.generation = generation;
    runWorker().postMessage({ cmd: 'complete', reqId: generation.id, modelId: 'falcon_instruct',
      prompt: built.prompt, stops: desc.stops || built.stops, maxTokens, temperature: 0.2 });
    armGenerationWatchdog(run);
  });
}

async function submit(text, { regen = false } = {}) {
  text = text.trim(); if (!text || state.busy || !state.available.has(selectedModel())) return;
  await ensureConversation(text);
  if (!regen) { const user = await msg.add(state.conversation.id, { role: 'user', content: text }); state.messages.push(user); }
  $('prompt').value = ''; $('sendBtn').disabled = true;
  const desc = state.available.get('falcon_instruct');
  const calibration = await kv.get(SPIRAL_CALIBRATION_KEY) || {};
  const plan = planSpiral(text, { deeper: state.think, calibration });
  const answer = await msg.add(state.conversation.id, { role: 'assistant', content: '', status: 'streaming', model_id: 'falcon_instruct',
    meta: { backend: 'wasm', route_mode: 'b2_spiral', route_category: plan.category,
      route_reason: `${plan.complexity} path · ${plan.parts.length} part(s)`, policy_version: SPIRAL_POLICY } });
  state.messages.push(answer); renderConversation();
  const runId = newId();
  const run = { id: runId, messageId: answer.id, conversationId: state.conversation.id,
    modelId: 'falcon_instruct', startedAt: performance.now(), firstVisibleAt: null,
    abortController: new AbortController(), generation: null, cancelled: false };
  setBusy(run);
  try {
    await events.append(runId, 'route_selected', { model_id: 'falcon_instruct', backend: 'wasm',
      reason_category: plan.category, route_mode: 'b2_spiral', policy_version: SPIRAL_POLICY,
      plan: { complexity: plan.complexity, parts: plan.parts.length, max_model_calls: plan.maxModelCalls } }, state.conversation.id);
    if (run.cancelled) throw new Error('Stopped');
    const turns = state.messages.filter(m => (m.role === 'user' || m.role === 'assistant') && m.id !== answer.id && m.content)
      .slice(-12).map(m => ({ role: m.role, content: m.content }));
    status('B2 Spiral reasoning locally…');
    const result = await spiral.run(text, { scope: state.conversation.id, turns, deeper: state.think, calibration,
      signal: run.abortController.signal,
      onToken: content => { if (!run.firstVisibleAt) run.firstVisibleAt = performance.now(); answer.content = content; updateStreamMessage(answer); },
      generate: options => generateForSpiral(run, desc, { ...options, tools: plan.category === 'tool' }),
      runTool: async call => {
        const result = await runToolProposal(call, { signal: run.abortController.signal });
        await toolCalls.add({ runId, conversationId: run.conversationId, proposerModelId: 'falcon_instruct', call, result }).catch(() => {});
        return result;
      } });
    if (!run.firstVisibleAt) run.firstVisibleAt = performance.now();
    answer.content = result.answer; answer.status = 'done';
    answer.meta = { ...answer.meta, via: result.verification.status === 'verified' ? 'Verified local result' : 'Local draft · unverified',
      run_id: runId, tokens: result.metrics.tokens,
      ttft_ms: Math.round(run.firstVisibleAt - run.startedAt),
      elapsed_ms: Math.round(performance.now() - run.startedAt),
      spiral_plan: { complexity: result.plan.complexity, parts: result.plan.parts.length, omittedParts: result.plan.omittedParts },
      spiral_metrics: result.metrics, spiral_trace: result.trace, spiral_verification: result.verification,
      spiral_state: { schemaVersion: result.state.schemaVersion, givens: result.state.givens,
        dependencies: result.state.dependencies, derivations: result.state.derivations,
        verifiedFacts: result.state.verifiedFacts, unresolved: result.state.unresolved, residuals: result.state.residuals,
        visitedDirections: result.state.visitedDirections },
      ...(result.exact ? { spiral_deltas: result.exact.deltas, spiral_expression: result.trace.find(step => step.step === 'calculate')?.expression,
        shared_state_id: result.exact.stateId || null } : {}) };
    await msg.update(answer.id, { content: answer.content, status: answer.status, meta: answer.meta });
    await events.append(runId, 'spiral_result', { metrics: result.metrics, verification: result.verification, steps: result.trace.map(s => s.step) }, run.conversationId);
    const current = calibration[plan.category]?.schemaVersion === 2 ? calibration[plan.category] : { runs: 0, verifiedSuccesses: 0, verifiedFailures: 0,
      unverified: 0, modelCalls: 0, calculatorCalls: 0, elapsedMs: 0, repairs: 0,
      verifiedModelSuccesses: 0, verifiedModelFailures: 0, modelRuns: 0, modelElapsedMs: 0 };
    const modelOutcome = modelCalibrationOutcome(result);
    const checkedFailure = modelOutcome === 'failure';
    const operations = structuredClone(current.operations || {});
    for (const receipt of result.trace.filter(step => step.step === 'direction_result')) {
      const profile = operations[receipt.operation] || { runs: 0, verifiedSuccesses: 0, verifiedFailures: 0,
        elapsedMs: 0, informationGainSum: 0, cacheHits: 0 };
      operations[receipt.operation] = { runs: profile.runs + 1,
        verifiedSuccesses: profile.verifiedSuccesses + Number(receipt.verificationStatus === 'verified'),
        verifiedFailures: profile.verifiedFailures + Number(receipt.verificationStatus === 'failed'),
        elapsedMs: profile.elapsedMs + (receipt.elapsedMs || 0),
        informationGainSum: (profile.informationGainSum || 0) + (receipt.informationGainProxy || 0),
        cacheHits: (profile.cacheHits || 0) + Number(!!receipt.reused) };
    }
    calibration[plan.category] = { ...current, schemaVersion: 2, runs: current.runs + 1,
      operations,
      verifiedSuccesses: current.verifiedSuccesses + Number(result.verification.status === 'verified'),
      verifiedFailures: current.verifiedFailures + Number(!!checkedFailure),
      verifiedModelSuccesses: (current.verifiedModelSuccesses || 0) + Number(modelOutcome === 'success'),
      verifiedModelFailures: (current.verifiedModelFailures || 0) + Number(modelOutcome === 'failure'),
      modelRuns: (current.modelRuns || 0) + Number(result.metrics.modelCalls > 0),
      modelElapsedMs: (current.modelElapsedMs || 0) + (result.metrics.modelCalls > 0 ? result.metrics.elapsedMs : 0),
      unverified: current.unverified + Number(result.verification.status === 'unverified'),
      modelCalls: current.modelCalls + result.metrics.modelCalls,
      calculatorCalls: current.calculatorCalls + result.metrics.calculatorCalls,
      elapsedMs: current.elapsedMs + result.metrics.elapsedMs,
      repairs: current.repairs + result.trace.filter(step => step.step === 'repair').length,
      updatedAt: Date.now() };
    await kv.set(SPIRAL_CALIBRATION_KEY, calibration).catch(() => {});
    await exactSpiral.flush({ onlyPending: true }).catch(() => {});
    setBusy(null); renderConversation({ animate: false }); status('Response complete · B2 Spiral · local CPU WebAssembly', true);
  } catch (e) {
    answer.status = run.cancelled ? 'stopped' : 'error';
    answer.content ||= run.cancelled ? '' : 'Local runtime error: ' + e.message;
    await msg.update(answer.id, { status: answer.status, content: answer.content });
    setBusy(null); renderConversation(); status(e.message, true);
  }
}

async function regenerate(answer) {
  if (state.busy) return;
  const index = state.messages.findIndex(m => m.id === answer.id);
  const prior = state.messages.slice(0, index).reverse().find(m => m.role === 'user');
  if (prior) await submit(prior.content, { regen: true });
}
function confirmAction(text, action) {
  $('confirmText').textContent = text; $('confirmDialog').showModal();
  $('confirmYes').onclick = async () => { $('confirmDialog').close(); await action(); };
}
async function ingestFiles(files) {
  const worker = state.ingest ||= new Worker(new URL('../workers/ingest-worker.mjs', import.meta.url), { type: 'module' });
  for (const file of files) {
    const reqId = newId(); status('Verifying ' + file.name + ' locally…');
    const result = await new Promise((resolve, reject) => {
      const listener = ({ data }) => {
        if (data.reqId !== reqId) return;
        if (data.type === 'progress') {
          const progress = `Verifying locally · ${Math.round(data.frac * 100)}%`;
          status(`${file.name} · ${progress}`);
          if (state.provisioning) setProvisionProgress(progress);
          return;
        }
        worker.removeEventListener('message', listener);
        data.type === 'done' ? resolve(data.desc) : reject(new Error(data.message || 'Import failed'));
      };
      worker.addEventListener('message', listener); worker.postMessage({ cmd: 'ingest', reqId, file });
    });
    toast(names[result.id] + ' verified and stored'); await refreshModels();
  }
  status('Model import complete · private browser storage', true);
}

async function provisionHostedModel(modelId) {
  if (state.available.has(modelId)) return true;
  const name = hostedModelFile[modelId];
  if (!name) return false;
  const url = new URL('../models/parts/' + encodeURIComponent(name), import.meta.url);
  if (url.origin !== location.origin) throw new Error('model source must be on this site');
  setProvisionProgress('Connecting to model source…');
  let response;
  try { response = await fetch(url, { cache: 'no-store', redirect: 'error' }); }
  catch { return false; }
  if (!response.ok) return false;
  const declaredSize = Number(response.headers.get('Content-Length'));
  if (Number.isFinite(declaredSize) && declaredSize > 300 * 1024 * 1024) throw new Error('hosted model exceeds size limit');
  const chunks = []; let received = 0;
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > 300 * 1024 * 1024) { await reader.cancel(); throw new Error('hosted model exceeds size limit'); }
      chunks.push(value);
      setProvisionProgress(declaredSize > 0 ? `Downloading · ${Math.min(100, Math.round(received / declaredSize * 100))}%` : `Downloading · ${Math.round(received / 1048576)} MiB`);
    }
  } else chunks.push(await response.blob());
  setProvisionProgress('Verifying locally…');
  await ingestFiles([new File(chunks, name, { type: 'application/octet-stream' })]);
  return state.available.has(modelId);
}

async function prepareSelectedModel(id = selectedModel()) {
  if (state.available.has(id)) { updateModelLoadStatus(); return; }
  if (state.provisioning) return;
  state.provisioning = id; state.provisionProgress = 'Checking hosted model…'; renderModels();
  try {
    if (!await provisionHostedModel(id)) {
      state.failedModels.add(id);
      status(`${names[id]} unavailable here · import a GGUF in Settings`, true);
    } else state.failedModels.delete(id);
  } catch (error) { state.failedModels.add(id); status('Model setup failed: ' + error.message, true); }
  finally {
    state.provisioning = null; state.provisionProgress = null; renderModels();
  }
}

async function prepareAllHostedModels() {
  if (state.autoPreparing || location.protocol === 'file:') return;
  state.autoPreparing = true; renderModels();
  try {
    for (const id of SPECIALISTS) if (!state.available.has(id)) await prepareSelectedModel(id);
  } finally { state.autoPreparing = false; renderModels(); }
}

async function boot() {
  state.orb = initOrb($('orbCanvas'));
  window.addEventListener('resize', () => placeOrb(false));
  $('kickerText').textContent = 'Private, on this device';
  $('headline').innerHTML = '<span>The quiet hours</span><em>are for wondering.</em>';
  $('agentList').innerHTML = '<div class="agents-empty">No local tasks running</div>';
  await init(); await refreshModels(); renderThreads();
  requestAnimationFrame(() => placeOrb(false));
  const last = await kv.get('active_conversation'); if (last && await conv.get(last)) await openConversation(last);
  state.theme = localStorage.getItem('seren-theme') || 'system'; applyTheme();
  if ('speechSynthesis' in window) {
    refreshLocalSpeechVoice();
    speechSynthesis.addEventListener?.('voiceschanged', refreshLocalSpeechVoice);
  }
  $('composer').onsubmit = e => { e.preventDefault(); state.busy ? stopGeneration() : submit($('prompt').value); };
  $('prompt').oninput = updateSend;
  $('prompt').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('composer').requestSubmit(); } };
  for (const b of document.querySelectorAll('[data-sugg]')) b.onclick = () => { $('prompt').value = suggestions[b.dataset.sugg]; $('prompt').focus(); updateSend(); };
  $('thinkBtn').onclick = () => { state.think = !state.think; $('thinkBtn').setAttribute('aria-pressed', String(state.think)); };
  $('newBtn').onclick = $('newBtnTop').onclick = () => { if (state.busy) stopGeneration(); state.conversation = null; state.messages = []; kv.del('active_conversation'); renderConversation(); closeDrawer(); $('prompt').focus(); };
  $('searchInput').oninput = e => renderThreads(e.target.value);
  $('modelBtn').onclick = () => { $('modelMenu').hidden = !$('modelMenu').hidden; $('modelBtn').setAttribute('aria-expanded', String(!$('modelMenu').hidden)); };
  $('modelBtn').onkeydown = e => { if (e.key === 'ArrowDown') { e.preventDefault(); $('modelMenu').hidden = false;
    $('modelBtn').setAttribute('aria-expanded', 'true'); $('modelMenu').querySelector('button')?.focus(); } };
  $('modelMenu').onkeydown = e => {
    const items = [...$('modelMenu').querySelectorAll('button')]; const index = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); $('modelMenu').hidden = true; $('modelBtn').setAttribute('aria-expanded', 'false'); $('modelBtn').focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(index + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus(); }
  };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('modelMenu').hidden) {
      $('modelMenu').hidden = true; $('modelBtn').setAttribute('aria-expanded', 'false'); $('modelBtn').focus();
    }
  });
  $('settingsBtn').onclick = $('settingsBtnTop').onclick = () => $('setupDialog').showModal();
  $('setupClose').onclick = $('setupDone').onclick = () => $('setupDialog').close();
  $('importBtn').onclick = () => $('modelFileInput').click();
  if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
    try {
      const probe = await fetch('/models/parts/' + encodeURIComponent(localModelFiles[0]), { method: 'HEAD', cache: 'no-store' });
      $('importLocalBtn').hidden = !probe.ok;
    } catch { $('importLocalBtn').hidden = true; }
    $('importLocalBtn').onclick = async () => {
      const button = $('importLocalBtn'); button.disabled = true;
      try {
        for (const name of localModelFiles) {
          status('Reading approved local file ' + name + '…');
          const response = await fetch('/models/parts/' + encodeURIComponent(name), { cache: 'no-store' });
          if (!response.ok) throw new Error(name + ': local development server returned ' + response.status);
          await ingestFiles([new File([await response.blob()], name, { type: 'application/octet-stream' })]);
        }
        status('Falcon Instruct verified in this browser', true);
      } catch (error) { status('Local model import failed: ' + error.message, true); }
      finally { button.disabled = false; }
    };
  }
  $('modelFileInput').onchange = async e => { try { await ingestFiles([...e.target.files]); } catch (err) { status('Import failed: ' + err.message, true); } e.target.value = ''; };
  $('removeModelsBtn').onclick = () => confirmAction('Remove all imported model weights from this browser?', async () => {
    localStorage.setItem('seren-auto-provision-suppressed', '1');
    if (state.busy) stopGeneration(); for (const d of await models.all()) await models.remove(d.id); await refreshModels(); toast('Models removed');
  });
  $('exportChatsBtn').onclick = async () => {
    const blob = new Blob([await exportAllConversations()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'seren-conversations.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $('importChatsBtn').onclick = () => $('chatFileInput').click();
  $('chatFileInput').onchange = async e => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 50_000_000) throw new Error('conversation export is too large');
      const imported = await importConversations(await file.text());
      renderThreads(); toast(imported.length + ' conversations imported');
      status('Conversation import complete · stored only in this browser', true);
    } catch (error) { status('Conversation import failed: ' + error.message, true); }
    finally { e.target.value = ''; }
  };
  $('deleteChatsBtn').onclick = () => confirmAction('Delete all conversations and their local run events from this browser?', async () => {
    await exactSpiral.flush().catch(() => {}); const count = await deleteAllConversations(); exactSpiral.clear();
    state.conversation = null; state.messages = [];
    renderConversation(); renderThreads(); toast(count + ' conversations deleted');
  });
  $('factoryResetBtn').onclick = () => confirmAction('Erase all conversations, imported models, settings and local evaluation data from this browser? This cannot be undone.', async () => {
    if (state.busy) { status('Stop the current generation before resetting local data', true); return; }
    state.worker?.terminate(); state.worker = null; state.loadedModelId = null;
    try {
      await exactSpiral.flush().catch(() => {}); const receipt = await factoryReset(); exactSpiral.clear();
      localStorage.setItem('seren-auto-provision-suppressed', '1');
      state.conversation = null; state.messages = []; state.selected = 'auto';
      localStorage.removeItem('seren-theme'); state.theme = 'system'; applyTheme();
      await refreshModels(); renderThreads(); renderConversation();
      toast(`${receipt.conversations} conversations and ${receipt.models} models erased`);
    } catch (error) { status('Local reset failed: ' + error.message, true); }
  });
  $('computePref').value = 'wasm';
  $('computePref').querySelector('[value="webgpu"]').disabled = true;
  $('computePref').onchange = () => { $('computePref').value = 'wasm'; status('Only verified CPU WebAssembly is available in this build'); };
  $('confirmNo').onclick = $('confirmClose').onclick = () => $('confirmDialog').close();
  $('shareBtn').onclick = async () => { if (!state.conversation) return toast('No conversation to copy');
    const text = state.messages.map(m => `${m.role}: ${m.content}`).join('\n\n'); await navigator.clipboard.writeText(text); toast('Conversation copied'); };
  for (const b of document.querySelectorAll('[data-theme-set]')) b.onclick = () => { state.theme = b.dataset.themeSet; localStorage.setItem('seren-theme', state.theme); applyTheme(); };
  $('openNavBtn').onclick = () => $('app').classList.add('nav-open');
  $('closeNavBtn').onclick = $('scrim').onclick = closeDrawer;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void exactSpiral.flush().catch(() => {}); });
  $('collapseBtn').onclick = () => { $('app').classList.add('nav-collapsed'); $('expandBtn').hidden = false; };
  $('expandBtn').onclick = () => { $('app').classList.remove('nav-collapsed'); $('expandBtn').hidden = true; };
  if ('serviceWorker' in navigator) navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(e => status('Offline shell unavailable: ' + e.message));
  if (location.protocol === 'file:') updateModelLoadStatus('Open this app through localhost or the public HTTPS URL to prepare models');
  else if (!state.available.has('falcon_instruct') && localStorage.getItem('seren-auto-provision-suppressed') !== '1') void prepareAllHostedModels();
}
function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  for (const b of document.querySelectorAll('[data-theme-set]')) b.setAttribute('aria-pressed', String(b.dataset.themeSet === state.theme));
  state.orb?.setLight(state.theme === 'light' || state.theme === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
}

boot().catch(e => { console.error(e); status('Seren could not start: ' + e.message, true); });
