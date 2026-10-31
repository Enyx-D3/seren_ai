import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const base = { entryPoint: 'add', prefix: '', tests: 'def check(candidate):\n    assert candidate(2, 3) == 5\n' };
function check(answer) {
  const child = spawnSync('python3', ['-I', '-S', 'tools/b2_python_check.py'], {
    input: JSON.stringify({ ...base, answer }), encoding: 'utf8', timeout: 5000 });
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}
assert.equal(check('def add(a,b):\n    return a+b').status, 'passed');
assert.equal(check('def add(a,b):\n    return a-b').status, 'failed');
assert.match(check('def add(a,b):\n    import os\n    return 5').detail, /Import/);
assert.match(check('def add(a,b):\n    return ().__class__').detail, /attribute denied/);
console.log('Restricted HumanEval checker PASS');
