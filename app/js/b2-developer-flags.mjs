/* Explicitly opt-in experimental B2 UI routes. The default browser journey
 * continues to use the preserved one-Instruct controller. URL flags are not
 * proof that a research pathway passed a release or model-quality gate. */

function isEnabled(params, key) {
  const values = params.getAll(key);
  return values.length === 1 && values[0] === '1';
}

export function readB2DeveloperFlags(search = '') {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  const experimentalDependency = isEnabled(params, 'b2_dependency');
  const wantsProseV2 = isEnabled(params, 'b2_prose_v2');
  const wantsProseV3 = isEnabled(params, 'b2_prose_v3');
  // Two alternate parsers may not be activated together; their acceptance
  // contracts differ and an ambiguous policy must fail closed.
  const exclusiveProse = wantsProseV2 !== wantsProseV3;
  return Object.freeze({
    experimentalChain: isEnabled(params, 'b2_chain'),
    experimentalDependency,
    experimentalCortexGuard: experimentalDependency && isEnabled(params, 'b2_cortex'),
    experimentalProseV2: experimentalDependency && exclusiveProse && wantsProseV2,
    experimentalProseV3: experimentalDependency && exclusiveProse && wantsProseV3,
  });
}
