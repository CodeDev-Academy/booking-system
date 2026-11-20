// Workflow 01 — the intake contract, pinned end to end.
//
// Workflow 01 is the ONLY path a web form or Telegram intake travels. It used
// to be dead in three independent ways while every harness stayed green,
// because nothing asserted the request Django actually receives:
//
//   1. URL  : base already includes /api/v1, the node appended /api/v1 again.
//   2. Body : it sent "phone" (Django reads patient_phone) and a literal null
//             service_id (CharField without allow_null -> 400), with values
//             pasted into JSON unescaped.
//   3. Auth : a hardcoded fallback secret 'clinic_dev_secret_2026'.
//
// This file runs the shipped node sources and asserts the outbound contract.
// Node only - no n8n restart required.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const wf = JSON.parse(fs.readFileSync(path.join(__dirname, '../workflows/01_intake_webhook.json'), 'utf8'));
const raw = JSON.stringify(wf);
const node = (name) => wf.nodes.find((n) => n.name === name) || null;
const code = (name) => String(node(name)?.parameters?.jsCode || '');

let failures = 0;
let checks = 0;
function check(name, ok, detail) {
  checks += 1;
  if (!ok) failures += 1;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + name + (ok || !detail ? '' : '  -> ' + detail));
}

console.log('A. graph shape');

check('A1 webhook -> normalize', Boolean(wf.connections['Patient Intake Webhook']));
check('A2 normalize -> post', Boolean(wf.connections['Normalize Input & E.164 Phone']));
check('A3 post node exists', Boolean(node('Post to Django Booking Queue')));

console.log('B. the outbound request Django actually receives');

const post = node('Post to Django Booking Queue');
const postUrl = String(post?.parameters?.url || '');
const postBody = String(post?.parameters?.jsonBody || '');
const postHeaders = JSON.stringify(post?.parameters?.headerParameters || {});

check('B1 URL does not append /api/v1 twice', !postUrl.includes('/api/v1/booking-requests'),
  'the env base already includes /api/v1');
check('B2 the queue path is appended to the env base once',
  code('Normalize Input & E.164 Phone').includes("+ '/booking-requests/'")
  && !code('Normalize Input & E.164 Phone').includes('/api/v1/booking-requests'),
  'the path must be built in code, appended to a base that already includes /api/v1');
check('B3 URL has no hardcoded host fallback', !raw.includes('backend:8000'),
  'a silent default host is how a real intake lands on a demo server');
check('B4 URL is composed by the normalize node', postUrl.includes('$json.django_url'),
  'the URL should be built once, in code, not re-composed per node');
check('B5 no hardcoded fallback secret', !raw.includes('clinic_dev_secret_2026'),
  'an unset env var must fail loudly, not become a known string');
check('B6 secret comes from the normalize node', postHeaders.includes('$json.secret'),
  'the header should read the secret prepared in code');
check('B7 body is JSON.stringify of a built object', postBody.includes('JSON.stringify($json.django_body)'),
  'pasting values into a JSON template breaks on any quote in a name');
check('B8 the raw template keys are gone', !postBody.includes('"phone"') && !postBody.includes(': null'),
  'the body must be built, not templated');

console.log('C. the normalize node builds the contract');

function runNormalize(inputBody, env) {
  const src = code('Normalize Input & E.164 Phone');
  const sandbox = {
    $input: { item: { json: inputBody } },
    $env: env || {},
  };
  const out = vm.runInNewContext('(function () {\n' + src + '\n})()', sandbox);
  return Array.isArray(out) ? out[0].json : out.json;
}

const base = { patient_name: "Ngozi O'Brien", phone: '08030001199', notes: 'sharp pain' };
const withEnv = runNormalize(base, {
  DJANGO_API_BASE_URL: 'https://clinic.up.railway.app/api/v1',
  DJANGO_WEBHOOK_SECRET: 's3cret',
});
const withoutEnv = runNormalize(base, {});

check('C1 output carries the built django_body', Boolean(withEnv && withEnv.django_body),
  'no django_body field - the post node has nothing safe to send');
if (withEnv && withEnv.django_body) {
  check('C2 django_body uses patient_name', withEnv.django_body.patient_name === "Ngozi O'Brien");
  check('C3 django_body uses patient_phone', withEnv.django_body.patient_phone === '+2348030001199',
    'expected the E.164 form');
  check('C4 django_body has no raw phone key', !('phone' in withEnv.django_body));
  check('C5 service_id omitted when unknown', !('service_id' in withEnv.django_body),
    'a null service_id is a 400 on a CharField without allow_null');
  check('C6 preferred_doctor_id omitted when unknown', !('preferred_doctor_id' in withEnv.django_body));
  check('C7 a quote in a name survives intact', JSON.parse(JSON.stringify(withEnv.django_body)).patient_name === "Ngozi O'Brien");
}

const withService = runNormalize({ ...base, service_id: 'svc-dental', doctor_id: 'doc-bello' }, {});
check('C8 a known service id is passed through',
  withService && withService.django_body && withService.django_body.service_id === 'svc-dental',
  'service_id must be present exactly when the intake supplied one');

check('C9 django_url is the env base plus the queue path',
  withEnv && withEnv.django_url === 'https://clinic.up.railway.app/api/v1/booking-requests/',
  'got ' + (withEnv && withEnv.django_url));
check('C10 no env base means no URL - fail loudly, not to a default host',
  withoutEnv && withoutEnv.django_url === '',
  'got ' + (withoutEnv && withoutEnv.django_url));
check('C11 the secret travels without a fallback',
  withEnv && withEnv.secret === 's3cret' && withoutEnv && withoutEnv.secret === '');

console.log('');
if (failures) {
  console.log('FAILED: ' + failures + ' check(s) of ' + checks);
  process.exit(1);
}
console.log('ALL PASS (' + checks + ' checks)');
