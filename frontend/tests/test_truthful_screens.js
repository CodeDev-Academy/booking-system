// Wave 3 / Step 3.2 - "an empty backend means an empty screen".
//
// The review (finding 9): every sync bails out when the API answers with an
// empty list, so the seeded demo rows survive a fresh install - reception
// opens a brand-new clinic and sees patients who do not exist.
//
// Contract pinned here:
//   - a SUCCESSFUL answer with zero rows REPLACES the on-screen rows (empty
//     clinic shows an empty screen);
//   - a FAILED fetch keeps whatever is on screen (the network being down is
//     not the same as an empty clinic).
// Node only - no browser needed.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), 'utf8');

let failures = 0;
let checks = 0;
function check(name, ok, detail) {
  checks += 1;
  if (!ok) failures += 1;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + name + (ok || !detail ? '' : '  -> ' + detail));
}

function fnBody(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  if (a === -1) return null;
  const b = src.indexOf(endMarker, a);
  return src.slice(a, b === -1 ? a + 6000 : b);
}

console.log('Q. the queue empties when the backend answers empty');

const queueSrc = read('../src/stores/useQueueStore.js');
const apiSrc = read('../src/services/apiService.js');

console.log('X. the API base never guesses in production');

check('X1 no fallback to someone else\'s server',
  !/booking-system-3-iojp\.onrender\.com/.test(apiSrc),
  'DEFAULT_PROD_API_URL pointed at a demo backend that is not the customer\'s');
check('X2 a production build without configuration refuses to start',
  /import\.meta\.env\.PROD[\s\S]{0,700}throw new Error/.test(apiSrc),
  'the base used to silently guess the site\'s own origin');

const queueSync = fnBody(queueSrc, 'syncFromBackend: async', 'patchSlot:');
check('Q1 no early return on an empty list',
  !/list\.length === 0\)\s*return/.test(queueSync || ''),
  'the old bail kept demo rows on screen forever');
check('Q2 an empty answer clears the request list',
  /requests:\s*\[\s*\]/.test(queueSync || ''),
  'a successful empty answer must replace the rows');
check('Q3 a failed fetch keeps the screen',
  /catch[\s\S]{0,80}(console\.warn|warn)\(/.test(queueSync || ''),
  'network down must not wipe the screen');

console.log('C. the calendar empties when the backend answers empty');

const calSrc = read('../src/stores/useCalendarStore.js');
const calSync = fnBody(calSrc, 'syncFromBackend: async', 'reassignToColleague: async');
check('C1 no early return when the roster is empty',
  !/docSchedules\.length === 0\)\s*return/.test(calSync || ''),
  'a fresh install with no doctors kept fake blocks on screen');
check('C2 an empty answer clears blocks and leave periods',
  /blocks:\s*\[\s*\][\s\S]{0,120}leavePeriods:\s*\{\s*\}/.test(calSync || '')
    || /leavePeriods:\s*\{\s*\}[\s\S]{0,120}blocks:\s*\[\s*\]/.test(calSync || ''),
  'both must be replaced on an empty roster');
check('C3 a failed fetch keeps the screen',
  /catch[\s\S]{0,80}(console\.warn|warn)\(/.test(calSync || ''),
  'network down must not wipe the screen');

console.log('S. the settings store reflects an empty service list');

const setSrc = read('../src/stores/useSettingsStore.js');
const setSync = fnBody(setSrc, 'syncFromBackend: async', 'saveSettings:');
check('S1 no length guard around the services replacement',
  !/servicesData\.length > 0/.test(setSync || ''),
  'an empty service list must still replace the seeded one');
check('S2 an empty array is written as empty',
  /services:\s*mappedServices/.test(setSync || '') && /Array\.isArray\(servicesData\)/.test(setSync || ''),
  'Array.isArray alone (no length test) guards the write');

console.log('');
if (failures) {
  console.log('FAILED: ' + failures + ' check(s) of ' + checks);
  process.exit(1);
}
console.log('ALL PASS (' + checks + ' checks)');
