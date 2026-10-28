/* Seren 7 browser shell. Every answer is either a labelled deterministic local
   calculation or tokens from the verified GGUF running in the WASM Worker. */
import { init, conv, msg, models, modelFile, kv, events, toolCalls, jointRecords, exportAllConversations, importConversations, deleteAllConversations, factoryReset, storageEstimate } from './store.mjs';
import { SPECIALISTS, MODEL_META, route } from './compass.mjs';
import { buildChatPrompt } from './prompts.mjs';
import { tryLocalAnswer, extractExactArithmetic, parseToolFabric, reachableToolsJSON } from './tools.mjs';
import { runToolProposal } from './tool-runner.mjs';
import { ExactSpiral, isReuseCandidate, repairHeartbeat } from './spiral.mjs';
import { proposeExactToolJoint, EXACT_TOOL_JOINT, BRAKED_MODEL_JOINT } from './joint.mjs';
import { md } from './md.mjs';
import { initOrb } from './orb.mjs';

const $ = id => document.getElementById(id);
const state = { conversation: null, messages: [], selected: 'auto', think: false,
  available: new Map(), failedModels: new Set(), autoPreparing: false, busy: null, worker: null, ingest: null, orb: null, theme: 'system' };
const names = { falcon_instruct: 'Falcon Instruct', falcon_reason: 'Falcon R',
  falcon_coder: 'Falcon Coder', falcon_tools: 'Falcon Tool-Calling' };
const localModelFiles = [
  'Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf',
  'Falcon-H1R-Tiny-90M-Q4_K_M.gguf',
  'Falcon-H1-Tiny-Coder-Q4_K_M.gguf',
  'Falcon-H1-Tiny-Tool-Calling-Q4_K_M.gguf',
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
  if (modelId === 'falcon_reason') {
    const end = raw.lastIndexOf('</think>');
    return end >= 0 ? raw.slice(end + 8).trimStart() : '';
  }
  if (modelId === 'falcon_tools' && (raw.includes('<tool_call>') || /`\s*\{\s*"name"/.test(raw))) {
    return 'Checking a local tool proposal…';
  }
  return raw;
}
function closeDrawer() { $('app').classList.remove('nav-open'); }

function renderModels() {
  $('modelRows').replaceChildren(); $('modelMenu').replaceChildren();
  for (const id of SPECIALISTS) {
    const d = state.available.get(id);
    const row = document.createElement('label'); row.className = 'model-row'; row.dataset.modelId = id;
    row.innerHTML = '<input type="radio" name="setupModelChoice"><b></b><span class="st"></span><span class="desc"></span>';
    row.querySelector('input').checked = state.selected === id;
    row.querySelector('input').onchange = () => { state.selected = id; $('modelName').textContent = MODEL_META[id].display;
      renderModels(); if (!state.available.has(id) && !state.autoPreparing) void prepareSelectedModel(); };
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
    item.querySelector('span').textContent = id === 'auto' ? 'Conservative Instruct until routing is verified' :
      (state.available.has(id) ? names[id] + ' · ready' : names[id] + ' · prepares from this site when used, if available');
    item.onclick = () => { state.selected = id; $('modelName').textContent = MODEL_META[id].display;
      $('modelMenu').hidden = true; $('modelBtn').setAttribute('aria-expanded', 'false'); renderModels(); $('modelBtn').focus();
      if (!state.available.has(selectedModel()) && !state.autoPreparing) void prepareSelectedModel(); };
    $('modelMenu').append(item);
  }
  $('heroStatus').textContent = state.provisioning ? `${names[state.provisioning]} · ${state.provisionProgress || 'preparing locally'}` :
    state.available.size ? `${state.available.size} of 4 local specialists imported` : 'Waiting for a local model · import a GGUF in Settings';
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
    const label = document.createElement('span'); label.className = 'm-name'; label.textContent = m.model_id ? names[m.model_id] : 'Seren 7';
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
      const values = [
        ['Model', m.model_id || 'deterministic'], ['Backend', m.meta.backend || 'local'],
        ['Route mode', m.meta.route_mode || 'unrecorded'],
        ['Task category', m.meta.route_category || 'unrecorded'],
        ['Route reason', m.meta.route_reason || 'unrecorded'],
        ['Policy', m.meta.policy_version || 'unrecorded'],
        ['Tokens', m.meta.tokens ?? 'unknown'], ['First token', m.meta.ttft_ms == null ? 'unmeasured' : m.meta.ttft_ms + ' ms'],
        ['Elapsed', m.meta.elapsed_ms == null ? 'unmeasured' : m.meta.elapsed_ms + ' ms'],
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
      const expression = extractExactArithmetic(priorUser);
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
  const worker = new Worker(new URL('../workers/runtime-worker.mjs', import.meta.url), { type: 'module' });
  worker.onmessage = async ({ data }) => {
    if (data.type === 'reply') {
      const waiting = waiters.get(data.reqId); if (waiting) { waiters.delete(data.reqId); data.ok ? waiting.resolve(data) : waiting.reject(new Error(data.message)); }
      return;
    }
    if (data.type !== 'event') return;
    const run = state.busy;
    if (!run || data.request_id !== run.id) return;
    if (data.schema_version !== 1 || !Number.isInteger(data.sequence) || data.sequence <= (run.lastSequence || 0)) return;
    if (run.terminalSeen) return;
    run.lastSequence = data.sequence;
    if (data.kind === 'complete' || data.kind === 'cancelled' || data.kind === 'error') run.terminalSeen = true;
    // Messages hold the visible answer. Keep event receipts without duplicating
    // token text, which can include private reasoning or other sensitive content.
    const receipt = data.kind === 'token'
      ? { token_id: data.payload.token_id, token_count: data.payload.token_count, replace: !!data.payload.replace }
      : data.payload;
    await events.append(run.id, data.kind, receipt, run.conversationId);
    if (data.kind === 'token') {
      armGenerationWatchdog(run);
      if (!run.firstTokenAt) run.firstTokenAt = performance.now();
      run.content = data.payload.replace ? data.payload.text : run.content + data.payload.text;
      const m = state.messages.find(x => x.id === run.messageId) || await msg.get(run.messageId);
      const visible = visibleOutput(run.modelId, run.content);
      if (m) { m.content = visible; updateStreamMessage(m); }
      if (data.payload.token_count % 8 === 0) await msg.update(run.messageId, { content: visible });
    } else if (data.kind === 'complete' || data.kind === 'cancelled' || data.kind === 'error') {
      const m = state.messages.find(x => x.id === run.messageId) || await msg.get(run.messageId);
      if (m) {
        m.content = '';
        let toolReceipts = null;
        if (data.kind === 'complete' && m.model_id === 'falcon_tools') {
          const proposal = parseToolFabric(run.content);
          if (proposal.calls.length) {
            toolReceipts = [];
            for (const call of proposal.calls.slice(0, 3)) {
              const result = await runToolProposal(call, { signal: run.toolAbortController.signal });
              const receipt = { name: call.name, arguments: call.arguments, ...result };
              toolReceipts.push(receipt);
              try {
                await toolCalls.add({ runId: run.id, conversationId: run.conversationId,
                  proposerModelId: m.model_id, call, result });
                await events.append(run.id, 'tool_result', { name: call.name, status: result.status,
                  verification: result.verification || 'none', elapsed_ms: result.elapsed_ms }, run.conversationId);
              } catch (error) {
                receipt.receipt_error = `local receipt write failed: ${error.message}`;
              }
              if (result.status === 'cancelled') break;
            }
            m.content = toolReceipts.map(r => r.ok ? `${r.name}: ${r.value}` :
              `${r.name}: ${r.status === 'denied' ? 'rejected' : 'failed'} (${r.error})`).join('\n');
          } else if (proposal.errors.length || run.content.includes('<tool_call>')) {
            m.content = 'Malformed local tool proposal. No action was run.';
          }
        }
        m.content ||= visibleOutput(m.model_id, run.content) || (data.kind === 'error' ? `Local runtime error: ${data.payload.message}` :
          m.model_id === 'falcon_reason' ? 'No final answer was emitted within this run’s token budget.' : '');
        m.status = run.cancelled || data.kind === 'cancelled' ? 'stopped' : data.kind === 'complete' ? 'done' : 'error';
        m.meta = { ...m.meta, tokens: data.payload.tokens || 0, backend: 'wasm', finished_at: Date.now(),
          ttft_ms: run.firstTokenAt ? Math.round(run.firstTokenAt - run.startedAt) : null,
          elapsed_ms: Math.round(performance.now() - run.startedAt), run_id: run.id,
          tool_receipts: toolReceipts };
        await msg.update(m.id, { content: m.content, status: m.status, meta: m.meta });
      }
      setBusy(null); renderConversation({ animate: false }); status(m?.status === 'stopped' ? 'Stopped' : data.kind === 'complete' ? 'Response complete · local CPU WebAssembly' : 'Local runtime error', true);
    }
  };
  worker.onerror = async e => {
    const error = new Error('Runtime worker failed: ' + e.message);
    worker.terminate(); state.worker = null;
    for (const waiter of waiters.values()) waiter.reject(error);
    waiters.clear();
    await failActiveRun(error.message);
  };
  state.worker = worker; return worker;
}
async function failActiveRun(message) {
  const run = state.busy;
  if (run) {
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
    state.worker?.terminate(); state.worker = null;
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
      waiters.delete(reqId); state.worker?.terminate(); state.worker = null;
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
  state.busy.toolAbortController?.abort();
  if (!state.busy.terminalSeen) state.worker?.postMessage({ cmd: 'abort', reqId: state.busy.id });
  armGenerationWatchdog(state.busy, 10000);
  status('Stopping local generation…');
}

async function submit(text, { regen = false } = {}) {
  text = text.trim(); if (!text || state.busy || !state.available.has(selectedModel())) return;
  await ensureConversation(text);
  if (!regen) { const user = await msg.add(state.conversation.id, { role: 'user', content: text }); state.messages.push(user); }
  $('prompt').value = ''; $('sendBtn').disabled = true;
  let local = null, spiralRun = null;
  const jointEnabled = new URLSearchParams(location.search).get('joint_policy') !== 'conservative';
  const jointRun = jointEnabled ? proposeExactToolJoint(text, { selected: state.selected }) : null;
  if (jointRun) local = { answer: jointRun.answer, via: jointRun.via };
  if (state.selected !== 'falcon_tools') {
    const expression = extractExactArithmetic(text);
    if (isReuseCandidate(expression)) {
      try {
        spiralRun = await exactSpiral.solve(expression, { scope: state.conversation.id });
        local = { answer: spiralRun.value, via: spiralRun.reused ? 'verified shared state' : 'verified exact arithmetic' };
      } catch { /* storage/canonicalization failure falls back to independent calculation */ }
    }
    local ||= tryLocalAnswer(text);
  }
  if (local) {
    const runId = spiralRun || jointRun ? newId() : null;
    const answer = await msg.add(state.conversation.id, { role: 'assistant', content: local.answer,
      meta: { via: local.via, ...(jointRun ? { run_id: runId, backend: 'deterministic',
        route_mode: 'verified_joint_tool', route_category: 'tool',
        route_reason: 'Explicit bounded calculator request passed independent exact verification',
        policy_version: jointRun.policy_version, joint_action: jointRun.action,
        verification_id: jointRun.verification } : {}), ...(spiralRun ? { run_id: runId, backend: 'deterministic',
        route_mode: spiralRun.route, route_category: 'arithmetic', route_reason: 'Bounded exact shared-state Spiral',
        policy_version: 'spiral-exact-1', spiral_deltas: spiralRun.deltas,
        spiral_ack: 'persisted_with_message', spiral_replay_status: 'not_replayed',
        shared_state_id: spiralRun.stateId || null } : {}) } });
    if (jointRun) {
      for (const policy of [EXACT_TOOL_JOINT, BRAKED_MODEL_JOINT]) {
        try {
          if (!(await jointRecords.policy(policy.policy_id))) await jointRecords.putPolicy({
            id: policy.policy_id, ...policy, schema_version: 3,
            parameters_json: JSON.stringify({ grammar: policy.policy_id === EXACT_TOOL_JOINT.policy_id ? 'explicit_bounded_exact_arithmetic' : 'mixed_specialist_route' }),
            applicability_json: JSON.stringify({ description: policy.applicability }),
            parent_policy_version: 'compass-conservative-1', created_at: Date.now(),
          });
        } catch { /* policy receipt failure must not replace verified answer */ }
      }
    }
    state.messages.push(answer); renderConversation(); await conv.touch(state.conversation.id); renderThreads();
    await exactSpiral.flush({ onlyPending: true }).catch(() => {});
    return;
  }
  const requiredModel = state.selected === 'auto' ? 'falcon_instruct' : state.selected;
  if (!state.available.has(requiredModel)) return;
  const ready = new Set(state.available.keys());
  const decision = route(text, { ready, selected: state.selected, think: state.think });
  const chosen = decision.modelId;
  if (!chosen || !state.available.has(chosen)) {
    status('Local model not ready · import the selected Falcon GGUF', true); $('setupDialog').showModal(); renderConversation(); return;
  }
  const desc = state.available.get(chosen);
  const answer = await msg.add(state.conversation.id, { role: 'assistant', content: '', status: 'streaming', model_id: chosen,
    meta: { backend: 'wasm', route_mode: decision.mode, route_category: decision.category,
      route_reason: decision.reason, policy_version: decision.policyVersion } });
  state.messages.push(answer); renderConversation();
  const runId = newId(); setBusy({ id: runId, messageId: answer.id, conversationId: state.conversation.id,
    modelId: chosen, content: '', startedAt: performance.now(), firstTokenAt: null, lastSequence: 0,
    toolAbortController: new AbortController() });
  try {
    await events.append(runId, 'route_selected', { model_id: chosen, backend: 'wasm',
      reason_category: decision.category, route_mode: decision.mode, policy_version: decision.policyVersion,
      token_budget: decision.budget.maxTokens }, state.conversation.id);
    const blob = await modelFile(desc);
    if (!blob) throw new Error('Verified model bytes missing from browser storage');
    status('Loading ' + names[chosen] + ' locally…');
    await request('load', { modelId: chosen, blob, expectedSha256: desc.sha256 });
    if (state.busy?.cancelled) {
      answer.status = 'stopped'; await msg.update(answer.id, { status: 'stopped' });
      setBusy(null); renderConversation(); status('Stopped before generation', true); return;
    }
    const turns = state.messages.filter(m => (m.role === 'user' || m.role === 'assistant') && m.id !== answer.id && m.content)
      .slice(-12).map(m => ({ role: m.role, content: m.content }));
    const built = buildChatPrompt(chosen, turns, { think: state.think,
      tools: chosen === 'falcon_tools' ? reachableToolsJSON() : null });
    status('Writing with ' + names[chosen] + ' · CPU WebAssembly');
    runWorker().postMessage({ cmd: 'complete', reqId: runId, modelId: chosen,
      prompt: built.prompt, stops: desc.stops || built.stops,
      maxTokens: decision.budget.maxTokens,
      temperature: chosen === 'falcon_tools' ? 0 : 0.7 });
    armGenerationWatchdog(state.busy);
  } catch (e) {
    await msg.update(answer.id, { status: 'error', content: 'Local runtime error: ' + e.message });
    answer.status = 'error'; answer.content = 'Local runtime error: ' + e.message;
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
        status('Four approved local models verified in this browser', true);
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
    state.worker?.terminate(); state.worker = null;
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
  else if (state.available.size < SPECIALISTS.length && localStorage.getItem('seren-auto-provision-suppressed') !== '1') void prepareAllHostedModels();
}
function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  for (const b of document.querySelectorAll('[data-theme-set]')) b.setAttribute('aria-pressed', String(b.dataset.themeSet === state.theme));
  state.orb?.setLight(state.theme === 'light' || state.theme === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
}

boot().catch(e => { console.error(e); status('Seren could not start: ' + e.message, true); });
