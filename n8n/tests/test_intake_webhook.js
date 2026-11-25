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

console.log('D. inbound authentication (audit F1)');

// Workflow 01 used to run webhook -> normalize -> Django with NO caller check,
// while 04/05/07/08 each verify X-Webhook-Secret first. The intake path is the
// one an anonymous client can hit, so it is the one that must not depend on
// Django's rate limit to survive.

const verifyNode = node('Verify Intake Secret');
const authIfNode = node('IF Intake Authorized');
const denyNode = node('Respond Intake Unauthorized');

check('D1 a verify node sits after the webhook', Boolean(verifyNode),
  'no Verify Intake Secret node - the graph accepts anyone');
check('D2 an IF routes on the auth result', Boolean(authIfNode),
  'no IF Intake Authorized node');
check('D3 a respond node answers 401', Boolean(denyNode),
  'no Respond Intake Unauthorized node');
if (denyNode) {
  check('D4 the refusal really is a 401',
    Number(denyNode?.parameters?.options?.responseCode) === 401,
    'got ' + JSON.stringify(denyNode?.parameters?.options));
}

// The webhook must feed ONLY the verifier: nothing that touches Django, the
// clock or the response may run before the decision.
const webhookOut = (wf.connections['Patient Intake Webhook']?.main || []).flat()
  .map((c) => c.node);
check('D5 the webhook connects to nothing but the verifier',
  webhookOut.length === 1 && webhookOut[0] === 'Verify Intake Secret',
  'got ' + JSON.stringify(webhookOut));
if (authIfNode) {
  const branches = (wf.connections['IF Intake Authorized']?.main || []).map((b) => (b || []).map((c) => c.node));
  check('D6 the true branch is the only path to normalize',
    Array.isArray(branches[0]) && branches[0].includes('Normalize Input & E.164 Phone'),
    'got ' + JSON.stringify(branches));
  check('D7 the false branch ends in the refusal',
    Array.isArray(branches[1]) && branches[1].includes('Respond Intake Unauthorized'),
    'got ' + JSON.stringify(branches));
  const ifSrc = JSON.stringify(authIfNode?.parameters || {});
  check('D8 the gate is the auth flag alone - no mock-mode bypass',
    ifSrc.includes('intake_auth.authorized') && !/PROVIDER_MOCK|providerMock|mock/i.test(ifSrc),
    'an IF that lets "mock mode" skip authentication is how workflow 08 stays open');
}

const verifySrc = code('Verify Intake Secret');
check('D9 the verifier reads the header, not the body',
  verifySrc.includes('headers') && verifySrc.includes('x-webhook-secret'),
  'the secret must come from the request header');
check('D10 no literal fallback secret in the verifier',
  !/clinic_dev/.test(verifySrc),
  'a fallback value in source is a published credential');

// The decisive part: execute the shipped source and try to get through.
function runVerify(inputJson, env) {
  const sandbox = {
    $input: { first: () => ({ json: inputJson }) },
    $env: env || {},
  };
  const src = code('Verify Intake Secret');
  if (!src) return null;
  return vm.runInNewContext('(function () {\n' + src + '\n})()', sandbox)[0].json;
}

const body = { body: { patient_name: 'Amina', phone: '08090012345' } };
const configured = runVerify({ ...body, headers: { 'x-webhook-secret': 'right-value' } },
  { DJANGO_WEBHOOK_SECRET: 'right-value' });
check('D11 the correct secret is accepted', Boolean(configured?.intake_auth?.authorized),
  JSON.stringify(configured?.intake_auth));

const wrong = runVerify({ ...body, headers: { 'x-webhook-secret': 'guess' } },
  { DJANGO_WEBHOOK_SECRET: 'right-value' });
check('D12 a wrong secret is refused with a named reason',
  wrong && wrong.intake_auth?.authorized === false && wrong.intake_auth?.reason === 'bad_secret',
  JSON.stringify(wrong?.intake_auth));

const none = runVerify(body, { DJANGO_WEBHOOK_SECRET: 'right-value' });
check('D13 a missing header is refused', none && none.intake_auth?.authorized === false,
  JSON.stringify(none?.intake_auth));

const unconfigured = runVerify({ ...body, headers: { 'x-webhook-secret': 'anything' } }, {});
check('D14 an unconfigured receiver refuses everything, fail closed',
  unconfigured && unconfigured.intake_auth?.authorized === false
    && unconfigured.intake_auth?.reason === 'secret_not_configured',
  JSON.stringify(unconfigured?.intake_auth));

const oldLiteral = runVerify({ ...body, headers: { 'x-webhook-secret': 'clinic_dev_secret_2026' } }, {});
check('D15 the retired published literal never authenticates',
  oldLiteral && oldLiteral.intake_auth?.authorized === false,
  'the burned value must be dead on this path too');

check('D16 the payload still reaches the next node intact',
  configured?.body?.patient_name === 'Amina' || configured?.patient_name === 'Amina',
  'the verifier must pass the request through, not swallow it');

console.log('');
if (failures) {
  console.log('FAILED: ' + failures + ' check(s) of ' + checks);
  process.exit(1);
}
console.log('ALL PASS (' + checks + ' checks)');
