// Settings Truth — the lunch break is a real setting, not decoration.
//
// The Settings screen showed an editable lunch break. The save nested it under
// `schedule_engine`, which the Django serializer ignores, so the value never
// reached the database. The booking engine kept 13:00-14:00 while the Schedule
// Grid drew 12:00-13:00. These checks pin the wire end to end:
//   1. Save sends lunch + working days as real fields.
//   2. Load restores them into the store.
//   3. The hours table has ONE clinic-wide lunch control.
//   4. The schedule feed publishes the clinic's real lunch.
//   5. The grid draws that lunch, and hides it when none is set.

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

const settingsStore = read('../src/stores/useSettingsStore.js');
const calendarStore = read('../src/stores/useCalendarStore.js');
const hoursBento = read('../src/components/settings/OperatingHoursBento.jsx');
const gridCalendar = read('../src/components/calendar/DoctorGridBookingCalendar.jsx');

console.log('L. The lunch break is one real setting');

check('L1 saving settings sends the lunch break as real fields',
  /lunch_break_start:\s*config\.schedule_engine\.lunch_break_start/.test(settingsStore)
    && /lunch_break_end:\s*config\.schedule_engine\.lunch_break_end/.test(settingsStore),
  'nested under schedule_engine, Django silently dropped it');

check('L2 saving settings sends the working-day list',
  /working_days:\s*config\.schedule_engine\.working_days/.test(settingsStore),
  'the day toggles never reached the database');

check('L3 loading settings restores lunch and working days',
  /settingsData\.lunch_break_start/.test(settingsStore)
    && /settingsData\.lunch_break_end/.test(settingsStore)
    && /settingsData\.working_days/.test(settingsStore),
  'the hours table always showed local defaults');

check('L4 one lunch action updates every day row',
  /updateLunchBreak:\s*\(field, value\)\s*=>/.test(settingsStore)
    && /lunchBreak:\s*\{\s*\.\.\.state\.lunchBreak,\s*\[field\]:\s*value\s*\}/.test(settingsStore),
  'per-day lunch values drifted from the one clinic break');

check('L5 the hours table has one clinic-wide lunch control',
  !/input-lunch/.test(hoursBento) && /onUpdateLunchBreak/.test(hoursBento),
  'per-day lunch inputs edited values that were never saved');

check('L6 the calendar store reads the lunch from the schedule feed',
  /const clinicLunch = data\?\.clinic/.test(calendarStore)
    && /start:\s*data\.clinic\.lunch_break_start/.test(calendarStore),
  'the grid needs the clinic lunch from the same request it already makes');

check('L7 the grid draws the real lunch time',
  !/slotStr === '12:00 PM'/.test(gridCalendar)
    && /labelFromHHMM\(clinicLunch\.start\)/.test(gridCalendar),
  'a hardcoded 12:00 break disagrees with the booking engine');

check('L8 the grid hides the lunch card when no break is set',
  /clinicLunch\?\.start && clinicLunch\?\.end/.test(gridCalendar),
  'a clinic with no lunch break must not show one');

// Found by the live browser pass: only the empty-roster branch stored the
// lunch, so a clinic WITH doctors still drew no break at all.
check('L9 the normal sync path stores the lunch too',
  /set\(\{ leavePeriods, doctors: mappedDoctors, clinicLunch/.test(calendarStore),
  'a real roster never received the clinic lunch');

// Found by the live browser pass: a zero-length break (both clocks the same)
// still drew "12:15 PM until 12:15 PM". Equal times mean NO break.
check('L10 a zero-length break draws nothing',
  /minutesFromHHMM\(clinicLunch\.end\) > minutesFromHHMM\(clinicLunch\.start\)/.test(gridCalendar),
  'a cleared break must not appear as a rest window');

console.log('');
if (failures) {
  console.log(`FAILED ${failures}/${checks} checks`);
  process.exit(1);
}
console.log(`OK ${checks}/${checks} checks`);
