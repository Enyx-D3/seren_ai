import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 667 } });
  await page.goto('http://127.0.0.1:8799/');
  await page.locator('#modelBtn').focus();
  await page.keyboard.press('ArrowDown');
  const opened = await page.locator('#modelBtn').getAttribute('aria-expanded') === 'true';
  const firstFocused = await page.locator('#modelMenu button').first().evaluate(el => el === document.activeElement);
  await page.keyboard.press('ArrowDown');
  const moved = await page.locator('#modelMenu button').nth(1).evaluate(el => el === document.activeElement);
  await page.keyboard.press('Escape');
  const closed = await page.locator('#modelBtn').getAttribute('aria-expanded') === 'false' &&
    await page.locator('#modelBtn').evaluate(el => el === document.activeElement);
  await page.locator('#settingsBtnTop').focus();
  await page.keyboard.press('Enter');
  const dialogOpen = await page.locator('#setupDialog').evaluate(el => el.open);
  await page.keyboard.press('Escape');
  const dialogClosed = await page.locator('#setupDialog').evaluate(el => !el.open);
  console.log(JSON.stringify({ opened, firstFocused, moved, closed, dialogOpen, dialogClosed }));
  if (![opened, firstFocused, moved, closed, dialogOpen, dialogClosed].every(Boolean)) process.exitCode = 1;
} finally { await browser.close(); }
