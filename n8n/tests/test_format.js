// Phase 3 / step 3.2 harness: run the SHIPPED Format node source from the
// workflow JSON and assert the patient-facing grammar for every option count.
// Node only - no n8n restart required.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WF = path.join(__dirname, '..', 'workflows', '05_slot_offer_dispatcher.json');
const wf = JSON.parse(fs.readFileSync(WF, 'utf8'));
const node = wf.nodes.find((n) => n.name === 'Format Offers & Telegram Buttons');
if (!node) { console.log('FAIL could not find the Format node in the workflow JSON'); process.exit(1); }
const CODE = node.parameters.jsCode;

const slot = (n) => ({
  id: 'offer-' + n,
  doctor_name: 'Dr. Bello',
  date_label: 'Sat, 15 Nov 2026',
  time_label: '9:30 AM',
});

function run(count, expiry) {
  const body = {
    request_id: 'REQ-2026-0099',
    patient_name: 'Amina Yusuf',
    patient_phone: '+2348033112233',
    service_name: 'Dental Consultation',
    clinic_name: 'Cedarcare',
    telegram_chat_id: null,
    expiry_minutes: expiry === undefined ? 60 : expiry,
    dispatch_channels: ['sms'],
    candidate_slots: Array.from({ length: count }, (_, i) => slot(i + 1)),
  };
  const sandbox = { $input: { item: { json: { body } } }, console };
  return vm.runInNewContext('(function () {\n' + CODE + '\n})()', sandbox).json;
}

let failures = 0;
const check = (label, cond, detail) => {
  if (cond) { console.log('  ok   ' + label); }
  else { failures++; console.log('  FAIL ' + label + (detail ? ' -> ' + detail : '')); }
};

console.log('A. one option -> singular slot, "Reply 1"');
let out = run(1);
check('says "slot is ready"', out.sms_body.includes('Dental Consultation slot is ready'), out.sms_body);
check('does not say "slots are ready"', !out.sms_body.includes('slots are ready'));
check('reply hint is exactly "Reply 1"', out.sms_body.includes('Reply 1 to lock in your time'), out.sms_body);
check('no "1, 2" anywhere', !out.sms_body.includes('1, 2'), out.sms_body);
check('one option listed', out.sms_body.includes(' 1) Sat, 15 Nov 2026 9:30 AM (Dr. Bello)'), out.sms_body);
check('slots_count 1', out.slots_count === 1, String(out.slots_count));
check('one inline button', out.inline_keyboard.length === 1, String(out.inline_keyboard.length));

console.log('B. two options -> "Reply 1 or 2"');
out = run(2);
check('says "slots are ready"', out.sms_body.includes('Dental Consultation slots are ready'), out.sms_body);
check('reply hint is "Reply 1 or 2"', out.sms_body.includes('Reply 1 or 2 to lock in your time'), out.sms_body);
check('no dangling ", or 2"', !out.sms_body.includes(', or 2'), out.sms_body);

console.log('C. three options -> "Reply 1, 2, or 3"');
out = run(3);
check('reply hint is "Reply 1, 2, or 3"', out.sms_body.includes('Reply 1, 2, or 3 to lock in your time'), out.sms_body);

console.log('D. four options -> "Reply 1, 2, 3, or 4"');
out = run(4);
check('reply hint is "Reply 1, 2, 3, or 4"', out.sms_body.includes('Reply 1, 2, 3, or 4 to lock in your time'), out.sms_body);
check('four inline buttons', out.inline_keyboard.length === 4, String(out.inline_keyboard.length));

console.log('E. expiry grammar -> "1 minute" / "60 minutes"');
out = run(1, 1);
check('sms says "1 minute"', out.sms_body.includes('Held for 1 minute.'), out.sms_body);
check('telegram says "1 minute"', out.message_text.includes('held for <b>1 minute</b>'), out.message_text);
out = run(1, 60);
check('sms says "60 minutes"', out.sms_body.includes('Held for 60 minutes.'), out.sms_body);
check('telegram says "60 minutes"', out.message_text.includes('held for <b>60 minutes</b>'), out.message_text);

console.log('F. zero options -> never claims options exist');
out = run(0);
check('no "slots are ready"', !out.sms_body.includes('slots are ready'), out.sms_body);
check('no "Reply" hint', !out.sms_body.includes('Reply'), out.sms_body);
check('says front desk will call', out.sms_body.includes('front desk will call you shortly'), out.sms_body);
check('slots_count 0', out.slots_count === 0, String(out.slots_count));
check('no inline buttons', out.inline_keyboard.length === 0, String(out.inline_keyboard.length));

console.log(failures ? '\nFAILED: ' + failures : '\nALL PASS');
process.exit(failures ? 1 : 0);
