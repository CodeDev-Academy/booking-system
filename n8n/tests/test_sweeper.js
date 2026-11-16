// Workflow B / B.1 harness: run the SHIPPED sources from
// `n8n/02_hold_and_offer_expiry_cron.json` and assert the rebuilt graph's contract.
//
// The rebuild has one job: every 60 seconds ask Django ("POST /webhooks/expiry-sweep/")
// who expired, then DELIVER the message Django composed on the app Django chose.
// n8n decides nothing: no copy, no channel choice, no fallback URLs. The assertions
// below are that sentence, spelled out: fail-closed auth, the clean no-work
// passthrough, per-app request building (mock -> simulator, live gates), the
// claim-ref upsert, and the canonical error block.
//
// Node only - no n8n restart required.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WF_PATH = path.join(__dirname, '..', '02_hold_and_offer_expiry_cron.json');
const DISPATCH_PATH = path.join(__dirname, '..', '05_slot_offer_dispatcher.json');

const wf = JSON.parse(fs.readFileSync(WF_PATH, 'utf8'));
const dispatch = JSON.parse(fs.readFileSync(DISPATCH_PATH, 'utf8'));
const rawFile = fs.readFileSync(WF_PATH, 'utf8');

const nodeSource = (workflow, name) => {
  const node = workflow.nodes.find((n) => n.name === name);
  return node && node.parameters ? node.parameters.jsCode : null;
};
const nodeByName = (workflow, name) => workflow.nodes.find((n) => n.name === name);

let total = 0;
let failures = 0;
const check = function (label, cond, detail) {
  total++;
  if (cond) console.log('  ok   ' + label);
  else { failures++; console.log('  FAIL ' + label + (detail !== undefined ? ' -> ' + JSON.stringify(detail).slice(0, 220) : '')); }
};

// ---------------------------------------------------------------- vm plumbing
function runSync(name, sandbox) {
  const code = nodeSource(wf, name);
  if (!code) throw new Error('node not found: ' + name);
  const fn = vm.runInNewContext('(function () {\n' + code + '\n})', sandbox || {});
  return fn.call({});
}

function runAsync(name, sandbox, ctx) {
  const code = nodeSource(wf, name);
  if (!code) throw new Error('node not found: ' + name);
  const fn = vm.runInNewContext('(async function () {\n' + code + '\n})', sandbox || {});
  return fn.call(ctx || {});
}

const SECRET = 'clinic_dev_secret_2026';
const AUTH_ENV = { DJANGO_WEBHOOK_SECRET: SECRET, DJANGO_API_BASE_URL: 'http://127.0.0.1:8000/api/v1' };

const hasNode = (name) => Boolean(nodeByName(wf, name));
const requireNode = (name) => {
  check('node exists: ' + name, hasNode(name));
  return hasNode(name);
};

// Django sweep response fixtures (B.0 contract: items carry channel + message + claim_ref).
const nudgeItem = (over) => Object.assign({
  request_id: 'REQ-2026-0042',
  id: 'b0f7-uuid',
  patient_name: 'Amina Test',
  patient_phone: '+2348099977777',
  service_name: 'Dental Consultation',
  channel: 'sms',
  message: 'Friendly reminder: your appointment choices for Dental Consultation expire in 12 minutes. Reply 1 or 2 to lock in your time.',
  claim_ref: 'nudge-REQ-2026-0042-sms',
  minutes_remaining: 12,
}, over || {});
const recoveryItem = (over) => Object.assign({
  request_id: 'REQ-2026-0042',
  id: 'b0f7-uuid',
  patient_name: 'Amina Test',
  patient_phone: '+2348099977777',
  service_name: 'Dental Consultation',
  channel: 'whatsapp',
  message: 'Hello Amina Test, the previously offered times for Dental Consultation have expired. Reply RESCHEDULE and our front desk will send you fresh times.',
  claim_ref: 'recovery-REQ-2026-0042-whatsapp',
}, over || {});
const telegramItem = (over) => nudgeItem(Object.assign({
  channel: 'telegram',
  telegram_chat_id: '55882',
  reply_markup: { inline_keyboard: [[{ text: '1 - slot', callback_data: 'select_slot_7' }]] },
  claim_ref: 'nudge-REQ-2026-0042-telegram',
}, over || {}));
const emptySweep = () => ({
  timestamp: '2026-01-01T00:00:00+00:00',
  expired_offers_count: 0, expired_offer_codes: [], expired_offers: [],
  pre_expiry_nudges: [],
  expired_holds_count: 0, expired_hold_codes: [],
});

(async () => {
  console.log('A. the cron POST fails closed: env-driven URL and secret, no fallbacks');
  await runGroupA();
  await runGroupB();
  await runGroupC();
  await runGroupD();
  await runGroupE();
  await runGroupF();
  await runGroupG();

  console.log(failures ? '\nFAILED: ' + failures + ' of ' + total : '\nALL PASS (' + total + ' assertions)');
  process.exit(failures ? 1 : 0);

  // ------------------------------------------------------------------ groups
  async function runGroupA() {
    const post = nodeByName(wf, 'Trigger Django Expiry Sweeper');
    if (!requireNode('Trigger Django Expiry Sweeper')) return;
    const urlTemplate = String(post.parameters.url || '');
    const headerList = (post.parameters.headerParameters && post.parameters.headerParameters.parameters) || [];

    // Resolve the URL expression the way n8n would, against the instance's own
    // convention: DJANGO_API_BASE_URL already ends in /api/v1 (see workflow 04).
    const inner = urlTemplate.replace(/^=\{\{/, '').replace(/\}\}$/, '').trim();
    let resolved = null;
    try {
      resolved = vm.runInNewContext('(function ($env) { return (' + inner + '); })', {})(
        { DJANGO_API_BASE_URL: 'http://127.0.0.1:8000/api/v1' });
    } catch (e) { resolved = null; }
    check('A1 the resolved sweep url is exactly the expiry-sweep endpoint (no doubled /api/v1)',
      resolved === 'http://127.0.0.1:8000/api/v1/webhooks/expiry-sweep/', resolved);
    check('A2 /api/v1 appears exactly once in the resolved url',
      typeof resolved === 'string' && resolved.split('/api/v1').length - 1 === 1, resolved);
    check('A3 the url is env-driven, not hardcoded', urlTemplate.includes('$env.DJANGO_API_BASE_URL'), urlTemplate);
    check('A4 no docker-compose fallback hides a missing env', !urlTemplate.includes('backend:8000'), urlTemplate);
    check('A5 no || fallback in the url', !urlTemplate.includes('||'), urlTemplate);
    check('A6 the secret header is present', headerList.some((h) => h.name === 'X-Webhook-Secret'), headerList);
    check('A7 the secret header reads the env, not a literal',
      headerList.some((h) => h.name === 'X-Webhook-Secret' && String(h.value).includes('$env.DJANGO_WEBHOOK_SECRET')),
      headerList.map((h) => h.value));
    check('A8 no literal secret anywhere in the file', !rawFile.includes(SECRET));
    check('A9 the sweep body names the n8n cron actor', String(post.parameters.jsonBody || '').includes('n8n_cron_sweeper'), post.parameters.jsonBody);
    const sched = nodeByName(wf, '60-Second Sweeper Schedule');
    check('A10 the schedule fires every 60 seconds', sched && JSON.stringify(sched.parameters).includes('*/1 * * * *'),
      sched && JSON.stringify(sched.parameters).slice(0, 160));
  }

  async function runGroupB() {
    console.log("\nB. the sweep response is split into deliverable items, nothing else");
    if (!requireNode('Parse Sweep Response')) return;

    let out = runSync('Parse Sweep Response', {
      $input: { first: () => ({ json: Object.assign(emptySweep(), {
        expired_offers: [recoveryItem()],
        pre_expiry_nudges: [nudgeItem()],
      }) }) },
    });
    check('B1 a recovery item and a nudge item become two outputs', out.length === 2, out.map((i) => i.json.kind));
    const kinds = out.map((i) => i.json.kind).sort();
    check('B2 the kind travels with the item (nudge / recovery)', JSON.stringify(kinds) === JSON.stringify(['nudge', 'recovery']), kinds);
    const recovery = out.map((i) => i.json).find((j) => j.kind === 'recovery');
    check('B3 the message passes through verbatim', recovery && recovery.message === recoveryItem().message, recovery && recovery.message);
    check('B4 the claim_ref passes through verbatim', recovery && recovery.claim_ref === 'recovery-REQ-2026-0042-whatsapp', recovery && recovery.claim_ref);

    out = runSync('Parse Sweep Response', { $input: { first: () => ({ json: emptySweep() }) } });
    check('B5 an empty sweep passes through as zero items (clean no-op)', out.length === 0, out);

    out = runSync('Parse Sweep Response', {
      $input: { first: () => ({ json: Object.assign(emptySweep(), {
        pre_expiry_nudges: [nudgeItem({ message: '' }), nudgeItem({ claim_ref: '' }), nudgeItem()],
      }) }) },
    });
    check('B6 a malformed item (no words or no claim) is dropped, not sent', out.length === 1, out);

    out = runSync('Parse Sweep Response', {
      $input: { first: () => ({ json: Object.assign(emptySweep(), { pre_expiry_nudges: [telegramItem()] }) }) },
    });
    const tg = out[0] && out[0].json;
    check('B7 a telegram item keeps its chat id', tg && tg.telegram_chat_id === '55882', tg && tg.telegram_chat_id);
    check('B8 a telegram item keeps its keyboard', tg && tg.reply_markup && Array.isArray(tg.reply_markup.inline_keyboard), tg && tg.reply_markup);
  }

  async function runGroupC() {
    console.log('\nC. each app gets the right request; mock mode uses the simulator');
    if (!requireNode('Build Provider Requests')) return;

    const runBuild = (items, env) => runSync('Build Provider Requests', {
      $input: { all: () => items.map((json) => ({ json })) },
      $env: Object.assign({ DJANGO_API_BASE_URL: 'http://x/api/v1' }, env || {}),
    });

    // Mock mode: PROVIDER_MOCK unset defaults to mock.
    let out = runBuild([nudgeItem()], {});
    let j = out[0] && out[0].json;
    check('C1 unset PROVIDER_MOCK means mock mode', j && j.adapter_meta && j.adapter_meta.provider_mock === true, j && j.adapter_meta);
    check('C2 a mock SMS goes to the sms simulator', j && /\/provider-sim\/sms$/.test(String(j.provider_request.url)), j && j.provider_request.url);
    check('C3 the mock SMS body carries Django\u2019s words verbatim', j && j.provider_request.body && j.provider_request.body.message === nudgeItem().message,
      j && j.provider_request.body);
    check('C4 the sms context carries the claim_ref', j && j.context && j.context.claim_ref === 'nudge-REQ-2026-0042-sms', j && j.context);

    out = runBuild([recoveryItem()], {});
    j = out[0] && out[0].json;
    check('C5 a mock WhatsApp goes to the whatsapp simulator', j && /\/provider-sim\/whatsapp$/.test(String(j.provider_request.url)), j && j.provider_request.url);
    check('C6 the mock WhatsApp body carries Django\u2019s words', j && JSON.stringify(j.provider_request.body).includes('RESCHEDULE'), j && JSON.stringify(j.provider_request.body).slice(0, 160));

    out = runBuild([telegramItem()], { TELEGRAM_BOT_TOKEN: 'tok123' });
    j = out[0] && out[0].json;
    check('C7 a telegram item targets the bot API sendMessage', j && /https:\/\/api\.telegram\.org\/bottok123\/sendMessage/.test(String(j.provider_request.url)), j && j.provider_request.url);
    check('C8 the telegram body carries chat id, words, HTML mode and the keyboard',
      j && j.provider_request.body && j.provider_request.body.chat_id === '55882'
      && j.provider_request.body.text === telegramItem().message
      && j.provider_request.body.parse_mode === 'HTML'
      && j.provider_request.body.reply_markup.inline_keyboard.length === 1,
      j && j.provider_request.body);
    check('C9 a telegram send item keeps the claim_ref in its context', j && j.context && j.context.claim_ref === 'nudge-REQ-2026-0042-telegram', j && j.context);

    // Live mode gates.
    out = runBuild([nudgeItem()], { PROVIDER_MOCK: 'false', VOICEBIP_API_URL: 'https://voicebip.example', VOICEBIP_API_KEY: 'k1' });
    j = out[0] && out[0].json;
    check('C10 a live SMS targets the provider url', j && j.provider_request.url === 'https://voicebip.example/sms', j && j.provider_request.url);
    check('C11 a live SMS authorizes with the provider key', j && j.provider_request.headers && j.provider_request.headers.Authorization === 'Bearer k1', j && j.provider_request.headers);

    out = runBuild([nudgeItem()], { PROVIDER_MOCK: 'false' });
    j = out[0] && out[0].json;
    check('C12 a live SMS without provider credentials is a skip, not a send', j && j.provider_request.route === 'skip', j && j.provider_request);
    check('C13 the skip names its reason', j && j.provider_request.skip_reason === 'provider_not_configured', j && j.provider_request.skip_reason);
    check('C14 a skipped leg still carries the claim_ref for the skip log', j && j.context && j.context.claim_ref === 'nudge-REQ-2026-0042-sms', j && j.context);

    out = runBuild([recoveryItem()], { PROVIDER_MOCK: 'false', WHATSAPP_PHONE_NUMBER_ID: 'pn', WHATSAPP_ACCESS_TOKEN: 'wt' });
    j = out[0] && out[0].json;
    check('C15 a live WhatsApp without an approved template is skipped', j && j.provider_request.skip_reason === 'whatsapp_template_not_configured', j && j.provider_request);

    out = runBuild([recoveryItem()], { PROVIDER_MOCK: 'false', WHATSAPP_PHONE_NUMBER_ID: 'pn', WHATSAPP_ACCESS_TOKEN: 'wt', WHATSAPP_TEMPLATE_NAME: 'clinic_expiry_notice' });
    j = out[0] && out[0].json;
    check('C16 a live WhatsApp with a template builds a template body', j && j.provider_request.body && j.provider_request.body.type === 'template'
      && j.provider_request.body.template.name === 'clinic_expiry_notice', j && j.provider_request.body);
    check('C17 the template parameters carry Django\u2019s words', j && JSON.stringify(j.provider_request.body.template.components).includes('RESCHEDULE'),
      JSON.stringify(j && j.provider_request.body && j.provider_request.body.template));

    out = runBuild([telegramItem()], {});
    j = out[0] && out[0].json;
    check('C18 a telegram item without a bot token is skipped', j && j.provider_request.route === 'skip' && j.provider_request.skip_reason === 'provider_not_configured', j && j.provider_request);
  }

  async function runGroupD() {
    console.log('\nD. the switch routes by app, and every wire lands where it should');
    const sw = nodeByName(wf, 'Route by Channel');
    check('D1 a switch node routes the three apps', Boolean(sw) && sw.type === 'n8n-nodes-base.switch', sw && sw.type);
    const conn = wf.connections['Route by Channel'];
    const outs = conn && conn.main ? conn.main.map((o) => (o && o[0] ? o[0].node : null)) : [];
    check('D2 output 1 is the telegram send', outs[0] === 'Send Telegram Message', outs);
    check('D3 output 2 is the SMS send', outs[1] === 'Send SMS (VoiceBip)', outs);
    check('D4 output 3 is the WhatsApp send', outs[2] === 'Send WhatsApp Message', outs);
    check('D5 output 4 is the skip log', outs[3] === 'Log Skipped Leg', outs);

    const chain = wf.connections['Parse Sweep Response'];
    check('D6 parse feeds the builder', Boolean(chain && chain.main && chain.main[0] && chain.main[0][0] && chain.main[0][0].node === 'Build Provider Requests'), chain);
    const toSwitch = wf.connections['Build Provider Requests'];
    check('D7 the builder feeds the switch', Boolean(toSwitch && toSwitch.main && toSwitch.main[0] && toSwitch.main[0][0] && toSwitch.main[0][0].node === 'Route by Channel'), toSwitch);
  }

  async function runGroupE() {
    console.log('\nE. every send node exposes its failure to the log');
    const senders = ['Send Telegram Message', 'Send SMS (VoiceBip)', 'Send WhatsApp Message'];
    check('E1 all three send nodes exist', senders.every(hasNode), senders.map((n) => hasNode(n)));
    check('E2 a send failure has a wire to the log (onError)', senders.every((n) => { const x = nodeByName(wf, n); return x && x.onError === 'continueErrorOutput'; }),
      senders.map((n) => { const x = nodeByName(wf, n); return x && x.onError; }));
    const tg = nodeByName(wf, 'Send Telegram Message');
    check('E3 the send nodes push the built body', senders.every((n) => {
      const x = nodeByName(wf, n);
      return x && String(x.parameters.jsonBody || '').includes('provider_request.body');
    }), null);
    check('E4 the telegram send adds no provider Authorization header', tg && (!tg.parameters.headerParameters || !tg.parameters.headerParameters.parameters.some((h) => h.name === 'Authorization')), tg && tg.parameters.headerParameters);
    const sms = nodeByName(wf, 'Send SMS (VoiceBip)');
    check('E5 the sms send authorizes from the built request', sms && sms.parameters.headerParameters.parameters.some((h) => h.name === 'Authorization' && String(h.value).includes('provider_request.headers.Authorization')), sms && sms.parameters.headerParameters);

    const conn = wf.connections;
    const wireTo = (nodeName, outputIndex) => {
      const c = conn[nodeName] && conn[nodeName].main && conn[nodeName].main[outputIndex];
      return c && c[0] ? c[0].node : null;
    };
    check('E6 telegram success and failure both reach its log',
      wireTo('Send Telegram Message', 0) === 'Log Telegram Outcome' && wireTo('Send Telegram Message', 1) === 'Log Telegram Outcome',
      ['Send Telegram Message'].map((n) => [wireTo(n, 0), wireTo(n, 1)]));
    check('E7 sms success and failure both reach its log',
      wireTo('Send SMS (VoiceBip)', 0) === 'Log SMS Outcome' && wireTo('Send SMS (VoiceBip)', 1) === 'Log SMS Outcome',
      ['Send SMS (VoiceBip)'].map((n) => [wireTo(n, 0), wireTo(n, 1)]));
    check('E8 whatsapp success and failure both reach its log',
      wireTo('Send WhatsApp Message', 0) === 'Log WhatsApp Outcome' && wireTo('Send WhatsApp Message', 1) === 'Log WhatsApp Outcome',
      ['Send WhatsApp Message'].map((n) => [wireTo(n, 0), wireTo(n, 1)]));
  }

  async function runGroupF() {
    console.log('\nF. the log nodes upsert the claim row: sent, failed, or skipped');
    const loggers = ['Log Telegram Outcome', 'Log SMS Outcome', 'Log WhatsApp Outcome'];
    const allLoggers = loggers.every(hasNode);
    check('F1 all three log nodes exist', allLoggers, loggers.map((n) => hasNode(n)));
    requireNode('Log Skipped Leg');

    // Drift guard: the canonical classification block must be a byte-identical copy.
    const block = (src) => {
      const start = src.indexOf('// >>> provider-error-classification');
      const end = src.indexOf('// <<< provider-error-classification');
      return (start >= 0 && end > start) ? src.slice(start, end + '// <<< provider-error-classification'.length) : null;
    };
    const canonical = block(nodeSource(dispatch, 'Log SMS Interaction') || '');
    check('F2 the canonical block exists in 05', Boolean(canonical));
    for (const name of loggers) {
      const src = nodeSource(wf, name) || '';
      check('F3 ' + name + ' carries the canonical block', Boolean(block(src)), 'missing');
      check('F4 ' + name + ' block is byte-identical to 05', block(src) === canonical, 'drifted from 05');
    }

    // Behaviour: run each log node ONCE per run (n8n default mode: run once for
    // all items), zipping responses to this channel's adapter items by position.
    if (allLoggers) {
    const mkSandbox = (responses, adapterItems) => ({
      $input: { all: () => responses.map((json) => ({ json })), item: undefined },
      $: (name) => ({ all: () => adapterItems.map((json) => ({ json })) }),
      $env: AUTH_ENV,
    });
    const httpCalls = [];
    const ctx = { helpers: { httpRequest: async (opts) => { httpCalls.push(opts); return { id: 'row-1', status: 'sent' }; } } };

    const adapterItems = [nudgeItem().adapter || { provider_channel: 'sms', context: { claim_ref: 'nudge-REQ-2026-0042-sms', request_id: 'REQ-2026-0042', patient_name: 'Amina Test', patient_phone: '+2348099977777', channel: 'sms', kind: 'nudge' } }];
    const successResponse = { message_id: 'sms-99', status: 'sent' };
    await runAsync('Log SMS Outcome', mkSandbox([successResponse], adapterItems), ctx);
    let payload = httpCalls[0] && httpCalls[0].body;
    check('F5 the outcome is logged to the interactions endpoint', httpCalls[0] && /\/interactions\/$/.test(String(httpCalls[0].url)), httpCalls[0] && httpCalls[0].url);
    check('F6 the log call authorizes with the webhook secret', httpCalls[0] && httpCalls[0].headers && httpCalls[0].headers['X-Webhook-Secret'] === SECRET, httpCalls[0] && httpCalls[0].headers);
    check('F7 a successful send upserts the CLAIM REF, not a provider id', payload && payload.external_ref === 'nudge-REQ-2026-0042-sms', payload && payload.external_ref);
    check('F8 a successful send logs status sent', payload && payload.status === 'sent', payload && payload.status);
    check('F9 the log row names the request', payload && payload.request_code === 'REQ-2026-0042', payload && payload.request_code);

    // Failure path: a provider error must classify and log failed.
    const failureResponse = { error: { message: '404 - "{\\"code\\":404,\\"message\\":\\"Not found\\"}"' } };
    await runAsync('Log SMS Outcome', mkSandbox([failureResponse], adapterItems), ctx);
    payload = httpCalls[1] && httpCalls[1].body;
    check('F10 a failed send logs status failed', payload && payload.status === 'failed', payload && payload.status);
    check('F11 the failure carries a readable sentence', payload && typeof payload.error_detail === 'string' && payload.error_detail.length > 3, payload && payload.error_detail);

    // THE pairing contract: TWO sms responses in ONE run must zip to their own
    // claim refs by position (this is the defect the live proof caught: a log
    // node that ran once-per-run but paired with [0] silently dropped item 2).
    const twoCtx = [1, 2].map((n) => ({ provider_channel: 'sms', context: { claim_ref: 'nudge-REQ-2026-00' + n + '-sms', request_id: 'REQ-2026-00' + n, patient_name: 'P' + n, patient_phone: '+234809997777' + n, channel: 'sms', kind: 'nudge' } }));
    const httpCalls2 = [];
    const ctx2 = { helpers: { httpRequest: async (opts) => { httpCalls2.push(opts); return {}; } } };
    await runAsync('Log SMS Outcome', mkSandbox([{ message_id: 'a' }, { message_id: 'b' }], twoCtx), ctx2);
    check('F12 two responses in one run pair with their own claim_refs by position',
      httpCalls2.length === 2
      && httpCalls2[0].body.external_ref === 'nudge-REQ-2026-001-sms' && httpCalls2[1].body.external_ref === 'nudge-REQ-2026-002-sms',
      httpCalls2.map((c) => c.body.external_ref));

    // Best-effort: a Django outage while logging must not throw.
    const failingCtx = { helpers: { httpRequest: async () => { throw new Error('boom'); } } };
    let logged = null;
    try {
      const out = await runAsync('Log SMS Outcome', mkSandbox([{ message_id: 'x' }], adapterItems), failingCtx);
      logged = out && out[0] && out[0].json;
    } catch (e) { logged = { threw: String(e) }; }
    check('F13 a logging outage never crashes the run', logged && logged.interaction_log && logged.interaction_log.ok === false, logged);

    // A response with no paired adapter context must NOT post an empty-claim row.
    const orphanCtx = { helpers: { httpRequest: async (opts) => { httpCalls2.push(opts); return {}; } } };
    await runAsync('Log SMS Outcome', mkSandbox([{ message_id: 'orphan' }], []), orphanCtx);
    check('F13b an unpaired response posts nothing (never an empty claim row)', httpCalls2.length === 2, httpCalls2.length);

    // Skip log: an unsent leg must upsert the claim row as failed with the reason.
    const skipItem = { context: { claim_ref: 'recovery-REQ-2026-0042-whatsapp', request_id: 'REQ-2026-0042', patient_name: 'Amina Test', patient_phone: '+2348099977777', channel: 'whatsapp', kind: 'recovery' }, provider_channel: 'whatsapp' };
    const skipCalls = [];
    const skipCtx = { helpers: { httpRequest: async (opts) => { skipCalls.push(opts); return {}; } } };
    await runAsync('Log Skipped Leg', {
      $input: { all: () => [{ json: { skip_reason: 'whatsapp_template_not_configured', context: skipItem.context } }] },
      $env: AUTH_ENV,
    }, skipCtx);
    payload = skipCalls[0] && skipCalls[0].body;
    check('F14 a skipped leg upserts its claim_ref as failed', payload && payload.external_ref === 'recovery-REQ-2026-0042-whatsapp' && payload.status === 'failed', payload);
    check('F15 the skip summary names the reason', payload && String(payload.summary).includes('whatsapp_template_not_configured'), payload && payload.summary);
    }
  }

  async function runGroupG() {
    console.log('\nG. n8n writes no patient-facing words');
    check('G1 the file never mentions the recovery word', !rawFile.includes('RESCHEDULE'));
    check('G2 the file never writes reminder sentences', !rawFile.includes('expire in'), null);
    check('G3 the file never writes the blueprint nudge', !rawFile.includes('Friendly reminder'));
  }
})().catch((e) => {
  console.error('\nHARNESS ERROR: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
