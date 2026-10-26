// tools/fab_debug.mjs — inspect parseToolFabric against the selftest input.
import { parseToolFabric } from '../app/js/tools.mjs';
const BT = String.fromCharCode(96);
const fabInput = BT + "{" + "\n" + "\"name\": \"calculator\"," + "\n" + "\"arguments\": {\"expression\": \"3*14\"}" + "\n" + "}" + BT
  + ' junk '
  + BT + "{" + "\n" + "\"name\": \"now\", \"arguments\": {\"deep\": true}}" + "\n" + "}" + BT;
console.log('INPUT ESCAPED:', JSON.stringify(fabInput));
const fab = parseToolFabric(fabInput);
console.log('calls:', JSON.stringify(fab.calls, null, 1));
console.log('errors:', JSON.stringify(fab.errors, null, 1));
