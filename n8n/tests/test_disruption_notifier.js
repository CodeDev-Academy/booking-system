// Item B.3 harness: run the SHIPPED sources of workflow 08 (disruption_notifier)
// and assert the whole delivery graph: fail-closed auth, item parsing, provider
// adaptation (mock + live), the multi-patient log zip, and the byte-identical
// canonical error-classification block shared with Workflow D (05).
//
// Django owns the words. Nothing in this workflow may carry patient copy.
// Node only - no n8n restart required.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WF = path.join(__dirname, '..', 'workflows', '08_disruption_notifier.json');
const WF05 = path.join(__dirname, '..', 'workflows', '05_slot_offer_dispatcher.json');
const wf = JSON.parse(fs.readFileSync(WF, 'utf8'));
const wf05 = JSON.parse(fs.readFileSync(WF05, 'utf8'));

let failures = 0;
const check = (label, cond, detail) => {
  if (cond) { console.log('  ok   ' + label); }
  else { failures++; console.log('  FAIL ' + label + (detail === undefined ? '' : ' -> ' + detail)); }
};

const node = (name) => wf.nodes.find((n) => n.name === name);
const node05 = (name) => wf05.nodes.find((n) => n.name === name);
const code = (name) => { const n = node(name); return n ? n.parameters.jsCode : null; };

// Django's words look like this (written by disruption_service.py). The workflow
// must never contain any fragment of patient copy.
const WORDS = 'Hello Amina Yusuf, due to a sudden emergency, your Dental Examination '
  + 'appointment with Dr. Bello Ibrahim has been moved. You are now booked with '
  + 'Dr. Chinwe Okafor on Mon 23 Nov at 11:00 AM at Cedarcare Specialist Clinic. '
  + 'We apologise for the change. Please call 0809... if this does not suit you. Ref AP-1042.';

const BODY = {
  doctor_id: 'd-1111',
  doctor_name: 'Dr. Bello Ibrahim',
  reason: 'Acute Malaria',
  clinic_name: 'Cedarcare Specialist Clinic',
  items: [
    {
      request_id: 'AP-1042', id: '9', kind: 'disruption', channel: 'sms',
      patient_name: 'Amina Yusuf', patient_phone: '+2348031112233',
      service_name: 'Dental Examination', doctor_name: 'Dr. Chinwe Okafor',
      start_datetime: '2026-11-23T11:00:00+01:00',
      claim_ref: 'disrupt-AP-1042-sms', message: WORDS,
    },
    {
      request_id: 'AP-1042', id: '9', kind: 'disruption', channel: 'whatsapp',
      patient_name: 'Amina Yusuf', patient_phone: '+2348031112233',
      service_name: 'Dental Examination', doctor_name: 'Dr. Chinwe Okafor',
      start_datetime: '2026-11-23T11:00:00+01:00',
      claim_ref: 'disrupt-AP-1042-whatsapp', message: WORDS,
    },
  ],
};

const runVerify = (envVars, headers) => {
  const sandbox = {
    console,
    $input: { first: () => ({ json: { headers: headers || {}, ...{} } }) },
    $env: envVars,
  };
  return vm.runInNewContext('(function () {\n' + code('Verify Disruption Secret') + '\n})()', sandbox);
};

const runParse = (reqBody) => {
  const sandbox = {
    console,
    $input: { first: () => ({ json: { headers: { 'x-webhook-secret': 's' }, body: reqBody } }) },
  };
  return vm.runInNewContext('(function () {\n' + code('Parse Disruption Items') + '\n})()', sandbox);
};

const ADAPTER_SRC = (channel) => ({
  request_id: 'AP-1042',
  patient_name: 'Amina Yusuf',
  patient_phone: '+234 803 111 2233',
  service_name: 'Dental Examination',
  doctor_name: 'Dr. Chinwe Okafor',
  clinic_name: 'Cedarcare Specialist Clinic',
  channel,
  claim_ref: 'disrupt-AP-1042-' + channel,
  message: WORDS,
  start_datetime: '2026-11-23T11:00:00+01:00',
  chat_id: null,
  want_sms: channel === 'sms',
  want_whatsapp: channel === 'whatsapp',
  want_voice: false,
});

function runAdapter(envVars, channel, overrides) {
  const src = Object.assign({}, ADAPTER_SRC(channel), overrides || {});
  const store = {};
  const sandbox = {
    console,
    $env: envVars,
    $input: { all: () => [{ json: src }] },
    $getWorkflowStaticData: () => store,
  };
  return vm.runInNewContext('(function () {\n' + code('Provider Config & Adapter') + '\n})()', sandbox);
}

// Multi-item runner: ONE disruption push carries EVERY impacted patient, and
// Parse Disruption Items emits one input per channel — so the adapter must
// adapt EVERY input item, not just the first.
function runAdapterMulti(envVars, srcs) {
  const store = {};
  const sandbox = {
    console,
    $env: envVars,
    $input: { all: () => srcs.map((json) => ({ json })) },
    $getWorkflowStaticData: () => store,
  };
  return vm.runInNewContext('(function () {\n' + code('Provider Config & Adapter') + '\n})()', sandbox);
}

// Log-node runner: MULTIPLE responses (one disruption push carries every patient),
// zipped by position against the adapter's same-channel items.
async function runLog(nodeName, channel, responses, overrides) {
  const bases = (overrides && overrides.bases) || responses.map((_, i) => ({
    request_id: 'AP-104' + (2 + i),
    patient_name: i === 0 ? 'Amina Yusuf' : 'Chidi Okonkwo',
    patient_phone: '+23480311122' + (30 + i),
    provider_channel: channel,
    claim_ref: 'disrupt-AP-104' + (2 + i) + '-' + channel,
  }));
  const posts = [];
  const sandbox = {
    console,
    $input: { all: () => responses.map((json) => ({ json })), first: () => ({ json: responses[0] || {} }) },
    $: () => ({ all: () => bases.map((json) => ({ json })) }),
    $env: { DJANGO_API_BASE_URL: 'http://127.0.0.1:8000/api/v1', DJANGO_WEBHOOK_SECRET: 'clinic_dev_secret_2026' },
  };
  const fn = vm.runInNewContext('(async function () {\n' + code(nodeName) + '\n})', sandbox);
  const ctx = {
    helpers: {
      httpRequest: async (opts) => {
        posts.push(opts);
        return { id: 42, status: opts.body.status };
      },
    },
  };
  const result = await fn.call(ctx);
  return { out: result, posts, bases };
}

const wrap = (status, body) => status + ' - ' + JSON.stringify(body);

(async () => {
  // ---- S. shape, wiring, and the no-copy rule --------------------------------
  console.log('S. workflow shape');
  check('S1 workflow name', wf.name === '08_Disruption_Notifier', wf.name);
  const kept = ['Provider Config & Adapter', 'Route Provider Request', 'Send SMS (VoiceBip)',
    'Send WhatsApp Interactive Message', 'Log WhatsApp Interaction', 'Log SMS Interaction',
    'Log Skipped Channel'];
  for (const name of kept) check('S2 keeps node "' + name + '"', Boolean(node(name)));
  const auth = ['Disruption Alerts Webhook from Django', 'Verify Disruption Secret',
    'IF Disruption Authorized', 'Respond Disruption Accepted', 'Respond Disruption Unauthorized',
    'Parse Disruption Items'];
  for (const name of auth) check('S3 has node "' + name + '"', Boolean(node(name)));
  const dropped = wf.nodes.filter((n) => /voice|wait 30|check patient|merge/i.test(n.name)
    && n.name !== 'Send SMS (VoiceBip)'); // the SMS provider's node NAME mentions Voice — it is the SMS leg
  check('S4 no voice/probe/wait nodes', dropped.length === 0, dropped.map((n) => n.name).join(', '));

  const hook = node('Disruption Alerts Webhook from Django');
  check('S5 webhook path is disruption-alerts', hook && hook.parameters.path === 'disruption-alerts',
    hook && hook.parameters.path);
  check('S6 webhook responds at the response node', hook && hook.parameters.responseMode === 'responseNode');

  const ifNode = node('IF Disruption Authorized');
  const cond = JSON.stringify(ifNode && ifNode.parameters);
  check('S7 IF checks the auth verdict', cond.indexOf('dispatch_auth.authorized') !== -1, cond);
  const unauthorized = node('Respond Disruption Unauthorized');
  check('S8 unauthorized answers 401', unauthorized.parameters.options.responseCode === 401);
  const accepted = node('Respond Disruption Accepted');
  check('S9 accepted answers 200', accepted.parameters.options.responseCode === 200);

  const conns = wf.connections;
  const goesTo = (from, output, target) => {
    const c = (conns[from] || {}).main || [];
    return Boolean(c[output] && c[output].some((t) => t.node === target));
  };
  check('S10 webhook -> verify', goesTo('Disruption Alerts Webhook from Django', 0, 'Verify Disruption Secret'));
  check('S11 verify -> IF', goesTo('Verify Disruption Secret', 0, 'IF Disruption Authorized'));
  check('S12 IF true -> accepted respond', goesTo('IF Disruption Authorized', 0, 'Respond Disruption Accepted'));
  check('S13 IF false -> unauthorized respond', goesTo('IF Disruption Authorized', 1, 'Respond Disruption Unauthorized'));
  check('S14 accepted -> parse', goesTo('Respond Disruption Accepted', 0, 'Parse Disruption Items'));
  check('S15 parse -> claim check', goesTo('Parse Disruption Items', 0, 'Check Claim Liveness'));
  check('S16 adapter -> route', goesTo('Provider Config & Adapter', 0, 'Route Provider Request'));
  check('S17 route whatsapp -> send whatsapp', goesTo('Route Provider Request', 0, 'Send WhatsApp Interactive Message'));
  check('S18 route sms -> send sms', goesTo('Route Provider Request', 1, 'Send SMS (VoiceBip)'));
  check('S19 route skip -> log skipped', goesTo('Route Provider Request', 2, 'Log Skipped Channel'));
  check('S20 no voice route rule', JSON.stringify(node('Route Provider Request').parameters).indexOf('voice') === -1);
  check('S21 send WA success -> log WA', goesTo('Send WhatsApp Interactive Message', 0, 'Log WhatsApp Interaction'));
  check('S22 send WA error -> log WA too', goesTo('Send WhatsApp Interactive Message', 1, 'Log WhatsApp Interaction'));
  check('S23 send SMS success -> log SMS', goesTo('Send SMS (VoiceBip)', 0, 'Log SMS Interaction'));
  check('S24 send SMS error -> log SMS too', goesTo('Send SMS (VoiceBip)', 1, 'Log SMS Interaction'));

  const sendWA = node('Send WhatsApp Interactive Message');
  const sendSMS = node('Send SMS (VoiceBip)');
  check('S25 send nodes are parameter-identical clones of 05',
    JSON.stringify(sendWA.parameters) === JSON.stringify(node05('Send WhatsApp Interactive Message').parameters)
    && JSON.stringify(sendSMS.parameters) === JSON.stringify(node05('Send SMS (VoiceBip)').parameters));
  check('S26 log skipped is a byte-identical clone of 05',
    code('Log Skipped Channel') === (node05('Log Skipped Channel').parameters.jsCode || '').slice(0, code('Log Skipped Channel').length)
    && code('Log Skipped Channel') === node05('Log Skipped Channel').parameters.jsCode);

  const CANON = /\/\/ >>> provider-error-classification[\s\S]*?\/\/ <<< provider-error-classification <<</;
  const blockOf = (n) => { const m = n.parameters.jsCode.match(CANON); return m ? m[0] : null; };
  const canon05 = blockOf(node05('Log WhatsApp Interaction'));
  check('S27 canonical classification block byte-identical to 05 (whatsapp)',
    blockOf(node('Log WhatsApp Interaction')) === canon05);
  check('S28 canonical classification block byte-identical to 05 (sms)',
    blockOf(node('Log SMS Interaction')) === canon05);

  const raw = JSON.stringify(wf);
  check('S29 no Django words in the workflow (emergency)', raw.indexOf('mergency') === -1);
  check('S30 no Django words in the workflow (apologise)', raw.indexOf('pologis') === -1);
  check('S31 no Django words in the workflow (moved sentence)', raw.indexOf('has been moved') === -1);
  check('S32 log nodes key off the adapter lookup',
    code('Log WhatsApp Interaction').indexOf("$('Provider Config & Adapter')") !== -1
    && code('Log SMS Interaction').indexOf("$('Provider Config & Adapter')") !== -1);

  // Gap 3: nothing may be sent without asking Django whether the claim is still
  // live. The check annotates every item; an IF routes the live ones to the
  // adapter and the dead ones into a dead end (no send node downstream).
  check('S33 claim-check node exists', Boolean(node('Check Claim Liveness')));
  check('S34 check -> IF', goesTo('Check Claim Liveness', 0, 'IF Claim Live'));
  check('S35 live -> adapter', goesTo('IF Claim Live', 0, 'Provider Config & Adapter'));
  check('S36 held -> halt log', goesTo('IF Claim Live', 1, 'Log Halted Claims'));
  const haltTargets = (((conns['Log Halted Claims'] || {}).main || [])[0] || []);
  check('S37 the halt log is a dead end', haltTargets.length === 0, JSON.stringify(haltTargets));
  check('S38 parse never feeds the adapter directly',
    !goesTo('Parse Disruption Items', 0, 'Provider Config & Adapter'));
  check('S39 the halt log writes nothing to Django', (code('Log Halted Claims') || '').indexOf('httpRequest') === -1);

  // ---- A. verify node: fail closed -------------------------------------------
  console.log('A. verify node (fail closed)');
  let out = runVerify({}, { 'x-webhook-secret': 'whatever' });
  check('A1 unset secret -> unauthorized', out[0].json.dispatch_auth.authorized === false);
  check('A2 reason names the cause', out[0].json.dispatch_auth.reason === 'secret_not_configured');
  out = runVerify({ DJANGO_WEBHOOK_SECRET: 'right' }, { 'x-webhook-secret': 'wrong' });
  check('A3 wrong secret -> unauthorized', out[0].json.dispatch_auth.authorized === false);
  check('A4 reason bad_secret', out[0].json.dispatch_auth.reason === 'bad_secret');
  out = runVerify({ DJANGO_WEBHOOK_SECRET: 'right' }, { 'x-webhook-secret': 'right' });
  check('A5 correct secret -> authorized', out[0].json.dispatch_auth.authorized === true);

  // ---- B. parse node: pass-through, drop malformed ---------------------------
  console.log('B. parse node');
  out = runParse(BODY);
  check('B1 both items pass through', out.length === 2, String(out.length));
  check('B2 sms item wants only sms', out[0].json.want_sms === true && out[0].json.want_whatsapp === false);
  check('B3 whatsapp item wants only whatsapp', out[1].json.want_whatsapp === true && out[0].json.want_sms === undefined ? true : out[1].json.want_sms === false);
  check('B4 words pass through VERBATIM', out.every((i) => i.json.message === WORDS));
  check('B5 claim refs kept', out[0].json.claim_ref === 'disrupt-AP-1042-sms'
    && out[1].json.claim_ref === 'disrupt-AP-1042-whatsapp');
  check('B6 request_id is the appointment code', out.every((i) => i.json.request_id === 'AP-1042'));
  check('B7 per-item context wins, body context fills gaps', out.every((i) => i.json.doctor_name === 'Dr. Chinwe Okafor'
    && i.json.reason === 'Acute Malaria' && i.json.clinic_name === 'Cedarcare Specialist Clinic'));
  out = runParse({ ...BODY, items: [{ ...BODY.items[0], doctor_name: '' }] });
  check('B7b item without doctor falls back to the leave doctor',
    out.length === 1 && out[0].json.doctor_name === 'Dr. Bello Ibrahim');

  out = runParse({ ...BODY, items: [{ ...BODY.items[0], message: '   ' }] });
  check('B8 empty words dropped', out.length === 0, String(out.length));
  out = runParse({ ...BODY, items: [{ ...BODY.items[0], claim_ref: '' }] });
  check('B9 missing claim dropped (single-shot or nothing)', out.length === 0, String(out.length));
  out = runParse({ ...BODY, items: [{ ...BODY.items[0], channel: 'pigeon' }] });
  check('B10 unknown channel dropped', out.length === 0, String(out.length));
  out = runParse({ ...BODY, items: [{ ...BODY.items[0], patient_phone: '' }] });
  check('B11 phoneless item dropped', out.length === 0, String(out.length));
  out = runParse({ ...BODY, items: [] });
  check('B12 empty push -> zero items', out.length === 0, String(out.length));
  out = runParse({ ...BODY, items: [...BODY.items, { request_id: 'AP-X', channel: 'sms' }] });
  check('B13 malformed tail dropped, valid kept', out.length === 2, String(out.length));

  // ---- C. adapter, mock mode -------------------------------------------------
  console.log('C. adapter (mock mode)');
  out = runAdapter({ PROVIDER_MOCK: '' }, 'sms');
  check('C1 route is sms', out[0].json.provider_request.route === 'sms');
  check('C2 mock url is the simulator', out[0].json.provider_request.url.indexOf('/sms') !== -1
    && out[0].json.provider_request.url.indexOf('provider-sim') !== -1, out[0].json.provider_request.url);
  check('C3 sms body carries the words VERBATIM', out[0].json.provider_request.body.message === WORDS);
  check('C4 to is the raw phone', out[0].json.provider_request.body.to === '+234 803 111 2233');

  out = runAdapter({ PROVIDER_MOCK: '' }, 'whatsapp');
  check('C5 route is whatsapp', out[0].json.provider_request.route === 'whatsapp');
  const body = out[0].json.provider_request.body;
  check('C6 mock url is the simulator', out[0].json.provider_request.url.indexOf('/whatsapp') !== -1);
  check('C7 type is template', body.type === 'template');
  check('C8 mock template name', body.template.name === 'mock_clinic_disruption_notice', body.template.name);
  const bodyComp = (body.template.components || []).find((c) => c.type === 'body');
  check('C9 exactly ONE body param', (body.template.components || []).length === 1
    && bodyComp.parameters.length === 1, JSON.stringify(body.template.components));
  check('C10 param is the words VERBATIM', bodyComp.parameters[0].text === WORDS);
  check('C11 no buttons (no new reply grammar)',
    !(body.template.components || []).some((c) => c.type === 'button'));
  check('C12 callback data is the appointment code', body.biz_opaque_callback_data === 'AP-1042');
  check('C13 to is E.164 without plus', body.to === '2348031112233', body.to);

  // ---- D. adapter, live mode -------------------------------------------------
  console.log('D. adapter (live mode)');
  out = runAdapter({ PROVIDER_MOCK: 'false', VOICEBIP_API_URL: 'https://api.voicebip.test',
    VOICEBIP_API_KEY: 'vbkey' }, 'sms');
  check('D1 live sms url', out[0].json.provider_request.url === 'https://api.voicebip.test/sms');
  check('D2 bearer key', out[0].json.provider_request.headers.Authorization === 'Bearer vbkey');
  check('D3 words VERBATIM', out[0].json.provider_request.body.message === WORDS);

  out = runAdapter({ PROVIDER_MOCK: 'false' }, 'sms');
  check('D4 missing sms creds -> skip', out[0].json.provider_request.route === 'skip'
    && out[0].json.provider_request.skip_reason === 'provider_not_configured');
  check('D5 skipped leg builds no url', out[0].json.provider_request.url === '');

  out = runAdapter({ PROVIDER_MOCK: 'false', WHATSAPP_PHONE_NUMBER_ID: '123',
    WHATSAPP_ACCESS_TOKEN: 'tok', WHATSAPP_DISRUPTION_TEMPLATE_NAME: 'clinic_disruption_v1' }, 'whatsapp');
  check('D6 live whatsapp url is graph api', out[0].json.provider_request.url.indexOf('graph.facebook.com') !== -1);
  check('D7 disruption template name from env', out[0].json.provider_request.body.template.name === 'clinic_disruption_v1');
  check('D8 template lang default en_US', out[0].json.provider_request.body.template.language.code === 'en_US');

  out = runAdapter({ PROVIDER_MOCK: 'false', WHATSAPP_PHONE_NUMBER_ID: '123',
    WHATSAPP_ACCESS_TOKEN: 'tok' }, 'whatsapp');
  check('D9 no disruption template -> skip', out[0].json.provider_request.route === 'skip'
    && out[0].json.provider_request.skip_reason === 'whatsapp_template_not_configured');

  out = runAdapter({ PROVIDER_MOCK: 'false', WHATSAPP_PHONE_NUMBER_ID: '123',
    WHATSAPP_ACCESS_TOKEN: 'tok', WHATSAPP_DISRUPTION_TEMPLATE_NAME: 'clinic_disruption_v1' }, 'whatsapp',
    { patient_phone: '' });
  check('D10 phoneless -> skip missing_phone', out[0].json.provider_request.skip_reason === 'missing_phone');

  out = runAdapter({ PROVIDER_MOCK: 'false', VOICEBIP_API_URL: 'https://api.voicebip.test',
    VOICEBIP_API_KEY: 'vbkey' }, 'whatsapp', { want_voice: true, want_whatsapp: false, want_sms: false });
  check('D11 want_voice alone produces nothing sendable',
    out.length === 1 && out[0].json.provider_request.route === 'no_active_channel' || out[0].json.provider_channel === null,
    JSON.stringify(out.map((o) => o.json.provider_request.route)));

  // ---- D+. adapter multi-item: one push carries EVERY impacted patient -------
  console.log('D+ adapter (multi-item, 2 patients x 2 channels)');
  out = runAdapterMulti({ PROVIDER_MOCK: '' }, [
    ADAPTER_SRC('sms'),
    ADAPTER_SRC('whatsapp'),
    Object.assign({}, ADAPTER_SRC('sms'), {
      request_id: 'AP-1043', claim_ref: 'disrupt-AP-1043-sms',
      patient_phone: '+234 805 444 5555', message: 'Other words',
    }),
    Object.assign({}, ADAPTER_SRC('whatsapp'), {
      request_id: 'AP-1043', claim_ref: 'disrupt-AP-1043-whatsapp',
      patient_phone: '+234 805 444 5555', message: 'Other words',
    }),
  ]);
  check('D+1 four inputs -> four adapted outputs', out.length === 4, String(out.length));
  check('D+2 every item keeps its own channel', out[0].json.provider_channel === 'sms'
    && out[1].json.provider_channel === 'whatsapp'
    && out[2].json.provider_channel === 'sms'
    && out[3].json.provider_channel === 'whatsapp',
    JSON.stringify(out.map((o) => o.json.provider_channel)));
  check('D+3 item 3 carries ITS phone', out[2].json.provider_request.body.to === '+234 805 444 5555');
  check('D+4 item 3 carries ITS words', out[2].json.provider_request.body.message === 'Other words');
  check('D+5 item 2 whatsapp words stay verbatim', out[1].json.provider_request.body.template.components[0].parameters[0].text === WORDS);
  check('D+6 item 4 whatsapp words are its own', out[3].json.provider_request.body.template.components[0].parameters[0].text === 'Other words');
  check('D+7 no skip legs on a clean multi-push', out.every((o) => o.json.provider_request.route !== 'skip'),
    JSON.stringify(out.map((o) => o.json.provider_request.route)));

  // ---- E. log nodes: multi-patient zip by position ---------------------------
  console.log('E. log nodes (multi-patient zip)');
  let r = await runLog('Log WhatsApp Interaction', 'whatsapp', [
    { messages: [{ id: 'wamid.AAA' }] },
    { messages: [{ id: 'wamid.BBB' }] },
  ]);
  check('E1 two responses -> two posts', r.posts.length === 2, String(r.posts.length));
  check('E2 post 1 keys patient 1', r.posts[0].body.request_code === 'AP-1042'
    && r.posts[0].body.patient_name === 'Amina Yusuf', JSON.stringify(r.posts[0].body));
  check('E3 post 2 keys patient 2', r.posts[1].body.request_code === 'AP-1043'
    && r.posts[1].body.patient_name === 'Chidi Okonkwo', JSON.stringify(r.posts[1].body));
  check('E4 both sent with provider refs', r.posts[0].body.external_ref === 'wamid.AAA'
    && r.posts[1].body.external_ref === 'wamid.BBB');
  check('E5 summary names the disruption notice',
    r.posts[0].body.summary === 'Disruption notice sent via WhatsApp', r.posts[0].body.summary);
  check('E6 channel/provider correct', r.posts[0].body.channel === 'whatsapp'
    && r.posts[0].body.provider === 'meta_whatsapp');
  check('E7 posts go to Django interactions', r.posts[0].url === 'http://127.0.0.1:8000/api/v1/interactions/'
    && r.posts[0].headers['X-Webhook-Secret'] === 'clinic_dev_secret_2026');

  r = await runLog('Log WhatsApp Interaction', 'whatsapp', [
    { messages: [{ id: 'wamid.AAA' }] },
    { error: { message: wrap(429, { error: 'rate_limited', message: 'Too many requests, retry in 60s' }), name: 'Error' } },
  ]);
  check('E8 failure in position 2 -> failed', r.posts[1].body.status === 'failed', r.posts[1].body.status);
  check('E9 failure classified clean', /^Provider rate limit reached: Too many requests/.test(r.posts[1].body.error_detail || ''),
    r.posts[1].body.error_detail);
  check('E10 failure still attributed to patient 2', r.posts[1].body.request_code === 'AP-1043'
    && r.posts[1].body.patient_name === 'Chidi Okonkwo');

  r = await runLog('Log SMS Interaction', 'sms', [
    { external_ref: 'vb-111', status: 'ok' },
    { error: { message: 'connect ECONNREFUSED 127.0.0.1:9', name: 'Error', code: 'ECONNREFUSED' } },
  ]);
  check('E11 sms success posted', r.posts[0].body.status === 'sent' && r.posts[0].body.external_ref === 'vb-111');
  check('E12 sms transport failure explained', /refused the connection/.test(r.posts[1].body.error_detail || ''),
    r.posts[1].body.error_detail);
  check('E13 sms summary names the disruption notice',
    r.posts[0].body.summary === 'Disruption notice sent via SMS', r.posts[0].body.summary);
  check('E14 sms provider is voicebip', r.posts[0].body.provider === 'voicebip' && r.posts[0].body.channel === 'sms');

  // ---- F. skipped-channel rows ------------------------------------------------
  console.log('F. skipped channel rows');
  const skipCode = code('Log Skipped Channel');
  const skipSandbox = {
    console,
    $input: { all: () => [{ json: {
      request_id: 'AP-1042', patient_name: 'Amina Yusuf', patient_phone: '',
      provider_channel: 'sms',
      provider_request: { route: 'skip', skip_reason: 'provider_not_configured' },
    } }] },
    $env: { DJANGO_API_BASE_URL: 'http://127.0.0.1:8000/api/v1', DJANGO_WEBHOOK_SECRET: 'clinic_dev_secret_2026' },
  };
  const skipPosts = [];
  const skipFn = vm.runInNewContext('(async function () {\n' + skipCode + '\n})', skipSandbox);
  const skipOut = await skipFn.call({ helpers: { httpRequest: async (opts) => { skipPosts.push(opts); return { id: 7, status: 'queued' }; } } });
  check('F1 skip writes one queued row', skipPosts.length === 1 && skipPosts[0].body.status === 'queued');
  check('F2 deterministic skip external_ref', skipPosts[0].body.external_ref === 'skip-sms-AP-1042');
  check('F3 skip reason visible', skipPosts[0].body.error_detail === 'provider_not_configured');

  // ---- G. claim liveness gate (Gap 3) ----------------------------------------
  // Django queues a notice, then the workflow delivers it. An undo can mark
  // that notice expired in between, so "queued" is not a promise. The gate asks
  // Django immediately before any send and holds anything that is not a
  // definite yes -- including "Django could not be reached at all".
  console.log('G. claim liveness gate (fail closed)');

  const CHECK_ENV = {
    DJANGO_API_BASE_URL: 'http://127.0.0.1:8000/api/v1',
    DJANGO_WEBHOOK_SECRET: 'clinic_dev_secret_2026',
  };
  const CHECK_ITEMS = () => ([
    {
      request_id: 'AP-1042', channel: 'sms', claim_ref: 'disrupt-AP-1042-aaa-sms',
      patient_name: 'Amina Yusuf', patient_phone: '+2348031112233', message: WORDS,
    },
    {
      request_id: 'AP-1043', channel: 'whatsapp',
      claim_ref: 'disrupt-AP-1043-bbb-whatsapp',
      patient_name: 'Chidi Okonkwo', patient_phone: '+2348054445555',
      message: 'Other words',
    },
  ]);

  async function runClaimCheck(items, opts) {
    const options = opts || {};
    const calls = [];
    const warns = [];
    const sandbox = {
      console: { log: () => {}, warn: (...a) => warns.push(a.join(' ')), error: (...a) => warns.push(a.join(' ')) },
      $env: Object.prototype.hasOwnProperty.call(options, 'env') ? options.env : CHECK_ENV,
      $input: { all: () => items.map((json) => ({ json })) },
    };
    const fn = vm.runInNewContext('(async function () {\n' + code('Check Claim Liveness') + '\n})', sandbox);
    const ctx = {
      helpers: {
        httpRequest: async (req) => {
          calls.push(req);
          if (options.throws) throw new Error(options.throws);
          return options.response;
        },
      },
    };
    const result = await fn.call(ctx);
    const all = (result || []).map((i) => i.json);
    const live = all.filter((i) => i.claim_live === true);
    const held = all.filter((i) => i.claim_live !== true);
    return { all, live, held, calls, warns };
  }

  const liveMap = (refs) => {
    const map = {};
    refs.forEach((ref) => { map[ref] = { live: true, status: 'queued' }; });
    return map;
  };

  let g = await runClaimCheck(CHECK_ITEMS(), {
    response: { claims: liveMap(['disrupt-AP-1042-aaa-sms', 'disrupt-AP-1043-bbb-whatsapp']) },
  });
  check('G1 both live -> both reach the adapter', g.live.length === 2 && g.held.length === 0,
    JSON.stringify({ live: g.live.length, held: g.held.length }));
  check('G2 words are never rewritten', g.live.every((i) => i.message === WORDS || i.message === 'Other words'));
  check('G3 asks Django with the shared secret',
    g.calls.length === 1
    && g.calls[0].method === 'POST'
    && g.calls[0].url === CHECK_ENV.DJANGO_API_BASE_URL + '/webhooks/disruption-claims/check/'
    && g.calls[0].headers['X-Webhook-Secret'] === CHECK_ENV.DJANGO_WEBHOOK_SECRET,
    JSON.stringify(g.calls));
  check('G4 asks about every ref it holds',
    JSON.stringify(g.calls[0].body.claim_refs) === JSON.stringify(['disrupt-AP-1042-aaa-sms', 'disrupt-AP-1043-bbb-whatsapp']),
    JSON.stringify(g.calls[0].body));

  g = await runClaimCheck(CHECK_ITEMS(), {
    response: { claims: {
      'disrupt-AP-1042-aaa-sms': { live: false, status: 'expired' },
      'disrupt-AP-1043-bbb-whatsapp': { live: true, status: 'queued' },
    } },
  });
  check('G5 an expired claim is held, the live one still sends',
    g.live.length === 1 && g.live[0].claim_ref === 'disrupt-AP-1043-bbb-whatsapp'
    && g.held.length === 1 && g.held[0].claim_ref === 'disrupt-AP-1042-aaa-sms');
  check('G6 the held reason names expiry', g.held[0].held_reason === 'claim_expired', g.held[0].held_reason);
  check('G7 the held item is warned about once, by ref',
    g.warns.length === 1 && g.warns[0].indexOf('disrupt-AP-1042-aaa-sms') !== -1, JSON.stringify(g.warns));

  g = await runClaimCheck(CHECK_ITEMS(), {
    response: { claims: {
      'disrupt-AP-1042-aaa-sms': { live: false, status: 'sent' },
      'disrupt-AP-1043-bbb-whatsapp': { live: false, status: 'missing' },
    } },
  });
  check('G8 a sent claim is never re-sent', g.live.length === 0 && g.held.length === 2);
  check('G9 reasons distinguish already-sent from unknown',
    g.held[0].held_reason === 'claim_already_sent' && g.held[1].held_reason === 'claim_unknown',
    JSON.stringify(g.held.map((i) => i.held_reason)));

  g = await runClaimCheck(CHECK_ITEMS(), { throws: 'connect ECONNREFUSED 127.0.0.1:8000' });
  check('G10 unreachable Django -> EVERYTHING held (fail closed)',
    g.live.length === 0 && g.held.length === 2);
  check('G11 the reason says the check was unavailable',
    g.held.every((i) => i.held_reason === 'claim_check_unavailable'),
    JSON.stringify(g.held.map((i) => i.held_reason)));

  g = await runClaimCheck(CHECK_ITEMS(), { response: { error: 'INVALID_WEBHOOK_SECRET' } });
  check('G12 an answer without claims -> everything held',
    g.live.length === 0 && g.held.length === 2
    && g.held.every((i) => i.held_reason === 'claim_check_unavailable'));

  g = await runClaimCheck(CHECK_ITEMS(), {
    response: { claims: { 'disrupt-AP-1042-aaa-sms': { status: 'queued' } } },
  });
  check('G13 a missing "live: true" is not a yes',
    g.live.length === 0 && g.held.length === 2, JSON.stringify(g.held.map((i) => i.held_reason)));

  g = await runClaimCheck(CHECK_ITEMS(), { env: { DJANGO_API_BASE_URL: '', DJANGO_WEBHOOK_SECRET: '' } });
  check('G14 no Django config -> nothing asked, nothing sent',
    g.calls.length === 0 && g.live.length === 0 && g.held.length === 2);
  check('G15 unconfigured reason is explicit',
    g.held.every((i) => i.held_reason === 'claim_check_unavailable'));

  g = await runClaimCheck(CHECK_ITEMS(), { env: { DJANGO_WEBHOOK_SECRET: 's' } });
  check('G16 base URL alone is not enough', g.calls.length === 0 && g.live.length === 0);

  g = await runClaimCheck([], { response: { claims: {} } });
  check('G17 no items -> no call, no output', g.calls.length === 0 && g.live.length === 0 && g.held.length === 0);

  g = await runClaimCheck([
    Object.assign({}, CHECK_ITEMS()[0]),
    Object.assign({}, CHECK_ITEMS()[0]),
  ], { response: { claims: liveMap(['disrupt-AP-1042-aaa-sms']) } });
  check('G18 duplicate refs are asked once', JSON.stringify(g.calls[0].body.claim_refs) === JSON.stringify(['disrupt-AP-1042-aaa-sms']),
    JSON.stringify(g.calls[0].body.claim_refs));
  check('G19 duplicate items both still send', g.live.length === 2);

  g = await runClaimCheck(CHECK_ITEMS(), { response: { claims: {
    'disrupt-AP-1042-aaa-sms': { live: 'yes', status: 'queued' },
    'disrupt-AP-1043-bbb-whatsapp': { live: true, status: 'queued' },
  } } });
  check('G20 a non-boolean "live" is not a yes',
    g.live.length === 1 && g.live[0].claim_ref === 'disrupt-AP-1043-bbb-whatsapp'
    && g.held[0].held_reason === 'claim_unknown');

  // The halt log is the observable end of the dead side: one row per held
  // claim, Django untouched (a refused send must never rewrite the record).
  const haltSandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    $input: { all: () => [
      { json: { request_id: 'AP-1042', claim_ref: 'disrupt-AP-1042-aaa-sms', held_reason: 'claim_expired', claim_status: 'expired', channel: 'sms' } },
      { json: { request_id: 'AP-1043', claim_ref: 'disrupt-AP-1043-bbb-whatsapp', held_reason: 'claim_check_unavailable', claim_status: 'unknown', channel: 'whatsapp' } },
    ] },
  };
  const haltOut = vm.runInNewContext('(function () {\n' + code('Log Halted Claims') + '\n})()', haltSandbox);
  check('G21 one halt row per held claim', haltOut.length === 2, String(haltOut.length));
  check('G22 halt row keeps the ref and the reason',
    haltOut[0].json.claim_ref === 'disrupt-AP-1042-aaa-sms'
    && haltOut[0].json.held_reason === 'claim_expired'
    && haltOut[1].json.held_reason === 'claim_check_unavailable');
  check('G23 halt rows are marked not sent', haltOut.every((i) => i.json.sent === false));

  // ---- H. Gap 4: the log write-back names the claim it closes -----------------
  // The provider row is keyed by the provider's own message id, so Django needs
  // the claim_ref in the same payload to close the queued claim. Without it the
  // claim stays deliverable forever and the gate keeps saying live:true after the
  // patient has already been messaged.
  console.log('');
  console.log('H. log write-back closes the claim');
  for (const [nodeName, channel] of [['Log SMS Interaction', 'sms'],
    ['Log WhatsApp Interaction', 'whatsapp']]) {
    const sent = await runLog(nodeName, channel, [{
      messages: [{ id: 'provider-id-' + channel }], status: 'sent',
    }]);
    const body = (sent.posts[0] || {}).body || {};
    check('H1 ' + channel + ' log sends claim_ref',
      body.claim_ref === sent.bases[0].claim_ref,
      JSON.stringify(body.claim_ref));
    check('H2 ' + channel + ' log still sends the provider id as external_ref',
      body.external_ref === 'provider-id-' + channel, String(body.external_ref));
  }

  const failedLog = await runLog('Log SMS Interaction', 'sms', [{ status: 'failed' }]);
  check('H3 a failed send still names its claim',
    (failedLog.posts[0] || {}).body.claim_ref === failedLog.bases[0].claim_ref);

  const noClaim = await runLog('Log SMS Interaction', 'sms', [{ status: 'sent' }], {
    bases: [{ request_id: 'AP-1049', patient_name: 'No Claim', patient_phone: '+2348031112299',
      provider_channel: 'sms' }],
  });
  check('H4 an item without a claim sends an empty claim_ref',
    (noClaim.posts[0] || {}).body.claim_ref === '');


  console.log('');
  if (failures) {
    console.log('FAILED: ' + failures + ' check(s)');
    process.exit(1);
  } else {
    console.log('ALL PASS');
  }
})().catch((err) => {
  console.log('HARNESS ERROR: ' + (err && err.stack || err));
  process.exit(1);
});
