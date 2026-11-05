/* Run after `npm ci` and `npm run serve` from the Seren source checkout.
 * This tests the real browser Worker tool lane. It does not test native Linux.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.B2_BASE_URL || 'http://127.0.0.1:8799/';
// Playwright's managed Chromium is preferred. A developer can point this
// smoke at an existing local Chromium/Chrome without changing the test or
// granting any extra capability to the application under test.
const executablePath = process.env.B2_CHROMIUM_EXECUTABLE_PATH;
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [], externalRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (!request.url().startsWith(base)) externalRequests.push(request.url());
  });
  // Keep the test on the served app origin while avoiding unrelated model
  // provisioning/UI work. The imports and Workers still load from real source.
  await page.route(base, route => route.fulfill({ status: 200, contentType: 'text/html',
    body: '<!doctype html><html><head><title>B2 Tool Capability Smoke</title></head><body></body></html>' }));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const { createB2ToolCapabilitySession } = await import('/js/b2-tool-capability.mjs');
    const exact = expression => ({ name: 'exact_arithmetic', arguments: { expression } });
    let deniedAllocations = 0;
    const denyFactory = () => { deniedAllocations++; throw new Error('denied proposal allocated a Worker'); };
    const defaultDeny = createB2ToolCapabilitySession({ allowedTools: ['exact_arithmetic'], workerFactory: denyFactory });
    const noCapability = await defaultDeny.run(exact('1+1'));
    const guarded = createB2ToolCapabilitySession({ allowLocalCompute: true, allowedTools: ['exact_arithmetic'],
      workerFactory: denyFactory });
    const unauthorized = await guarded.run({ name: 'shell', arguments: { command: 'ls' } });
    const inherited = await guarded.run({ name: 'constructor', arguments: {} });
    const protoName = await guarded.run({ name: '__proto__', arguments: {} });
    const pollutedArgs = await guarded.run({ name: 'exact_arithmetic',
      arguments: JSON.parse('{"__proto__":"yes","expression":"2+2"}') });
    const inheritedArgs = await guarded.run({ name: 'exact_arithmetic',
      arguments: Object.assign(Object.create({ shell: 'ls' }), { expression: '2+2' }) });
    const constructorArg = await guarded.run({ name: 'exact_arithmetic',
      arguments: JSON.parse('{"constructor":"bad","expression":"2+2"}') });

    // Real browser Worker execution, not a Node-side executeToolCall double.
    const allowed = createB2ToolCapabilitySession({ allowLocalCompute: true, allowedTools: ['exact_arithmetic'] });
    const answer = await allowed.run(exact('17*19'));

    // Wrap real Workers but intentionally withhold a posted task. This checks
    // termination/cancellation mechanics rather than running hostile code.
    let terminated = 0;
    const stalledRealWorker = () => {
      const worker = new Worker('/workers/tool-worker.mjs', { type: 'module' });
      return { onmessage: null, onerror: null,
        postMessage() {},
        terminate() { terminated++; worker.terminate(); } };
    };
    const timed = createB2ToolCapabilitySession({ allowLocalCompute: true,
      allowedTools: ['exact_arithmetic'], workerFactory: stalledRealWorker, maxPerCallMs: 20 });
    const timeout = await timed.run(exact('1+1'));
    const controller = new AbortController();
    const abortSession = createB2ToolCapabilitySession({ allowLocalCompute: true,
      allowedTools: ['exact_arithmetic'], workerFactory: stalledRealWorker, signal: controller.signal });
    const pendingAbort = abortSession.run(exact('1+1'));
    controller.abort();
    const aborted = await pendingAbort;
    const closeSession = createB2ToolCapabilitySession({ allowLocalCompute: true,
      allowedTools: ['exact_arithmetic'], workerFactory: stalledRealWorker });
    const pendingClose = closeSession.run(exact('1+1'));
    closeSession.close();
    const closed = await pendingClose;
    return { noCapability, unauthorized, inherited, protoName, pollutedArgs, inheritedArgs,
      constructorArg, deniedAllocations, answer, timeout, aborted, closed, terminated };
  });

  assert.equal(result.noCapability.reason, 'local_compute_not_authorized');
  assert.equal(result.unauthorized.reason, 'unknown_tool');
  assert.equal(result.inherited.reason, 'unknown_tool');
  assert.equal(result.protoName.reason, 'unknown_tool');
  assert.equal(result.pollutedArgs.reason, 'argument_schema_mismatch');
  assert.equal(result.inheritedArgs.reason, 'invalid_arguments');
  assert.equal(result.constructorArg.reason, 'argument_schema_mismatch');
  assert.equal(result.deniedAllocations, 0, 'unauthorized model proposal allocated a Worker');
  assert.equal(result.answer.status, 'succeeded');
  assert.equal(result.answer.value, '323');
  assert.equal(result.answer.verification, 'independently_verified_exact');
  assert.equal(result.timeout.status, 'timeout');
  assert.equal(result.aborted.status, 'cancelled');
  assert.equal(result.closed.status, 'cancelled');
  assert.equal(result.terminated, 3);
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  console.log(JSON.stringify({ passed: true, browser: 'Chromium', source: base,
    allowedResult: result.answer.value, denialsBeforeAllocation: true,
    timeoutAbortAndCloseTerminations: result.terminated,
    nativeTinyLinuxProven: false }, null, 2));
} finally { await browser.close(); }
