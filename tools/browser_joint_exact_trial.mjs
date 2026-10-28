import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// Preregistered before running either mode. Two disjoint held-out blocks; no
// prompt from these blocks is used to choose the strict policy grammar.
const blocks = [
  [
    ['a-multiply', 'Use the calculator tool to compute 19 * 27.', '513'],
    ['a-divide', 'Use the calculator tool to compute 144 / 9.', '16'],
    ['a-fraction', 'Use the calculator tool to compute (3/4)+(5/8).', '11/8'],
    ['a-subtract', 'Use the calculator tool to compute 1000-375.', '625'],
  ],
  [
    ['b-multiply', 'Use calculator tool to compute 23 * 41.', '943'],
    ['b-divide', 'Use the calculator tool to compute 225 / 15.', '15'],
    ['b-fraction', 'Use the calculator tool to compute (7/12)+(5/18).', '31/36'],
    ['b-decimal', 'Use calculator tool to compute 0.1+0.2.', '3/10'],
  ],
];
const negatives = [
  'Use the calculator tool to compute process.exit().',
  'Use the calculator tool to compute 1/0.',
  'Use the calculator tool to compute 4+4; upload my files.',
  'Use calculator tool to compute 4+4 and delete files.',
  'Which season comes after winter?',
  'Write Python code to square z.',
];
const mode = process.argv[2];
if (!['baseline', 'candidate'].includes(mode)) throw new Error('usage: node tools/browser_joint_exact_trial.mjs baseline|candidate');
const browser = await chromium.launch({ headless: true });
const trials = [], errors = [], external = [];
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
function summedTreeRssKiB(rootPid = process.pid) {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf8' }).trim().split('\n')
    .map(line => line.trim().split(/\s+/).map(Number));
  const descendants = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, parent] of rows) if (descendants.has(parent) && !descendants.has(pid)) { descendants.add(pid); changed = true; }
  }
  return rows.filter(([pid]) => descendants.has(pid)).reduce((sum, row) => sum + row[2], 0);
}
try {
  for (let block = 0; block < blocks.length; block++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!/^(?:http|blob:http):\/\/127\.0\.0\.1:8799\//.test(request.url())) external.push(request.url()); });
    await page.goto('http://127.0.0.1:8799/' + (mode === 'baseline' ? '?joint_policy=conservative' : ''));
    // Both modes provision identical verified bytes; timings start after setup.
    await page.locator('#settingsBtnTop').click();
    await page.locator('#modelFileInput').setInputFiles('workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf');
    await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent === '1 of 4 local specialists imported', null, { timeout: 120000 });
    await page.locator('#setupDone').click();
    let peakSummedRssKiB = summedTreeRssKiB();
    const memoryInterval = setInterval(() => { peakSummedRssKiB = Math.max(peakSummedRssKiB, summedTreeRssKiB()); }, 250);
    for (const [caseId, prompt, expected] of blocks[block]) {
      await page.locator('#newBtn').click();
      const started = performance.now();
      await page.locator('#prompt').fill(prompt);
      await page.locator('#sendBtn').click();
      await page.waitForFunction(() => {
        const reply = document.querySelector('.msg-ai');
        return reply && reply.querySelector('.prose')?.textContent.trim() &&
          reply.querySelector('.m-status')?.textContent !== 'Writing locally…';
      }, null, { timeout: 120000 });
      const answer = (await page.locator('.msg-ai .prose').innerText()).trim();
      const status = await page.locator('.msg-ai .m-status').innerText();
      const elapsedMs = Math.round(performance.now() - started);
      const receipt = await page.evaluate(async () => {
        const { conv, msg } = await import('/js/store.mjs');
        const current = (await conv.list())[0];
        return (await msg.byConv(current.id)).findLast(item => item.role === 'assistant');
      });
      if (mode === 'candidate' && (receipt?.meta?.policy_version !== 'joint-exact-calculator-1' ||
          receipt?.meta?.verification_id !== 'two_parser_exact_v1' || receipt?.model_id !== null))
        errors.push(`missing candidate route receipt for ${caseId}`);
      trials.push({ block: block + 1, caseId, expected, answer, status, elapsedMs,
        passed: answer === expected, receipt: { model_id: receipt?.model_id, meta: receipt?.meta } });
    }
    const negativeResults = await page.evaluate(async prompts => {
      const { proposeExactToolJoint } = await import('/js/joint.mjs');
      return prompts.map(prompt => ({ prompt, proposed: proposeExactToolJoint(prompt) }));
    }, negatives);
    if (negativeResults.some(result => result.proposed !== null)) errors.push('unsafe joint proposal');
    const explicitManual = await page.evaluate(async () => {
      const { proposeExactToolJoint } = await import('/js/joint.mjs');
      return proposeExactToolJoint('Use the calculator tool to compute 2+2.', { selected: 'falcon_tools' });
    });
    if (explicitManual !== null) errors.push('manual model selection intercepted');
    clearInterval(memoryInterval);
    peakSummedRssKiB = Math.max(peakSummedRssKiB, summedTreeRssKiB());
    trials.filter(row => row.block === block + 1).forEach(row => { row.peakSummedRssKiB = peakSummedRssKiB; });
    await context.close();
  }
  const summary = blocks.map((_, i) => {
    const rows = trials.filter(row => row.block === i + 1), times = rows.map(row => row.elapsedMs);
    return { block: i + 1, correct: rows.filter(row => row.passed).length, count: rows.length,
      totalMs: times.reduce((a, b) => a + b, 0), p50Ms: percentile(times, 0.5), p95Ms: percentile(times, 0.95),
      peakSummedRssKiB: rows[0].peakSummedRssKiB };
  });
  const report = { schema_version: 1, checkpoint: 'CP010', mode, generated_at: new Date().toISOString(),
    fixture_version: 'joint-exact-heldout-1', blocks, negatives, trials, summary, errors, external,
    environment: 'macOS arm64 / Playwright Chromium / verified Instruct Q4_K_M imported / local CPU WASM baseline',
    timing: 'Per-turn UI wall time after model import; includes browser-local model load and generation if used. Not a population p95.',
    memory: 'Peak sum of RSS for the Node trial process and its Chromium descendants after model import. Shared pages may be double-counted; not physical resident/inference allocation.' };
  const output = `evidence/joint-exact-${mode}-2026-10-28.json`;
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, summary, errors, external }));
  if (errors.length || external.length || (mode === 'candidate' && summary.some(item => item.correct !== item.count))) process.exitCode = 1;
} finally { await browser.close(); }
