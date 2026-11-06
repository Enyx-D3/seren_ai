import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readB2DeveloperFlags } from '../app/js/b2-developer-flags.mjs';

const plain = readB2DeveloperFlags();
assert.deepEqual(plain, {
  experimentalChain: false, experimentalDependency: false,
  experimentalCortexGuard: false, experimentalProseV2: false, experimentalProseV3: false,
});
assert.deepEqual(readB2DeveloperFlags('?b2_prose_v3=1&b2_cortex=1'), plain,
  'stray research options cannot activate a dependency interpreter');
const v3 = readB2DeveloperFlags('?b2_dependency=1&b2_cortex=1&b2_prose_v3=1');
assert.equal(v3.experimentalDependency, true);
assert.equal(v3.experimentalCortexGuard, true);
assert.equal(v3.experimentalProseV3, true);
assert.equal(v3.experimentalProseV2, false);
assert.equal(readB2DeveloperFlags('?b2_dependency=1&b2_prose_v2=1').experimentalProseV2, true);
assert.equal(readB2DeveloperFlags('?b2_chain=1').experimentalChain, true);
for (const query of [
  '?b2_dependency=1&b2_prose_v3=0',
  '?b2_dependency=1&b2_prose_v3=1&b2_prose_v2=1',
  '?b2_dependency=1&b2_prose_v3=1&b2_prose_v3=1',
  '?b2_dependency=1&b2_prose_v3=true',
]) assert.equal(readB2DeveloperFlags(query).experimentalProseV3, false, query);
assert.equal(readB2DeveloperFlags('?b2_dependency=1&b2_cortex=1&b2_cortex=0').experimentalCortexGuard, false);
const sw = readFileSync(new URL('../app/sw.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../app/js/main.mjs', import.meta.url), 'utf8');
assert.match(sw, /\.\/js\/b2-developer-flags\.mjs/,
  'offline application shell includes experimental URL policy');
assert.match(main, /readB2DeveloperFlags\(location\.search\)/,
  'actual browser chat path uses the developer-only policy');
assert.match(main, /\.\.\.devFlags/,
  'controller call receives the reviewed policy');
console.log('CP034 developer flags: default-off, gated prose V2/V3, duplicate-deny and offline shell PASS');
