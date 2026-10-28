import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:8799/');
  const support = await page.evaluate(() => {
    const canvas = document.querySelector('#orbCanvas');
    const gl = canvas.getContext('webgl');
    const ext = gl?.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    window.__orbLoss = ext;
    return true;
  });
  if (!support) { console.log('SKIP WebGL loss extension unavailable'); process.exit(0); }
  await page.evaluate(() => window.__orbLoss.loseContext());
  await page.waitForFunction(() => document.querySelector('#orbCanvas').hidden && !!document.querySelector('.orb-fallback'));
  await page.evaluate(() => window.__orbLoss.restoreContext());
  await page.waitForFunction(() => !document.querySelector('#orbCanvas').hidden && !document.querySelector('.orb-fallback'));
  const reduced = await page.evaluate(async () => {
    const canvas = document.querySelector('#orbCanvas');
    const before = canvas.toDataURL();
    await new Promise(resolve => setTimeout(resolve, 400));
    return before === canvas.toDataURL();
  });
  console.log(JSON.stringify({ contextRecovered: true, reducedMotionFrameStable: reduced }));
  if (!reduced) process.exitCode = 1;
} finally { await browser.close(); }
