import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const origin = process.env.SEREN_V1_TEST_URL || 'http://127.0.0.1:8799/';
const installedChrome = existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath();
const browser = await chromium.launch({ headless: true, executablePath: installedChrome, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
await page.route('**/api/research?*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
  provider: 'Brave Search', results: [{ title: 'Economic release', url: 'https://example.org/economy',
    excerpt: 'The example index changed from 2.1% to 2.3% in the reporting period.' }],
}) }));
const modelRequests = [];
page.on('request', request => {
  if (/\.(gguf)$|\/models\/parts\//i.test(new URL(request.url()).pathname)) modelRequests.push(request.url());
});

const source = [
  'Our team reviewed the launch plan on Monday and recorded three remaining release tasks.',
  'The source citation display must include original line numbers and preserve quantitative claims.',
  'January testing processed 120 reports per hour, February processed 155 reports per hour, and March processed 147 reports per hour.',
  'Shafi will review the desktop interface before the next release candidate is approved.',
].join('\n');

try {
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.locator('#modelLoadStatus').getByText('Deterministic V1 · no AI model required').waitFor();
  assert.equal(await page.locator('#modelName').innerText(), 'Perfect Summaries');
  await page.locator('#prompt').fill(source);
  await page.locator('#sendBtn').click();
  await page.locator('article.msg-ai .prose').last().getByText('Source-grounded summary', { exact: false }).waitFor();
  assert.match(await page.locator('article.msg-ai .prose').last().innerText(), /Source line/);
  await page.locator('article.msg-ai details').last().locator('summary').click();
  assert.match(await page.locator('article.msg-ai details').last().innerText(), /Model calls: 0/);

  await page.locator('#modelBtn').click();
  await page.getByRole('menuitemradio', { name: /Professional Reports/ }).click();
  await page.locator('#prompt').fill(source);
  await page.locator('#sendBtn').click();
  await page.locator('article.msg-ai .prose').last().getByText('Executive summary', { exact: false }).waitFor();
  assert.match(await page.locator('article.msg-ai .prose').last().innerText(), /Scope and limitations/);

  await page.locator('#modelBtn').click();
  await page.getByRole('menuitemradio', { name: /Smart Research/ }).click();
  await page.locator('#prompt').fill('What changed in inflation this month?');
  await page.locator('#sendBtn').click();
  await page.locator('article.msg-ai .prose').last().getByText('retrieved evidence', { exact: false }).waitFor();
  assert.match(await page.locator('article.msg-ai .prose').last().innerText(), /Economic release/);

  await page.locator('#attachTextBtn').click();
  await page.locator('#documentFileInput').setInputFiles({ name: 'meeting-notes.txt', mimeType: 'text/plain', buffer: Buffer.from(source) });
  assert.equal(await page.locator('#prompt').inputValue(), source);
  assert.deepEqual(modelRequests, [], 'V1 must not download or request model weights');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('article.msg-ai').last().waitFor();
  assert.equal(await page.locator('article.msg-ai').count(), 3, 'history should persist after reload');
  console.log('browser deterministic V1 smoke: PASS (summary, report, research honesty, import, no model requests, persisted history)');
} finally {
  await browser.close();
}
