// Harness for `07_Provider_Callback_Receiver` › `Verify & Normalize Provider Event`.
//
// The node is the only authentication gate in front of /webhook/provider-callback, so the
// matrix below is the security contract: which carriers are accepted, which are refused,
// and what the refusal looks like to `Respond Unauthorized`.
//
// Phase 3 / 3.5 changed the rule. The shared secret must travel in a HEADER, because n8n
// records the webhook's `query` in every execution — a `?token=` callback URL writes the
// secret into the log of every callback. Two exceptions survive, both forced:
//   - a Meta envelope, because Meta cannot set custom headers and its signature cannot be
//     verified in-graph (no raw body), so the URL token is the only mechanism it has;
//   - a partner that has confirmed it can only paste a URL, via an explicit flag that is
//     off unless someone turns it on.
// `body.token` is gone: a secret inside the payload is logged twice and nothing sends it.
//
//   node n8n/tests/test_callback_auth.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WF_PATH = path.join(__dirname, '..', 'workflows', '07_provider_callback.json');
const NODE_NAME = 'Verify & Normalize Provider Event';

const workflow = JSON.parse(fs.readFileSync(WF_PATH, 'utf8'));
const node = workflow.nodes.find((n) => n.name === NODE_NAME);
if (!node) {
  console.error('node not found in ' + WF_PATH + ': ' + NODE_NAME);
  process.exit(1);
}
const SOURCE = node.parameters.jsCode;

let total = 0;
let failures = 0;
const check = function (label, cond, detail) {
  total++;
  if (cond) console.log('  ok   ' + label);
  else { failures++; console.log('  FAIL ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
};

// One webhook item, the way n8n builds it: body parsed, headers lower-cased.
function run(envVars, request) {
  const sandbox = {
    $env: envVars,
    $input: { first: () => ({ json: request }) },
    console,
  };
  // n8n's Code node source ends in a top-level `return`, so it must run inside a function.
  return vm.runInNewContext('(function () {\n' + SOURCE + '\n})()', sandbox);
}

const TOKEN = 'clinic_dev_callback_2026';
const ENV = { PROVIDER_CALLBACK_TOKEN: TOKEN };

// A flat VoiceBip-style event: this is the launch provider, so this is the case that
// matters most.
const voiceBody = {
  id: 'sms-ext-9581',
  status: 'delivered',
  to: '+2348030000001',
  request_code: 'REQ-2026-9581',
  channel: 'sms',
};

// A Meta status batch: what the WhatsApp leg would receive.
const metaBody = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'waba-1',
    changes: [{
      field: 'messages',
      value: {
        statuses: [{
          id: 'wamid.test-35',
          status: 'delivered',
          recipient_id: '2348030000001',
          biz_opaque_callback_data: 'REQ-2026-9581',
        }],
      },
    }],
  }],
};

const req = function (body, opts) {
  const o = opts || {};
  return { body: body, query: o.query || {}, headers: o.headers || {}, method: o.method || 'POST' };
};

console.log('A. a header token authenticates a VoiceBip event');
let out = run(ENV, req(voiceBody, { headers: { 'x-provider-token': TOKEN } }));
check('A1 authorized', out[0].json.authorized === true, JSON.stringify(out[0].json));
check('A2 not skipped', out[0].json.skip === false, out[0].json.skip);
check('A3 normalized external_ref', out[0].json.payload.external_ref === 'sms-ext-9581', out[0].json.payload.external_ref);
check('A4 normalized status + channel', out[0].json.payload.status === 'delivered' && out[0].json.payload.channel === 'sms', out[0].json.payload.status + '/' + out[0].json.payload.channel);
check('A5 request code carried through', out[0].json.payload.request_code === 'REQ-2026-9581', out[0].json.payload.request_code);
check('A6 accepted response names the ref', out[0].json.response.external_ref === 'sms-ext-9581', JSON.stringify(out[0].json.response));

console.log('B. the other two header names still work');
out = run(ENV, req(voiceBody, { headers: { 'x-callback-token': TOKEN } }));
check('B1 x-callback-token accepted', out[0].json.authorized === true, JSON.stringify(out[0].json));
out = run(ENV, req(voiceBody, { headers: { 'x-webhook-token': TOKEN } }));
check('B2 x-webhook-token accepted', out[0].json.authorized === true, JSON.stringify(out[0].json));

console.log('C. a query token no longer authenticates a VoiceBip event (3.5)');
out = run(ENV, req(voiceBody, { query: { token: TOKEN } }));
check('C1 rejected', out[0].json.authorized === false, JSON.stringify(out[0].json));
check('C2 401 with bad_token', out[0].json.http_code === 401 && out[0].json.reason === 'bad_token', out[0].json.http_code + '/' + out[0].json.reason);

console.log('D. a token in the payload is never accepted');
out = run(ENV, req(Object.assign({}, voiceBody, { token: TOKEN })));
check('D1 body token rejected', out[0].json.authorized === false, JSON.stringify(out[0].json));

console.log('E. a Meta envelope keeps the URL token, because Meta has no alternative');
out = run(ENV, req(metaBody, { query: { token: TOKEN } }));
check('E1 authorized', out[0].json.authorized === true, JSON.stringify(out[0].json).slice(0, 200));
check('E2 channel is whatsapp', out[0].json.payload.channel === 'whatsapp', out[0].json.payload.channel);
check('E3 wamid captured', out[0].json.payload.external_ref === 'wamid.test-35', out[0].json.payload.external_ref);
check('E4 request code from biz_opaque_callback_data', out[0].json.payload.request_code === 'REQ-2026-9581', out[0].json.payload.request_code);

console.log('E5. ...and a Meta envelope still authenticates by header');
out = run(ENV, req(metaBody, { headers: { 'x-provider-token': TOKEN } }));
check('E5 authorized', out[0].json.authorized === true, JSON.stringify(out[0].json).slice(0, 200));

console.log('E6. ...but only the documented query parameter counts');
out = run(ENV, req(metaBody, { query: { access_token: TOKEN } }));
check('E6 access_token rejected', out[0].json.authorized === false, JSON.stringify(out[0].json));

console.log('F. a Meta envelope with no token at all is refused');
out = run(ENV, req(metaBody));
check('F1 401', out[0].json.authorized === false && out[0].json.http_code === 401, out[0].json.http_code);

console.log('G. the escape hatch is explicit, not implicit');
out = run(Object.assign({}, ENV, { PROVIDER_CALLBACK_ALLOW_QUERY_TOKEN: 'true' }), req(voiceBody, { query: { token: TOKEN } }));
check('G1 flag=true allows a query token', out[0].json.authorized === true, JSON.stringify(out[0].json));
out = run(Object.assign({}, ENV, { PROVIDER_CALLBACK_ALLOW_QUERY_TOKEN: 'false' }), req(voiceBody, { query: { token: TOKEN } }));
check('G2 flag=false does not', out[0].json.authorized === false, JSON.stringify(out[0].json));
out = run(Object.assign({}, ENV, { PROVIDER_CALLBACK_ALLOW_QUERY_TOKEN: 'yes' }), req(voiceBody, { query: { token: TOKEN } }));
check('G3 only the literal "true" opens it', out[0].json.authorized === false, JSON.stringify(out[0].json));

console.log('H. wrong tokens and unconfigured receivers fail closed');
out = run(ENV, req(voiceBody, { headers: { 'x-provider-token': TOKEN + 'x' } }));
check('H1 wrong header token 401', out[0].json.authorized === false && out[0].json.reason === 'bad_token', out[0].json.reason);
out = run({}, req(voiceBody, { headers: { 'x-provider-token': TOKEN } }));
check('H2 unset env 401', out[0].json.authorized === false && out[0].json.http_code === 401, out[0].json.http_code);
check('H3 unset env says so', out[0].json.reason === 'callback_token_not_configured', out[0].json.reason);
out = run({}, req(voiceBody, { headers: { 'x-provider-token': '' } }));
check('H4 unset env + empty header 401', out[0].json.authorized === false, JSON.stringify(out[0].json));

console.log('I. the refusal keeps the contract Respond Unauthorized renders');
const refused = run(ENV, req(voiceBody, { query: { token: TOKEN } }))[0].json;
check('I1 http_code 401', refused.http_code === 401, refused.http_code);
check('I2 response.ok false', refused.response.ok === false, refused.response.ok);
check('I3 error unauthorized', refused.response.error === 'unauthorized', refused.response.error);
check('I4 reason names the token', refused.response.reason === 'invalid_callback_token', refused.response.reason);
check('I5 no payload leaks into a refusal', refused.payload === undefined, JSON.stringify(refused.payload));

console.log('J. an unrecognised channel is ignored, not relabelled as SMS (3.6)');
// A channel the receiver cannot map is a contract mismatch. Filing it as 'sms' would put
// a row in the patient timeline for a message that was never an SMS, and the provider's
// 200 means it never retries and never surfaces.
const noChannel = function (body, headers) {
  return run(ENV, req(body, { headers: headers || { 'x-provider-token': TOKEN } }));
};
const isUnknownChannel = function (out) {
  const j = out[0].json;
  return j.skip === true && j.reason === 'unknown_channel' && j.payload === undefined;
};

out = noChannel(Object.assign({}, voiceBody, { id: 'x-9001', channel: 'email' }));
check('J1 explicit "email" is ignored', isUnknownChannel(out), JSON.stringify(out[0].json).slice(0, 160));
out = noChannel(Object.assign({}, voiceBody, { id: 'x-9002', channel: undefined, channel_type: 'push' }));
check('J2 channel_type "push" is ignored', isUnknownChannel(out), JSON.stringify(out[0].json).slice(0, 160));
out = noChannel(Object.assign({}, voiceBody, { id: 'x-9003', channel: { name: 'sms' } }));
check('J3 an object channel is not stringified into sms', isUnknownChannel(out), JSON.stringify(out[0].json).slice(0, 160));
check('J10 an ignored callback still answers 200', out[0].json.http_code === 200, out[0].json.http_code);

console.log('J4. but an ABSENT channel keeps the documented inference chain');
out = noChannel(Object.assign({}, voiceBody, { id: 'sms-ext-9004', channel: undefined }));
check('J4 ref hint -> sms', out[0].json.payload && out[0].json.payload.channel === 'sms', JSON.stringify(out[0].json).slice(0, 160));
out = noChannel({ id: 'x-9005', status: 'answered', to: '+2348030000001', request_code: 'REQ-2026-9581' });
check('J5 answered -> voice', out[0].json.payload && out[0].json.payload.channel === 'voice', JSON.stringify(out[0].json).slice(0, 160));
out = noChannel({ id: 'voice-9006', status: 'delivered', to: '+2348030000001', request_code: 'REQ-2026-9581' });
check('J6 ref hint -> voice', out[0].json.payload && out[0].json.payload.channel === 'voice', JSON.stringify(out[0].json).slice(0, 160));
out = noChannel({ id: 'x-9007', status: 'delivered', to: '+2348030000001', request_code: 'REQ-2026-9581' });
check('J7 no hint at all -> sms (documented VoiceBip default)', out[0].json.payload && out[0].json.payload.channel === 'sms', JSON.stringify(out[0].json).slice(0, 160));

console.log('J8. a mappable spelling still maps');
out = noChannel(Object.assign({}, voiceBody, { id: 'x-9008', channel: 'Voice' }));
check('J8 "Voice" -> voice', out[0].json.payload && out[0].json.payload.channel === 'voice', JSON.stringify(out[0].json).slice(0, 160));

console.log('J9. a Meta envelope is WhatsApp whatever it claims');
out = run(ENV, req(metaBody, { query: { token: TOKEN } }));
const metaWithChannel = JSON.parse(JSON.stringify(metaBody));
metaWithChannel.entry[0].changes[0].value.statuses[0].channel = 'email';
out = run(ENV, req(metaWithChannel, { headers: { 'x-provider-token': TOKEN } }));
check('J9 Meta + channel:"email" -> whatsapp', out[0].json.payload && out[0].json.payload.channel === 'whatsapp', JSON.stringify(out[0].json).slice(0, 160));

console.log('K. the patient identity a provider sends actually reaches Django (3.7)');
// `normalize()` returns `patient_name`; the forwarder used to read `n.patientName`, which
// is undefined, so every callback silently dropped the name the provider sent.
out = noChannel(Object.assign({}, voiceBody, { id: 'x-9101', patient_name: 'Amina Test' }));
check('K1 provider patient_name reaches the payload', out[0].json.payload.patient_name === 'Amina Test', JSON.stringify(out[0].json.payload.patient_name));
check('K1b ...as a string, not undefined', typeof out[0].json.payload.patient_name === 'string', typeof out[0].json.payload.patient_name);
out = noChannel(Object.assign({}, voiceBody, { id: 'x-9102' }));
check('K2 absent name becomes an empty string', out[0].json.payload.patient_name === '', JSON.stringify(out[0].json.payload.patient_name));
out = noChannel({ id: 'x-9103', status: 'delivered', recipient: '+2348030009103', request_code: 'REQ-2026-9581' });
check('K3 the recipient alias is still read as the phone', out[0].json.payload.patient_phone === '+2348030009103', JSON.stringify(out[0].json.payload.patient_phone));

console.log(failures ? '\nFAILED: ' + failures + ' of ' + total : '\nALL PASS (' + total + ' assertions)');
process.exit(failures ? 1 : 0);
