// Create a static web bundle. The explicit local-only option copies the single
// user-provided verified Instruct GGUF for same-site browser provisioning.
import { cp, mkdir, mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, relative, basename, extname } from 'node:path';
import { EXPECTED_SHA256 } from '../app/js/model-receipts.mjs';

const root = resolve(import.meta.dirname, '..');
const includeLocalModels = process.argv.includes('--include-local-models');
const modelFiles = {
  falcon_instruct: 'Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf',
};
const approvedModelPaths = new Set(Object.values(modelFiles).map(name => `models/parts/${name}`));
async function hashFile(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}
const outputRoot = join(root, 'dist');
await mkdir(outputRoot, { recursive: true });
const output = await mkdtemp(join(outputRoot, 'seren7-web-'));
await cp(join(root, 'app'), output, { recursive: true, filter: path => !basename(path).startsWith('.') && basename(path) !== 'joint.mjs' });
await writeFile(join(output, 'vercel.json'), JSON.stringify({
  $schema: 'https://openapi.vercel.sh/vercel.json',
  headers: [
    { source: '/(.*)', headers: [
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
    ] },
    { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
  ],
}, null, 2) + '\n');
if (includeLocalModels) {
  const destination = join(output, 'models', 'parts');
  await mkdir(destination, { recursive: true });
  for (const [id, name] of Object.entries(modelFiles)) {
    const source = join(root, 'workspace', 'parts', name);
    const size = (await stat(source)).size;
    if (size < 10 * 1024 * 1024 || size > 300 * 1024 * 1024 || await hashFile(source) !== EXPECTED_SHA256[id])
      throw new Error(`local model failed the CP001 size/hash receipt: ${name}`);
    await cp(source, join(destination, name));
  }
  await writeFile(join(output, 'MODEL_BUNDLE_NOTICE.txt'),
    'Private local-use bundle: one user-provided Falcon-H1-Tiny 90M Instruct Q4_K_M GGUF is included as a static asset.\n' +
    'Each is checked against the CP001 SHA-256 receipt before packaging and again in the browser before use.\n' +
    'The source model cards identify the Falcon-LLM License. Review the exact model/license terms and redistribution obligations before publishing this bundle.\n' +
    'Model card license link: https://falconllm.tii.ae/falcon-terms-and-conditions.html\n');
  const noticePath = join(output, 'THIRD_PARTY_NOTICES.txt');
  const notice = await readFile(noticePath, 'utf8');
  await writeFile(noticePath, notice.replace(
    'Falcon-H1-Tiny model weights are not included in this static bundle. Users import their own approved model files separately. Review each model\'s source license before distributing weights.',
    'This private local-use bundle includes one user-provided Falcon-H1-Tiny Instruct model weight. See MODEL_BUNDLE_NOTICE.txt. Review the exact source license and redistribution terms before publication.'));
}

const files = [];
async function list(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await list(path);
    else if (entry.isFile()) {
      const rel = relative(output, path);
      if (['.safetensors', '.zip'].includes(extname(path)) ||
          (extname(path) === '.gguf' && !(includeLocalModels && approvedModelPaths.has(rel))))
        throw new Error(`unapproved model/archive bytes found in static app: ${path}`);
      const bytes = await readFile(path);
      files.push({ path: rel, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
}
await list(output);
const required = ['index.html', 'vercel.json', 'THIRD_PARTY_NOTICES.txt', 'js/main.mjs', 'js/tool-runner.mjs', 'js/spiral.mjs', 'js/b2-direction.mjs', 'js/b2-boolean.mjs', 'sw.js', 'workers/ingest-worker.mjs', 'workers/runtime-worker.mjs', 'workers/tool-worker.mjs', 'vendor/wllama/index.js', 'vendor/wllama/wllama-single.wasm', 'vendor/wllama/wllama-multi.wasm', 'vendor/wllama/LICENCE', 'vendor/fflate/LICENCE', 'vendor/jssha256/LICENSE.txt', 'fonts/DM_Mono_OFL.txt', 'fonts/Fraunces_OFL.txt', 'fonts/Onest_OFL.txt'];
for (const path of required) if (!files.some(file => file.path === path)) throw new Error(`missing release asset: ${path}`);
if (includeLocalModels) for (const path of approvedModelPaths) if (!files.some(file => file.path === path)) throw new Error(`missing local model: ${path}`);
await writeFile(join(output, 'asset-manifest.json'), JSON.stringify({ format: 'seren7-web-assets-v1', models_included: includeLocalModels, files }, null, 2) + '\n');
console.log(`Web bundle: ${output} (${files.length} assets; ${includeLocalModels ? 'one local model included for private use' : 'model weights excluded'})`);
