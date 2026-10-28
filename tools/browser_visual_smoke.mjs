import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
for (const width of [390, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:8799/');
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await page.screenshot({ path: `/tmp/seren-${width}.png` });
  console.log(JSON.stringify({ width, overflow, screenshot: `/tmp/seren-${width}.png` }));
  await page.close();
}
await browser.close();
