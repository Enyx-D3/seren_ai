import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(resolve('reference/Seren_7_original.html')).href);
    await page.waitForTimeout(700);
    const path = `/tmp/seren-reference-${width}.png`;
    await page.screenshot({ path });
    console.log(JSON.stringify({ width, path, errors }));
    await page.close();
  }
} finally { await browser.close(); }
