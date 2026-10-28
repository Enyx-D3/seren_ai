import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:8799/');
  await page.locator('#prompt').fill('Write a detailed paragraph about why a quiet evening can help someone think clearly.');
  await page.locator('#sendBtn').click();
  await page.waitForFunction(() => document.querySelector('.msg-ai .m-status')?.textContent === 'Writing locally…', null, { timeout: 120000 });
  await page.evaluate(() => {
    const article = document.querySelector('.msg-ai');
    const prose = article.querySelector('.prose');
    window.__streamProbe = { article, prose, samples: 0, replacements: 0, lastLength: 0 };
    const observer = new MutationObserver(() => {
      const probe = window.__streamProbe;
      const current = document.querySelector('.msg-ai');
      if (current !== probe.article) probe.replacements++;
      const length = probe.prose.textContent.length;
      if (length > probe.lastLength) { probe.samples++; probe.lastLength = length; }
    });
    observer.observe(document.querySelector('#thread'), { childList: true, subtree: true, characterData: true });
    window.__streamProbe.observer = observer;
  });
  await page.waitForFunction(() => document.querySelector('.msg-ai .m-status')?.textContent === 'Local response', null, { timeout: 120000 });
  const result = await page.evaluate(() => {
    const probe = window.__streamProbe;
    probe.observer.disconnect();
    return { samples: probe.samples, replacements: probe.replacements,
      completedText: document.querySelector('.msg-ai .prose')?.textContent || '',
      finalMarkdown: !document.querySelector('.msg-ai .prose')?.classList.contains('streaming-text'),
      finalRiseSuppressed: document.querySelector('.msg-ai')?.classList.contains('no-rise') };
  });
  const passed = result.samples >= 2 && result.replacements === 1 && result.completedText.trim() &&
    result.finalMarkdown && result.finalRiseSuppressed && !errors.length;
  const report = { checkpoint: 'CP004/CP011', ...result, completedText: result.completedText.slice(0, 180), errors, passed };
  await writeFile('evidence/stream-stability-2026-10-28.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  if (!passed) process.exitCode = 1;
} finally { await browser.close(); }
