import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
async function run(localService) {
  const context = await browser.newContext();
  await context.addInitScript(value => {
    const voice = { name: 'Fixture voice', voiceURI: 'fixture:voice', lang: 'en-US', localService: value };
    window.__spoken = [];
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speaking: false, getVoices: () => [voice], addEventListener: () => {}, cancel: () => {},
      speak: utterance => window.__spoken.push({ text: utterance.text, localService: utterance.voice?.localService }),
    } });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true,
      value: class { constructor(text) { this.text = text; } } });
  }, localService);
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:8799/');
  await page.waitForFunction(() => document.querySelector('#importLocalBtn')?.hidden === false);
  await page.locator('#prompt').fill('2+2');
  await page.locator('#sendBtn').click();
  await page.waitForFunction(() => document.querySelector('.msg-ai .prose')?.textContent.includes('4'));
  const button = page.getByRole('button', { name: 'Read response aloud' });
  const visible = await button.count() > 0;
  if (visible) await button.click();
  const spoken = await page.evaluate(() => window.__spoken);
  await context.close();
  return { localService, visible, spoken };
}
try {
  const local = await run(true), remote = await run(false);
  console.log(JSON.stringify({ local, remote }));
  if (!local.visible || local.spoken.length !== 1 || local.spoken[0].text !== '4' ||
    !local.spoken[0].localService || remote.visible || remote.spoken.length) process.exitCode = 1;
} finally { await browser.close(); }
