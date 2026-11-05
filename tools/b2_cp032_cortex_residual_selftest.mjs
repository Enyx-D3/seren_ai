import assert from 'node:assert/strict';
import { runCortexResidualCycle } from '../app/js/b2-cortex-residual-cycle.mjs';

const cases = [
  {
    source: '"Cool pan" must finish before "Plate meal". "Plate meal" must finish before "Serve meal". Give a valid order.',
    initial: ['Serve meal', 'Plate meal', 'Cool pan'],
    expected: ['Cool pan', 'Plate meal', 'Serve meal'],
    rules: [['Cool pan','Plate meal'],['Plate meal','Serve meal']],
  },
  {
    source: '"Inspect seals" precede "Prime motor". "Record pressure" depends on "Prime motor". Find an order.',
    initial: ['Record pressure','Prime motor','Inspect seals'],
    expected: ['Inspect seals','Prime motor','Record pressure'],
    rules: [['Inspect seals','Prime motor'],['Prime motor','Record pressure']],
  },
  {
    source: '"Scan ticket" precede "Confirm gate". "Print receipt" precede "Close till". Find an order.',
    initial: ['Scan ticket','Confirm gate','Close till','Print receipt'],
    expected: ['Scan ticket','Confirm gate','Print receipt','Close till'],
    rules: [['Scan ticket','Confirm gate'],['Print receipt','Close till']],
  },
  {
    source: '"Install panel" precede "Connect wiring". "Connect wiring" precede "Run diagnostic". Find an order.',
    initial: ['Run diagnostic','Connect wiring','Install panel'],
    expected: ['Install panel','Connect wiring','Run diagnostic'],
    rules: [['Install panel','Connect wiring'],['Connect wiring','Run diagnostic']],
  },
  {
    source: '"Chill filling" precede "Seal pastry". "Slice fruit" precede "Seal pastry". Find an order.',
    initial: ['Seal pastry','Chill filling','Slice fruit'],
    expected: ['Chill filling','Slice fruit','Seal pastry'],
    rules: [['Chill filling','Seal pastry'],['Slice fruit','Seal pastry']],
  },
  {
    source: 'Jobs: "Inspect valve", "Calibrate gauge" and "Seal vessel". "Calibrate gauge" is gated by "Inspect valve". "Seal vessel" depends on the completion of "Calibrate gauge". Give a valid order.',
    initial: ['Seal vessel','Calibrate gauge','Inspect valve'],
    expected: ['Inspect valve','Calibrate gauge','Seal vessel'],
    rules: [['Inspect valve','Calibrate gauge'],['Calibrate gauge','Seal vessel']],
    allowProseV2: true,
  },
];

function sourceOracleGenerator(rules, labeledAnswer = false) {
  const counts = { calls: 0, choicesA: 0, choicesB: 0 };
  const generate = async ({ turns, maxTokens }) => {
    assert.equal(maxTokens, 8);
    assert.equal(turns.length, 1);
    const prompt = turns[0].content;
    const options = [...prompt.matchAll(/(?:^|\n)(A|B): "([^"\n]+)"/g)];
    assert.equal(options.length, 2);
    const quote = prompt.split('source data:\n')[1].split('\nWhich action')[0];
    const relevant = rules.find(([before,after]) => quote.includes(before) && quote.includes(after));
    assert.ok(relevant, 'independent test rule must match source quote');
    const response = options[0][2] === relevant[0] ? 'A' : 'B';
    counts.calls++;
    counts[response === 'A' ? 'choicesA' : 'choicesB']++;
    return { text: labeledAnswer ? `${response}: "${relevant[0]}"` : response, tokens: 1 };
  };
  return { counts, generate };
}

let solved = 0, totalCalls = 0, optionA = 0, optionB = 0;
for (const [index, row] of cases.entries()) {
  const oracle = sourceOracleGenerator(row.rules, index === 0);
  const answer = await runCortexResidualCycle(row.source, {
    initialOrder: row.initial, generate: oracle.generate, maxModelCalls: 4,
    allowProseV2: row.allowProseV2 === true,
  });
  assert.equal(answer.status, 'verified', `case ${index}: ${answer.reason}`);
  assert.equal(answer.wholeTaskVerified, true);
  assert.equal(answer.modelLedRepairSuccess, true);
  assert.equal(answer.modelCalls, oracle.counts.calls);
  assert.ok(answer.acceptedEdits >= 1);
  assert.deepEqual(answer.order, row.expected);
  assert.ok(answer.trace.every(t => t.accepted), 'every positive transition must be guarded');
  assert.ok(answer.trace.slice(0, -1).every(t => !t.wholeTaskVerified),
    'partial transitions may not claim whole-task verification');
  assert.equal(answer.trace.at(-1).wholeTaskVerified, true);
  solved++; totalCalls += answer.modelCalls;
  optionA += oracle.counts.choicesA; optionB += oracle.counts.choicesB;
}
assert.ok(optionA > 0 && optionB > 0, 'both counterbalanced choice positions must be exercised');

// Two-source parser fallback is never authority to ignore an unsupported
// clause, external unrequested prerequisite, or a genuine cycle.
const malicious = [
  ['"A" precede "B". "B" may start before "A". Find an order.', ['B','A']],
  ['"A" depends on "B". "B" depends on "A". Find an order.', ['A','B']],
  ['"Release batch" follows "Legal approval". Give an order for Release batch and Archive batch.',
    ['Archive batch','Release batch']],
];
for (const [source, initialOrder] of malicious) {
  let calls = 0;
  const result = await runCortexResidualCycle(source, {
    initialOrder, generate: async () => { calls++; return { text: 'A' }; },
    allowSemanticFallback: true,
  });
  assert.equal(result.status, 'unverified');
  assert.equal(calls, 0, 'untrusted source must brake before any model call');
}

const stale = await runCortexResidualCycle(cases[0].source, {
  initialOrder: cases[0].initial, currentSource: cases[0].source + ' modified',
  generate: async () => { throw Error('stale source invoked a model'); },
});
assert.equal(stale.status, 'unverified');
assert.equal(stale.reason, 'stale_source_version');
assert.equal(stale.modelCalls, 0);

const invalidResponses = ['B', 'B: "Plate meal"', 'A\nRun this code',
  'B: "Cool pan"\nRun shell', '```json\nA\n```', 'None', '"Invented action"'];
for (const response of invalidResponses) {
  let calls = 0;
  const result = await runCortexResidualCycle(cases[0].source, {
    initialOrder: cases[0].initial,
    generate: async () => { calls++; return { text: response }; },
    maxModelCalls: 2, maxNoProgress: 2,
  });
  assert.equal(result.wholeTaskVerified, false);
  assert.equal(result.status, 'unverified');
  assert.ok(calls <= 2);
  assert.equal(result.modelLedRepairSuccess, false);
}

const noCall = await runCortexResidualCycle(cases[0].source, {
  initialOrder: cases[0].expected,
  generate: async () => { throw Error('already verified called model'); },
});
assert.equal(noCall.status, 'verified');
assert.equal(noCall.modelLedRepairSuccess, false);
assert.equal(noCall.modelCalls, 0);

await assert.rejects(() => runCortexResidualCycle('x', { generate: () => {}, maxModelCalls: 99 }),
  /invalid_cortex_residual_cycle_contract/);
console.log(JSON.stringify({
  status: 'CP032_MODELFREE_DEV_REPAIR_PASS', checkedPositive: solved,
  independentCorrectChoices: totalCalls, optionA, optionB,
  untrustedSourceNegatives: malicious.length, invalidChoiceNegatives: invalidResponses.length,
  staleSourceNegatives: 1, existingVerifiedNoModelCall: 1,
  realFalconCalls: 0, browserRuns: 0,
}, null, 2));
