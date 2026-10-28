import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

// Preregistered conservative rule for this fresh corpus: only explicit
// calculator-tool requests switch from Auto/Instruct to Tool-Calling.
const cases = [
  { id: 'chat-1', family: 'chat', prompt: 'Which month follows April? Answer with one word.', expected: '\\bMay\\b' },
  { id: 'chat-2', family: 'chat', prompt: 'What color are ripe bananas? Answer with one word.', expected: '\\byellow\\b' },
  { id: 'math-1', family: 'math', prompt: 'What is 23 plus 18?', expected: '^41$' },
  { id: 'math-2', family: 'math', prompt: 'What is 12 times 7?', expected: '^84$' },
  { id: 'code-1', family: 'code', prompt: 'Write a JavaScript expression that returns x minus 1.', expected: 'x\\s*-\\s*1' },
  { id: 'code-2', family: 'code', prompt: 'Write a Python expression that returns y doubled.', expected: 'y\\s*\\*\\s*2|2\\s*\\*\\s*y|y\\s*\\+\\s*y' },
  { id: 'tool-1', family: 'tool', prompt: 'Use the calculator tool to compute 19 * 23.', expected: 'calculator: 437' },
  { id: 'tool-2', family: 'tool', prompt: 'Use the calculator tool to compute 96 / 8.', expected: 'calculator: 12' },
];
const files = {
  instruct: 'workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf',
  tools: 'workspace/parts/Falcon-H1-Tiny-Tool-Calling-Q4_K_M.gguf',
};
const variant = process.argv.find(value => value.startsWith('--variant='))?.slice(10) || 'baseline-budget';
if (!/^[a-z0-9-]+$/.test(variant)) throw new Error('invalid variant label');

const browser = await chromium.launch({ headless: true });
async function run(policy) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8799/');
    await page.locator('#settingsBtnTop').click();
    await page.locator('#modelFileInput').setInputFiles(policy === 'tool_only' ? [files.instruct, files.tools] : files.instruct);
    await page.waitForFunction(expected => document.querySelector('#heroStatus')?.textContent === `${expected} of 4 local specialists imported`,
      policy === 'tool_only' ? 2 : 1, { timeout: 120000 });
    await page.locator('#setupDone').click();
    const rows = [];
    for (const item of cases) {
      await page.locator('#newBtn').click();
      if (policy === 'tool_only' && item.family === 'tool' && item.id === 'tool-1') {
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
      const elapsedMs = Math.round(performance.now() - started);
      const answer = await page.locator('.msg-ai .prose').innerText();
      const status = await page.locator('.msg-ai .m-status').innerText();
      rows.push({ caseId: item.id, family: item.family, answer, status, elapsedMs,
        passed: item.family === 'tool' ? answer.trim() === item.expected : new RegExp(item.expected, 'i').test(answer) });
    }
    return { policy, rows, errors };
  } finally { await context.close(); }
}
try {
  const baseline = await run('conservative_auto');
  const candidate = await run('tool_only');
  const summarize = result => ({ correct: result.rows.filter(row => row.passed).length, total: result.rows.length,
    toolReceipts: result.rows.filter(row => row.family === 'tool' && row.answer.startsWith('calculator:')).length,
    totalElapsedMs: result.rows.reduce((sum, row) => sum + row.elapsedMs, 0),
    p95ElapsedMs: [...result.rows.map(row => row.elapsedMs)].sort((a, b) => a - b)[Math.ceil(0.95 * result.rows.length) - 1] });
  const report = { variant, corpus: cases, baseline, candidate, baselineSummary: summarize(baseline), candidateSummary: summarize(candidate),
    policy: 'Only explicit calculator-tool requests switch to Tool-Calling; all other tasks use conservative Auto/Instruct.',
    environment: 'macOS arm64 / Playwright Chromium headless / exact Q4_K_M GGUFs / local CPU WebAssembly',
    caveat: 'Eight fresh tasks, two per family. Per-turn elapsed time includes actual UI, local model loading and any switch; initial model file import is excluded.' };
  const output = `evidence/compass-tool-shadow-${variant}-${new Date().toISOString().slice(0, 10)}.json`;
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ baseline: report.baselineSummary, candidate: report.candidateSummary,
    regressions: cases.filter((item, index) => baseline.rows[index].passed && !candidate.rows[index].passed).map(item => item.id),
    errors: [...baseline.errors, ...candidate.errors], output }, null, 2));
  if (baseline.errors.length || candidate.errors.length) process.exitCode = 1;
} finally { await browser.close(); }
