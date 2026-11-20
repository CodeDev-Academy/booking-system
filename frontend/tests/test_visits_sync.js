// Wave 3 / Step 3.3 - "the Live Visits board reads real data".
//
// The review (finding 8): useVisitsStore had NO syncFromBackend at all —
// apiService.fetchTodayAppointments was defined and never called — so the
// swimlanes, timers and expected-today list were always the seeded demo
// rows. This pins the real path: today's appointments are fetched, mapped by
// status into the lanes, an empty answer empties the board, and a failed
// fetch keeps the screen. Node only.

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
  return src.slice(a, b === -1 ? a + 9000 : b);
}

console.log('V. the visits store fetches today');

const storeSrc = read('../src/stores/useVisitsStore.js');
const sync = fnBody(storeSrc, 'syncFromBackend: async', 'admitWalkIn');
check('V1 the store has a syncFromBackend', sync !== null,
  'useVisitsStore must expose syncFromBackend');
if (sync) {
  check('V2 it fetches today\'s appointments',
    /fetchTodayAppointments/.test(sync), 'the endpoint existed but was never called');
  check('V3 an arrived appointment becomes a waiting visit',
    /'arrived'[\s\S]{0,160}'waiting'/.test(sync) || /status:\s*'waiting'/.test(sync));
  check('V4 an in-consultation appointment lands in the consult lane',
    /'in_consultation'/.test(sync));
  check('V5 a completed appointment lands in the completed lane',
    /'completed'/.test(sync));
  check('V6 a confirmed appointment is expected today, not a lane visit',
    /expectedToday/.test(sync) && /'confirmed'/.test(sync));
  check('V7 an empty answer empties the board',
    /set\(\{\s*visits,\s*expectedToday\s*\}\)/.test(sync)
      || /visits:\s*\[\s*\][\s\S]{0,80}expectedToday:\s*\[\s*\]/.test(sync),
    'a successful empty answer must replace both lists');
  check('V8 a failed fetch keeps the screen',
    /catch[\s\S]{0,80}(console\.warn|warn)\(/.test(sync));
  check('V9 the visit carries the backend identity for display',
    /doctor_name/.test(sync) && /service_name/.test(sync),
    'display must not depend on the mock roster');
}

console.log('H. the hook drives the board from the API and the clinic clock');

const hookSrc = read('../src/hooks/useLiveVisits.js');
check('H1 the hook triggers the sync on mount',
  /syncFromBackend/.test(hookSrc), 'useLiveVisits must call the store sync');
check('H2 display prefers the row\'s own backend fields',
  /doctorName/.test(hookSrc) && /serviceName/.test(hookSrc),
  'getDoctor/getService mocks must be a fallback only');
check('H3 the ticker runs on the clinic clock',
  /clinicNow\(\)/.test(hookSrc) && !/Date\.now\(\)/.test(hookSrc),
  'a slow laptop clock must not skew the urgency timers');

console.log('');
if (failures) {
  console.log('FAILED: ' + failures + ' check(s) of ' + checks);
  process.exit(1);
}
console.log('ALL PASS (' + checks + ' checks)');
