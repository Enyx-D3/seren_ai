import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

// CP007 preregistration: a route can be promoted only if it has zero paired
// correctness regressions, at least one additional correct task, and both
// total and p95 turn latency <= 1.25x conservative Auto in each order block.
// This test is a small eligibility screen, not a population quality estimate.
const threshold = { maxCorrectnessRegressions: 0, minAdditionalCorrect: 1, maxLatencyRatio: 1.25 };
const cases = [
  { id: 'chat-a', family: 'chat', prompt: 'Which season comes after winter? Give one word.', expected: '\\bspring\\b' },
  { id: 'chat-b', family: 'chat', prompt: 'What is the opposite of north? Give one word.', expected: '\\bsouth\\b' },
  { id: 'math-a', family: 'math', prompt: 'Calculate 0.25 + 0.5.', expected: '^3/4$' },
  { id: 'math-b', family: 'math', prompt: 'What is 8 times 9?', expected: '^72$' },
  { id: 'code-a', family: 'code', prompt: 'Write a JavaScript expression that adds 2 to n.', expected: 'n\\s*\\+\\s*2|2\\s*\\+\\s*n' },
  { id: 'code-b', family: 'code', prompt: 'Write a Python expression that squares z.', expected: 'z\\s*\\*\\*\\s*2|z\\s*\\*\\s*z' },
  { id: 'tool-a', family: 'tool', prompt: 'Use the calculator tool to compute 17 * 23.', expected: 'calculator: 391' },
  { id: 'tool-b', family: 'tool', prompt: 'Use the calculator tool to compute 84 / 7.', expected: 'calculator: 12' },
];
const models = {
  instruct: 'workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf',
  tools: 'workspace/parts/Falcon-H1-Tiny-Tool-Calling-Q4_K_M.gguf',
};
const browser = await chromium.launch({ headless: true });
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
async function run(policy, block) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage(), errors = [], rows = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8799/');
    await page.locator('#settingsBtnTop').click();
    await page.locator('#modelFileInput').setInputFiles(policy === 'tool_only' ? [models.instruct, models.tools] : models.instruct);
    await page.waitForFunction(expected => document.querySelector('#heroStatus')?.textContent === `${expected} of 4 local specialists imported`,
      policy === 'tool_only' ? 2 : 1, { timeout: 120000 });
    await page.locator('#setupDone').click();
    for (const item of cases) {
      await page.locator('#newBtn').click();
      if (policy === 'tool_only' && item.id === 'tool-a') {
        await page.locator('#modelBtn').click();
        await page.locator('#modelMenu .menu-item').last().click();
      }
      const started = performance.now();
      await page.locator('#prompt').fill(item.prompt);
      await page.locator('#sendBtn').click();
      await page.waitForFunction(() => {
        const reply = document.querySelector('.msg-ai');
        return reply && reply.querySelector('.prose')?.textContent.trim() &&
          reply.querySelector('.m-status')?.textContent !== 'Writing locally…';
      }, null, { timeout: 120000 });
      const answer = await page.locator('.msg-ai .prose').innerText();
      const status = await page.locator('.msg-ai .m-status').innerText();
      rows.push({ caseId: item.id, family: item.family, answer, status,
        elapsedMs: Math.round(performance.now() - started),
        passed: item.family === 'tool' ? answer.trim() === item.expected : new RegExp(item.expected, 'i').test(answer) });
    }
    return { block, policy, rows, errors };
  } finally { await context.close(); }
}
try {
  const blocks = [];
  for (const [block, order] of [['AB', ['conservative_auto', 'tool_only']], ['BA', ['tool_only', 'conservative_auto']]]) {
    const runs = [];
    for (const policy of order) runs.push(await run(policy, block));
    const baseline = runs.find(run => run.policy === 'conservative_auto');
    const candidate = runs.find(run => run.policy === 'tool_only');
    const summarize = run => ({ correct: run.rows.filter(row => row.passed).length,
      totalMs: run.rows.reduce((sum, row) => sum + row.elapsedMs, 0),
      p95Ms: percentile(run.rows.map(row => row.elapsedMs), 0.95) });
    const base = summarize(baseline), proposed = summarize(candidate);
    const regressions = cases.filter((item, i) => baseline.rows[i].passed && !candidate.rows[i].passed).map(item => item.id);
    blocks.push({ block, order, baseline, candidate, base, proposed, regressions,
      latencyRatio: { total: proposed.totalMs / base.totalMs, p95: proposed.p95Ms / base.p95Ms },
      eligible: !regressions.length && proposed.correct - base.correct >= threshold.minAdditionalCorrect &&
        proposed.totalMs <= base.totalMs * threshold.maxLatencyRatio &&
        proposed.p95Ms <= base.p95Ms * threshold.maxLatencyRatio &&
        !runs.some(run => run.errors.length) });
    console.log(JSON.stringify({ block, base, proposed, regressions, eligible: blocks.at(-1).eligible }));
  }
  const report = { threshold, cases, blocks, decision: blocks.every(block => block.eligible) ? 'eligible_for_review' : 'retain_conservative_auto',
    environment: 'macOS arm64 / isolated Playwright Chromium profiles / exact Q4_K_M GGUFs / local CPU WebAssembly',
    caveat: 'Eight new tasks repeated once in AB and BA order. Model import excluded; turn time includes local model load and UI. Small regex-scored sample; no broad accuracy claim.' };
  const output = `evidence/compass-counterbalanced-${new Date().toISOString().slice(0, 10)}.json`;
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ decision: report.decision, output }));
  if (blocks.some(block => block.baseline.errors.length || block.candidate.errors.length)) process.exitCode = 1;
} finally { await browser.close(); }
