import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:8799/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Bring the models to this browser' });
  if (!await dialog.isVisible()) throw new Error('Settings dialog has no accessible name');
  await page.locator('#modelFileInput').setInputFiles('workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf');
  await page.waitForFunction(() => document.querySelector('#statusAnnouncer')?.textContent.includes('Model import complete'));
  await dialog.getByRole('button', { name: 'Done' }).click();
  const composer = page.getByRole('textbox', { name: 'Message Seren' });
  await composer.fill('Say hello.');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForFunction(() => document.querySelector('#statusAnnouncer')?.textContent.includes('Response complete'));
  const namedControls = {
    search: await page.getByRole('searchbox', { name: 'Search threads' }).count(),
    copy: await page.getByRole('button', { name: 'Copy response' }).count(),
    regenerate: await page.getByRole('button', { name: 'Regenerate response' }).count(),
  };
  const announcement = await page.locator('#statusAnnouncer').textContent();
  console.log(JSON.stringify({ namedControls, announcement, errors }));
  if (Object.values(namedControls).some(value => value < 1) || errors.length) process.exitCode = 1;
} finally { await browser.close(); }
