// Wave 3 / Step 3.5 - "no ghost rows".
//
// The review (Batch 3 High): every write path committed a FAKE row, toasted
// success, published it to every store — and only THEN called the API with
// a console.warn on failure. A failed booking left an appointment on the
// screen that never existed. Wave 2 made the backend answer failures with
// readable sentences; this step surfaces them instead of inventing success.
//
// Live rule: ask the backend FIRST, commit the REAL row it returns, show
// its sentence when it refuses. The optimistic path survives only for
// demo rows (isDemoMode / local mock requests), which are the pitch tool.
// Node only.

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
  return src.slice(a, b === -1 ? a + 12000 : b);
}

console.log('Q. the queue confirm books for real first');

const queueSrc = read('../src/stores/useQueueStore.js');
const confirm = fnBody(queueSrc, 'confirmSingleSlot', 'injectRequest');
const demoMarkerQ = (confirm || '').indexOf('// Demo/mock row');
const randomIdQ = (confirm || '').indexOf('apptId = `AP-');
check('Q1 the action is async and awaits the backend',
  /confirmSingleSlot:\s*async/.test(queueSrc) && /await apiService\s*\.\s*holdSlot/.test(confirm || ''),
  'the old flow toasted success before the API call');
check('Q2 the live row uses the backend appointment code',
  /appointment_code/.test(confirm || '') && (randomIdQ === -1 || (demoMarkerQ !== -1 && randomIdQ > demoMarkerQ)),
  'the live path must commit the backend code; a random AP-#### belongs to demo rows only');
check('Q3 a refusal shows the server\'s own sentence',
  /err\.details\?\.detail|err\.details\.detail/.test(confirm || '') && /tone:\s*'error'/.test(confirm || ''),
  'Wave 2 made the 409s readable — show them');

console.log('W. the calendar walk-in books for real first');

const calSrc = read('../src/stores/useCalendarStore.js');
const walkIn = fnBody(calSrc, 'confirmWalkIn', 'releaseHold');
check('W1 the action is async and awaits the backend',
  /confirmWalkIn:\s*async/.test(calSrc) && /await apiService\s*\.\s*registerWalkIn/.test(walkIn || ''),
  'the old flow published a fake AP block before the POST');
check('W2 the committed block uses the backend appointment code',
  /appointment_code/.test(walkIn || ''),
  'no locally minted ids on real rows');
check('W3 a refusal rolls back and shows the sentence',
  /tone:\s*'error'/.test(walkIn || '') && /err\.details\?\.detail|err\.details\.detail/.test(walkIn || ''),
  'a failed walk-in must leave the slot free and explain why');

console.log('S. staff creation is real, and holds no secrets');

const staffSrc = read('../src/stores/useStaffStore.js');
const addStaff = fnBody(staffSrc, 'addStaffMember', 'openResetPinModal');
check('S1 the action is async and awaits the backend',
  /addStaffMember:\s*async/.test(staffSrc) && /await apiService\s*\.\s*createStaff/.test(addStaff || ''),
  'a failed POST used to leave a fake staff row on screen');
check('S2 the committed row uses the backend id',
  /res\.id|res\?\.id/.test(addStaff || '') && !/id: `staff-\$\{Date\.now\(\)\}`/.test(addStaff || ''),
  'no locally minted ids on real rows');
check('S3 live rows never hold a PIN or password',
  !/newStaff\.pin = newStaffData\.pin/.test(addStaff || '') || /isDemoMode/.test((addStaff || '').split('newStaff.pin')[0]),
  'credentials must not live in browser state in live mode');
check('S4 the success toast does not print the PIN',
  !/Quick-PIN \$\{/.test(addStaff || ''),
  'the toast used to reveal the workstation PIN');

console.log('');
if (failures) {
  console.log('FAILED: ' + failures + ' check(s) of ' + checks);
  process.exit(1);
}
console.log('ALL PASS (' + checks + ' checks)');
