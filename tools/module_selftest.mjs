// tools/module_selftest.mjs — verification of the app logic layer against
// language-agnostic vectors, real GGUF bytes, and template contracts.
import { Sha256 } from '../app/js/sha256.mjs';
import { describeModel } from '../app/js/gguf.mjs';
import { evalExpr, tryLocalAnswer, convert, parseToolFabric, executeToolCall, reachableToolsJSON, renderToolResultBlock } from '../app/js/tools.mjs';
import { buildChatPrompt, buildFimPrompt, stopsFor } from '../app/js/prompts.mjs';
import { route } from '../app/js/compass.mjs';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

let fails = 0;
const t = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL'), name); if (!cond) fails++; };
const j = v => JSON.stringify(v);

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

// --- deterministic tools ---
t('eval 2+2*3 = 8', evalExpr('2+2*3') === 8);
t('eval paren precedence (2+2)*3 = 12', evalExpr('(2+2)*3') === 12);
t('eval round(3.6) = 4', evalExpr('round(3.6)') === 4);
t('eval sqrt pi approx', Math.abs(evalExpr('sqrt(pi)') - 1.77245) < 1e-4);
t('eval unary -2^2 = -4', evalExpr('-2^2') === -4);
t('eval comma thousands 1,234+1 = 1235', evalExpr('1,234+1') === 1235);
let threw = false; try { evalExpr('round(4'); } catch { threw = true; }
t('eval rejects half-call', threw);
threw = false; try { evalExpr('process()'); } catch { threw = true; }
t('eval rejects unknown ident', threw);
const local = tryLocalAnswer('What is 12% of 80?');
t('percent intercept 9.6', local && local.answer === '9.6');
const convA = convert(1, 'kg', 'lb');
t('convert kg->lb ~2.2', convA !== null && Math.abs(convA - 2.20462) < 0.01);
const convB = convert(100, 'c', 'f');
t('convert c->f 212', convB === 212);
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
const ex = executeToolCall({ name: 'calculator', arguments: { expression: '3*14' } });
t('execute calculator 42', ex.ok === true && ex.value === '42');
const ex2 = executeToolCall({ name: 'rm_rf', arguments: {} });
t('unknown tool refused', ex2.ok === false);
t('whitelist has 3 tools', reachableToolsJSON().length === 3);
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
t('route code -> coder', route('fix this python function def broken', { ready }).modelId === 'falcon_coder');
t('route why -> reason', route('why does the sky look blue? explain', { ready }).modelId === 'falcon_reason');
t('route default -> instruct', route('hello there, be nice', { ready }).modelId === 'falcon_instruct');
t('availability gate', route('fix this python function def broken', { ready: new Set(['falcon_instruct']) }).modelId === 'falcon_instruct');
t('think biases reasoning', route('what should I consider', { ready, think: true }).modelId === 'falcon_reason');

console.log(fails ? ('TOTAL FAILS: ' + fails) : 'ALL PASS');
process.exit(fails ? 1 : 0);
