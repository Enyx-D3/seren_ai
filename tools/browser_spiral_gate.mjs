/* CP009 gate: exact shared-state Spiral correctness, replay determinism,
   adversarial non-equivalence, repeated-state hit rate and net benefit.
   Requires `node tools/serve.mjs` and the four local GGUFs are not needed. */
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

const BASE = 'http://127.0.0.1:8799/';
const sourceRevision = (() => {
  try { return execSync('git rev-parse --short HEAD', { cwd: process.cwd() }).toString().trim(); }
  catch { return 'unknown'; }
})();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage(), errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(BASE)) external.push(request.url()); });
  await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent.includes('Start chatting'));
  await page.context().setOffline(true);

  const phaseA = await page.evaluate(async () => {
    const { exactArithmetic } = await import('/js/exact-arithmetic.mjs');
    const { ExactSpiral, canonicalArithmetic, isReuseCandidate, replayHeartbeat, repairHeartbeat, planExactDependencies } = await import('/js/spiral.mjs');
    const { sharedStates, conv } = await import('/js/store.mjs');
    const { tryLocalAnswer } = await import('/js/tools.mjs');

    const synthetic = [
      { name: 'rational-product-6', expression: Array(6).fill('(12345678901234567/98765432109876543)').join('*') },
      { name: 'large-fraction-sum-6', expression: [
        '(987654321098765431/876543210987654319)', '(876543210987654319/765432109876543211)',
        '(765432109876543211/654321098765432099)', '(654321098765432099/543210987654321097)',
        '(543210987654321097/432109876543210983)', '(432109876543210983/321098765432109871)'].join('+') },
      { name: 'engineering-ratio-product-5', expression: [
        '(12500000000000001/70000000000000003)', '(12400000000000007/13000000000000009)',
        '(24000000000000011/11000000000000013)', '(36000000000000017/19000000000000019)',
        '(48000000000000023/23000000000000029)'].join('*') },
    ];
    const realistic = [
      { name: 'quarterly-budget-variance', expression: [
        '(48750000000000001/32500000000000003)', '(51250000000000009/34166666666666671)',
        '(47800000000000013/31866666666666671)', '(50100000000000017/33400000000000003)',
        '(49200000000000019/32800000000000001)'].join('*') },
      { name: 'unit-cost-rollup', expression: [
        '(198765432109876543/100000000000000007)', '(176543210987654321/100000000000000003)',
        '(154321098765432109/100000000000000009)', '(132109876543210987/100000000000000001)',
        '(110987654321098765/100000000000000007)'].join('*') },
      { name: 'proration-reconciliation', expression: [
        '(12345678901234567/98765432109876543)', '(23456789012345677/87654321098765431)',
        '(34567890123456789/76543210987654321)', '(45678901234567891/65432109876543219)',
        '(56789012345678903/54321098765432107)'].map(item => `(${item})`).join('+') },
      { name: 'batch-yield', expression: [
        '(987654321098765431/876543210987654319)', '(765432109876543211/654321098765432099)',
        '(543210987654321097/432109876543210983)', '(321098765432109871/210987654321098761)',
        '(210987654321098761/109876543210987653)'].join('*') },
    ];
    for (const item of [...synthetic, ...realistic]) {
      item.expected = exactArithmetic(item.expression).text;
      item.length = item.expression.length;
    }
    const scopes = [];
    const makeScope = async label => {
      const id = `cp009-${label}-${crypto.randomUUID()}`;
      await conv.put({ id, title: `CP009 ${label}` }); scopes.push(id); return id;
    };
    const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const measure = async (fn, trials = 7) => {
      const samples = [];
      for (let i = 0; i < trials; i++) { const start = performance.now(); await fn(); samples.push(performance.now() - start); }
      return { samples, median: median(samples) };
    };
    const baseline = async (items, rounds, trials = 7) => {
      for (let i = 0; i < 5; i++) for (const item of items) exactArithmetic(item.expression);
      return measure(() => {
        for (let round = 0; round < rounds; round++) for (const item of items) exactArithmetic(item.expression);
      }, trials);
    };
    const replayResult = result => {
      const first = replayHeartbeat(JSON.parse(JSON.stringify(result.deltas)));
      const second = replayHeartbeat(JSON.parse(JSON.stringify(result.deltas)));
      return { ok: first.ok && second.ok && first.value === result.value &&
        first.value === second.value && first.final_hash === second.final_hash &&
        first.sequences === second.sequences, first, second };
    };
    const runSuite = async (label, items, rounds, { persist = false, collectReplay = false } = {}) => {
      const scope = await makeScope(label);
      const engine = new ExactSpiral();
      const started = performance.now();
      let attempts = 0, hits = 0, replayChecked = 0;
      const failures = [], perItem = Object.fromEntries(items.map(item => [item.name, { attempts: 0, hits: 0 }]));
      const replay = [];
      let sample = null;
      for (let round = 0; round < rounds; round++) {
        for (const item of items) {
          const result = await engine.solve(item.expression, { scope });
          attempts++; perItem[item.name].attempts++;
          if (result.reused) { hits++; perItem[item.name].hits++; }
          if (result.value !== item.expected) failures.push({ name: item.name, round, expected: item.expected, actual: result.value });
          if (!sample) sample = { name: item.name, expression: item.expression, expected: item.expected, result };
          if (collectReplay) {
            replayChecked++;
            const checked = replayResult(result);
            if (!checked.ok) replay.push({ name: item.name, round, result: checked });
          }
        }
      }
      const elapsedMs = performance.now() - started;
      let persistMs = null;
      if (persist) { const start = performance.now(); await engine.flush({ onlyPending: true }); persistMs = performance.now() - start; }
      const steadyAttempts = attempts - items.length;
      return { scope, attempts, hits, hitRate: hits / attempts,
        steadyStateHitRate: steadyAttempts > 0 ? hits / steadyAttempts : null,
        elapsedMs, persistMs, failures, perItem, replayChecked, replay, sample,
        steps: sample.result.deltas.map(delta => delta.kind) };
    };

    // Open the database before timing; app boot also does this.
    await sharedStates.byScope('cp009-db-warmup');

    const syntheticRounds = 50, realisticRounds = 30;
    const syntheticBaseline = await baseline(synthetic, syntheticRounds);
    const syntheticTrials = [];
    for (let i = 0; i < 7; i++) syntheticTrials.push(await runSuite('synthetic-trial', synthetic, syntheticRounds,
      { persist: i === 0, collectReplay: i === 0 }));
    const realisticBaseline = await baseline(realistic, realisticRounds);
    const realisticTrials = [];
    for (let i = 0; i < 7; i++) realisticTrials.push(await runSuite('realistic-trial', realistic, realisticRounds,
      { persist: i === 0, collectReplay: i === 0 }));

    const suiteEvidence = (items, rounds, baselineRun, trials) => {
      const first = trials[0];
      return {
        expressions: items.map(item => ({ name: item.name, length: item.length, expected_length: item.expected.length })),
        rounds, attempts: first.attempts, hits: first.hits, hitRate: first.hitRate,
        steadyStateHitRate: first.steadyStateHitRate, perItem: first.perItem,
        correctnessFailures: first.failures, replayChecked: first.replayChecked, replayFailures: first.replay,
        steps: first.steps, baselineMs: baselineRun.median, spiralMs: median(trials.map(trial => trial.elapsedMs)),
        criticalPathRatio: median(trials.map(trial => trial.elapsedMs)) / baselineRun.median,
        persistenceMs: first.persistMs,
        netIncludingPersistenceRatio: (median(trials.map(trial => trial.elapsedMs)) + first.persistMs) / baselineRun.median,
        samples: trials.map(trial => ({ elapsedMs: trial.elapsedMs, hits: trial.hits, attempts: trial.attempts })),
        baselineSamples: baselineRun.samples,
      };
    };
    const syntheticEvidence = suiteEvidence(synthetic, syntheticRounds, syntheticBaseline, syntheticTrials);
    const realisticEvidence = suiteEvidence(realistic, realisticRounds, realisticBaseline, realisticTrials);

    // Adversarial equivalence, positive commutative controls, corruption repair.
    const counters = { put: 0, link: 0, increment: 0 };
    const tracked = {
      byScope: scope => sharedStates.byScope(scope),
      find: (identity, scope) => sharedStates.find(identity, scope),
      put: async row => { counters.put++; return sharedStates.put(row); },
      incrementReuse: async (id, count) => { counters.increment++; return sharedStates.incrementReuse(id, count); },
      linkEquivalent: async (source, target, proof) => { counters.link++; return sharedStates.linkEquivalent(source, target, proof); },
    };
    const positiveScope = await makeScope('positive-controls');
    const adversarialScope = await makeScope('adversarial-pairs');
    const positiveEngine = new ExactSpiral({ storage: tracked });
    const positiveControls = [];
    for (const [left, right] of [['2+1', '1+2'], ['10+2', '2+10'], ['2*3', '3*2']]) {
      const a = await positiveEngine.solve(left, { scope: positiveScope, forceReuse: true });
      const b = await positiveEngine.solve(right, { scope: positiveScope, forceReuse: true });
      positiveControls.push({ left, right, leftValue: a.value, rightValue: b.value,
        reused: b.reused, sameState: a.stateId === b.stateId,
        expected: exactArithmetic(left).text,
        ok: b.reused && a.stateId === b.stateId && a.value === b.value && a.value === exactArithmetic(left).text });
    }
    await positiveEngine.flush({ onlyPending: true });
    const adversarialPairs = [
      ['2-1', '1-2'], ['8/4', '4/8'], ['2+3*4', '(2+3)*4'],
      ['1/2+1/3', '1/3+1/2'], ['0.1+0.2', '0.3'],
      ['1.0+2.00', '1+2'], ['(1/2)*(2/3)', '(2/3)*(1/2)'],
      ['12345678901234567+1', '1+12345678901234566'],
    ];
    const adversarialEngine = new ExactSpiral({ storage: tracked });
    const adversarial = [];
    for (const [left, right] of adversarialPairs) {
      const a = await adversarialEngine.solve(left, { scope: adversarialScope, forceReuse: true });
      const b = await adversarialEngine.solve(right, { scope: adversarialScope, forceReuse: true });
      const expectedLeft = exactArithmetic(left).text, expectedRight = exactArithmetic(right).text;
      const falsePositive = b.reused || b.stateId === a.stateId;
      adversarial.push({ left, right, leftValue: a.value, rightValue: b.value,
        expectedLeft, expectedRight, reused: b.reused, sameState: a.stateId === b.stateId, falsePositive,
        correct: a.value === expectedLeft && b.value === expectedRight });
    }
    const falsePositiveCount = adversarial.filter(row => row.falsePositive).length;
    const isolated = await new ExactSpiral({ storage: tracked }).solve('2+1', {
      scope: await makeScope('scope-isolation'), forceReuse: true });
    const scopeIsolation = { reused: isolated.reused, value: isolated.value, expected: '3' };

    // Corrupt one persisted positive-control receipt and verify repair rather than reuse.
    const positiveRows = await sharedStates.byScope(positiveScope);
    const corruptedRow = positiveRows.find(row => row.confidence_kind === 'exact' && row.canonical_expression === '1+2');
    if (!corruptedRow) throw new Error('missing exact receipt for corruption fixture');
    await sharedStates.put({ ...corruptedRow, value: '999' });
    const repaired = await new ExactSpiral({ storage: sharedStates }).solve('1+2', { scope: positiveScope, forceReuse: true });
    const repairedRow = (await sharedStates.byScope(positiveScope))
      .find(row => row.id === corruptedRow.id);
    const corruption = { reused: repaired.reused, value: repaired.value, expected: '3',
      repairDelta: repaired.deltas.some(delta => delta.kind === 'repair'),
      repairedValue: repairedRow?.value, ok: !repaired.reused && repaired.value === '3' &&
        repaired.deltas.some(delta => delta.kind === 'repair') && repairedRow?.value === '3' };

    // Replay determinism and tamper detection on the first synthetic result.
    const sample = syntheticTrials[0].sample;
    const replayRuns = [0, 1, 2].map(() => replayHeartbeat(JSON.parse(JSON.stringify(sample.result.deltas))));
    const replayDeterministic = new Set(replayRuns.map(run => JSON.stringify(run))).size === 1 &&
      replayRuns.every(run => run.ok && run.value === sample.expected);
    const tamperCases = {
      payload_value: deltas => { deltas.at(-1).payload.value = '0'; },
      previous_hash: deltas => { deltas[1].previous_hash = 'deadbeef'; },
      hash: deltas => { deltas.at(-1).hash = '00000000'; },
      sequence: deltas => { deltas[1].sequence = 9; },
      kind: deltas => { deltas[1].kind = 'unknown'; },
      truncated: deltas => { deltas.pop(); },
      too_long: deltas => { deltas.push({ ...deltas.at(-1), sequence: deltas.length + 1, previous_hash: deltas.at(-1).hash });
        deltas.push({ ...deltas.at(-1), sequence: deltas.length + 1, previous_hash: deltas.at(-1).hash }); },
    };
    const tamper = {};
    for (const [name, mutate] of Object.entries(tamperCases)) {
      const deltas = JSON.parse(JSON.stringify(sample.result.deltas)); mutate(deltas);
      const result = replayHeartbeat(deltas);
      tamper[name] = { ok: result.ok, error: result.error || null, repairFrom: result.repair_from_sequence ?? null };
    }
    const tampered = JSON.parse(JSON.stringify(sample.result.deltas));
    tampered[1].payload.value = '0';
    const repairA = repairHeartbeat(sample.expression, tampered, '0');
    const repairB = repairHeartbeat(sample.expression, tampered, '0');
    const repairDeterministic = JSON.stringify(repairA) === JSON.stringify(repairB) &&
      repairA.repaired && replayHeartbeat(repairA.deltas).value === sample.expected;
    const validRepair = repairHeartbeat(sample.expression, sample.result.deltas, sample.expected);
    const replay = {
      sampleExpression: sample.expression, sampleExpected: sample.expected,
      deterministic: replayDeterministic, runs: replayRuns,
      tamper, repairDeterministic,
      validRequiresNoRepair: validRepair.repaired === false && validRepair.value === sample.expected,
      dependencyScheduled: sample.result.deltas.some(delta => delta.kind === 'dependencies_ready'),
      sampleDeltas: sample.result.deltas,
    };

    // One-off cost and explicit fallback checks.
    const oneOff = Array.from({ length: 8 }, (_, index) => Array(6).fill(
      `(${12345678901234567n + BigInt(index)}/98765432109876543)`).join('*'));
    const oneOffBaseline = await baseline(oneOff.map(expression => ({ expression })), 1);
    const oneOffTrials = [];
    for (let trial = 0; trial < 7; trial++) {
      const engine = new ExactSpiral();
      const scope = await makeScope('one-off-trial');
      const start = performance.now();
      for (const expression of oneOff) await engine.solve(expression, { scope });
      oneOffTrials.push(performance.now() - start);
    }
    const oneOffMs = median(oneOffTrials);
    const shortExpression = '2+1';
    const longUnsupported = Array(60).fill('1/2').join('+');
    const shortSolve = await new ExactSpiral().solve(shortExpression, { scope: await makeScope('short-fallback') });
    const longError = await new ExactSpiral().solve(longUnsupported, { scope: await makeScope('long-fallback') })
      .then(() => null).catch(error => error.message);
    const longFallback = tryLocalAnswer(longUnsupported);
    const zeroFallback = tryLocalAnswer('1/0');
    const fallback = {
      shortCandidate: isReuseCandidate(shortExpression),
      shortRoute: shortSolve.route,
      shortValue: shortSolve.value,
      longCandidate: isReuseCandidate(longUnsupported),
      longSolveError: longError,
      longFallbackVia: longFallback?.via || null,
      longFallbackAnswer: longFallback?.answer || null,
      divisionByZeroVia: zeroFallback?.via || null,
      divisionByZeroAnswer: zeroFallback?.answer || null,
    };
    const performanceEvidence = {
      oneOffBaselineMs: oneOffBaseline.median, oneOffSpiralMs: oneOffMs,
      oneOffRatio: oneOffMs / oneOffBaseline.median,
      oneOffSamples: oneOffTrials,
      fallback,
      canonical: {
        sum: canonicalArithmetic('2+1').canonical,
        subtraction: canonicalArithmetic('2-1').canonical,
      },
      dependencies: planExactDependencies(synthetic[0].expression).length,
    };

    return {
      synthetic: syntheticEvidence, realistic: realisticEvidence, syntheticItems: synthetic, realisticItems: realistic,
      reloadScope: syntheticTrials[0].scope, reloadRounds: syntheticRounds,
      adversarial: { positiveControls, pairs: adversarial, falsePositiveCount,
        scopeIsolation, corruption },
      replay, performance: performanceEvidence, scopes,
      sample: { expression: sample.expression, expected: sample.expected, deltas: sample.result.deltas },
    };
  });

  await page.reload();
  await page.waitForFunction(() => document.querySelector('#heroStatus')?.textContent.includes('Start chatting'));
  const phaseB = await page.evaluate(async ({ scope, items, rounds, sample }) => {
    const { exactArithmetic } = await import('/js/exact-arithmetic.mjs');
    const { ExactSpiral, replayHeartbeat } = await import('/js/spiral.mjs');
    const { sharedStates } = await import('/js/store.mjs');
    const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const expected = Object.fromEntries(items.map(item => [item.expression, exactArithmetic(item.expression).text]));
    const engine = new ExactSpiral();
    await engine.warm(scope);
    const rows = (await sharedStates.byScope(scope)).filter(row => row.confidence_kind === 'exact');
    const trials = [];
    for (let trial = 0; trial < 7; trial++) {
      const start = performance.now();
      for (let round = 0; round < rounds; round++) for (const item of items) {
        const result = await engine.solve(item.expression, { scope });
        if (!result.reused || result.value !== expected[item.expression]) throw new Error('reload reuse mismatch');
      }
      trials.push(performance.now() - start);
    }
    const baselineTrials = [];
    for (let trial = 0; trial < 7; trial++) {
      const start = performance.now();
      for (let round = 0; round < rounds; round++) for (const item of items) exactArithmetic(item.expression);
      baselineTrials.push(performance.now() - start);
    }
    const replay = [0, 1, 2].map(() => replayHeartbeat(JSON.parse(JSON.stringify(sample.deltas))));
    return {
      persistedExactRows: rows.length,
      attempts: rounds * items.length * 7, hits: rounds * items.length * 7,
      hitRate: 1, spiralMs: median(trials), baselineMs: median(baselineTrials),
      ratio: median(trials) / median(baselineTrials),
      samples: trials, baselineSamples: baselineTrials,
      replayOk: replay.every(run => run.ok && run.value === sample.expected),
      replayDeterministic: new Set(replay.map(run => JSON.stringify(run))).size === 1,
      reuseCounts: rows.map(row => ({ canonical_length: row.canonical_expression.length, reuse_count: row.reuse_count || 0 })),
    };
  }, { scope: phaseA.reloadScope, items: phaseA.syntheticItems, rounds: phaseA.reloadRounds, sample: phaseA.sample });

  async function ask(text) {
    const before = await page.locator('.msg-ai').count();
    const started = performance.now();
    await page.locator('#prompt').fill(text);
    await page.locator('#sendBtn').click();
    await page.waitForFunction(previous => {
      const rows = [...document.querySelectorAll('.msg-ai')];
      return rows.length > previous && rows.at(-1).querySelector('.m-status')?.textContent !== 'Writing locally…';
    }, before, { timeout: 20000 });
    return { answer: await page.locator('.msg-ai .prose').last().innerText(),
      via: await page.locator('.msg-ai .m-status').last().innerText(),
      elapsedMs: Math.round(performance.now() - started) };
  }
  await page.locator('#newBtn').click();
  const uiExpression = phaseA.sample.expression;
  const uiExpected = phaseA.sample.expected;
  const uiFirst = await ask(uiExpression);
  const uiSecond = await ask(uiExpression);
  const uiThird = await ask(uiExpression);
  await page.waitForTimeout(500);
  const uiConversation = await page.evaluate(async () => (await (await import('/js/store.mjs')).conv.list())[0]?.id);
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.msg-ai').length >= 3);
  const uiFourth = await ask(uiExpression);
  const uiShort = await ask('2+1');
  const uiFallback = await ask(Array(60).fill('1/2').join('+'));
  const uiZero = await ask('1/0');
  const uiStore = await page.evaluate(async conversationId => {
    const { msg, sharedStates } = await import('/js/store.mjs');
    const { replayHeartbeat } = await import('/js/spiral.mjs');
    const messages = await msg.byConv(conversationId);
    const answers = messages.filter(row => row.role === 'assistant');
    const rows = (await sharedStates.byScope(conversationId)).filter(row => row.confidence_kind === 'exact');
    return {
      answers: answers.map(row => ({ content: row.content, via: row.meta?.via || null,
        sharedStateId: row.meta?.shared_state_id || null,
        replay: row.meta?.spiral_deltas ? replayHeartbeat(row.meta.spiral_deltas) : null })),
      exactRows: rows.map(row => ({ canonical_length: row.canonical_expression.length,
        reuse_count: row.reuse_count || 0, value_digest: row.value_digest })),
    };
  }, uiConversation);
  const ui = {
    expressionLength: uiExpression.length, expectedLength: uiExpected.length,
    first: uiFirst, second: uiSecond, third: uiThird, afterReload: uiFourth,
    shortFallback: uiShort, longFallback: uiFallback, divisionByZero: uiZero,
    conversationId: uiConversation, store: uiStore,
  };

  const cleanup = await page.evaluate(async scopes => {
    const { conv } = await import('/js/store.mjs');
    for (const scope of scopes) await conv.del(scope);
    return { requested: scopes.length };
  }, [...phaseA.scopes, uiConversation]);
  const sampleRowsAfterDelete = await page.evaluate(async scope => {
    const { sharedStates } = await import('/js/store.mjs');
    return (await sharedStates.byScope(scope)).length;
  }, phaseA.reloadScope);

  const synthetic = phaseA.synthetic, realistic = phaseA.realistic;
  const uiReplayOk = uiStore.answers.filter(row => row.replay).every(row => row.replay.ok &&
    row.replay.value === (row.content === uiExpected ? uiExpected : row.content)) &&
    uiStore.answers.filter(row => row.replay).length >= 4;
  const failures = [];
  for (const [name, suite] of [['synthetic', synthetic], ['realistic', realistic]]) {
    if (suite.correctnessFailures.length) failures.push(`${name}: correctness failures`);
    if (suite.hitRate <= 0.9) failures.push(`${name}: hit rate ${suite.hitRate}`);
    if (suite.steadyStateHitRate !== 1) failures.push(`${name}: steady-state hit rate ${suite.steadyStateHitRate}`);
    if (!(suite.criticalPathRatio < 1)) failures.push(`${name}: critical path ratio ${suite.criticalPathRatio}`);
    if (!(suite.netIncludingPersistenceRatio < 1.25)) failures.push(`${name}: net ratio ${suite.netIncludingPersistenceRatio}`);
  }
  if (phaseA.adversarial.falsePositiveCount !== 0) failures.push('adversarial false positives');
  if (!phaseA.adversarial.positiveControls.every(row => row.ok)) failures.push('positive equivalence controls');
  if (phaseA.adversarial.scopeIsolation.reused !== false) failures.push('scope isolation');
  if (!phaseA.adversarial.corruption.ok) failures.push('corruption repair');
  if (!phaseA.replay.deterministic || !phaseA.replay.repairDeterministic ||
      !Object.values(phaseA.replay.tamper).every(row => row.ok === false) ||
      !phaseA.replay.validRequiresNoRepair) failures.push('replay determinism/tamper');
  if (phaseB.persistedExactRows < phaseA.syntheticItems.length) failures.push('persisted rows missing');
  if (phaseB.hitRate !== 1 || !(phaseB.ratio < 1)) failures.push('reload reuse benefit');
  if (!(phaseA.performance.oneOffRatio < 5)) failures.push('one-off overhead');
  if (phaseA.performance.fallback.shortCandidate !== false ||
      phaseA.performance.fallback.shortRoute !== 'baseline_short_expression' ||
      phaseA.performance.fallback.shortValue !== '3') failures.push('short-expression fallback');
  if (!phaseA.performance.fallback.longSolveError ||
      phaseA.performance.fallback.longFallbackVia !== 'approximate calculator') failures.push('unsupported-expression fallback');
  if (phaseA.performance.fallback.divisionByZeroVia !== 'verified exact arithmetic') failures.push('division-by-zero fallback');
  if (!(uiFirst.via === 'verified exact arithmetic' && uiSecond.via === 'verified shared state' &&
      uiThird.via === 'verified shared state' && uiFourth.via === 'verified shared state')) failures.push('UI reuse status');
  if (uiShort.via !== 'verified exact arithmetic' || uiShort.answer !== '3') failures.push('UI short fallback');
  if (uiFallback.via !== 'approximate calculator') failures.push('UI unsupported fallback');
  if (uiZero.via !== 'verified exact arithmetic' || !uiZero.answer.startsWith('Undefined')) failures.push('UI division-by-zero fallback');
  if (!uiReplayOk) failures.push('UI heartbeat replay');
  if (uiStore.exactRows.length < 1 || uiStore.exactRows[0].reuse_count < 1) failures.push('UI reuse receipt');
  if (sampleRowsAfterDelete !== 0) failures.push('deletion cleanup');
  if (errors.length || external.length) failures.push('page errors or external requests');

  const report = {
    schema_version: 1, checkpoint: 'CP009', generated_at: new Date().toISOString(),
    source_revision: sourceRevision,
    environment: `macOS arm64 / Playwright Chromium ${await browser.version()} / offline after service-worker ready / local IndexedDB / no model needed`,
    gate: {
      synthetic: synthetic, realistic: realistic,
      reload: phaseB, adversarial: phaseA.adversarial, replay: phaseA.replay,
      performance: phaseA.performance, ui, cleanup: { ...cleanup, sampleRowsAfterDelete },
    },
    errors, external,
    passed: failures.length === 0, failures,
  };
  const output = `evidence/spiral-gate-${new Date().toISOString().slice(0, 10)}.json`;
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    passed: report.passed, failures,
    synthetic: { hitRate: synthetic.hitRate, criticalPathRatio: synthetic.criticalPathRatio, netRatio: synthetic.netIncludingPersistenceRatio },
    realistic: { hitRate: realistic.hitRate, criticalPathRatio: realistic.criticalPathRatio, netRatio: realistic.netIncludingPersistenceRatio },
    reload: { ratio: phaseB.ratio, rows: phaseB.persistedExactRows },
    adversarialFalsePositives: phaseA.adversarial.falsePositiveCount,
    replayDeterministic: phaseA.replay.deterministic,
    ui: { first: uiFirst.via, second: uiSecond.via, reload: uiFourth.via, short: uiShort.via, fallback: uiFallback.via, zero: uiZero.via },
    output,
  }, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally { await browser.close(); }
