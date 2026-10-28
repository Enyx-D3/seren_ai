// Reconstruct gitignored browser WASM from the pinned npm dependency.
// Model weights are intentionally excluded and must be imported by the user.
import { copyFile, readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const assets = [
  ['node_modules/@wllama/wllama/esm/index.js', 'app/vendor/wllama/index.js', '08e0fad5c9efdf4414ca2e27d0d8d5bdfa54d91a8054b40d9d9c90c9ce870b9d'],
  ['node_modules/@wllama/wllama/src/single-thread/wllama.wasm', 'app/vendor/wllama/wllama-single.wasm', 'aced0c759f668e17d618114b8688bf55b32289dbdbd08b6e3254b0bc75838ad5'],
  ['node_modules/@wllama/wllama/src/multi-thread/wllama.wasm', 'app/vendor/wllama/wllama-multi.wasm', 'f69f292f06d9c5c63ac447aac768c3d508fe7a56f0a7926bd12cc33370bc627d'],
];

for (const [source, target, expected] of assets) {
  const bytes = await readFile(resolve(root, source));
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) throw new Error(`${source}: SHA-256 mismatch (expected ${expected}, got ${actual})`);
  const destination = resolve(root, target);
  await mkdir(resolve(root, 'app/vendor/wllama'), { recursive: true });
  const existing = await readFile(destination).catch(() => null);
  if (!existing || !existing.equals(bytes)) await copyFile(resolve(root, source), destination);
  console.log(`${target}: ${actual}`);
}
