import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(process.argv[2] || 'app');
const bundledModels = await stat(resolve(root, 'models/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf')).then(() => true, () => false);
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/seren/')) throw new Error('outside site');
    const rel = decodeURIComponent(url.pathname.slice('/seren/'.length)) || 'index.html';
    const path = resolve(root, rel);
    if (path !== root && !path.startsWith(root + sep)) throw new Error('outside root');
    const actual = (await stat(path)).isDirectory() ? resolve(path, 'index.html') : path;
    const bytes = await readFile(actual);
    res.writeHead(200, { 'Content-Type': mime[extname(actual)] || 'application/octet-stream' }); res.end(bytes);
  } catch (error) { res.writeHead(404); res.end(error.message); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (bundledModels) await page.route('**/models/parts/*.gguf', async route => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/seren/`);
  await page.waitForFunction(() => typeof document.querySelector('#prompt')?.oninput === 'function');
  if (bundledModels) {
    await page.locator('#prompt').fill('Say hello.');
    await page.waitForFunction(() => document.querySelector('#modelLoadStatus')?.dataset.loading === 'true');
    if (await page.locator('#modelLoadStatus').getAttribute('data-loading') !== 'true' ||
      await page.locator('#sendBtn').isEnabled()) throw new Error('loading status or disabled Send missing before model verification');
    await page.waitForFunction(() => document.querySelector('#modelLoadStatus')?.textContent.includes('ready in this browser'), null, { timeout: 120000 });
    await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent.includes('4 of 4 local specialists imported'), null, { timeout: 240000 });
    await page.locator('#settingsBtnTop').click();
    await page.locator('#modelRows input[type="radio"]').nth(2).check();
    if (await page.locator('#modelName').innerText() !== 'Seren 7 Coder') throw new Error('settings model radio did not select Coder');
    await page.locator('#setupDone').click();
    await page.locator('#modelBtn').click();
    await page.locator('#modelMenu .menu-item').first().click();
  }
  if (!bundledModels) {
    await page.locator('#settingsBtnTop').click();
    await page.waitForTimeout(300);
    if (await page.locator('#importLocalBtn').isVisible()) throw new Error('development-only import shown on static host');
    await page.locator('#modelFileInput').setInputFiles('workspace/parts/Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf');
    await page.waitForFunction(() => document.querySelector('#modelRows')?.textContent.includes('Verified'), { timeout: 120000 });
    await page.locator('#setupDone').click();
  }
  await page.locator('#prompt').fill('Say hello.');
  await page.locator('#sendBtn').click();
  await page.waitForFunction(() => document.querySelector('.msg-ai .m-status')?.textContent.includes('Local response'), { timeout: 120000 });
  if (errors.length) throw new Error(errors.join('\n'));
  const content = await page.locator('.msg-ai .prose').last().innerText();
  if (!content.trim()) throw new Error('no local response');
  if (bundledModels) {
    const imported = await page.evaluate(async () => (await (await import('./js/store.mjs')).models.all()).map(model => model.id));
    if (!imported.includes('falcon_instruct')) throw new Error('bundled Instruct was not verified into browser storage');
  }
  console.log(`PASS nested static bundle: ${root}; model auto-provisioned: ${bundledModels}; response: ${content.slice(0, 120)}`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
