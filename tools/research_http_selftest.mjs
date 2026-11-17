import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const service = fileURLToPath(new URL('./serve.mjs', import.meta.url));
const port = String(30000 + Math.floor(Math.random() * 20000));
const server = spawn(process.execPath, [service], {
  env: { ...process.env, PORT: port, BRAVE_SEARCH_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let timer;
try {
  await Promise.race([
    new Promise((resolve, reject) => {
      server.stdout.on('data', data => { if (String(data).includes('Seren dev server:')) resolve(); });
      server.once('error', reject);
      server.once('exit', code => reject(new Error('Server exited before ready: ' + code)));
    }),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Server did not start')), 4000); }),
  ]);
  const response = await fetch(`http://127.0.0.1:${port}/api/research?q=What%20is%20science`);
  assert.equal(response.status, 503, 'search must not fabricate a result without a provider key');
  assert.equal((await response.json()).error, 'General web search provider not configured.');
  const badQuery = await fetch(`http://127.0.0.1:${port}/api/research?q=`);
  assert.equal(badQuery.status, 400);
  const index = await fetch(`http://127.0.0.1:${port}/index.html`);
  assert.equal(index.status, 200);
  assert.match(await index.text(), /documentFileInput/);
  console.log('HTTP V1 selftest: PASS (search not configured is honest, input validation, UI served)');
} finally {
  clearTimeout(timer);
  server.kill('SIGTERM');
}
