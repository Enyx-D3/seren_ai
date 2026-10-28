// Create a self-contained static web bundle. Models are provisioned by import.
import { cp, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve, relative, basename, extname } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outputRoot = join(root, 'dist');
await mkdir(outputRoot, { recursive: true });
const output = await mkdtemp(join(outputRoot, 'seren7-web-'));
await cp(join(root, 'app'), output, { recursive: true, filter: path => !basename(path).startsWith('.') });

const files = [];
async function list(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await list(path);
    else if (entry.isFile()) {
      if (['.gguf', '.safetensors', '.zip'].includes(extname(path))) throw new Error(`model/archive bytes found in static app: ${path}`);
      const bytes = await readFile(path);
      files.push({ path: relative(output, path), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
}
await list(output);
const required = ['index.html', 'THIRD_PARTY_NOTICES.txt', 'js/main.mjs', 'js/tool-runner.mjs', 'js/spiral.mjs', 'sw.js', 'workers/ingest-worker.mjs', 'workers/runtime-worker.mjs', 'workers/tool-worker.mjs', 'vendor/wllama/index.js', 'vendor/wllama/wllama-single.wasm', 'vendor/wllama/wllama-multi.wasm', 'vendor/wllama/LICENCE', 'vendor/fflate/LICENCE', 'vendor/jssha256/LICENSE.txt', 'fonts/DM_Mono_OFL.txt', 'fonts/Fraunces_OFL.txt', 'fonts/Onest_OFL.txt'];
for (const path of required) if (!files.some(file => file.path === path)) throw new Error(`missing release asset: ${path}`);
await writeFile(join(output, 'asset-manifest.json'), JSON.stringify({ format: 'seren7-web-assets-v1', models_included: false, files }, null, 2) + '\n');
console.log(`Web bundle: ${output} (${files.length} assets; model weights excluded)`);
