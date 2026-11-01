# First frozen word-problem run failure

Fixture SHA-256: `c4c89a0a8abee861e60941da64568510e122b720ff9015d5cf0de99de8058dd6`.

Command: `node tools/b2_word_holdout_eval.mjs`.

Observed: process exited 1 with `Error: unexpected Falcon call` from `SpiralController.run` at `app/js/spiral.mjs:457`. Diagnostic parser check showed w1=true, w2=true, **w3=false**, w4=true, n1=false, n2=false. The w3 phrase was “7 pouches. Each pouch contains 11 beads.” The parser's singularization removed only trailing `s`, yielding `pouche` and rejecting the otherwise supported relation. This was an honest abstention, not a wrong verified answer. No output receipt was written by the first harness invocation because the thrown error interrupted it. The fixture is retained unchanged. The generic plural rule was repaired after this failure; results on the same fixture are regression evidence, not untouched holdout evidence.
