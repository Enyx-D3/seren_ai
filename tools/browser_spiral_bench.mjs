import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8799/');
  const measurements = await page.evaluate(async () => {
    const { exactArithmetic } = await import('/js/exact-arithmetic.mjs');
    const { ExactSpiral } = await import('/js/spiral.mjs');
    const cases = [
      { name: 'many-additions', expression: Array(60).fill('1/2').join('+') },
      { name: 'many-multiplications', expression: Array(13).fill('12345678901234567').join('*') },
      { name: 'nested-parentheses', expression: '('.repeat(100) + '1+2' + ')'.repeat(100) },
      { name: 'rational-products', expression: Array(6).fill('(12345678901234567/98765432109876543)').join('*') },
      { name: 'mixed-engineering-ratios', expression: [
        '(12500000000000001/70000000000000003)', '(12400000000000007/13000000000000009)',
        '(24000000000000011/11000000000000013)', '(36000000000000017/19000000000000019)',
        '(48000000000000023/23000000000000029)',
      ].join('*') },
    ];
    const output = [];
    for (const item of cases) {
      const loops = 200;
      try {
        const expected = exactArithmetic(item.expression).text;
        let started = performance.now();
        for (let i = 0; i < loops; i++) exactArithmetic(item.expression);
        const baselineMs = performance.now() - started;
        const spiral = new ExactSpiral();
        const scope = `bench-${item.name}`;
        await spiral.solve(item.expression, { scope });
        started = performance.now();
        let reused = 0;
        for (let i = 0; i < loops; i++) {
          const result = await spiral.solve(item.expression, { scope });
          if (result.reused && result.value === expected) reused++;
        }
        await spiral.flush();
        const reusedMs = performance.now() - started;
        output.push({ name: item.name, length: item.expression.length, loops, baselineMs, reusedMs,
          ratio: reusedMs / baselineMs, reused, resultLength: expected.length });
      } catch (error) { output.push({ name: item.name, length: item.expression.length, error: error.message }); }
    }
    return output;
  });
  const passed = measurements.filter(row => ['rational-products', 'mixed-engineering-ratios'].includes(row.name))
    .every(row => row.reused === row.loops && row.ratio < 1) &&
    measurements.find(row => row.name === 'many-multiplications')?.reused === 0 &&
    measurements.filter(row => ['many-additions', 'nested-parentheses'].includes(row.name)).every(row => !!row.error);
  const output = `evidence/spiral-benchmark-${new Date().toISOString().slice(0, 10)}.json`;
  await writeFile(output, JSON.stringify({ measurements, passed, environment: 'macOS arm64 / isolated Playwright Chromium / browser-local exact solver and IndexedDB' }, null, 2) + '\n');
  console.log(JSON.stringify({ passed, measurements, output }, null, 2));
  if (!passed) process.exitCode = 1;
} finally { await browser.close(); }
