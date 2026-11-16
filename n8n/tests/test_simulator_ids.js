// Harness for `06_Provider_Simulator` › the three `Build * Response` nodes.
//
// The simulator exists to be a faithful stand-in for a real provider, and the one
// property the whole logging path silently depends on is this: **a provider mints
// a new id for every message it accepts**. That id is what a delivery report comes
// back with (07 matches on it) and it is the unique key of the InteractionLog row
// (`POST /interactions/` upserts on `external_ref`).
//
// The simulator used to return one id per REQUEST (`mock-sms-REQ-2026-0007`). Two
// replies to the same request therefore carried the same id and the second outbound
// log row silently updated the first: the dashboard showed one reply where the
// patient had received two. Real gateways do not behave that way, so the fixture
// was wrong, not the log.
//
//   node n8n/tests/test_simulator_ids.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WF_PATH = path.join(__dirname, '..', '06_provider_simulator.json');
const wf = JSON.parse(fs.readFileSync(WF_PATH, 'utf8'));

const source = (name) => {
  const node = wf.nodes.find((n) => n.name === name);
  return node && node.parameters ? node.parameters.jsCode : null;
};

let total = 0;
let failures = 0;
const check = (label, cond, detail) => {
  total++;
  if (cond) console.log('  ok   ' + label);
  else { failures++; console.log('  FAIL ' + label + (detail === undefined ? '' : ' -> ' + JSON.stringify(detail).slice(0, 220))); }
};

// Run one Build node the way n8n does: the provider request body arrives as
// `$input.first().json.body`, and env vars come from `$env`.
const build = (name, body, env) => {
  const code = source(name);
  if (!code) throw new Error('node not found: ' + name);
  const sandbox = {
    $input: { first: () => ({ json: { body: body } }) },
    $env: env || {},
    Math: Math,
    Date: Date,
    String: String,
    RegExp: RegExp,
  };
  const fn = vm.runInNewContext('(function () {\n' + code + '\n})', sandbox);
  return fn.call({})[0].json;
};

const REQ = 'REQ-2026-0042';
const smsBody = (over) => Object.assign({ to: '+2348030001122', message: 'Thank you!', metadata: { request_code: REQ } }, over || {});
const waBody = (over) => Object.assign({ to: '2348030001122', biz_opaque_callback_data: REQ, text: { body: 'Thank you!' } }, over || {});
const voiceBody = (over) => Object.assign({ to: '+2348030001122', metadata: { request_code: REQ } }, over || {});

console.log('A. every accepted message gets its own id');
const sms1 = build('Build SMS Response', smsBody());
const sms2 = build('Build SMS Response', smsBody());
check('A1 SMS shapes look real', sms1.http_code === 200 && sms1.body.status === 'sent', sms1);
check('A2 two SMS sends get different ids', sms1.body.external_ref !== sms2.body.external_ref, [sms1.body.external_ref, sms2.body.external_ref]);
check('A3 ...and the id is echoed as message_id', sms1.body.message_id === sms1.body.external_ref, sms1.body);

const wa1 = build('Build WhatsApp Response', waBody());
const wa2 = build('Build WhatsApp Response', waBody());
check('A4 two WhatsApp sends get different wamids',
  wa1.body.messages[0].id !== wa2.body.messages[0].id, [wa1.body.messages[0].id, wa2.body.messages[0].id]);

const voice1 = build('Build Voice Response', voiceBody());
const voice2 = build('Build Voice Response', voiceBody());
check('A5 two calls get different ids', voice1.body.external_ref !== voice2.body.external_ref, [voice1.body.external_ref, voice2.body.external_ref]);

console.log('\nB. the id stays readable and keeps the request code');
check('B1 an SMS id names the channel and the request',
  sms1.body.external_ref.startsWith('mock-sms-' + REQ), sms1.body.external_ref);
check('B2 an SMS id still contains a REQ- code for 07\'s legacy fallback',
  /REQ-[0-9]{4}-[0-9]+/i.test(sms1.body.external_ref), sms1.body.external_ref);
check('B3 a wamid looks like a wamid',
  wa1.body.messages[0].id.startsWith('wamid.mock-whatsapp-' + REQ), wa1.body.messages[0].id);
check('B4 ...and also contains the REQ- code',
  /REQ-[0-9]{4}-[0-9]+/i.test(wa1.body.messages[0].id), wa1.body.messages[0].id);
check('B5 a voice id names the channel and the request',
  voice1.body.external_ref.startsWith('mock-voice-' + REQ), voice1.body.external_ref);

console.log('\nC. Meta\'s real shape is preserved');
check('C1 contacts[] echoes the number in digits', wa1.body.contacts[0].wa_id === '2348030001122', wa1.body.contacts);
check('C2 messages[0].message_status is accepted', wa1.body.messages[0].message_status === 'accepted', wa1.body.messages);
check('C3 no flat external_ref leaks into the WhatsApp body', wa1.body.external_ref === undefined, Object.keys(wa1.body));

console.log('\nD. a send with no request code is still unique');
const bare1 = build('Build SMS Response', { to: '+2348030001199', message: 'hi', metadata: {} });
const bare2 = build('Build SMS Response', { to: '+2348030001199', message: 'hi', metadata: {} });
check('D1 the destination number is the readable part', bare1.body.external_ref.includes('+2348030001199'), bare1.body.external_ref);
check('D2 ...and the ids still differ', bare1.body.external_ref !== bare2.body.external_ref, [bare1.body.external_ref, bare2.body.external_ref]);

console.log('\nE. the failure switch still answers HTTP 500');
const FAIL = { PROVIDER_MOCK_FAIL: 'true' };
check('E1 SMS fails on demand', build('Build SMS Response', smsBody(), FAIL).http_code === 500);
check('E2 WhatsApp fails on demand', build('Build WhatsApp Response', waBody(), FAIL).http_code === 500);
check('E3 voice fails on demand', build('Build Voice Response', voiceBody(), FAIL).http_code === 500);
check('E4 a failing send mints no id', build('Build SMS Response', smsBody(), FAIL).body.error === 'SIMULATED_PROVIDER_FAILURE');

console.log(failures ? '\nFAILED: ' + failures + ' of ' + total : '\nALL PASS (' + total + ' assertions)');
process.exit(failures ? 1 : 0);
