import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const baseUrl = process.env.B2_BASE_URL || 'http://127.0.0.1:8799/';
if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--confirm'))
  throw new Error('Usage: node tools/browser_b2_calibration_probe.mjs [--confirm]');
const caseSet = process.argv[2] === '--confirm' ? 'confirm' : 'development';
const training = caseSet === 'confirm'
  ? ['78*91', '67*84', '92*76', '59*87', '83*94', '68*77', '74*93', '96*71']
  : ['97*89', '86*73', '94*77', '83*69', '71*96', '88*67', '75*92', '93*84'];
const unseen = caseSet === 'confirm' ? '63*88' : '62*87';
const promptFor = expression => `Explain step by step how to compute ${expression} exactly, and give the final number.`;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage(), errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (!request.url().startsWith(baseUrl) && !request.url().startsWith('blob:' + baseUrl)) external.push(request.url());
  });
  await page.goto(baseUrl);
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent.includes('Falcon Instruct ready'), null, { timeout: 120000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent.includes('Falcon Instruct ready'), null, { timeout: 120000 });
  await context.setOffline(true);
  async function ask(expression) {
    const before = await page.locator('.msg-ai').count();
    await page.locator('#prompt').fill(promptFor(expression));
    await page.locator('#sendBtn').click();
    await page.waitForFunction(count => {
      const rows = [...document.querySelectorAll('.msg-ai')];
      return rows.length > count && rows.at(-1).querySelector('.m-status')?.textContent !== 'Writing locally…';
    }, before, { timeout: 120000 });
    const result = await page.evaluate(async () => {
      const { conv, msg } = await import('/js/store.mjs');
      const conversation = (await conv.list())[0];
      const answers = (await msg.byConv(conversation.id)).filter(row => row.role === 'assistant');
      const last = answers.at(-1);
      return { answer: last.content, status: last.status, verification: last.meta?.spiral_verification,
        metrics: last.meta?.spiral_metrics, trace: last.meta?.spiral_trace };
    });
    return { expression, ...result,
      checkedRepairFailure: result.trace?.some(step => step.step === 'direction_result' &&
        step.operation === 'falcon_repair' && step.verificationStatus === 'failed' && step.checkedOutcome) || false };
  }
  const rows = [];
  for (const expression of training) {
    rows.push(await ask(expression));
    if (rows.filter(row => row.checkedRepairFailure).length >= 3) break;
  }
  const beforeReload = await page.evaluate(async () => (await import('/js/store.mjs')).kv.get('spiral_calibration_v2'));
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent.includes('Falcon Instruct ready'), null, { timeout: 120000 });
  const unseenRow = await ask(unseen);
  const afterReload = await page.evaluate(async () => (await import('/js/store.mjs')).kv.get('spiral_calibration_v2'));
  const receipt = { generatedAt: new Date().toISOString(), baseUrl, caseSet,
    environment: 'macOS arm64 Playwright Chromium CPU WebAssembly',
    training: rows, beforeReload: beforeReload?.arithmetic || null, unseen: unseenRow,
    afterReload: afterReload?.arithmetic || null, errors, external,
    conclusion: rows.filter(row => row.checkedRepairFailure).length >= 3
      ? unseenRow.trace?.some(step => step.step === 'calibrated_brake')
        ? 'observed_checked_failures_changed_next_operation_after_reload'
        : 'three_checked_failures_but_no_direction_change'
      : 'insufficient_checked_repair_failures_for_calibration_gate' };
  const path = `evidence/b2-calibration-real-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await writeFile(path, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ path, trainingCases: rows.length,
    checkedRepairFailures: rows.filter(row => row.checkedRepairFailure).length,
    unseen: { answer: unseenRow.answer, verification: unseenRow.verification,
      modelCalls: unseenRow.metrics?.modelCalls, calibratedBrake: unseenRow.trace?.some(step => step.step === 'calibrated_brake') },
    beforeReload: receipt.beforeReload, afterReload: receipt.afterReload,
    conclusion: receipt.conclusion, errors, external }, null, 2));
  if (errors.length || external.length || unseenRow.status !== 'done') process.exitCode = 1;
} finally { await browser.close(); }
