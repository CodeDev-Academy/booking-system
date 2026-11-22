// Wave 3 / Step 3.4 - "the calendar shows the appointment's own data".
//
// The review (Batch 3 High): clicking a real appointment opened a modal with
// INVENTED data - start: Date.now(), end: now+30m, the service guessed from
// label text, the phone read from a key the grid never filled, and the
// doctor defaulting to 'doc-bello'. And the remote mapping was mock-shaped:
// every block got serviceId 'svc-dental' and the doctor was matched by NAME
// SUBSTRING (bello/okafor/babawo) - so a fourth doctor or a second service
// landed in the wrong lane, and real UUID ids never matched anything.
//
// This pins the real identities end to end. Node only.

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

console.log('S. the store maps REAL identities');

const storeSrc = read('../src/stores/useCalendarStore.js');
const calSync = fnBody(storeSrc, 'syncFromBackend: async', 'setAppointmentHold');
check('S1 no name-substring doctor mapping',
  !/docNameLower\.includes\('bello'\)/.test(calSync || ''),
  'bello/okafor/babawo heuristics put real doctors in mock lanes');
check('S2 blocks carry the backend doctor id',
  /const docId = String\(docItem\.doctor_id\)/.test(calSync || '') && /doctorId:\s*docId/.test(calSync || ''),
  'the block must key by the real UUID, not a guessed slug');
check('S3 blocks carry the real service identity',
  !/serviceId:\s*'svc-dental'/.test(calSync || '') && /service_name/.test(calSync || ''),
  'every remote block used to be svc-dental');
check('S4 the roster is replaced with the backend doctors',
  /set\(\(\s*state\)?\s*=>?\s*\(\{[\s\S]{0,400}doctors:\s*mappedDoctors/i.test(calSync || '')
    || /doctors:\s*mappedDoctors/.test(calSync || ''),
  'lane columns must come from the real roster');

console.log('G. the grid and modal stop inventing');

const gridSrc = read('../src/components/calendar/DoctorGridBookingCalendar.jsx');
check('G1 no default-to-Bello meta for unknown doctors',
  !/DOCTOR_META\['doc-bello'\]/.test(gridSrc),
  'a real (UUID) doctor used to show Bello\'s fake week');
const dayAppts = fnBody(gridSrc, 'const activeDayAppointments = useMemo', 'const getSlotDetails');
// The row fields moved into one shared helper (day list + week overview), so
// the contract is checked there. Both panels build rows with it.
const agendaRow = fnBody(gridSrc, 'const toAgendaRow = (b) => ({', '});');
check('G2 day rows carry the block\'s real fields',
  /start:\s*b\.start/.test(agendaRow || '') && /patientPhone:\s*b\.patientPhone/.test(agendaRow || '')
    && /serviceName/.test(agendaRow || ''),
  'the modal callback needs start/end/phone/service from the row');
check('G2b both the day list and the week overview use that row helper',
  /\.map\(toAgendaRow\)/.test(dayAppts || '') && /\.map\(toAgendaRow\)/.test(gridSrc),
  'one row builder keeps the day list and the week cards in agreement');

const calendarView = read('../src/views/CalendarView.jsx');
const modalCb = fnBody(calendarView, 'onSelectAppointment={(apt) => {', 'onReleaseHold');
check('G3 the modal gets the row\'s own times',
  /start:\s*apt\.start/.test(modalCb || '') && /end:\s*apt\.end/.test(modalCb || ''),
  'no more Date.now() inventions');
check('G4 the modal gets the real phone and service',
  /apt\.patientPhone|apt\.phone/.test(modalCb || '') && /apt\.serviceId/.test(modalCb || ''),
  'phone came from a key the grid never filled; service was guessed from a label');
check('G5 no doctor default to a mock slug',
  !/doc-bello'?\s*\|\|/.test(modalCb || '') && !/\|\|\s*'doc-bello'/.test(modalCb || ''),
  'the doctor default invented Bello');
check('G6 no service guessed from label text',
  !/apt\.service\?\.includes\('Extraction'\)/.test(modalCb || ''),
  'the service was a guess from the rendered label');

const modalSrc = read('../src/components/calendar/AppointmentDetailsModal.jsx');
check('G7 the modal prefers the row\'s own doctor/service names',
  /appointment\.doctorName/.test(modalSrc) && /appointment\.serviceName/.test(modalSrc),
  'getDoctor/getService mock lookups must be a fallback only');

console.log('');
if (failures) {
  console.log('FAILED: ' + failures + ' check(s) of ' + checks);
  process.exit(1);
}
console.log('ALL PASS (' + checks + ' checks)');
