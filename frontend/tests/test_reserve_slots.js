// Reserve Slots Truth — emergency reserves are real rows, not a hardcoded card.
//
// The Schedule Grid drew "1 Emergency Reserve" at 01:30 PM whatever the clinic
// had configured. The rows live in AvailabilityRule (emergency_reserve) and the
// booking engine already obeys them, but nothing let staff see, add or remove
// them. T-786 adds the API + a Settings list + real grid cards. These checks pin
// the frontend wire end to end.

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

const api = read('../src/services/apiService.js');
const calendarStore = read('../src/stores/useCalendarStore.js');
const settingsStore = read('../src/stores/useSettingsStore.js');
const gridCalendar = read('../src/components/calendar/DoctorGridBookingCalendar.jsx');
const settingsView = read('../src/views/SettingsView.jsx');

console.log('R. Emergency reserve slots are real');

check('R1 the API client can list reserve slots',
  /fetchReserveSlots/.test(api) && /\/clinic\/reserve-slots\//.test(api),
  'no way to read the real reserve rows');

check('R2 the API client can add a reserve slot',
  /createReserveSlot/.test(api) && /method:\s*'POST'/.test(api),
  'no way to protect a walk-in window');

check('R3 the API client can remove a reserve slot',
  /deleteReserveSlot/.test(api) && /method:\s*'DELETE'/.test(api),
  'a reserve could never be cleared');

check('R4 the calendar store keeps the reserve rows from the feed',
  /reserveSlots:\s*\[\]/.test(calendarStore) && /data\?\.reserve_slots/.test(calendarStore),
  'the grid needs the reserves from the same schedule request');

check('R5 the grid no longer hardcodes the reserve count',
  !/<strong[^>]*>1<\/strong>\s*Emergency Reserve/.test(gridCalendar),
  '"1 Emergency Reserve" was a guess, not a count');

check('R6 the grid no longer hardcodes a 01:30 PM reserve card',
  !/'01:30 PM'\)/.test(gridCalendar) && !/until 02:00 PM/.test(gridCalendar),
  'the reserve card must use the real row time');

check('R7 the grid draws reserve rows from the store',
  /reserveSlots/.test(gridCalendar) && /event-reserve/.test(gridCalendar),
  'real reserve rows must render as cards');

check('R8 Settings has a reserve-slots manager',
  /ReserveSlotsBento/.test(settingsView),
  'staff need a place to add and remove reserves');

check('R9 the settings store loads reserve slots',
  /loadReserveSlots/.test(settingsStore) && /fetchReserveSlots/.test(settingsStore),
  'the list must come from the API, not local state');

check('R10 the settings store can add and remove a reserve',
  /addReserveSlot/.test(settingsStore) && /removeReserveSlot/.test(settingsStore)
    && /createReserveSlot/.test(settingsStore) && /deleteReserveSlot/.test(settingsStore),
  'add/remove must call the real endpoints');

console.log('');
if (failures) {
  console.log(`FAILED ${failures}/${checks} checks`);
  process.exit(1);
}
console.log(`OK ${checks}/${checks} checks`);
