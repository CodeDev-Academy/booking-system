// Leave lifecycle / Step 1 - "the doctor is back" must actually work.
//
// The 1-click duty switch deliberately removes only the row it created, so
// after an emergency plan the dated leave survived and the doctor stayed
// unbookable while the screen said "on duty". The fix is an explicit
// end-leave call whose ANSWER decides the screen: no blind local flip.
//
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
  if (a === -1) return '';
  const b = src.indexOf(endMarker, a);
  return src.slice(a, b === -1 ? a + 6000 : b);
}

console.log('A. the API has a real end-leave call');

const apiSrc = read('../src/services/apiService.js');
check('A1 apiService.endDoctorLeave posts to /end-leave/',
  /async endDoctorLeave\s*\(/.test(apiSrc) && /\/end-leave\//.test(apiSrc),
  'without it the UI can only guess');

console.log('B. the screen follows the server, not a hope');

const storeSrc = read('../src/stores/useCalendarStore.js');
const restore = fnBody(storeSrc, 'restoreDoctorDuty:', 'syncFromBackend:');

check('B1 restoreDoctorDuty calls the new endpoint',
  /endDoctorLeave\s*\(/.test(restore),
  'the old code flipped the flag locally and ignored the server');
check('B2 the duty state comes from the response',
  /is_on_leave/.test(restore),
  'the backend is the only honest source for "is this doctor free today"');
check('B3 the failure path does not claim success',
  /catch/.test(restore) && !/catch[\s\S]{0,400}isOnDuty:\s*true/.test(restore),
  'a failed call must show the error, not an optimistic on-duty state');
check('B4 the toast uses the server sentence',
  /res\?*\.message|response\?*\.message/.test(restore),
  'Django owns the wording, including "already on duty"');
check('B5 demo mode still works with no backend',
  /isDemoMode/.test(restore),
  'the pitch simulator has no server');

console.log('C. the button says what it does');

let modalSrc = '';
try { modalSrc = read('../src/components/calendar/EmergencyDisruptionModal.jsx'); } catch (err) { modalSrc = ''; }
check('C1 the button names "leave" and "today", not a vague restore',
  /End .*leave/i.test(modalSrc) || /leave today/i.test(modalSrc),
  'the old label promised a restore the system could not perform');

console.log('D. planned leave has its own place');

check('D1 the API can list, create and delete leave periods',
  /async fetchDoctorLeaves\s*\(/.test(apiSrc)
  && /async createDoctorLeave\s*\(/.test(apiSrc)
  && /async deleteDoctorLeave\s*\(/.test(apiSrc)
  && /\/leaves\//.test(apiSrc),
  'a plain leave must not require running an emergency plan');

check('D2 the store can open, add to and remove from the planner',
  /openLeavePlanner/.test(storeSrc)
  && /addDoctorLeave/.test(storeSrc)
  && /removeDoctorLeave/.test(storeSrc),
  'without it the form has nowhere to live');

let plannerSrc = '';
try { plannerSrc = read('../src/components/calendar/LeavePlannerModal.jsx'); } catch (err) { plannerSrc = ''; }
check('D3 a planner modal exists', plannerSrc.length > 0, 'no file yet');
check('D4 the planner shows the server refusal instead of guessing',
  /planner\.error|error\b/.test(plannerSrc) && /plan/i.test(plannerSrc),
  'the overlap-with-bookings rule belongs to Django; the modal must show its sentence');
check('D5 the planner is mounted in the calendar',
  /LeavePlannerModal/.test(read('../src/components/calendar/DoctorGridBookingCalendar.jsx')),
  'a modal nobody renders is dead code');

console.log('E. the patient is told the right reason');

check('E1 the cockpit offers "Planned leave" as a reason',
  /Planned leave/.test(modalSrc),
  'annual leave must not be announced as a sudden emergency');
check('E2 the store sends the chosen kind with the plan',
  /kind:\s*get\(\)\.disruptionModal\.leaveKind/.test(storeSrc),
  'the backend needs to know which sentence to write');

console.log('F. the banner reports the Telegram leg honestly');

check('F1 the banner reads the Telegram sent count',
  /telegram_sent_count/.test(storeSrc),
  'Django sends this leg itself, so the number is real');
check('F2 a failed Telegram send is shown, not hidden',
  /telegram_failed_count/.test(storeSrc),
  'no bot token must not look like a delivery');

console.log('');
if (failures) {
  console.log(`FAILED ${failures}/${checks} checks`);
  process.exit(1);
}
console.log(`OK ${checks}/${checks} checks`);
