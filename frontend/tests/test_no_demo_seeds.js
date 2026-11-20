// Wave 3 / Step 3.7 (Option B) - "the API is the only source of clinic rows".
//
// The user's decision: the in-browser demo seeds are DELETED. The pitch look
// comes from `seed_clinic` on the database, so every screen reads the real
// pipeline; the pitch SIMULATOR keeps its own private dataset (mockData's
// constants stay for it, untouched).
//
// Two traps this pins beyond deleting the seed builders:
//   1. localStorage: every store persists its rows, so old sessions would
//      RESURRECT the demo data. Each persisted store bumps its version with
//      a one-time migrate that wipes the seeded arrays.
//   2. resetToDemoDefaults: it used to re-seed the mocks. Under B it resets
//      to an EMPTY clinic - the honest meaning of a reset.
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

const queueSrc = read('../src/stores/useQueueStore.js');
const calSrc = read('../src/stores/useCalendarStore.js');
const visitsSrc = read('../src/stores/useVisitsStore.js');
const staffSrc = read('../src/stores/useStaffStore.js');
const settingsSrc = read('../src/stores/useSettingsStore.js');
const appModeSrc = read('../src/stores/appModeStore.js');
const dayViewSrc = read('../src/components/calendar/CalendarDayView.jsx');

console.log('I. stores start empty');

check('I1 the queue seeds nothing at init',
  !/requests: buildMockRequests\(\)/.test(queueSrc) && !/busyBlocks: buildBusyBlocks\(\)/.test(queueSrc),
  'buildMockRequests/buildMockAppointments/buildBusyBlocks at init');
check('I2 the calendar seeds nothing at init',
  !/blocks: initCalendarBlocks\(\)/.test(calSrc) && !/doctors: DOCTORS\.map/.test(calSrc),
  'initCalendarBlocks/DOCTORS roster at init');
check('I3 the visits board seeds nothing at init',
  !/visits: buildInitialVisits\(\)/.test(visitsSrc),
  'buildInitialVisits/buildInitialExpected at init');
check('I4 the staff roster seeds nothing at init',
  !/staffList: INITIAL_STAFF/.test(staffSrc),
  'INITIAL_STAFF at init');
check('I5 the walk-in modal defaults to nothing, not a mock doctor/service',
  !/DOCTORS\[0\]\.id/.test(calSrc) && !/SERVICES\[0\]\.id/.test(calSrc),
  'the modal pre-selected mock identities');
check('I6 the settings store starts with no service list of its own',
  !/services: DEFAULT_SERVICES\.map/.test(settingsSrc),
  'the seeded DEFAULT_SERVICES menu');
check('I7 the fake default receptionist is gone',
  !/name: 'Sarah Aliyu'/.test(appModeSrc),
  'appModeStore defaulted to a fake staff member');

console.log('P. old localStorage cannot resurrect the seeds');

function persistBlock(src, name) {
  const a = src.indexOf(`name: '${name}'`);
  if (a === -1) return null;
  return src.slice(Math.max(0, a - 200), a + 700);
}
check('P1 the queue store migrates old seeds away',
  /version:\s*2/.test(persistBlock(queueSrc, 'cbs_queue_storage') || '')
    && /migrate/.test(persistBlock(queueSrc, 'cbs_queue_storage') || ''),
  'version bump + one-time wipe');
check('P2 the calendar store migrates old seeds away',
  /version:\s*2/.test(persistBlock(calSrc, 'cbs_calendar_storage') || '')
    && /migrate/.test(persistBlock(calSrc, 'cbs_calendar_storage') || ''),
  'persisted blocks would come back otherwise');
check('P3 the visits store migrates old seeds away',
  /version:\s*2/.test(persistBlock(visitsSrc, 'cbs_visits_storage') || '')
    && /migrate/.test(persistBlock(visitsSrc, 'cbs_visits_storage') || ''),
  'persisted visits would come back otherwise');
check('P4 the staff store migrates old seeds away',
  /version:\s*2/.test(persistBlock(staffSrc, 'cedarcare_staff_store') || '')
    && /migrate/.test(persistBlock(staffSrc, 'cedarcare_staff_store') || ''),
  'persisted staffList would come back otherwise');

console.log('R. resets are honest, and the simulator keeps its data');

check('R1 the queue reset clears, it does not re-seed',
  !/resetToDemoDefaults[\s\S]{0,400}buildMockRequests\(\)/.test(queueSrc),
  'a reset must not manufacture patients');
check('R2 the calendar reset clears, it does not re-seed',
  !/resetToDemoDefaults[\s\S]{0,400}initCalendarBlocks\(\)/.test(calSrc),
  'a reset must not manufacture blocks');
check('R3 the visits reset clears, it does not re-seed',
  !/resetToDemoDefaults[\s\S]{0,400}buildInitialVisits\(\)/.test(visitsSrc),
  'a reset must not manufacture visits');
check('R4 the workload meter counts real blocks only',
  !/Math\.max\(seed\.today/.test(dayViewSrc),
  'the capacity meter floored at fake seed counts');

console.log('');
if (failures) {
  console.log('FAILED: ' + failures + ' check(s) of ' + checks);
  process.exit(1);
}
console.log('ALL PASS (' + checks + ' checks)');
