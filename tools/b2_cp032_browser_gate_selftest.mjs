import assert from 'node:assert/strict';
import { CP032_BROWSER_PHASES, parseCp032BrowserOptions,
  cp032BrowserPreflight } from './b2_cp032_browser_gate.mjs';

const quick = parseCp032BrowserOptions(['--mode', 'smoke', '--port', '9123',
  '--browser-path', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']);
assert.equal(quick.mode, 'smoke');
assert.equal(quick.port, 9123);
assert.match(quick.output, /^evidence\/cp032-browser-owner-/);
assert.equal(quick.browserPath.includes('Google Chrome.app'), true);
assert.equal(CP032_BROWSER_PHASES.smoke.length, 2);
assert.equal(CP032_BROWSER_PHASES.full.length >= 8, true);
assert.equal(CP032_BROWSER_PHASES.full.includes('tools/b2_cp026_real_falcon_ab.mjs'), true);
assert.equal(new Set(CP032_BROWSER_PHASES.full).size, CP032_BROWSER_PHASES.full.length);
for (const args of [
  ['--mode', 'release'], ['--port', '0'], ['--mode', 'smoke', '--mode', 'full'],
  ['--mode'], ['--out', '../etc/unsafe.json'], ['--out', '/tmp/report.json'],
  ['--unknown', 'x'], ['--port', '65536'], ['--out', 'reports/test.json'],
]) assert.throws(() => parseCp032BrowserOptions(args));

// The test deliberately supplies an impossible executable. Preflight must
// refuse execution, regardless of any model or runtime bytes on this host.
const blocked = await cp032BrowserPreflight({
  ...parseCp032BrowserOptions(['--mode', 'preflight', '--port', '55971']),
  browserPath: '/not-a-real-browser-cp032',
});
assert.equal(blocked.status, 'BLOCKED_PREFLIGHT');
assert.ok(blocked.issues.includes('chromium_binary_missing') ||
  blocked.issues.includes('playwright_not_installed'));
assert.equal(blocked.notBrowserExecution, true);
assert.equal(blocked.notReleaseApproval, true);
console.log('CP032 browser gate runner model-free options, phase manifest and fail-closed preflight PASS');
