import assert from 'node:assert/strict';
import { produceDeterministicV1 } from '../app/js/deterministic-v1.mjs';

const source = [
  'The research team reviewed the release workflow on Monday and recorded four outstanding tasks.',
  'The research team reviewed the release workflow on Monday and recorded four outstanding tasks.',
  'In January the service processed 120 documents per hour with no reported failures.',
  'In February the service processed 155 documents per hour during the controlled test.',
  'In March the service processed 147 documents per hour and required another review.',
  'The user interface must display source citations before the report can be approved.',
].join('\n');

const summary = produceDeterministicV1('summary', source);
assert.equal(summary.status, 'source_bounded');
assert.equal(summary.sourceCount, 5, 'exact duplicate source sentences must be collapsed');
assert.ok(summary.evidence.length > 0);
for (const item of summary.evidence) {
  assert.equal(source.slice(item.offset, item.offset + item.text.length), item.text,
    'all selected statements must match their exact original source bytes');
  assert.ok(summary.text.includes(`[Source line ${item.line}]`));
}
const detailed = produceDeterministicV1('summary', source, { detailed: true });
assert.ok(detailed.evidence.length >= summary.evidence.length);

const report = produceDeterministicV1('report', source);
assert.ok(report.text.includes('## Executive summary'));
assert.ok(report.text.includes('## Main findings'));
assert.ok(report.text.includes('## Quantitative evidence'));
assert.ok(report.text.includes('## Scope and limitations'));
assert.ok(report.text.includes('no') || report.text.includes('No'));
for (const item of report.evidence) assert.ok(source.includes(item.text));

assert.throws(() => produceDeterministicV1('research', 'What is the latest weather?'), /Unknown/,
  'live research must use the separate web-research adapter');
assert.match(produceDeterministicV1('summary', 'short').text, /Please paste/);
assert.throws(() => produceDeterministicV1('summary', 'a'.repeat(500_001)), /limit/);
assert.throws(() => produceDeterministicV1('chat', source), /Unknown/);

console.log('deterministic V1 selftest: PASS (source offsets, duplicates, detailed summaries, reports, no fabricated research)');
