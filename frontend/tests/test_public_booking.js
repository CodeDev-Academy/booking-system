// Zero-partner route / Steps 4-5 — the public booking page.
//
// The patient has no WhatsApp and the staff dashboard is behind a login, so
// this page IS the front door: it must work with no session, send the FULL
// intake contract Django already understands, and hand the patient to Telegram.
//
// Node only. The payload builder is imported and EXECUTED (not grepped), so
// the contract checks are real; the view checks are source contracts.

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

console.log('A. the payload matches BookingRequestCreateSerializer');

let buildBookingIntakePayload = null;
try {
  ({ buildBookingIntakePayload } = await import('../src/services/bookingIntakePayload.js'));
} catch (err) {
  buildBookingIntakePayload = null;
}
check('A1 a single payload builder exists',
  typeof buildBookingIntakePayload === 'function',
  'the form must not hand-assemble JSON in JSX');

const full = buildBookingIntakePayload ? buildBookingIntakePayload({
  patientName: '  Amina Bello ',
  patientPhone: ' 0803 000 1234 ',
  serviceId: 'svc-1',
  preferredDoctorId: 'doc-1',
  fromDate: '2026-12-01',
  toDate: '2026-12-05',
  timeWindow: 'morning',
  dateOfBirth: '1990-04-02',
  gender: 'female',
  isEmergency: true,
  notes: '  tooth pain  ',
  trap: '',
}) : {};

check('A2 it sends the backend field names, not camelCase',
  full.patient_name === 'Amina Bello'
  && full.patient_phone === '0803 000 1234'
  && full.service_id === 'svc-1'
  && full.preferred_doctor_id === 'doc-1'
  && full.preferred_time_window === 'morning'
  && full.channel === 'web',
  JSON.stringify(full));
check('A3 the full intake survives: DOB, gender, emergency, note',
  full.date_of_birth === '1990-04-02'
  && full.gender === 'female'
  && full.is_emergency === true
  && full.patient_notes === 'tooth pain',
  JSON.stringify(full));
check('A4 preferred dates travel as the pair the backend normalizes',
  Array.isArray(full.preferred_dates)
  && full.preferred_dates[0] === '2026-12-01'
  && full.preferred_dates[1] === '2026-12-05',
  JSON.stringify(full.preferred_dates));
check('A5 the honeypot is always present and empty',
  full.clinic_web_trap === '',
  'the trap must exist so bots fill it and humans never see it');
check('A6 no email is collected (owner decision: nothing sends email yet)',
  !Object.keys(full).some((k) => k.includes('email')),
  Object.keys(full).join(','));
check('A7 no price ever leaves the browser',
  !Object.keys(full).some((k) => k.includes('price')),
  Object.keys(full).join(','));

const minimal = buildBookingIntakePayload ? buildBookingIntakePayload({
  patientName: 'Bare Minimum',
  patientPhone: '+2348030001234',
  serviceId: 'svc-2',
  timeWindow: 'afternoon',
}) : {};

check('A8 an empty DOB is null, never an empty string (the backend 400s on "")',
  minimal.date_of_birth === null,
  JSON.stringify(minimal.date_of_birth));
check('A9 an unchosen doctor and empty dates are omitted, not sent blank',
  !('preferred_doctor_id' in minimal) && !('preferred_dates' in minimal),
  JSON.stringify(Object.keys(minimal)));

console.log('B. the page works without a login');

const appSrc = read('../src/App.jsx');
const bookRouteAt = appSrc.indexOf('path="/book"');
const shellRouteAt = appSrc.indexOf('element={<Shell');
check('B1 a /book route exists', bookRouteAt !== -1, 'the patient has no staff account');
check('B2 /book sits OUTSIDE the authenticated Shell',
  bookRouteAt !== -1 && shellRouteAt !== -1 && bookRouteAt < shellRouteAt,
  'inside <Shell> the router redirects to /login');

let viewSrc = '';
try { viewSrc = read('../src/views/PublicBookingView.jsx'); } catch (err) { viewSrc = ''; }
check('B3 the public view exists', viewSrc.length > 0, 'no file yet');
check('B4 the public view never reads the auth store',
  viewSrc.length > 0 && !/useAuthStore/.test(viewSrc),
  'a patient must not be asked to sign in');

console.log('C. the page tells the truth about what happens next');

check('C1 the hold notice comes from the clinic API, not a hardcoded hour',
  /info\.notice|bookingInfo\.notice|\.notice/.test(viewSrc),
  'Django owns the wording (offer_expiry_minutes)');
check('C2 that hardcoded copy is gone',
  !/held for 1 hour|held for 60 minutes/i.test(viewSrc),
  'the 45-minute clinic would show a lie');
check('C3 the Telegram link comes from the submit response',
  /telegram_link/.test(viewSrc),
  'the link carries a per-request token — it cannot be hardcoded');
check('C4 a phone-only patient gets an honest fallback',
  /front desk|call you/i.test(viewSrc),
  'no Telegram configured must not look like a success');
check('C5 the emergency box warns that this form is not for emergencies',
  /emergenc/i.test(viewSrc) && /call|911|112|dial/i.test(viewSrc),
  'an emergency visit needs a phone, not a form');
check('C6 DOB is optional (owner decision)',
  !/id="dob"[^>]*required/.test(viewSrc) && !/dateOfBirth[^\n]*required/.test(viewSrc),
  'forcing it loses bookings; the phone already identifies the patient');
check('C7 the review screen shows the patient note the form collected',
  /symptom|patient note|reason for visit/i.test(
    (() => {
      try { return read('../src/components/review/ReviewModal.jsx'); } catch (e) { return ''; }
    })()
  ),
  'we ask for it, so reception must see it');

console.log('D. design and safety');

check('D1 the view renders no price',
  viewSrc.toLowerCase().includes('price') === false,
  'patient-facing copy never quotes prices');
check('D2 the view imports its own stylesheet',
  /styles\/components\/public-booking\.css/.test(viewSrc),
  'design stays in CSS, not inline objects');
let cssSrc = '';
try { cssSrc = read('../src/styles/components/public-booking.css'); } catch (err) { cssSrc = ''; }
check('D3 the stylesheet exists and is mobile-first',
  cssSrc.length > 0 && /@media/.test(cssSrc) && /max-width/.test(cssSrc),
  'patients arrive on phones');

console.log('');
if (failures) {
  console.log(`FAILED ${failures}/${checks} checks`);
  process.exit(1);
}
console.log(`OK ${checks}/${checks} checks`);
