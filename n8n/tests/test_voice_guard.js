// Phase 3 / 3.8 harness: the voice guard's fail-safe, and what a held-back channel
// does to Django. Node only - no n8n restart required.
//
// Two nodes are under test, read from the workflow export (never a copy):
//   Merge Voice Guard    - rebuilds the voice payload after the 30s status probe
//   Log Skipped Channel  - writes a `queued` row for every actionable skip
//
// The case that matters is the one nobody can trigger on purpose: the adapter's voice
// item is gone. The guard must then FAIL CLOSED (no call) and the skip logger must
// still record why, because that branch only ever fires when the graph is inconsistent.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WF = path.join(__dirname, '..', '05_slot_offer_dispatcher.json');
const wf = JSON.parse(fs.readFileSync(WF, 'utf8'));
const find = (name) => {
  const node = wf.nodes.find((n) => n.name === name);
  if (!node) { console.log('FAIL could not find node in the workflow JSON: ' + name); process.exit(1); }
  return node.parameters.jsCode;
};
const MERGE = find('Merge Voice Guard');
const LOG_SKIP = find('Log Skipped Channel');

const ENV = {
  DJANGO_API_BASE_URL: 'http://django.test/api/v1',
  DJANGO_WEBHOOK_SECRET: 'clinic_test_secret',
};

let failures = 0;
let total = 0;
const check = (label, cond, detail) => {
  total++;
  if (cond) { console.log('  ok   ' + label); }
  else { failures++; console.log('  FAIL ' + label + (detail !== undefined ? ' -> ' + JSON.stringify(detail) : '')); }
};

// --- Merge Voice Guard -----------------------------------------------------
function runMerge(probe, adapterItems) {
  const sandbox = {
    $input: { first: () => ({ json: probe }) },
    $: (name) => {
      if (name !== 'Provider Config & Adapter') throw new Error('unexpected node reference: ' + name);
      return { all: () => adapterItems.map((j) => ({ json: j })) };
    },
    console,
  };
  return vm.runInNewContext('(function () {\n' + MERGE + '\n})()', sandbox);
}

const VOICE_ITEM = {
  provider_channel: 'voice',
  request_id: 'REQ-2026-9901',
  patient_name: 'Amina Yusuf',
  patient_phone: '+2348030009901',
  provider_request: { route: 'call', url: 'https://voicebip.test/call', headers: { Authorization: 'Bearer x' }, body: { to: '2348030009901' } },
};
const PROBE_CLEAR = { request_id: 'REQ-2026-9901', status: 'slots_offered', should_skip_voice_call: false, has_active_hold: false, has_confirmed_booking: false };
const PROBE_ENGAGED = { request_id: 'REQ-2026-9901', status: 'converted', should_skip_voice_call: true, has_active_hold: false, has_confirmed_booking: true };

console.log('G1. a normal rebound leaves the call payload alone');
let out = runMerge(PROBE_CLEAR, [VOICE_ITEM]);
let j = out[0].json;
check('G1a should_skip stays false', j.voice_guard.should_skip === false, j.voice_guard.should_skip);
check('G1b the provider request is untouched', j.provider_request.route === 'call' && j.provider_request.url === VOICE_ITEM.provider_request.url, j.provider_request);
check('G1c identity survives the round trip', j.patient_phone === '+2348030009901' && j.request_id === 'REQ-2026-9901', j.patient_phone);

console.log('G2. the patient already replied -> skip, and nothing to log');
out = runMerge(PROBE_ENGAGED, [VOICE_ITEM]);
j = out[0].json;
check('G2a should_skip is true', j.voice_guard.should_skip === true, j.voice_guard.should_skip);
check('G2b reason is patient_already_engaged', j.provider_request.skip_reason === 'patient_already_engaged', j.provider_request.skip_reason);
check('G2c no call is built', j.provider_request.route === 'skip', j.provider_request.route);

console.log('G3. the adapter payload is GONE -> must fail closed, not send');
out = runMerge(PROBE_CLEAR, []);
j = out[0].json;
check('G3a should_skip is forced true', j.voice_guard.should_skip === true, j.voice_guard.should_skip);
check('G3b reason is voice_payload_missing', j.provider_request.skip_reason === 'voice_payload_missing', j.provider_request.skip_reason);
check('G3c route is skip', j.provider_request.route === 'skip', j.provider_request.route);
check('G3d no url to call', !j.provider_request.url, j.provider_request.url);
check('G3e the probe lends the request code', j.request_id === 'REQ-2026-9901', j.request_id);
check('G3f the channel is still voice', j.provider_channel === 'voice', j.provider_channel);

console.log('G9. the graph sends a skipped voice item to the logger, never to the sender');
const ifNode = wf.connections['IF Voice Still Needed'];
const falseTargets = ((ifNode && ifNode.main && ifNode.main[1]) || []).map((t) => t.node);
check('G9a the false output is wired', falseTargets.length > 0, falseTargets);
check('G9b ...to Log Skipped Channel', falseTargets.includes('Log Skipped Channel'), falseTargets);
check('G9c ...and not to the send node', !falseTargets.includes('Send Voice Call (VoiceBip)'), falseTargets);

// --- Log Skipped Channel ---------------------------------------------------
function runLog(items) {
  const posts = [];
  const sandbox = {
    $input: { all: () => items.map((x) => ({ json: x })) },
    $env: ENV,
    console,
  };
  const fn = vm.runInNewContext('(async function () {\n' + LOG_SKIP + '\n})', sandbox);
  return fn.call({
    helpers: {
      httpRequest: async (opts) => { posts.push(opts); return { id: 'row-1', status: 'queued' }; },
    },
  }).then((out) => ({ out, posts }));
}

(async () => {
  console.log('G4. a voice payload we could not rebuild becomes a held-back row');
  let r = await runLog([{ provider_channel: 'voice', request_id: 'REQ-2026-9901', provider_request: { route: 'skip', skip_reason: 'voice_payload_missing' } }]);
  check('G4a one POST is attempted', r.posts.length === 1, r.posts.length);
  const body = (r.posts[0] || {}).body || {};
  check('G4b status is queued (held back, not failed)', body.status === 'queued', body.status);
  check('G4c channel is voice', body.channel === 'voice', body.channel);
  check('G4d error_detail names the reason', body.error_detail === 'voice_payload_missing', body.error_detail);
  check('G4e external_ref is deterministic', body.external_ref === 'skip-voice-REQ-2026-9901', body.external_ref);
  check('G4f the summary explains it', typeof body.summary === 'string' && body.summary.indexOf('Held back') === 0, body.summary);
  check('G4g the row is linked to the request', body.request_code === 'REQ-2026-9901', body.request_code);
  check('G4h the result reports the row', r.out[0].json.skip_log.ok === true, r.out[0].json.skip_log);

  console.log('G5. patient_already_engaged stays unlogged, by decision');
  r = await runLog([{ provider_channel: 'voice', request_id: 'REQ-2026-9901', provider_request: { route: 'skip', skip_reason: 'patient_already_engaged' } }]);
  check('G5a no POST', r.posts.length === 0, r.posts.length);
  check('G5b marked not row worthy', r.out[0].json.skip_log.skipped === 'not_row_worthy', r.out[0].json.skip_log);

  console.log('G6. the existing actionable reasons still write a row');
  r = await runLog([{ provider_channel: 'voice', request_id: 'REQ-2026-9902', provider_request: { route: 'skip', skip_reason: 'outside_call_window' } }]);
  check('G6a one POST', r.posts.length === 1, r.posts.length);
  check('G6b error_detail kept', ((r.posts[0] || {}).body || {}).error_detail === 'outside_call_window', ((r.posts[0] || {}).body || {}).error_detail);

  console.log('G7. a Django outage never breaks the dispatch');
  const failing = {
    $input: { all: () => [{ json: { provider_channel: 'voice', request_id: 'REQ-2026-9903', provider_request: { skip_reason: 'voice_payload_missing' } } }] },
    $env: ENV,
    console,
  };
  const ffn = vm.runInNewContext('(async function () {\n' + LOG_SKIP + '\n})', failing);
  const fout = await ffn.call({ helpers: { httpRequest: async () => { throw new Error('connect ECONNREFUSED'); } } });
  check('G7a the node returns', fout[0].json.skip_log.ok === false, fout[0].json.skip_log);
  check('G7b the error is captured', String(fout[0].json.skip_log.error).indexOf('ECONNREFUSED') !== -1, fout[0].json.skip_log.error);

  console.log('G8. no request code -> no row (nothing to link it to)');
  r = await runLog([{ provider_channel: 'voice', provider_request: { skip_reason: 'voice_payload_missing' } }]);
  check('G8a no POST', r.posts.length === 0, r.posts.length);
  check('G8b marked not row worthy', r.out[0].json.skip_log.skipped === 'not_row_worthy', r.out[0].json.skip_log);

  console.log(failures ? '\nFAILED: ' + failures + ' of ' + total : '\nALL PASS (' + total + ' assertions)');
  process.exit(failures ? 1 : 0);
})();
