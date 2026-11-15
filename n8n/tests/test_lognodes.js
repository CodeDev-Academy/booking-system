// Phase 3 / step 3.3 harness: run the SHIPPED `Log * Interaction` sources from the
// workflow JSON and assert that a provider failure becomes ONE readable sentence.
//
// The fixtures are built the way n8n builds them: the HTTP body is embedded as a
// JSON *string literal* inside `error.message`, with the status only as a prefix.
// Node only - no n8n restart required.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WF = path.join(__dirname, '..', '05_slot_offer_dispatcher.json');
const wf = JSON.parse(fs.readFileSync(WF, 'utf8'));

const LOG_NODES = [
  { name: 'Log WhatsApp Interaction', channel: 'whatsapp' },
  { name: 'Log SMS Interaction', channel: 'sms' },
  { name: 'Log Voice Interaction', channel: 'voice' },
];

let failures = 0;
const check = (label, cond, detail) => {
  if (cond) { console.log('  ok   ' + label); }
  else { failures++; console.log('  FAIL ' + label + (detail === undefined ? '' : ' -> ' + detail)); }
};

// n8n: `404 - "{\"code\":404,...}"`  (status in the prefix, body as a string literal)
const wrap = (status, body) => status + ' - ' + (typeof body === 'string' ? JSON.stringify(body) : JSON.stringify(body));

const FIXTURES = {
  // Execution 147, verbatim shape (nested escaped quotes are the part that breaks the old code).
  http404: {
    message: wrap(404, {
      code: 404,
      message: 'The requested webhook "GET dispatch-offers" is not registered.',
      hint: 'The workflow must be active for the URL to work.',
    }),
    name: 'Error',
    stack: 'Error: 404 - ...\n    at AxiosError.from (C:\\...\\axios.cjs:1577:24)',
  },
  // Execution 148, verbatim.
  refused: {
    message: 'connect ECONNREFUSED 127.0.0.1:9',
    name: 'Error',
    code: 'ECONNREFUSED',
    stack: 'Error: connect ECONNREFUSED 127.0.0.1:9\n    at AxiosError.from (C:\\...\\axios.cjs:1577:24)',
  },
  auth401: {
    message: wrap(401, { status: 'error', message: 'Invalid API key', code: 'AUTH_FAILED' }),
    name: 'Error',
  },
  rate429: {
    message: wrap(429, { error: 'rate_limited', message: 'Too many requests, retry in 60s' }),
    name: 'Error',
  },
  server500: { message: '500 - Internal Server Error', name: 'Error' },
  gateway502: {
    message: wrap(502, { error: { error_data: { details: 'upstream provider timed out' } } }),
    name: 'Error',
  },
  validation422: {
    message: wrap(422, { errors: [{ field: 'phone', message: 'Phone number is not valid' }] }),
    name: 'Error',
  },
  // The old SMS/Voice code did String(parsed.error) here -> "[object Object]".
  nestedError: {
    message: wrap(400, { error: { message: 'sender ID not approved', title: 'Bad Request' } }),
    name: 'Error',
  },
  dns: { message: 'getaddrinfo ENOTFOUND api.voicebip.example', name: 'Error', code: 'ENOTFOUND' },
  timeout: { message: 'timeout of 10000ms exceeded', name: 'Error', code: 'ECONNABORTED' },
  opaque: { message: '', name: 'Error' },
};

const base = (channel) => ({
  request_id: 'REQ-2026-9200',
  patient_name: 'Amina Yusuf',
  patient_phone: '+2348033112233',
  provider_channel: channel,
});

function run(nodeName, channel, incoming) {
  const code = (wf.nodes.find((n) => n.name === nodeName) || {}).parameters?.jsCode;
  if (!code) throw new Error('node not found in workflow JSON: ' + nodeName);
  const posts = [];
  const sandbox = {
    console,
    $input: { first: () => ({ json: incoming }) },
    $: () => ({ all: () => [{ json: base(channel) }] }),
    $env: { DJANGO_API_BASE_URL: 'http://127.0.0.1:8000/api/v1', DJANGO_WEBHOOK_SECRET: 'clinic_dev_secret_2026' },
  };
  const fn = vm.runInNewContext('(async function () {\n' + code + '\n})', sandbox);
  const ctx = {
    helpers: {
      httpRequest: async (opts) => {
        posts.push(opts);
        return { id: 42, status: opts.body.status };
      },
    },
  };
  const result = fn.call(ctx);
  return result.then((out) => ({
    payload: out[0].json.interaction_log.payload,
    logged: out[0].json.interaction_log,
    posts,
  }));
}

const isClean = (s) => typeof s === 'string' && !s.includes('\\') && !s.includes('\n') && s.length <= 300;

(async () => {
  for (const node of LOG_NODES) {
    console.log('\n=== ' + node.name + ' (' + node.channel + ') ===');

    // ---- A. the execution-147 case: must become plain language -----------------
    let r = await run(node.name, node.channel, { error: FIXTURES.http404 });
    check('A1 status is failed', r.payload.status === 'failed', r.payload.status);
    check('A2 says endpoint not found', /endpoint not found/i.test(r.payload.error_detail), r.payload.error_detail);
    check('A3 keeps the provider sentence', r.payload.error_detail.includes('is not registered'), r.payload.error_detail);
    check('A4 decodes the nested escaped quotes', r.payload.error_detail.includes('"GET dispatch-offers"'), r.payload.error_detail);
    check('A5 no raw n8n wrapper', !r.payload.error_detail.includes('404 - "'), r.payload.error_detail);
    check('A6 no escape residue', isClean(r.payload.error_detail), r.payload.error_detail);
    check('A7 no stack trace', !/at AxiosError/.test(r.payload.error_detail), r.payload.error_detail);
    check('A8 no hint dumped in', !r.payload.error_detail.includes('workflow must be active'), r.payload.error_detail);
    check('A9 label leads the sentence', /^Provider endpoint not found/.test(r.payload.error_detail), r.payload.error_detail);
    check('A12 no bare status prefix', !/^\d{3}\s*-/.test(r.payload.error_detail), r.payload.error_detail);
    check('A10 still posts exactly one interaction', r.posts.length === 1, String(r.posts.length));
    check('A11 logged ok', r.logged.ok === true, JSON.stringify(r.logged));

    // ---- B. the execution-148 case: must not regress ---------------------------
    r = await run(node.name, node.channel, { error: FIXTURES.refused });
    check('B1 connection refused is explained', /refused the connection/i.test(r.payload.error_detail), r.payload.error_detail);
    check('B2 no status code invented', !/^\d{3}/.test(r.payload.error_detail), r.payload.error_detail);
    check('B3 clean string', isClean(r.payload.error_detail), r.payload.error_detail);

    // ---- C. status classes ----------------------------------------------------
    r = await run(node.name, node.channel, { error: FIXTURES.auth401 });
    check('C1 401 -> authentication failed', /authentication failed/i.test(r.payload.error_detail), r.payload.error_detail);
    check('C2 401 keeps provider text', r.payload.error_detail.includes('Invalid API key'), r.payload.error_detail);
    check('C3 401 label leads', /^Provider authentication failed/.test(r.payload.error_detail), r.payload.error_detail);

    r = await run(node.name, node.channel, { error: FIXTURES.rate429 });
    check('C4 429 -> rate limit', /rate limit/i.test(r.payload.error_detail), r.payload.error_detail);
    check('C5 429 keeps provider text', r.payload.error_detail.includes('Too many requests'), r.payload.error_detail);

    r = await run(node.name, node.channel, { error: FIXTURES.server500 });
    check('C6 500 -> server error', /server error/i.test(r.payload.error_detail), r.payload.error_detail);
    check('C7 500 plain-text body kept', r.payload.error_detail.includes('Internal Server Error'), r.payload.error_detail);
    check('C8 500 clean string', isClean(r.payload.error_detail), r.payload.error_detail);

    r = await run(node.name, node.channel, { error: FIXTURES.gateway502 });
    check('C9 502 -> server error', /server error/i.test(r.payload.error_detail), r.payload.error_detail);
    check('C10 502 digs out error_data.details', r.payload.error_detail.includes('upstream provider timed out'), r.payload.error_detail);

    r = await run(node.name, node.channel, { error: FIXTURES.validation422 });
    check('C11 422 -> rejected the request', /rejected the request/i.test(r.payload.error_detail), r.payload.error_detail);
    check('C12 422 reads the errors[] entry', r.payload.error_detail.includes('Phone number is not valid'), r.payload.error_detail);

    r = await run(node.name, node.channel, { error: FIXTURES.nestedError });
    check('C13 nested error object is unwrapped', r.payload.error_detail.includes('sender ID not approved'), r.payload.error_detail);
    check('C14 never "[object Object]"', !r.payload.error_detail.includes('[object Object]'), r.payload.error_detail);

    // ---- D. transport classes -------------------------------------------------
    r = await run(node.name, node.channel, { error: FIXTURES.dns });
    check('D1 DNS failure explained', /could not be resolved/i.test(r.payload.error_detail), r.payload.error_detail);
    r = await run(node.name, node.channel, { error: FIXTURES.timeout });
    check('D2 timeout explained', /did not respond in time/i.test(r.payload.error_detail), r.payload.error_detail);
    r = await run(node.name, node.channel, { error: FIXTURES.opaque });
    check('D3 empty error still yields a sentence', r.payload.error_detail.trim().length > 0, r.payload.error_detail);
    check('D4 empty error stays clean', isClean(r.payload.error_detail), r.payload.error_detail);

    // ---- E. non-exception failures and successes ------------------------------
    r = await run(node.name, node.channel, { ok: false, error_message: 'Recipient opted out' });
    check('E1 ok:false -> failed', r.payload.status === 'failed', r.payload.status);
    check('E2 ok:false keeps the provider message', r.payload.error_detail === 'Recipient opted out', r.payload.error_detail);
    check('E3 ok:false is not mislabelled', !/^Provider /.test(r.payload.error_detail), r.payload.error_detail);

    r = await run(node.name, node.channel, { ok: true, id: 'ext-123' });
    check('E4 success -> sent', r.payload.status === 'sent', r.payload.status);
    check('E5 success has empty error_detail', r.payload.error_detail === '', JSON.stringify(r.payload.error_detail));
    check('E6 success keeps external_ref', r.payload.external_ref === 'ext-123', r.payload.external_ref);
  }

  // ---- F. drift guard: one canonical classifier, three copies ----------------
  console.log('\n=== F. canonical block identical in all three log nodes ===');
  const START = '// >>> provider-error-classification';
  const END = '// <<< provider-error-classification';
  const blocks = LOG_NODES.map((n) => {
    const code = (wf.nodes.find((x) => x.name === n.name) || {}).parameters?.jsCode || '';
    const a = code.indexOf(START);
    const b = code.indexOf(END);
    return a >= 0 && b > a ? code.slice(a, b + END.length) : null;
  });
  check('F1 all three nodes carry the canonical block', blocks.every(Boolean), blocks.map((b) => (b ? 'yes' : 'MISSING')).join(', '));
  check('F2 block is byte-identical across nodes', blocks.every((b) => b === blocks[0]));
  check('F3 no node still uses humanError()', LOG_NODES.every((n) => {
    const code = (wf.nodes.find((x) => x.name === n.name) || {}).parameters?.jsCode || '';
    return !code.includes('humanError');
  }));
  check('F4 no node parses a hand-unescaped string', LOG_NODES.every((n) => {
    const code = (wf.nodes.find((x) => x.name === n.name) || {}).parameters?.jsCode || '';
    return !/JSON\.parse\([^)]*\.replace\(/.test(code);
  }));

  console.log(failures ? '\nFAILED: ' + failures : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
