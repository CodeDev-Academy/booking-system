// Phase 1 step 1.2 harness: run the adapter's real source with stubbed n8n globals
// and assert every routing branch. Node only - no n8n restart required.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// The adapter is a Code node in the workflow export, which is the source of truth.
// Never test a copy: a drifted copy is exactly what this harness is meant to catch.
const WF = path.join(__dirname, '..', '05_slot_offer_dispatcher.json');
const wf = JSON.parse(fs.readFileSync(WF, 'utf8'));
const adapterNode = wf.nodes.find((n) => n.name === 'Provider Config & Adapter');
if (!adapterNode) { console.log('FAIL could not find the adapter node in the workflow JSON'); process.exit(1); }
const CODE = adapterNode.parameters.jsCode;

const BASE_SRC = {
  request_id: 'REQ-2026-0099',
  patient_name: 'Amina Yusuf',
  patient_phone: '+234 803 311 2233',
  service_name: 'Dental Consultation',
  clinic_name: 'Cedarcare Specialist Clinic',
  chat_id: null,
  expiry_minutes: 45,
  slots_count: 2,
  options: [{ number: 1, label: '1) Sat 9:30' }, { number: 2, label: '2) Sat 11:00' }],
  whatsapp_params: ['1) Sat 9:30', '2) Sat 11:00'],
  want_whatsapp: true,
  want_sms: false,
  want_voice: false,
};

function run(envVars, overrides) {
  const src = Object.assign({}, BASE_SRC, overrides || {});
  const sandbox = {
    $env: envVars,
    $input: { all: () => [{ json: src }] },
    $getWorkflowStaticData: () => ({}),
    console,
  };
  return vm.runInNewContext('(function () {\n' + CODE + '\n})()', sandbox);
}

let failures = 0;
const check = (label, cond, detail) => {
  if (cond) { console.log('  ok   ' + label); }
  else { failures++; console.log('  FAIL ' + label + (detail ? ' -> ' + detail : '')); }
};

console.log('A. live + template mode + no template name -> must refuse to send');
let out = run({ PROVIDER_MOCK: 'false', WHATSAPP_PHONE_NUMBER_ID: '123', WHATSAPP_ACCESS_TOKEN: 'tok' });
check('route is skip', out[0].json.provider_request.route === 'skip', JSON.stringify(out[0].json.provider_request.route));
check('reason names the template', out[0].json.provider_request.skip_reason === 'whatsapp_template_not_configured', out[0].json.provider_request.skip_reason);
check('no url built', !out[0].json.provider_request.url);

console.log('B. live + template name -> template body, E.164 without plus');
out = run({
  PROVIDER_MOCK: 'false', WHATSAPP_PHONE_NUMBER_ID: '123', WHATSAPP_ACCESS_TOKEN: 'tok',
  WHATSAPP_TEMPLATE_NAME: 'clinic_slot_offer', WHATSAPP_TEMPLATE_LANG: 'en',
});
let body = out[0].json.provider_request.body;
check('route whatsapp', out[0].json.provider_request.route === 'whatsapp');
check('url is graph.facebook', String(out[0].json.provider_request.url).indexOf('graph.facebook.com') !== -1, out[0].json.provider_request.url);
check('auth header uses token', out[0].json.provider_request.headers.Authorization === 'Bearer tok');
check('type template', body.type === 'template', body.type);
check('template name', body.template.name === 'clinic_slot_offer');
check('language code', body.template.language.code === 'en');
check('to has no plus', body.to === '2348033112233', body.to);
check('6 body params', body.template.components[0].parameters.length === 6, body.template.components[0].parameters.length);
check('param 1 is patient name', body.template.components[0].parameters[0].text === 'Amina Yusuf');
check('param 3 is option 1 label', body.template.components[0].parameters[2].text === '1) Sat 9:30');
check('missing option -> em dash', body.template.components[0].parameters[4].text === '\u2014', body.template.components[0].parameters[4].text);
check('param 6 is expiry', body.template.components[0].parameters[5].text === '45');
check('2 quick replies', body.template.components.length === 3, body.template.components.length);
check('reply payloads 1,2', body.template.components[1].parameters[0].payload === '1' && body.template.components[2].parameters[0].payload === '2');
check('biz_opaque carries request', body.biz_opaque_callback_data === 'REQ-2026-0099');
check('no invented metadata field', body.metadata === undefined);

console.log('C. live + text mode -> free-form text (only valid inside 24h window)');
out = run({ PROVIDER_MOCK: 'false', WHATSAPP_PHONE_NUMBER_ID: '123', WHATSAPP_ACCESS_TOKEN: 'tok', WHATSAPP_TEMPLATE_MODE: 'text' });
check('type text', out[0].json.provider_request.body.type === 'text');
check('still no plus', out[0].json.provider_request.body.to === '2348033112233');
check('text mode bypasses template gate', out[0].json.provider_request.route === 'whatsapp');

console.log('D. mock -> placeholder template so the template path is exercised');
out = run({ PROVIDER_MOCK: 'true' });
check('mock url is simulator', String(out[0].json.provider_request.url).indexOf('provider-sim/whatsapp') !== -1, out[0].json.provider_request.url);
check('mock template name', out[0].json.provider_request.body.template.name === 'mock_clinic_slot_offer');
check('mock mode never reports missing env', out[0].json.adapter_meta.missing_env.length === 0);

console.log('E. live + no WhatsApp credentials -> provider_not_configured');
out = run({ PROVIDER_MOCK: 'false' });
check('reason provider_not_configured', out[0].json.provider_request.skip_reason === 'provider_not_configured', out[0].json.provider_request.skip_reason);
check('missing_env lists WhatsApp vars', out[0].json.adapter_meta.missing_env.join(',').indexOf('WHATSAPP_TEMPLATE_NAME') !== -1, out[0].json.adapter_meta.missing_env.join(','));

console.log('F. Telegram patient suppresses the WhatsApp leg');
out = run({ PROVIDER_MOCK: 'true' }, { chat_id: '12345' });
check('no items', out.length === 1 && out[0].json.provider_request.skip_reason === 'no_active_channel', JSON.stringify(out[0].json.provider_request.skip_reason));

console.log('G. >3 options -> WhatsApp caps quick replies at 3');
out = run({ PROVIDER_MOCK: 'true' }, {
  slots_count: 4,
  options: [{ number: 1, label: 'a' }, { number: 2, label: 'b' }, { number: 3, label: 'c' }, { number: 4, label: 'd' }],
  whatsapp_params: ['a', 'b', 'c', 'd'],
});
body = out[0].json.provider_request.body;
check('3 buttons only', body.template.components.length === 4, body.template.components.length);

console.log('H. phoneless patient -> every channel skips with missing_phone');
out = run({ PROVIDER_MOCK: 'true' }, { patient_phone: '', want_sms: true, want_voice: true });
check('three skip items', out.length === 3 && out.every(i => i.json.provider_request.route === 'skip'), JSON.stringify(out.map(i => i.json.provider_channel)));
for (const it of out) {
  const j = it.json;
  check(j.provider_channel + ' reason', j.provider_request.skip_reason === 'missing_phone', j.provider_request.skip_reason);
  check(j.provider_channel + ' builds nothing', !j.provider_request.url && j.provider_request.body === null);
}

console.log('I. phoneless beats unconfigured provider (most fundamental first)');
out = run({ PROVIDER_MOCK: 'false' }, { patient_phone: '' });
check('reason is missing_phone', out[0].json.provider_request.skip_reason === 'missing_phone', out[0].json.provider_request.skip_reason);

console.log('J. zero options -> every channel skips with no_slots');
out = run({ PROVIDER_MOCK: 'true' }, {
  slots_count: 0, options: [], whatsapp_params: [], want_sms: true, want_voice: true,
});
check('three skip items', out.length === 3 && out.every(i => i.json.provider_request.route === 'skip'), JSON.stringify(out.map(i => i.json.provider_channel)));
for (const it of out) {
  const j = it.json;
  check(j.provider_channel + ' reason no_slots', j.provider_request.skip_reason === 'no_slots', j.provider_request.skip_reason);
  check(j.provider_channel + ' builds nothing', !j.provider_request.url && j.provider_request.body === null);
}

console.log('K. no_slots beats phoneless + unconfigured (nothing to say at all)');
out = run({ PROVIDER_MOCK: 'false' }, { slots_count: 0, options: [], whatsapp_params: [], patient_phone: '' });
check('reason is no_slots', out[0].json.provider_request.skip_reason === 'no_slots', out[0].json.provider_request.skip_reason);

console.log('L. one option still dispatches normally (guard is not over-eager)');
out = run({ PROVIDER_MOCK: 'true' }, {
  slots_count: 1, options: [{ number: 1, label: '1) Sat 9:30' }], whatsapp_params: ['1) Sat 9:30'],
});
check('route whatsapp', out[0].json.provider_request.route === 'whatsapp', out[0].json.provider_request.route);
check('one quick reply', out[0].json.provider_request.body.template.components.length === 2, out[0].json.provider_request.body.template.components.length);

console.log(failures ? '\nFAILED: ' + failures : '\nALL PASS');
process.exit(failures ? 1 : 0);
