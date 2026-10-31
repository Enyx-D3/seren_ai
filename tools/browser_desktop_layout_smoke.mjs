import { chromium } from 'playwright';

const baseUrl = process.env.LAYOUT_URL || 'http://127.0.0.1:8810/';
const browser = await chromium.launch({ headless: true });
try {
  for (const [width, height] of [[1920, 1080], [1920, 900], [1440, 900]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(baseUrl);
    await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent.length > 0);
    const layout = await page.evaluate(() => {
      const names = ['app', 'sidebar', 'side-foot', 'topbar', 'stage', 'scroller', 'hero', 'dock', 'suggestions', 'composer', 'modelLoadStatus', 'footnote'];
      const rects = Object.fromEntries(names.map(name => {
        const element = document.getElementById(name) || document.querySelector('.' + name);
        const r = element.getBoundingClientRect();
        return [name, { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) }];
      }));
      return { viewport: { width: innerWidth, height: innerHeight }, bodyScrollHeight: document.body.scrollHeight,
        stageScrollHeight: document.querySelector('.stage').scrollHeight,
        stageClientHeight: document.querySelector('.stage').clientHeight,
        rects, bottomClipped: rects.app.bottom > innerHeight || rects.sidebar.bottom > innerHeight || rects.stage.bottom > innerHeight || rects.footnote.bottom > innerHeight || rects.composer.bottom > innerHeight };
    });
    const screenshot = `/tmp/seren-layout-${width}x${height}.png`;
    await page.screenshot({ path: screenshot });
    console.log(JSON.stringify({ ...layout, screenshot }));
    if (layout.bottomClipped) process.exitCode = 1;
    await page.close();
  }
} finally { await browser.close(); }
