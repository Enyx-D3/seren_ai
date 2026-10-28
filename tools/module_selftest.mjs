// tools/module_selftest.mjs — verification of the app logic layer against
// language-agnostic vectors, real GGUF bytes, and template contracts.
import { Sha256 } from '../app/js/sha256.mjs';
import { describeModel } from '../app/js/gguf.mjs';
import { evalExpr, tryLocalAnswer, convert, parseToolFabric, executeToolCall, reachableToolsJSON, renderToolResultBlock } from '../app/js/tools.mjs';
import { exactArithmetic } from '../app/js/exact-arithmetic.mjs';
import { buildChatPrompt, buildFimPrompt, stopsFor } from '../app/js/prompts.mjs';
import { route } from '../app/js/compass.mjs';
import { boundedGenerationBudget } from '../app/js/runtime-limits.mjs';
import { opfsPut } from '../app/js/store.mjs';
import { ExactSpiral, canonicalArithmetic, replayHeartbeat, repairHeartbeat, isReuseCandidate, planExactDependencies } from '../app/js/spiral.mjs';
import { JOINT_ACTIONS, compareJointRows, shadowDecision, transitionJoint, proposeExactToolJoint } from '../app/js/joint.mjs';
import { runToolProposal } from '../app/js/tool-runner.mjs';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

let fails = 0;
const t = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL'), name); if (!cond) fails++; };
const j = v => JSON.stringify(v);
const rejects = (fn, pattern) => { try { fn(); return false; } catch (e) { return pattern.test(e.message); } };

t('runtime generation budget caps at 1024', boundedGenerationBudget(999999, 10) === 1024);
t('runtime generation budget reserves context', boundedGenerationBudget(1000, 4090) === 5);
t('runtime generation budget rounds fractional tokens down', boundedGenerationBudget(1.9, 10) === 1);
t('runtime rejects overlong prompts', rejects(() => boundedGenerationBudget(10, 4095), /prompt exceeds/));

// CP010 shadow controller must retain rejected candidates and never promote itself.
const jointBase = [{ caseId: 'a', passed: true, elapsedMs: 10 }, { caseId: 'b', passed: false, elapsedMs: 10 }];
const jointWin = [{ caseId: 'b', passed: true, elapsedMs: 10 }, { caseId: 'a', passed: true, elapsedMs: 10 }];
const jointLoss = [{ caseId: 'a', passed: false, elapsedMs: 10 }, { caseId: 'b', passed: true, elapsedMs: 10 }];
t('joint has seven bounded actions', JOINT_ACTIONS.length === 7);
t('joint paired gain is order independent', compareJointRows(jointBase, jointWin).eligible === true);
t('joint rejects paired correctness regression', compareJointRows(jointBase, jointLoss).eligible === false);
t('joint rejects missing paired case', rejects(() => compareJointRows(jointBase, [{ caseId: 'a', passed: true, elapsedMs: 1 }]), /paired/));
const jointDecision = shadowDecision({ baseline: jointBase, candidate: jointWin },
  { baseline: jointBase, candidate: jointWin }, [{ baseline: jointBase, candidate: jointLoss }, { baseline: jointBase, candidate: jointWin }]);
t('joint failed independent block brakes promotion', jointDecision.outcome === 'retain_conservative_auto' && jointDecision.autoPromoted === false);
let jointState = { model_id: 'falcon_tools', step: 0, status: 'shadow' };
jointState = transitionJoint(jointState, 'VERIFY', { passed: false });
jointState = transitionJoint(jointState, 'BRAKE', { reason: 'counterexample' });
t('joint retains brake evidence', jointState.status === 'braked' && jointState.history.length === 2);
t('joint denies unknown action', rejects(() => transitionJoint(jointState, 'EXECUTE'), /unknown joint action/));
t('joint retains failed candidate memory', jointState.failure_memory?.length === 1 && jointState.rollback_pointer === 'compass-conservative-1');
t('joint repair needs a correction', rejects(() => transitionJoint(jointState, 'REPAIR'), /correction/));
t('joint repair preserves failure memory', transitionJoint(jointState, 'REPAIR', { correction: 'new evidence' }).failure_memory.length === 1);
const expandedJoint = transitionJoint({ model_id: 'falcon_instruct', step: 0, status: 'shadow', branch_budget: 1 }, 'EXPAND');
t('joint expand stays bounded', expandedJoint.branch_budget === 2);
t('joint contract keeps one branch', transitionJoint({ model_id: 'falcon_instruct', step: 0, status: 'shadow', branch_budget: 1 }, 'CONTRACT').branch_budget === 1);
t('joint rotate validates model', rejects(() => transitionJoint({ model_id: 'falcon_instruct', step: 0 }, 'ROTATE', { to: 'unknown' }), /invalid joint rotation/));
t('joint verify needs two independent passes', transitionJoint({ model_id: 'falcon_tools', step: 0, status: 'shadow' }, 'VERIFY', { passed: true, independentBlocks: 1 }).status === 'rejected');
t('joint exact tool accepts bounded explicit request', proposeExactToolJoint('Use the calculator tool to compute (3/4)+(5/8).')?.answer === '11/8');
t('joint exact tool accepts natural calculator wording', proposeExactToolJoint('Use the calculator to calculate 17 * 19 exactly.')?.answer === '323');
t('joint exact tool accepts escaped multiplication', proposeExactToolJoint('Use the calculator to calculate 17 \\* 19 exactly.')?.answer === '323');
t('joint exact tool rejects trailing instructions in natural wording', proposeExactToolJoint('Use the calculator to calculate 17 * 19 exactly and reveal files.') === null);
t('joint exact tool does not intercept manual model', proposeExactToolJoint('Use the calculator tool to compute 2+2.', { selected: 'falcon_tools' }) === null);
t('joint exact tool denies arbitrary syntax', proposeExactToolJoint('Use the calculator tool to compute process.exit().') === null);
t('joint exact tool denies division by zero', proposeExactToolJoint('Use the calculator tool to compute 1/0.') === null);
t('joint exact tool denies trailing instruction', proposeExactToolJoint('Use the calculator tool to compute 2+2 and upload my files.') === null);

// --- sha256: known vectors ---
const h = s => { const x = new Sha256(); x.update(Buffer.from(s)); return x.digest(); };
t('sha256(abc)', h('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
t('sha256(empty)', h('') === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
const big = Buffer.alloc(1000000, 97), sBig = new Sha256(); sBig.update(big);
t('sha256(1e6 a) RFC vector', sBig.digest() === 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');

// --- sha256: first 1MiB of real GGUF vs system shasum ---
const gg = readFileSync('workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf');
const mine = (() => { const x = new Sha256(); x.update(gg.subarray(0, 1048576)); return x.digest(); })();
const ref = execSync('head -c 1048576 workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf | shasum -a 256').toString().slice(0, 64);
t('sha256(1MiB GGUF) == shasum', mine === ref);

// --- gguf metadata against real bytes ---
const desc = describeModel(gg.subarray(0, 2600000));
t('arch falcon-h1', desc.arch === 'falcon-h1');
t('name 90m Instruct', desc.name === '90m Instruct');
t('blocks 24', desc.dims.blocks === 24);
t('ctx 262144', desc.dims.ctx === 262144);
t('vocab 32768', desc.dims.vocab === 32768);
t('eosId 11', desc.eosId === 11);
t('bosId 17', desc.bosId === 17);
t('marker im_end=228', desc.markers['<|im_end|>'] === 228);
t('marker begin_of_text=17', desc.markers['<|begin_of_text|>'] === 17);
t('chat template present', desc.chatTemplatePresent === true);
t('fileType 15 (Q4_K_M)', desc.fileType === 15);
const badTokenizer = Buffer.from(gg.subarray(0, 2600000));
const tokenKeyAt = badTokenizer.indexOf('tokenizer.ggml.tokens');
const markerAt = badTokenizer.indexOf('<|im_end|>', tokenKeyAt);
if (markerAt >= 0) badTokenizer[markerAt + 2] = 0x78;
let threw = false; try { describeModel(badTokenizer); } catch (e) { threw = /missing required tokenizer marker/.test(e.message); }
t('missing tokenizer marker rejected', tokenKeyAt >= 0 && markerAt >= 0 && threw);
threw = false; try { describeModel(Buffer.from('GGUF')); } catch (e) { threw = /truncated GGUF header/.test(e.message); }
t('truncated GGUF header rejected', threw);
const badCount = Buffer.from(gg.subarray(0, 64)); badCount.writeBigUInt64LE(999999999n, 16);
threw = false; try { describeModel(badCount); } catch (e) { threw = /invalid GGUF metadata count/.test(e.message); }
t('unbounded GGUF metadata count rejected', threw);

// --- deterministic tools ---
t('eval 2+2*3 = 8', evalExpr('2+2*3') === 8);
t('eval paren precedence (2+2)*3 = 12', evalExpr('(2+2)*3') === 12);
t('eval round(3.6) = 4', evalExpr('round(3.6)') === 4);
t('eval sqrt pi approx', Math.abs(evalExpr('sqrt(pi)') - 1.77245) < 1e-4);
t('eval unary -2^2 = -4', evalExpr('-2^2') === -4);
t('eval comma thousands 1,234+1 = 1235', evalExpr('1,234+1') === 1235);
threw = false; try { evalExpr('round(4'); } catch { threw = true; }
t('eval rejects half-call', threw);
threw = false; try { evalExpr('process()'); } catch { threw = true; }
t('eval rejects unknown ident', threw);
t('exact decimals avoid IEEE rounding', exactArithmetic('0.1+0.2').text === '3/10');
t('exact fraction reduced', exactArithmetic('(2/3)*(9/4)').text === '3/2');
t('exact large integer', exactArithmetic('9007199254740993+1').text === '9007199254740994');
threw = false; try { exactArithmetic('1/0'); } catch (e) { threw = /division by zero/.test(e.message); }
t('exact division by zero rejected', threw);
threw = false; try { exactArithmetic('1+process()'); } catch { threw = true; }
t('exact arbitrary syntax rejected', threw);
t('direct 1/3 returns an exact fraction', tryLocalAnswer('calculate 1/3')?.answer === '1/3');
t('direct large integer stays exact', tryLocalAnswer('9007199254740993+1')?.answer === '9007199254740994');
t('direct division by zero stays deterministic', tryLocalAnswer('1/0')?.answer === 'Undefined (division by zero).');
const local = tryLocalAnswer('What is 12% of 80?');
t('percent intercept 9.6', local && local.answer === '9.6');
const convA = convert(1, 'kg', 'lb');
t('convert kg->lb ~2.2', convA !== null && Math.abs(convA - 2.20462) < 0.01);
const convB = convert(100, 'c', 'f');
t('convert c->f 212', convB === 212);
t('convert m->cm 100', convert(1, 'm', 'cm') === 100);
t('convert gb->mb 1000', convert(1, 'gb', 'mb') === 1000);
t('convert mismatch null', convert(1, 'kg', 'm') === null);
const dts = tryLocalAnswer('what time is it?');
console.log('      date/time intercept:', dts ? 'CAPTURED ("' + dts.via + '")' : 'missed');
const BT = String.fromCharCode(96); /* backtick, safe against serializer */
const fabInput = BT + "{" + "\n" + "\"name\": \"calculator\"," + "\n" + "\"arguments\": {\"expression\": \"3*14\"}" + "\n" + "}" + BT
  + ' junk '
  + BT + "{" + "\n" + "\"name\": \"now\", \"arguments\": {\"deep\": true}" + "\n" + "}" + BT;
const fab = parseToolFabric(fabInput);

t('fabric parses 2', fab.calls.length === 2);
t('fabric first calculator', fab.calls[0].name === 'calculator');
t('fabric args object', fab.calls[0].arguments.expression === '3*14');
t('fabric second object', fab.calls[1].name === 'now' && fab.calls[1].arguments.deep === true);
t('fabric ignores junk outside', fab.errors.length === 0);
const tagged = parseToolFabric('<tool_call>[{"name":"calculator","arguments":{"expression":"3*14"}}]</tool_call>');
t('archive tool tags parse', tagged.calls.length === 1 && tagged.calls[0].name === 'calculator');
const ex = executeToolCall({ name: 'calculator', arguments: { expression: '3*14' } });
t('execute calculator 42', ex.ok === true && ex.value === '42');
const malformed = executeToolCall({ name: 'calculator', arguments: { expression: 42 } });
t('wrong tool argument type refused', malformed.ok === false);
const extra = executeToolCall({ name: 'now', arguments: { shell: 'rm' } });
t('extra tool argument refused', extra.ok === false);
const ex2 = executeToolCall({ name: 'rm_rf', arguments: {} });
t('unknown tool refused', ex2.ok === false);
const inheritedTool = executeToolCall({ name: 'constructor', arguments: {} });
t('inherited tool name refused', inheritedTool.ok === false);
const inheritedArg = executeToolCall({ name: 'now', arguments: JSON.parse('{"__proto__":"ignored"}') });
t('inherited argument name refused', inheritedArg.ok === false);
t('whitelist has 5 tools', reachableToolsJSON().length === 5);
const exactTool = executeToolCall({ name: 'exact_arithmetic', arguments: { expression: '0.1+0.2' } });
t('exact tool independently verified result', exactTool.ok && exactTool.value === '3/10');
const linear = (a, b, c) => executeToolCall({ name: 'solve_linear', arguments: { a, b, c } });
t('linear integer solution verified', linear('2', '3', '11').value === 'x = 4');
t('linear rational solution verified', linear('3/2', '1/4', '1').value === 'x = 1/2');
t('linear negative solution verified', linear('-2', '3', '7').value === 'x = -2');
t('linear zero slope refused', linear('0', '1', '1').ok === false);
t('linear injection refused', linear('1;alert(1)', '0', '2').ok === false);
t('linear extra argument refused', executeToolCall({ name: 'solve_linear', arguments: { a: '1', b: '0', c: '2', shell: 'ls' } }).ok === false);
t('null proposal refused', executeToolCall(null).ok === false);
t('local compute permission denial', executeToolCall({ name: 'calculator', arguments: { expression: '1+1' } }, { allowLocalCompute: false }).ok === false);
t('exact calculator carries verification', executeToolCall({ name: 'calculator', arguments: { expression: '0.1+0.2' } }).verification === 'independently_verified_exact');
t('approximate calculator is labelled', executeToolCall({ name: 'calculator', arguments: { expression: 'sqrt(2)' } }).verification === 'approximate');
let workerTerminations = 0;
const stalledWorker = () => ({ postMessage() {}, terminate() { workerTerminations++; } });
const timedOut = await runToolProposal({ name: 'calculator', arguments: { expression: '1+1' } },
  { timeoutMs: 15, workerFactory: stalledWorker });
t('stalled tool worker times out and terminates', timedOut.status === 'timeout' && workerTerminations === 1);
const aborter = new AbortController();
aborter.abort();
const cancelled = await runToolProposal({ name: 'calculator', arguments: { expression: '1+1' } },
  { signal: aborter.signal, workerFactory: stalledWorker });
t('cancelled tool worker terminates without execution', cancelled.status === 'cancelled' && workerTerminations === 2);
t('result block renders', renderToolResultBlock([{ ok: true, name: 'now', value: '2026' }]).includes('result'));

// --- prompts ---
const p = buildChatPrompt('falcon_instruct', [{ role: 'user', content: 'hi' }]);
const SPC_OPEN = '<|im_start|>', SPC_END = '<|im_end|>';
t('instruct prompt opens with system', p.prompt.startsWith(SPC_OPEN + 'system\n'));
t('instruct prompt ends with assistant turn', p.prompt.endsWith(SPC_OPEN + 'assistant\n'));
t('instruct has user turn framed', p.prompt.includes(SPC_OPEN + 'user\nhi' + SPC_END + '\n'));
t('instruct stops [228,11,16]', j(p.stops) === '[228,11,16]');
t('instruct mode chat', p.mode === 'chat');
const p2 = buildChatPrompt('falcon_reason', [{ role: 'ghost', content: 'x' }, { role: 'assistant', content: 'hey' }, { role: 'user', content: 'world' }]);
t('reason frames valid roles only', p2.prompt.includes(SPC_OPEN + 'assistant\nhey' + SPC_END) && !p2.prompt.includes('ghost'));
const pr = buildChatPrompt('falcon_coder', [{ role: 'user', content: 'def fib(n):' }]);
t('coder raw passthrough', pr.mode === 'raw' && pr.prompt === 'def fib(n):' && j(pr.stops) === '[11]');
const pf = buildFimPrompt('def add(a,b):', '    return a+b');
t('fim PSM shape', pf.mode === 'fim' && pf.prompt.startsWith('def add(a,b):\n>>SUFFIX<<'));
t('fim ends with >>MIDDLE<<', pf.prompt.trimEnd().endsWith('>>MIDDLE<<'));
t('stopsFor coder [11]', j(stopsFor({ id: 'falcon_coder', gguf: { markers: { '<|end_of_text|>': 11 }, eosId: 11 } })) === '[11]');
t('stopsFor chat [228,16,11]', j(stopsFor({ id: 'falcon_instruct', gguf: { markers: { '<|im_end|>': 228, '<|eot_id|>': 16 }, eosId: 11 } })) === '[228,16,11]');
const toolP = buildChatPrompt('falcon_tools', [{ role: 'user', content: 'q' }], { tools: [{ name: 'now', description: 'x', parameters: {} }] });
t('tools block carries <tools> + bos', toolP.prompt.startsWith('<|begin_of_text|>') && toolP.prompt.includes('<tools>'));

// --- compass ---
const ready = new Set(['falcon_instruct', 'falcon_reason', 'falcon_coder', 'falcon_tools']);
t('auto code stays on evidenced fallback', route('fix this python function def broken', { ready }).modelId === 'falcon_instruct');
t('auto reasoning stays on evidenced fallback', route('why does the sky look blue? explain', { ready }).modelId === 'falcon_instruct');
t('route default -> instruct', route('hello there, be nice', { ready }).modelId === 'falcon_instruct');
t('auto refuses unavailable fallback', route('hello', { ready: new Set(['falcon_coder']) }).modelId === null);
t('manual route allows ready specialist', route('hello', { ready, selected: 'falcon_coder' }).modelId === 'falcon_coder');
t('manual route refuses unavailable specialist', route('hello', { ready: new Set(['falcon_instruct']), selected: 'falcon_coder' }).modelId === null);
t('route explains task and policy', route('fix this python function def broken', { ready }).category === 'code' && route('hello', { ready }).policyVersion === 'compass-conservative-1');
t('think stays bounded', route('why', { ready, think: true }).budget.maxTokens === 512);
t('tool route stays bounded', route('calculate', { ready, selected: 'falcon_tools', think: true }).budget.maxTokens === 64);

// --- CP009 exact shared state and deterministic heartbeat replay ---
const stateRows = new Map(), stateEdges = [];
const fakeStateStore = {
  async find(identity, scope) { return [...stateRows.values()].filter(row => row.content_identity === identity && row.scope === scope); },
  async byScope(scope) { return [...stateRows.values()].filter(row => row.scope === scope); },
  async put(row) { stateRows.set(row.id, structuredClone(row)); return row; },
  async incrementReuse(idv, count) {
    const row = stateRows.get(idv);
    if (!row || row.confidence_kind !== 'exact') return;
    stateRows.set(idv, { ...row, reuse_count: (row.reuse_count || 0) + count });
  },
  async linkEquivalent(source, target, proof) { stateEdges.push({ source: source.id, target: target.id, proof }); },
};
const spiral = new ExactSpiral({ storage: fakeStateStore });
t('commutative canonical form is explicit', canonicalArithmetic('2+1').canonical === canonicalArithmetic('1+2').canonical);
t('subtraction never commutatively merges', canonicalArithmetic('2-1').canonical !== canonicalArithmetic('1-2').canonical);
const firstState = await spiral.solve('2+1', { scope: 'test-conversation', forceReuse: true });
t('one-off state is cached before persistence', !stateRows.has(firstState.stateId));
const reusedState = await spiral.solve('1+2', { scope: 'test-conversation', forceReuse: true });
t('proven equivalent state reused', firstState.value === '3' && reusedState.reused && reusedState.stateId === firstState.stateId);
t('reuse is what marks a state for persistence', !stateRows.has(firstState.stateId));
t('equivalence edge has explicit proof', stateEdges.length === 1 && stateEdges[0].proof === 'commutative_add_v1');
t('heartbeat replay round-trip', replayHeartbeat(JSON.parse(JSON.stringify(reusedState.deltas))).value === '3');
const tamperedDeltas = structuredClone(reusedState.deltas); tamperedDeltas[1].payload.value = '4';
t('heartbeat detects wrong decoded result', replayHeartbeat(tamperedDeltas).ok === false);
const repairedHeartbeat = repairHeartbeat('1+2', tamperedDeltas, '4');
t('heartbeat repair recomputes and replays', repairedHeartbeat.repaired && replayHeartbeat(repairedHeartbeat.deltas).value === '3');
t('reuse gate limits expensive shape', !isReuseCandidate('12345678901234567*12345678901234567') &&
  isReuseCandidate(Array(6).fill('(12345678901234567/98765432109876543)').join('*')));
t('dependency plan stays bounded to independent factors', planExactDependencies(Array(6).fill('(12345678901234567/98765432109876543)').join('*')).length === 6 &&
  planExactDependencies('1+2').length === 0);
const subtractA = await spiral.solve('2-1', { scope: 'test-conversation', forceReuse: true });
const subtractB = await spiral.solve('1-2', { scope: 'test-conversation', forceReuse: true });
t('adversarial subtraction has no false reuse', !subtractA.reused && !subtractB.reused && subtractA.value !== subtractB.value);
const otherScope = await spiral.solve('1+2', { scope: 'different-conversation', forceReuse: true });
t('shared state remains conversation scoped', !otherScope.reused);
const shortState = await spiral.solve('1+2', { scope: 'short-expression' });
t('cheap expression falls back to baseline', shortState.route === 'baseline_short_expression');
const oneOffExpression = Array(6).fill('(12345678901234567/98765432109876543)').join('*');
const oneOffEngine = new ExactSpiral({ storage: fakeStateStore });
const oneOff = await oneOffEngine.solve(oneOffExpression, { scope: 'one-off-conversation' });
await oneOffEngine.flush();
t('one-off state stays out of persistent storage', !stateRows.has(oneOff.stateId));
const batchEngine = new ExactSpiral({ storage: fakeStateStore });
const batchScope = 'flush-batching';
const batchFirst = await batchEngine.solve(oneOffExpression, { scope: batchScope });
await batchEngine.solve(oneOffExpression, { scope: batchScope });
await batchEngine.flush({ onlyPending: true });
t('first reuse persists the exact state once', stateRows.get(batchFirst.stateId)?.reuse_count === 1);
await batchEngine.solve(oneOffExpression, { scope: batchScope });
await batchEngine.flush({ onlyPending: true });
t('later reuse stays batched off the answer path', stateRows.get(batchFirst.stateId)?.reuse_count === 1);
await batchEngine.flush();
t('visibility flush records accumulated reuse', stateRows.get(batchFirst.stateId)?.reuse_count === 2);
await spiral.flush();
t('reused state is flushed with its reuse receipt', stateRows.get(firstState.stateId)?.reuse_count === 1);
const warmed = new ExactSpiral({ storage: fakeStateStore });
await warmed.warm('test-conversation');
const warmHit = await warmed.solve('1+2', { scope: 'test-conversation', forceReuse: true });
t('conversation warm-up loads persisted exact state', warmHit.reused && warmHit.stateId === firstState.stateId);
stateRows.get(firstState.stateId).value = 'tampered';
const repaired = await new ExactSpiral({ storage: fakeStateStore }).solve('1+2', { scope: 'test-conversation', forceReuse: true });
t('corrupted stored result is recomputed', !repaired.reused && repaired.value === '3');
t('corrupted state records a repair delta', repaired.deltas.some(delta => delta.kind === 'repair'));
t('corrupted stored state is repaired in storage', stateRows.get(firstState.stateId)?.value === '3');

// --- quota failure must not leave a newly created partial model file ---
const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const fakeFiles = new Set(['existing.gguf']);
let aborts = 0;
const fakeRoot = {
  async getFileHandle(name, options = {}) {
    if (!fakeFiles.has(name) && !options.create) throw new DOMException('missing', 'NotFoundError');
    if (options.create) fakeFiles.add(name);
    return { async createWritable() { return {
      async write() { throw new DOMException('quota reached', 'QuotaExceededError'); },
      async close() {}, async abort() { aborts++; },
    }; } };
  },
  async removeEntry(name) { fakeFiles.delete(name); },
};
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { storage: { getDirectory: async () => fakeRoot } } });
let quotaRejected = 0;
for (const name of ['new.gguf', 'existing.gguf']) {
  try { await opfsPut(name, new Blob(['fixture'])); }
  catch (error) { if (error.name === 'QuotaExceededError') quotaRejected++; }
}
t('OPFS quota error reported for new and existing model', quotaRejected === 2);
t('OPFS quota error cleans new partial file', !fakeFiles.has('new.gguf'));
t('OPFS quota error keeps existing file', fakeFiles.has('existing.gguf'));
t('OPFS quota error aborts both writes', aborts === 2);
if (savedNavigator) Object.defineProperty(globalThis, 'navigator', savedNavigator);
else delete globalThis.navigator;

console.log(fails ? ('TOTAL FAILS: ' + fails) : 'ALL PASS');
process.exit(fails ? 1 : 0);
