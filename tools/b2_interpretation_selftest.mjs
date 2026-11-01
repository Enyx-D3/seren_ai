import assert from 'node:assert/strict';
import { parseStructuredInterpretation, parseSpanLines, interpretProblemWithFalcon } from '../app/js/b2-structured-interpretation.mjs';
import { SpiralController, ExactSpiral } from '../app/js/spiral.mjs';

const source = 'Mira has 14 coins. She gives 6 coins to Leo. How many coins remain?';
const valid = JSON.stringify({ facts: ['Mira has 14 coins', 'She gives 6 coins to Leo'],
  relations: [{ quote: 'She gives 6 coins to Leo', operation: 'subtract' }],
  unknown: 'How many coins remain' });
const parsed = parseStructuredInterpretation(valid, source);
assert.equal(parsed.ok, true);
assert.equal(parsed.value.facts[0].sourceOffset, 0);
assert.equal(parsed.value.relations[0].status, 'model_proposed_unverified');
assert.deepEqual(parsed.value.verifiedFacts, []);
assert.equal(parseStructuredInterpretation('```json\n' + valid + '\n```', source).ok, true);
assert.equal(parseStructuredInterpretation(valid + ' extra', source).error, 'invalid_json');
assert.equal(parseStructuredInterpretation(JSON.stringify({ facts: ['Mira has 99 coins'], relations: [], unknown: null }), source).error, 'ungrounded_fact');
assert.equal(parseStructuredInterpretation(JSON.stringify({ facts: [], relations: [{ quote: 'She gives 6 coins to Leo', operation: 'shell' }], unknown: null }), source).error, 'invalid_relation_schema');
assert.equal(parseStructuredInterpretation(JSON.stringify({ facts: [], relations: [], unknown: null, verified: true }), source).error, 'invalid_top_level_schema');
const validLines = 'FACT: Mira has 14 coins\nRELATION: subtract|She gives 6 coins to Leo\nUNKNOWN: How many coins remain';
assert.equal(parseSpanLines(validLines, source).ok, true);
assert.equal(parseSpanLines('FACT: Mira has 99 coins\nUNKNOWN: null', source).error, 'ungrounded_fact');
assert.equal(parseSpanLines('RELATION: shell|She gives 6 coins to Leo\nUNKNOWN: null', source).error, 'invalid_span_line');
assert.equal(parseSpanLines('UNKNOWN: null', source).error, 'empty_span_lines');

let calls = 0;
const repaired = await interpretProblemWithFalcon(source, 'arithmetic', async () => ({
  text: ++calls === 1 ? '{invalid' : validLines, tokens: 9 }));
assert.equal(repaired.kind, 'model_grounded_provisional');
assert.equal(repaired.modelCalls, 2);
assert.deepEqual(repaired.attempts.map(row => row.status), ['rejected', 'schema_and_spans_valid']);
assert.equal(repaired.tokens, 18);
assert.deepEqual(repaired.interpretation.verifiedFacts, []);

let failures = 0;
const fallback = await interpretProblemWithFalcon(source, 'arithmetic', async () => {
  failures++; return { text: '{invalid', tokens: 3 };
});
assert.equal(failures, 2);
assert.equal(fallback.kind, 'lexical_fallback');
assert.equal(fallback.modelCalls, 2);
assert.ok(fallback.interpretation.relations.some(row => row.operationHint === 'subtract'));
assert.ok(!fallback.interpretation.verifiedFacts);

const storage = { async find() { return []; }, async byScope() { return []; }, async put(row) { return row; },
  async incrementReuse() {}, async linkEquivalent() {} };
const controller = new SpiralController({ exact: new ExactSpiral({ storage }) });
assert.equal((await controller.run(source, { scope: 'interpretation-off-selftest', deeper: true,
  generate: async () => ({ text: 'Unknown.', tokens: 1 }) })).metrics.modelCalls, 1);
let generated = 0;
const integrated = await controller.run(source, { scope: 'interpretation-selftest', deeper: true,
  experimentalInterpretation: true,
  turns: [{ role: 'user', content: source }], generate: async () => ({
    text: ++generated === 1 ? '{bad' : generated === 2 ? validLines : 'Eight coins remain.', tokens: 6 }) });
assert.equal(generated, 3);
assert.equal(integrated.metrics.modelCalls, 3);
assert.equal(integrated.state.graph.modelInterpretation.kind, 'model_grounded_provisional');
assert.ok(integrated.state.graph.nodes.some(row => row.type === 'model_relation_proposal'));
assert.ok(!integrated.state.verifiedFacts.some(row => row.operation === 'structured_interpretation'));
assert.equal(integrated.verification.status, 'unverified');
assert.ok(integrated.trace.some(row => row.operation === 'structured_interpretation' && row.schemaValid));

let invalidCalls = 0;
const integratedFallback = await controller.run(source, { scope: 'interpretation-fallback-selftest', deeper: true,
  experimentalInterpretation: true,
  generate: async () => ({ text: ++invalidCalls <= 2 ? '{bad' : 'I am unsure.', tokens: 2 }) });
assert.equal(invalidCalls, 3);
assert.equal(integratedFallback.state.graph.modelInterpretation.kind, 'lexical_fallback');
assert.equal(integratedFallback.state.verifiedFacts.length, 0);
assert.equal(integratedFallback.verification.status, 'unverified');
console.log('B2 structured interpretation selftest PASS');
