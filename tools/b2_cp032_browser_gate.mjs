/* CP032 owner-run acceptance: actual local Chromium, pinned Instruct and UI.
 *
 * This runner deliberately cannot promote a release gate. A real browser and
 * independently reviewed evidence are required; `preflight` only checks that
 * an attempt can start. It never attaches to an already-running localhost app.
 *
 *   npm ci && npm run prepare:runtime
 *   node tools/b2_cp032_browser_gate.mjs --mode preflight
 *   node tools/b2_cp032_browser_gate.mjs --mode smoke
 *   node tools/b2_cp032_browser_gate.mjs --mode full
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { performance } from 'node:perf_hooks';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_SHA256 } from '../app/js/model-receipts.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PINNED_MODEL = resolve(ROOT, 'workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf');
const REQUIRED_ASSETS = [
  'app/vendor/wllama/index.js',
  'app/vendor/wllama/wllama-single.wasm',
  'app/vendor/wllama/wllama-multi.wasm',
  'app/index.html',
  'app/workers/runtime-worker.mjs',
  'app/workers/tool-worker.mjs',
];
export const CP032_BROWSER_PHASES = Object.freeze({
  smoke: Object.freeze([
    'tools/browser_b2_tool_capability_smoke.mjs',
    'tools/browser_b2_ui_smoke.mjs',
  ]),
  full: Object.freeze([
    'tools/browser_b2_tool_capability_smoke.mjs',
    'tools/browser_b2_ui_smoke.mjs',
    'tools/browser_b2_lazy_load_smoke.mjs',
    'tools/browser_store_smoke.mjs',
    'tools/browser_schema_migration.mjs',
    'tools/browser_data_controls_smoke.mjs',
    'tools/browser_stop_smoke.mjs',
    'tools/browser_import_negative.mjs',
    'tools/b2_cp026_real_falcon_ab.mjs',
  ]),
});

export function parseCp032BrowserOptions(argv = []) {
  const supported = new Set(['--mode', '--port', '--out', '--browser-path']);
  const parsed = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    if (!supported.has(argv[i]) || i + 1 >= argv.length || parsed.has(argv[i]))
      throw Error('unknown, repeated or incomplete CP032 browser option');
    parsed.set(argv[i], argv[i + 1]);
  }
  const mode = parsed.get('--mode') || 'preflight';
  if (!['preflight', 'smoke', 'full', 'list'].includes(mode)) throw Error('invalid browser gate mode');
  const port = Number(parsed.get('--port') || '8799');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('invalid local port');
  const output = parsed.get('--out') || `evidence/cp032-browser-owner-${new Date().toISOString().replaceAll(':', '-')}.json`;
  if (output.startsWith('/') || output.includes('..') || !output.startsWith('evidence/') ||
      resolve(ROOT, output).slice(0, ROOT.length + 1) !== ROOT + sep)
    throw Error('evidence output must stay inside repository evidence/');
  const browserPath = parsed.get('--browser-path') || process.env.B2_CHROMIUM_EXECUTABLE_PATH || null;
  return { mode, port, output, browserPath };
}

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
async function fileExists(path) {
  try { return (await stat(path)).isFile(); } catch { return false; }
}
async function availablePort(port) {
  return new Promise(resolvePromise => {
    const server = createServer();
    server.once('error', error => resolvePromise({ ok: false, reason: error.code || error.message }));
    server.listen(port, '127.0.0.1', () => server.close(() => resolvePromise({ ok: true })));
  });
}

export async function cp032BrowserPreflight(options) {
  const issues = [], checks = {};
  for (const path of REQUIRED_ASSETS) {
    checks[path] = await fileExists(resolve(ROOT, path));
    if (!checks[path]) issues.push(`missing_asset:${path}`);
  }
  checks.modelPresent = await fileExists(PINNED_MODEL);
  if (!checks.modelPresent) issues.push('missing_pinned_instruct_gguf');
  else {
    checks.modelSha256 = await sha256File(PINNED_MODEL);
    checks.modelExpectedSha256 = EXPECTED_SHA256.falcon_instruct;
    if (checks.modelSha256 !== EXPECTED_SHA256.falcon_instruct)
      issues.push('pinned_model_hash_mismatch');
  }
  try {
    const { chromium } = await import('playwright');
    const chosen = options.browserPath || chromium.executablePath();
    checks.browserExecutable = chosen;
    checks.browserBinaryPresent = await fileExists(chosen);
    if (!checks.browserBinaryPresent) issues.push('chromium_binary_missing');
  } catch { issues.push('playwright_not_installed'); }
  checks.port = await availablePort(options.port);
  if (!checks.port.ok) issues.push(`localhost_port_unavailable:${checks.port.reason}`);
  try { checks.gitRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); }
  catch { issues.push('git_revision_unavailable'); }
  checks.nodeVersion = process.version;
  checks.platform = `${process.platform}/${process.arch}`;
  return { status: issues.length ? 'BLOCKED_PREFLIGHT' : 'READY_TO_ATTEMPT',
    issues, checks, notBrowserExecution: true, notReleaseApproval: true };
}

function stopOwnedProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try { child.kill('SIGTERM'); } catch { /* already exited */ }
}

async function startOwnedServer(options) {
  const child = spawn(process.execPath, ['tools/serve.mjs'], {
    cwd: ROOT, env: { ...process.env, PORT: String(options.port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let diagnostics = '';
  child.stdout.on('data', chunk => { diagnostics = (diagnostics + chunk.toString()).slice(-2500); });
  child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk.toString()).slice(-2500); });
  const base = `http://127.0.0.1:${options.port}/`;
  const deadline = performance.now() + 10000;
  while (performance.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const [page, model] = await Promise.all([
        fetch(base, { signal: AbortSignal.timeout(1200) }),
        fetch(`${base}models/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf`,
          { method: 'HEAD', signal: AbortSignal.timeout(1200) }),
      ]);
      const html = await page.text();
      const expectedModelSize = (await stat(PINNED_MODEL)).size;
      if (page.ok && model.ok && html.includes('Seren') &&
          page.headers.get('cross-origin-opener-policy') === 'same-origin' &&
          page.headers.get('cross-origin-embedder-policy') === 'credentialless' &&
          Number(model.headers.get('content-length')) === expectedModelSize)
        return { child, base, checks: { appGet: page.status, modelHead: model.status,
          modelSize: expectedModelSize, coop: true, coep: true } };
    } catch { /* server startup still in flight */ }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
  }
  stopOwnedProcess(child);
  throw Error(`Owned local app server failed to become ready: ${diagnostics}`);
}

async function runPhase(script, options, timeoutMs) {
  const started = performance.now();
  return new Promise(resolvePromise => {
    const env = { ...process.env, B2_BASE_URL: `http://127.0.0.1:${options.port}/` };
    if (options.browserPath) env.B2_CHROMIUM_EXECUTABLE_PATH = options.browserPath;
    const child = spawn(process.execPath, [script], { cwd: ROOT, env,
      stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', finished = false;
    const capture = (text, chunk) => (text + chunk.toString()).slice(-12000);
    child.stdout.on('data', chunk => { stdout = capture(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = capture(stderr, chunk); });
    const timer = setTimeout(() => {
      if (!finished) stopOwnedProcess(child);
    }, timeoutMs);
    child.once('error', error => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      resolvePromise({ script, status: 'BLOCKED_RUNNER', error: String(error.message),
        elapsedMs: Math.round(performance.now() - started) });
    });
    child.once('exit', (code, signal) => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      resolvePromise({ script, status: code === 0 ? 'PASS_SCOPED' : 'FAIL', exitCode: code,
        signal, elapsedMs: Math.round(performance.now() - started), stdout, stderr });
    });
  });
}

export async function runCp032BrowserGate(options) {
  const preflight = await cp032BrowserPreflight(options);
  const result = { checkpoint: 'CP032_BROWSER_OWNER_GATE',
    source: 'local source checkout; no external model inference',
    mode: options.mode, port: options.port, preflight, phases: [],
    finalStatus: preflight.status, browserReleaseAccepted: false,
    nativeTinyLinuxProven: false, physicalDeviceProven: false,
  };
  if (preflight.status !== 'READY_TO_ATTEMPT' || options.mode === 'preflight') return result;
  let server;
  try {
    server = await startOwnedServer(options);
    result.localServer = server.checks;
    for (const script of CP032_BROWSER_PHASES[options.mode]) {
      const phase = await runPhase(script, options,
        script.includes('real_falcon_ab') ? 1200000 : 360000);
      result.phases.push(phase);
      if (phase.status !== 'PASS_SCOPED') break;
    }
    result.finalStatus = result.phases.length === CP032_BROWSER_PHASES[options.mode].length &&
      result.phases.every(phase => phase.status === 'PASS_SCOPED') ?
      'PASS_SCOPED_BROWSER_RUN' : 'FAIL_OR_BLOCKED_BROWSER_RUN';
  } catch (error) { result.finalStatus = 'BLOCKED_SERVER_OR_BROWSER'; result.error = String(error.message); }
  finally { stopOwnedProcess(server?.child); }
  return result;
}

async function main() {
  let options;
  try { options = parseCp032BrowserOptions(process.argv.slice(2)); }
  catch (error) { console.error(`CP032 browser gate: ${error.message}`); process.exitCode = 2; return; }
  if (options.mode === 'list') {
    console.log(JSON.stringify({ modes: ['preflight', 'smoke', 'full'],
      phases: CP032_BROWSER_PHASES, releaseAcceptedByThisScript: false }, null, 2));
    return;
  }
  const result = await runCp032BrowserGate(options);
  const destination = resolve(ROOT, options.output);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ output: options.output, finalStatus: result.finalStatus,
    issues: result.preflight.issues, phaseCount: result.phases.length,
    passed: result.phases.filter(phase => phase.status === 'PASS_SCOPED').length,
    browserReleaseAccepted: false }, null, 2));
  if (result.finalStatus !== 'PASS_SCOPED_BROWSER_RUN' &&
      result.finalStatus !== 'READY_TO_ATTEMPT') process.exitCode = 2;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] || ''))
  await main().catch(error => { console.error('CP032 browser runner error:', error.stack || error); process.exitCode = 2; });
