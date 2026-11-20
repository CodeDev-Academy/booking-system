// Frontend booking payload contract (Wave 1 / Step 1.1).
//
// The queue "confirm slot", the calendar walk-in and the visits walk-in all
// POST through apiService. Django's SlotHoldRequestSerializer requires
// `patient_name` / `patient_phone` / `request_id` (snake_case) — the stores pass
// camelCase, and apiService.holdSlot used to forward them untouched, so every
// dashboard confirm and walk-in answered 400 while the UI toasted success.
//
// This harness pins the WIRE payload: the exact keys Django receives. It reads
// the shipped sources as text (the n8n harnesses do the same for node code) so
// no browser or Vite build is needed to catch a regression.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const apiSrc = readFileSync(join(here, '../src/services/apiService.js'), 'utf8');
const queueSrc = readFileSync(join(here, '../src/stores/useQueueStore.js'), 'utf8');
const visitsSrc = readFileSync(join(here, '../src/stores/useVisitsStore.js'), 'utf8');
const calendarSrc = readFileSync(join(here, '../src/stores/useCalendarStore.js'), 'utf8');

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
  const b = endMarker ? src.indexOf(endMarker, a) : -1;
  return src.slice(a, b === -1 ? a + 4000 : b);
}

const holdSlot = fnBody(apiSrc, 'async holdSlot', 'async registerWalkIn');
const registerWalkIn = fnBody(apiSrc, 'async registerWalkIn', 'async updateAppointmentStatus');
// The wire payload itself is built once, in the shared translator.
const wireBuilder = fnBody(apiSrc, 'function toWireBookingPayload', 'export const apiService');

console.log('A. apiService translates the store payload to the Django wire names');

check('A0 the shared wire builder exists', Boolean(wireBuilder),
  'function toWireBookingPayload not found - every booking POST needs this translator');
check('A1 holdSlot builder exists', Boolean(holdSlot), 'async holdSlot not found in apiService.js');
check('A2 registerWalkIn builder exists', Boolean(registerWalkIn), 'async registerWalkIn not found');
check('A3 holdSlot posts through the translator', /toWireBookingPayload\(/.test(holdSlot || ''),
  'holdSlot no longer builds its body with toWireBookingPayload');
check('A4 registerWalkIn posts through the translator',
  /toWireBookingPayload\(\s*\w+,\s*\{\s*isWalkIn:\s*true\s*\}\s*\)/.test(registerWalkIn || ''),
  'registerWalkIn must pass { isWalkIn: true }');

if (wireBuilder) {
  check('A5 the wire sends patient_name', /patient_name\s*:\s*pick\(/.test(wireBuilder),
    'no `patient_name:` key in the wire builder');
  check('A6 the wire sends patient_phone', /patient_phone\s*:\s*pick\(/.test(wireBuilder),
    'no `patient_phone:` key');
  check('A7 the wire forwards request_id when given',
    /request_id\s*:\s*pick\('requestId',\s*'request_id'/.test(wireBuilder),
    'no `request_id:` key - a queue confirm cannot link its BookingRequest');
  check('A8 the wire accepts the legacy camelCase name/phone',
    /pick\('patientName',\s*'patient_name',\s*'name'\)/.test(wireBuilder)
      && /pick\('patientPhone',\s*'patient_phone',\s*'phone'\)/.test(wireBuilder),
    'stores passing name/phone silently lose the patient identity');
  check('A9 the wire never sends the old raw keys',
    !/[\s{](name|phone)\s*:\s*(?!patientName|patientPhone)/.test(wireBuilder),
    'wire payload still contains bare `name:`/`phone:`');
}

if (registerWalkIn) {
  check('B4 registerWalkIn posts to the walk-in endpoint', /'\/appointments\/walk-in\/'/.test(registerWalkIn),
    'endpoint changed?');
}

console.log('C. the stores pass translatable camelCase, not the broken old keys');

const queueHold = fnBody(queueSrc, '.holdSlot({', '.catch(');
check('C1 queue confirm passes the booking request as requestId', /requestId\s*:/.test(queueHold || ''),
  'the .holdSlot({}) call in useQueueStore.js does not pass requestId');
check('C2 queue confirm no longer sends booking_request_id', !/booking_request_id\s*:/.test(queueHold || ''),
  'still sending booking_request_id - Django reads request_id');

const visitsWalkIn = fnBody(visitsSrc, '.registerWalkIn({', '.then(');
check('C3 visits walk-in passes a translatable name', /patientName\b/.test(visitsWalkIn || ''),
  'useVisitsStore does not pass patientName');

const calendarWalkIn = fnBody(calendarSrc, '.registerWalkIn({', '.catch(');
check('C4 calendar walk-in passes a translatable name', /patientName\s*:/.test(calendarWalkIn || ''),
  'useCalendarStore does not pass patientName');

console.log('');
if (failures) {
  console.log('FAILED: ' + failures + ' check(s) of ' + checks);
  process.exit(1);
}
console.log('ALL PASS (' + checks + ' checks)');
