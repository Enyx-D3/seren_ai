import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { SPIRAL_POLICY } from '../app/js/spiral.mjs';

const baseUrl = process.env.B2_BASE_URL || 'http://127.0.0.1:8799/';
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage(), errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (!r.url().startsWith(baseUrl) && !r.url().startsWith('blob:' + baseUrl)) external.push(r.url()); });
  await page.goto(baseUrl);
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent.includes('Falcon Instruct ready'), null, { timeout: 120000 });
  const rows = await page.locator('#modelRows .model-row').count();
  async function ask(prompt) {
    const before = await page.locator('.msg-ai').count();
    await page.locator('#prompt').fill(prompt);
    await page.locator('#sendBtn').click();
    await page.waitForFunction(n => {
      const rows = [...document.querySelectorAll('.msg-ai')];
      return rows.length > n && rows.at(-1).querySelector('.m-status')?.textContent !== 'Writing locally…';
    }, before, { timeout: 120000 });
    return await page.locator('.msg-ai .prose').last().innerText();
  }
  const math = await ask('Calculate 17 * 19 exactly.');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent.includes('Falcon Instruct ready'));
  await context.setOffline(true);
  const logic = await ask('If all cats are mammals and Mira is a cat, is Mira a mammal? Answer yes or no.');
  const boolean = await ask('not (True and False) or False is Answer True or False.');
  const chat = await ask('Say hello in one short sentence.');
  const plan = await ask('Plan a two-step morning backup; then list one risk.');
  const evidence = await page.evaluate(async () => {
    const { conv, msg, kv } = await import('/js/store.mjs');
    const conversation = (await conv.list())[0];
    const answers = (await msg.byConv(conversation.id)).filter(m => m.role === 'assistant');
    return { answers: answers.map(m => ({ model: m.model_id, status: m.status, policy: m.meta?.policy_version,
      verification: m.meta?.spiral_verification, metrics: m.meta?.spiral_metrics })),
      calibration: await kv.get('spiral_calibration_v2') };
  });
  const result = { baseUrl, rows, math, logic, boolean, chat, plan, evidence, errors, external,
    passed: rows === 1 && math.trim() === '323' && /^yes\b/i.test(logic) && boolean.trim() === 'True' &&
      chat.length > 0 && /\b(?:copy|files?|storage|drive|restore|archive)\b/i.test(plan) && evidence.answers.length === 5 &&
      evidence.answers.every(x => x.model === 'falcon_instruct' && x.status === 'done' && x.policy === SPIRAL_POLICY) &&
      evidence.answers[2].metrics.modelCalls === 0 && evidence.answers[2].metrics.calculatorCalls === 1 &&
      evidence.answers[3].metrics.modelCalls === 1 && evidence.answers[4].metrics.modelCalls >= 1 &&
      evidence.calibration.arithmetic.runs >= 1 && evidence.calibration.conversation.runs >= 1 &&
      evidence.calibration.logic.operations.boolean.verifiedSuccesses >= 1 &&
      evidence.calibration.arithmetic.verifiedModelSuccesses === 0 && evidence.calibration.conversation.modelRuns >= 1 &&
      errors.length === 0 && external.length === 0 };
  const path = `evidence/b2-ui-smoke-${new Date().toISOString().slice(0, 10)}.json`;
  await writeFile(path, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ path, ...result }, null, 2));
  if (!result.passed) process.exitCode = 1;
} finally { await browser.close(); }
