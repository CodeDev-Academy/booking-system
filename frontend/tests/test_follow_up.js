// Follow-up upgrade — rule B:
// The message box starts EMPTY, and an empty box means NOTHING is sent.
// The clinical note stays private. The date and time decide when it leaves.
//
// Node only, source-contract style like the other harnesses.

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

const modal = read('../src/components/swimlanes/FollowUpRecallModal.jsx');
const store = read('../src/stores/useVisitsStore.js');

console.log('A. the box starts empty and is optional');

check('A1 there is a message-for-the-patient box',
  /Message for the patient/i.test(modal),
  'the doctor needs a way to say what the patient must do');

check('A2 it starts empty (no default text)',
  /const \[patientMessage, setPatientMessage\] = useState\(''\)/.test(modal),
  'owner decision: empty by default');

check('A3 choosing a preset never fills the message',
  !/handleSelectChip[\s\S]{0,600}setPatientMessage/.test(modal),
  'presets fill the date and the private note only');

check('A4 the empty label says plainly that nothing will be sent',
  /No message will be sent/i.test(modal),
  'the screen must not imply a silent send');

check('A5 the fake feedback survey is gone',
  !/Feedback Survey/i.test(modal) && !/feedbackRequested/.test(modal),
  'it promised a survey that never existed');

console.log('B. the date and the time are real');

check('B1 the date is required and the stale 2026 fallback is gone',
  /required/.test(modal) && !/2026-10-22/.test(modal) && /disabled=\{!canSave\}/.test(modal),
  'an empty date used to submit a past date and fail');

check('B2 the send time exists and defaults to 09:00',
  /type="time"/.test(modal) && /useState\('09:00'\)/.test(modal),
  'a date-only recall fired just after midnight');

check('B3 the private note is labelled as never sent',
  /never sent to the patient/i.test(modal),
  'clinical notes must stay private');

console.log('C. the store sends the truth');

check('C1 the chosen date is used, not a guessed +14 days',
  /followUpData\?\.targetDate|followUpData\.targetDate/.test(store)
  && !/14 \* 86400000[\s\S]{0,40}follow_up_date/.test(store),
  'the modal date was silently ignored before');

check('C2 patient_message and send_at reach the API',
  /patient_message:\s*patientMessage/.test(store) && /send_at:\s*sendAt/.test(store),
  'without them Django cannot apply rule B');

check('C3 the toast says no message will be sent when the box is empty',
  /no message will be sent/i.test(store),
  'a scheduled-looking toast with no message is a lie');

console.log('');
if (failures) {
  console.log(`FAILED ${failures}/${checks} checks`);
  process.exit(1);
}
console.log(`OK ${checks}/${checks} checks`);
