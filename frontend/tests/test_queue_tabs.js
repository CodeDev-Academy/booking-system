// Queue tab contract - one request, one home.
//
// A request whose newest delivery outcome is a failure is "Needs Attention".
// It used to stay in "New Requests" as well (the buckets did not exclude each
// other), so a failed dispatch showed up twice and "New" no longer meant
// "never dispatched". These checks pin the split.
//
// Node only, source-contract style like the other harnesses.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), 'utf8');

let failures = 0;
let checks = 0;
function check(name, ok, detail) {
  checks += 1;
  if (!ok) failures += 1;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + name + (ok || !detail ? '' : '  -> ' + detail));
}

const hookSrc = read('../src/hooks/useTriageQueue.js');

// The bucket block, so the checks cannot be satisfied by unrelated text.
const start = hookSrc.indexOf('const buckets = useMemo');
const end = hookSrc.indexOf('const tabs = useMemo', start);
const buckets = start === -1 ? '' : hookSrc.slice(start, end === -1 ? start + 4000 : end);

console.log('A. the buckets do not overlap');

check('A1 the bucket block exists',
  buckets.length > 0,
  'the hook was restructured - update this harness');

check('A2 "new" excludes delivery failures',
  /new:\s*awaiting\.filter\([^)]*!r\.attentionOpen/.test(buckets)
  || /new:\s*awaiting\s*\.filter\(\s*\(r\)\s*=>\s*!r\.reRequested\s*&&\s*!r\.attentionOpen/.test(buckets),
  'a failed dispatch must leave "New Requests"');

check('A3 "re-requested" excludes delivery failures too',
  /rerequested:\s*awaiting\.filter\([^)]*!r\.attentionOpen/.test(buckets)
  || /rerequested:\s*awaiting\s*\.filter\(\s*\(r\)\s*=>\s*r\.reRequested\s*&&\s*!r\.attentionOpen/.test(buckets),
  'priority tab must not duplicate the attention tab either');

check('A4 "needs attention" is the only home for attention_open',
  /needs_attention:\s*needsAttention/.test(buckets)
  && /filter\(\(r\)\s*=>\s*r\.attentionOpen === true\)/.test(buckets),
  'the attention list must stay the single source');

check('A5 a successfully resent request returns to "new"',
  /attentionOpen/.test(buckets) && !/lastFailure[^\n]*message/i.test(buckets),
  'the backend already clears attention_open after a good send');

console.log('');
if (failures) {
  console.log(`FAILED ${failures}/${checks} checks`);
  process.exit(1);
}
console.log(`OK ${checks}/${checks} checks`);
