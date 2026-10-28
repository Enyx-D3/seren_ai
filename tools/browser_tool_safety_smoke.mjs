import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage(), errors = [], externalRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:8799/')) externalRequests.push(request.url()); });
  await page.goto('http://127.0.0.1:8799/');
  const results = await page.evaluate(async () => {
    const { runToolProposal } = await import('/js/tool-runner.mjs');
    const run = (name, args) => runToolProposal({ name, arguments: args });
    const exact = await run('calculator', { expression: '0.1+0.2' });
    const linear = await run('solve_linear', { a: '3/2', b: '1/4', c: '1' });
    const unknown = await run('shell', { command: 'whoami' });
    const inherited = await run('constructor', {});
    const malformed = await run('calculator', { expression: 42 });
    const extra = await run('now', { shell: 'rm' });
    const injected = await run('solve_linear', { a: '1;fetch("https://example.invalid")', b: '0', c: '2' });
    const nullCall = await runToolProposal(null);
    const bypassAttempt = await runToolProposal({ name: 'calculator', arguments: { expression: '1+1' }, permissionScope: 'shell_and_network' });
    let terminated = false;
    const timeout = await runToolProposal({ name: 'calculator', arguments: { expression: '1+1' } },
      { timeoutMs: 20, workerFactory: () => ({ postMessage() {}, terminate() { terminated = true; } }) });
    return { exact, linear, unknown, inherited, malformed, extra, injected, nullCall, bypassAttempt, timeout, terminated };
  });
  const denied = ['unknown', 'inherited', 'malformed', 'extra', 'injected', 'nullCall'].every(key =>
    results[key].ok === false && results[key].status === 'denied');
  const passed = results.exact.value === '3/10' && results.exact.verification === 'independently_verified_exact' &&
    results.linear.value === 'x = 1/2' && results.linear.verification === 'independently_verified_exact' &&
    results.bypassAttempt.value === '2' &&
    denied && results.timeout.status === 'timeout' && results.terminated &&
    !errors.length && !externalRequests.length;
  console.log(JSON.stringify({ passed, results, errors, externalRequests }, null, 2));
  if (!passed) process.exitCode = 1;
} finally { await browser.close(); }
