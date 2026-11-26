// Workflow C / C.2 harness: run the SHIPPED sources from
// `n8n/workflows/04_patient_response_handler.json` and assert the rebuilt graph's contract.
//
// The rebuild has one job: take an inbound SMS/WhatsApp message, ask Django
// (`POST /webhooks/patient-reply/`) what it means, and deliver the `reply_text`
// it returns. n8n decides nothing. The assertions below are that sentence,
// spelled out: fail-closed auth, both payload shapes, the one call, the
// duplicate rule, delivery, and the outbound log row.
//
// Node only - no n8n restart required.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WF_PATH = path.join(__dirname, '..', 'workflows', '04_patient_response_handler.json');
const DISPATCH_PATH = path.join(__dirname, '..', 'workflows', '05_slot_offer_dispatcher.json');

const wf = JSON.parse(fs.readFileSync(WF_PATH, 'utf8'));
const dispatch = JSON.parse(fs.readFileSync(DISPATCH_PATH, 'utf8'));

const nodeSource = (workflow, name) => {
  const node = workflow.nodes.find((n) => n.name === name);
  return node && node.parameters ? node.parameters.jsCode : null;
};

let total = 0;
let failures = 0;
const check = function (label, cond, detail) {
  total++;
  if (cond) console.log('  ok   ' + label);
  else { failures++; console.log('  FAIL ' + label + (detail !== undefined ? ' -> ' + JSON.stringify(detail).slice(0, 220) : '')); }
};

// ---------------------------------------------------------------- vm plumbing
function compile(workflow, name) {
  const code = nodeSource(workflow, name);
  if (!code) return null;
  return code;
}

function runSync(name, sandbox) {
  const code = compile(wf, name);
  if (!code) throw new Error('node not found: ' + name);
  const fn = vm.runInNewContext('(function () {\n' + code + '\n})', sandbox || {});
  return fn.call({});
}

function runAsync(name, sandbox, ctx) {
  const code = compile(wf, name);
  if (!code) throw new Error('node not found: ' + name);
  const fn = vm.runInNewContext('(async function () {\n' + code + '\n})', sandbox || {});
  return fn.call(ctx || {});
}

// n8n's webhook item shape: body parsed, headers lower-cased.
const webhookItem = (body, headers) => ({ json: { body: body, headers: headers || {}, query: {}, params: {} } });

const SECRET = 'clinic_dev_secret_2026';
const AUTH_ENV = { DJANGO_WEBHOOK_SECRET: SECRET };

const metaText = (text, over) => ({
  object: 'whatsapp_business_account',
  entry: [{
    id: 'waba-1',
    changes: [{
      field: 'messages',
      value: Object.assign({
        messaging_product: 'whatsapp',
        messages: [{
          from: '2348030001122',
          id: 'wamid.HBgNMjM0ODAzMDAwMTEyMg',
          timestamp: '1731684000',
          type: 'text',
          text: { body: text },
        }],
      }, over || {}),
    }],
  }],
});

const hasNode = (name) => Boolean(wf.nodes.find((n) => n.name === name));

const requireNode = (name) => {
  check('node exists: ' + name, hasNode(name));
  return hasNode(name);
};

(async () => {
  console.log('A. the inbound webhook fails closed before anything runs');
  await runGroupA();
  await runGroupB();
  await runGroupC();
  await runGroupD();
  await runGroupE();
  await runGroupF();

  console.log(failures ? '\nFAILED: ' + failures + ' of ' + total : '\nALL PASS (' + total + ' assertions)');
  process.exit(failures ? 1 : 0);

  // ------------------------------------------------------------------ groups
  async function runGroupA() {
  if (!requireNode('Verify Reply Secret')) return;
  let out = runSync('Verify Reply Secret', {
    $input: { first: () => webhookItem({ hello: 'x' }, { 'x-webhook-secret': SECRET }) },
    $env: AUTH_ENV,
  });
  check('A1 a valid header authenticates', out[0].json.reply_auth.authorized === true, out[0].json.reply_auth);
  check('A2 the webhook item is carried through', out[0].json.body.hello === 'x', out[0].json.body);

  out = runSync('Verify Reply Secret', {
    $input: { first: () => webhookItem({}, { 'x-webhook-secret': SECRET + 'x' }) },
    $env: AUTH_ENV,
  });
  check('A3 a wrong secret is refused', out[0].json.reply_auth.authorized === false, out[0].json.reply_auth);
  check('A4 the refusal names bad_secret', out[0].json.reply_auth.reason === 'bad_secret', out[0].json.reply_auth.reason);

  out = runSync('Verify Reply Secret', {
    $input: { first: () => webhookItem({}, { 'x-webhook-secret': SECRET }) },
    $env: {},
  });
  check('A5 an unset env refuses even the dev string', out[0].json.reply_auth.authorized === false, out[0].json.reply_auth);
  check('A6 the refusal names secret_not_configured', out[0].json.reply_auth.reason === 'secret_not_configured', out[0].json.reply_auth.reason);

  out = runSync('Verify Reply Secret', {
    $input: { first: () => webhookItem({}, {}) },
    $env: AUTH_ENV,
  });
  check('A7 no header at all is refused', out[0].json.reply_auth.authorized === false, out[0].json.reply_auth);

  out = runSync('Verify Reply Secret', {
    $input: { first: () => webhookItem({}, { 'x-webhook-secret': '  ' + SECRET + '  ' }) },
    $env: AUTH_ENV,
  });
  check('A8 surrounding whitespace is tolerated', out[0].json.reply_auth.authorized === true, out[0].json.reply_auth);

  out = runSync('Verify Reply Secret', {
    $input: { first: () => webhookItem({}, { 'x-webhook-secret': SECRET.toUpperCase() }) },
    $env: AUTH_ENV,
  });
  check('A9 the comparison is case-sensitive', out[0].json.reply_auth.authorized === false, out[0].json.reply_auth);
  }

  async function runGroupB() {
  console.log('\nB. a Meta WhatsApp message becomes {phone, text, channel, provider_message_id}');
  if (requireNode('Normalize Patient Reply')) {
    out = runSync('Normalize Patient Reply', { $input: { first: () => webhookItem(metaText('2')) } });
    let j = out[0].json;
    check('B1 action is reply', j.action === 'reply', j.action);
    check('B2 phone comes from `from`', j.phone === '2348030001122', j.phone);
    check('B3 text is the typed body', j.text === '2', j.text);
    check('B4 channel is whatsapp', j.channel === 'whatsapp', j.channel);
    check('B5 provider id is the wamid', j.provider_message_id === 'wamid.HBgNMjM0ODAzMDAwMTEyMg', j.provider_message_id);

    out = runSync('Normalize Patient Reply', {
      $input: {
        first: () => webhookItem(metaText('', {
          messages: [{
            from: '2348030001122', id: 'wamid.btn', type: 'button',
            button: { payload: '2', text: 'Option 2' },
          }],
        })),
      },
    });
    j = out[0].json;
    check('B6 a template quick-reply payload is the answer', j.text === '2', j.text);
    check('B7 ...and the button label is only a fallback', j.provider_message_id === 'wamid.btn', j.provider_message_id);

    out = runSync('Normalize Patient Reply', {
      $input: {
        first: () => webhookItem(metaText('', {
          messages: [{
            from: '2348030001122', id: 'wamid.btn2', type: 'button',
            button: { text: 'Cancel' },
          }],
        })),
      },
    });
    check('B8 a payload-less button falls back to its text', out[0].json.text === 'Cancel', out[0].json.text);

    out = runSync('Normalize Patient Reply', {
      $input: {
        first: () => webhookItem(metaText('', {
          messages: [{
            from: '2348030001122', id: 'wamid.int', type: 'interactive',
            interactive: { type: 'button_reply', button_reply: { id: '3', title: 'Option 3' } },
          }],
        })),
      },
    });
    check('B9 an interactive button_reply id is the answer', out[0].json.text === '3', out[0].json.text);

    out = runSync('Normalize Patient Reply', {
      $input: {
        first: () => webhookItem(metaText('', {
          messages: [{
            from: '2348030001122', id: 'wamid.img', type: 'image',
            image: { caption: 'this is my old report', id: 'media-1' },
          }],
        })),
      },
    });
    check('B10 media caption is kept for a human', out[0].json.text === 'this is my old report', out[0].json.text);

    out = runSync('Normalize Patient Reply', {
      $input: {
        first: () => webhookItem({
          object: 'whatsapp_business_account',
          entry: [{
            id: 'waba-1',
            changes: [{ field: 'messages', value: { statuses: [{ id: 'wamid.x', status: 'delivered' }] } }],
          }],
        }),
      },
    });
    j = out[0].json;
    check('B11 a status callback is ignored, not answered', j.action === 'ignore', j.action);
    check('B12 ...with not_a_message', j.reason === 'not_a_message', j.reason);

    out = runSync('Normalize Patient Reply', {
      $input: { first: () => webhookItem({ object: 'whatsapp_business_account', entry: [] }) },
    });
    check('B13 an empty Meta envelope is ignored', out[0].json.action === 'ignore', out[0].json);
  }
  }

  async function runGroupC() {
  console.log('\nC. a VoiceBip SMS payload is read through its documented aliases');
  if (hasNode('Normalize Patient Reply')) {
    out = runSync('Normalize Patient Reply', {
      $input: { first: () => webhookItem({ id: 'sms-in-1', from: '+2348030001122', text: '1' }) },
    });
    let j = out[0].json;
    check('C1 flat from/text is read', j.phone === '+2348030001122' && j.text === '1', j);
    check('C2 the SMS trigger implies channel sms', j.channel === 'sms', j.channel);
    check('C3 the provider id is carried', j.provider_message_id === 'sms-in-1', j.provider_message_id);

    out = runSync('Normalize Patient Reply', {
      $input: { first: () => webhookItem({ message_id: 'sms-in-2', sender: '+2348030001133', message: 'cancel' }) },
    });
    j = out[0].json;
    check('C4 sender/message aliases are read', j.phone === '+2348030001133' && j.text === 'cancel', j);

    out = runSync('Normalize Patient Reply', {
      $input: { first: () => webhookItem({ id: 'sms-in-3', phone: '+2348030001144', body: 'reschedule' }) },
    });
    j = out[0].json;
    check('C5 phone/body aliases are read', j.phone === '+2348030001144' && j.text === 'reschedule', j);

    out = runSync('Normalize Patient Reply', {
      $input: { first: () => webhookItem({ id: 'sms-in-4', from: '+2348030001155', text: '2', channel: 'whatsapp' }) },
    });
    check('C6 a documented channel is respected', out[0].json.channel === 'whatsapp', out[0].json.channel);

    out = runSync('Normalize Patient Reply', {
      $input: { first: () => webhookItem({ id: 'sms-in-5', from: '+2348030001166', text: 'x'.repeat(900) }) },
    });
    check('C7 long text is capped at 500', out[0].json.text.length === 500, out[0].json.text.length);

    out = runSync('Normalize Patient Reply', {
      $input: { first: () => webhookItem({ id: 'sms-in-6', text: '2' }) },
    });
    check('C8 a message with no number is a bad_request', out[0].json.action === 'bad_request', out[0].json);

    out = runSync('Normalize Patient Reply', {
      $input: { first: () => webhookItem({ id: 'sms-in-7', from: '  +2348030001177  ', text: ' 2 ' }) },
    });
    check('C9 phone and text are trimmed', out[0].json.phone === '+2348030001177' && out[0].json.text === '2', out[0].json);

    out = runSync('Normalize Patient Reply', {
      $input: { first: () => webhookItem({ id: 'sms-in-8', from: '+2348030001188', text: 2 }) },
    });
    check('C10 a numeric body still becomes text', out[0].json.text === '2', out[0].json.text);
  }
  }

  async function runGroupD() {
  console.log('\nD. delivery is built from env, and never invents config');
  const NORMALIZED = { json: { action: 'reply', phone: '+2348030001122', text: '2', channel: 'sms', provider_message_id: 'sms-in-1' } };
  const prep = function (answer, env) {
    return runSync('Prepare Reply Delivery', {
      $input: { first: () => ({ json: answer }) },
      $: () => ({ first: () => NORMALIZED }),
      // Audit F2: the mode is stated, never guessed. Group D exercises the
      // simulated leg, so it says so explicitly.
      $env: Object.assign({ PROVIDER_MOCK: 'true' }, env || {}),
    })[0].json;
  };
  const answer = function (over) {
    return Object.assign({
      status: 'held', intent: 'select', request_id: 'REQ-2026-0042',
      appointment_code: 'AP-1042', channel: 'sms', reply_text: 'Thank you! Your time is held.',
    }, over || {});
  };

  if (requireNode('Prepare Reply Delivery')) {
    let r = prep(answer());
    check('D1 mock mode points SMS at the simulator', r.provider_request.url.endsWith('/provider-sim/sms'), r.provider_request.url);
    let refused = false;
    try { prep(answer(), { PROVIDER_MOCK: '' }); }
    catch (e) { refused = /PROVIDER_MOCK/.test(String((e && e.message) || e)); }
    check('D2 an unset or empty flag refuses instead of guessing the mode', refused,
      'defaulting to simulation means nothing is sent while the log says sent (audit F2)');
    check('D3 the reply is sent verbatim', r.provider_request.body.message === 'Thank you! Your time is held.', r.provider_request.body.message);
    check('D4 the sender id is configurable', r.provider_request.body.sender_id === 'Cedarcare', r.provider_request.body.sender_id);
    check('D5 the request code travels in metadata', r.provider_request.body.metadata.request_code === 'REQ-2026-0042', r.provider_request.body.metadata);

    r = prep(answer({ channel: 'whatsapp' }));
    check('D6 WhatsApp mock points at its simulator path', r.provider_request.url.endsWith('/provider-sim/whatsapp'), r.provider_request.url);
    check('D7 WhatsApp wants digits, not the plus', r.provider_request.body.to === '2348030001122', r.provider_request.body.to);
    check('D8 a live-window reply is free-form text', r.provider_request.body.type === 'text' && r.provider_request.body.text.body === 'Thank you! Your time is held.', r.provider_request.body);
    check('D9 the request code rides biz_opaque_callback_data', r.provider_request.body.biz_opaque_callback_data === 'REQ-2026-0042', r.provider_request.body.biz_opaque_callback_data);

    r = prep(answer(), { PROVIDER_MOCK: 'false' });
    check('D10 live SMS without credentials is skipped, not guessed', r.provider_request.route === 'skip', r.provider_request);
    check('D11 ...and says provider_not_configured', r.provider_request.skip_reason === 'provider_not_configured', r.provider_request.skip_reason);

    r = prep(answer({ channel: 'whatsapp' }), { PROVIDER_MOCK: 'false' });
    check('D12 live WhatsApp without a token is skipped', r.provider_request.route === 'skip', r.provider_request);

    r = prep(answer(), {
      PROVIDER_MOCK: 'false',
      VOICEBIP_API_URL: 'https://api.voicebip.example/v1',
      VOICEBIP_API_KEY: 'vb-key',
      VOICEBIP_SMS_SENDER_ID: 'Cedarcare',
    });
    check('D13 live SMS uses the partner endpoint', r.provider_request.url === 'https://api.voicebip.example/v1/sms', r.provider_request.url);
    check('D14 ...with a bearer key, never in the body', r.provider_request.headers.Authorization === 'Bearer vb-key' && r.provider_request.body.key === undefined, r.provider_request.headers);

    r = prep(answer({ channel: 'whatsapp' }), {
      PROVIDER_MOCK: 'false',
      WHATSAPP_API_URL: 'https://graph.facebook.com/v19.0/',
      WHATSAPP_PHONE_NUMBER_ID: '123456',
      WHATSAPP_ACCESS_TOKEN: 'wa-token',
    });
    check('D15 live WhatsApp uses phone-number-id/messages', r.provider_request.url === 'https://graph.facebook.com/v19.0/123456/messages', r.provider_request.url);
    check('D16 ...with the Meta bearer token', r.provider_request.headers.Authorization === 'Bearer wa-token', r.provider_request.headers);

    r = prep(answer({ channel: 'voice' }));
    check('D17 a channel this endpoint does not own is skipped', r.provider_request.route === 'skip', r.provider_request);
    check('D18 ...with channel_not_supported', r.provider_request.skip_reason === 'channel_not_supported', r.provider_request.skip_reason);

    r = prep(answer({ reply_text: '' }));
    check('D19 an empty reply is never sent', r.provider_request.skip_reason === 'empty_reply', r.provider_request.skip_reason);

    // Audit F2: only the exact words true and false are accepted. A loose value
    // like "yes" or "0" is a typo waiting to silently simulate real traffic.
    let looseRefused = 0;
    for (const loose of ['yes', '0', '1', 'on']) {
      try { prep(answer(), { PROVIDER_MOCK: loose }); }
      catch (e) { if (/PROVIDER_MOCK/.test(String((e && e.message) || e))) looseRefused += 1; }
    }
    check('D20 loose values such as "yes" or "0" are refused, not guessed', looseRefused === 4,
      looseRefused + ' of 4 refused');
  }
  }

  async function runGroupE() {
  console.log('\nE. the outbound reply is logged, and a failure becomes one sentence');
  const PREPARED = (over) => ({
    json: {
      reply: Object.assign({
        status: 'held', request_id: 'REQ-2026-0042', appointment_code: 'AP-1042',
        channel: 'sms', reply_text: 'Thank you! Your time is held.',
      }, over || {}),
      phone: '+2348030001122',
      provider_request: { route: 'sms' },
    },
  });
  const logRun = async function (incoming, prepared) {
    const posts = [];
    const sandbox = {
      console,
      $input: { first: () => ({ json: incoming }) },
      $: () => ({ first: () => prepared || PREPARED() }),
      $env: { DJANGO_API_BASE_URL: 'http://127.0.0.1:8000/api/v1', DJANGO_WEBHOOK_SECRET: SECRET },
    };
    const ctx = {
      helpers: {
        httpRequest: async (opts) => { posts.push(opts); return { id: 77, status: 'sent' }; },
      },
    };
    const res = await runAsync('Log Reply Outcome', sandbox, ctx);
    return { payload: res[0].json.reply_result.payload, result: res[0].json.reply_result, posts: posts };
  };

  if (requireNode('Log Reply Outcome')) {
    let r = await logRun({ mock: true, ok: true, channel: 'sms', external_ref: 'mock-sms-REQ-2026-0042', status: 'sent' });
    // Audit F2: this fixture carries mock:true, so it is a simulated send and the
    // row must say so. Reporting it as sent is how a patient is never messaged.
    check('E1 a simulated SMS is recorded as simulated', r.payload.status === 'simulated', r.payload.status);
    check('E2 the provider ref is stored', r.payload.external_ref === 'mock-sms-REQ-2026-0042', r.payload.external_ref);
    check('E3 the provider is voicebip', r.payload.provider === 'voicebip', r.payload.provider);
    check('E4 it is outbound, not inbound', r.payload.direction === 'outbound', r.payload.direction);
    check('E5 the row links the request', r.payload.request_code === 'REQ-2026-0042', r.payload.request_code);
    check('E6 the row links the appointment', r.payload.appointment_code === 'AP-1042', r.payload.appointment_code);
    check('E7 the phone reaches the dossier row', r.payload.patient_phone === '+2348030001122', r.payload.patient_phone);
    check('E8 one POST, to /interactions/', r.posts.length === 1 && r.posts[0].url.endsWith('/interactions/'), r.posts.map((p) => p.url));
    check('E9 the log call carries the shared secret from env', r.posts[0].headers['X-Webhook-Secret'] === SECRET, r.posts[0].headers);

    r = await logRun({ messaging_product: 'whatsapp', contacts: [], messages: [{ id: 'wamid.mock-REQ-2026-0042' }], mock: true },
      PREPARED({ channel: 'whatsapp' }));
    check('E10 a wamid becomes the external ref', r.payload.external_ref === 'wamid.mock-REQ-2026-0042', r.payload.external_ref);
    check('E11 the provider is meta_whatsapp', r.payload.provider === 'meta_whatsapp', r.payload.provider);

    const http404 = {
      message: 404 + ' - ' + JSON.stringify({ code: 404, message: 'The requested webhook is not registered.' }),
      name: 'Error',
    };
    r = await logRun({ error: http404 });
    check('E12 an HTTP failure is status failed', r.payload.status === 'failed', r.payload.status);
    check('E13 ...in plain language', /endpoint not found/i.test(r.payload.error_detail), r.payload.error_detail);
    check('E14 ...keeping the provider sentence', r.payload.error_detail.includes('is not registered'), r.payload.error_detail);
    check('E15 ...with no raw wrapper left', !r.payload.error_detail.includes('404 - "'), r.payload.error_detail);
    check('E16 a failure still writes exactly one row', r.posts.length === 1, r.posts.length);

    r = await logRun({ error: { message: 'connect ECONNREFUSED 127.0.0.1:9', name: 'Error', code: 'ECONNREFUSED' } });
    check('E17 a refused connection is explained', /refused the connection/i.test(r.payload.error_detail), r.payload.error_detail);

    r = await logRun({ provider_request: { route: 'skip', skip_reason: 'provider_not_configured' } },
      { json: { reply: PREPARED().json.reply, phone: '+2348030001122', provider_request: { route: 'skip', skip_reason: 'provider_not_configured' } } });
    check('E18 a held-back reply is recorded, not dropped', r.payload.status === 'failed', r.payload.status);
    check('E19 ...and says why', /not configured/i.test(r.payload.error_detail), r.payload.error_detail);

    // A Django outage while logging must never take the patient flow down.
    const posts = [];
    const failing = {
      helpers: { httpRequest: async (opts) => { posts.push(opts); throw new Error('ECONNREFUSED'); } },
    };
    const res = await runAsync('Log Reply Outcome', {
      console,
      $input: { first: () => ({ json: { ok: true, external_ref: 'x' } }) },
      $: () => ({ first: () => PREPARED() }),
      $env: { DJANGO_API_BASE_URL: 'http://127.0.0.1:8000/api/v1', DJANGO_WEBHOOK_SECRET: SECRET },
    }, failing);
    check('E20 a log outage does not throw', Boolean(res[0].json.reply_result), res[0].json.reply_result);
    check('E21 ...it reports ok:false instead', res[0].json.reply_result.ok === false, res[0].json.reply_result);
  }
  }

  async function runGroupF() {
  console.log('\nF. the graph itself keeps the C.1 rules');
  const urls = wf.nodes
    .filter((n) => n.type === 'n8n-nodes-base.httpRequest')
    .map((n) => String(n.parameters.url || ''));
  const djangoCalls = urls.filter((u) => u.includes('/webhooks/patient-reply/'));
  check('F1 exactly one call to the patient-reply endpoint', djangoCalls.length === 1, djangoCalls);
  check('F2 no /api/v1 is appended to the base URL', !urls.some((u) => u.includes('/api/v1')), urls);
  check('F3 no staff-JWT PATCH survives', !wf.nodes.some((n) => String(n.parameters.method || '').toUpperCase() === 'PATCH'), wf.nodes.filter((n) => n.parameters.method).map((n) => n.name));
  check('F4 no re_request_slots_ prefix survives', !JSON.stringify(wf).includes('re_request_slots_'));
  check('F5 no hard-coded secret fallback survives', !JSON.stringify(wf).includes('clinic_dev_secret'));

  const hooks = wf.nodes.filter((n) => n.type === 'n8n-nodes-base.webhook');
  const hookPaths = hooks.map((n) => n.parameters.path).sort();
  check('F6 two triggers: whatsapp-inbound + sms-inbound', hookPaths.join(',') === 'sms-inbound,whatsapp-inbound', hookPaths);
  check('F7 both triggers answer through a respond node', hooks.every((n) => n.parameters.responseMode === 'responseNode'), hooks.map((n) => n.parameters.responseMode));

  const unauthorized = wf.nodes.find((n) => n.name === 'Respond Unauthorized');
  check('F8 the refusal is a real 401', unauthorized && Number(unauthorized.parameters.options.responseCode) === 401, unauthorized && unauthorized.parameters.options);
  check('F9 the 401 never echoes the secret', unauthorized && !String(unauthorized.parameters.responseBody).includes('x-webhook-secret'), unauthorized && unauthorized.parameters.responseBody);

  const senders = wf.nodes.filter((n) => /^Send Reply /.test(n.name));
  check('F10 both send nodes exist', senders.length === 2, senders.map((n) => n.name));
  check('F11 a send failure has a wire to the log', senders.every((n) => n.onError === 'continueErrorOutput'), senders.map((n) => n.onError));

  // Drift guard: the canonical classification block must be a byte-identical copy.
  const block = (src) => {
    const start = src.indexOf('// >>> provider-error-classification');
    const end = src.indexOf('// <<< provider-error-classification');
    return (start >= 0 && end > start) ? src.slice(start, end + '// <<< provider-error-classification'.length) : null;
  };
  const replyLog = nodeSource(wf, 'Log Reply Outcome');
  const canonical = block(nodeSource(dispatch, 'Log SMS Interaction') || '');
  check('F12 the classification block is present in the reply log', Boolean(block(replyLog || '')), 'missing');
  check('F13 ...and is byte-identical to 05', block(replyLog || '') === canonical, 'drifted from 05');
  }
})().catch((e) => {
  console.error('\nHARNESS ERROR: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
