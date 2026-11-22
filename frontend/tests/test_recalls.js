// Recalls page contract.
//
// Every recall is visible in one place. Cancel and mark-done are Django's
// decisions, and editing is only possible BEFORE a recall is sent.
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

const api = read('../src/services/apiService.js');
const hook = read('../src/hooks/useRecalls.js');
const view = read('../src/views/RecallsView.jsx');
const app = read('../src/App.jsx');
const rail = read('../src/components/layout/LeftRail.jsx');

console.log('A. the API surface');

check('A1 the list endpoint exists',
  /async fetchFollowUps\s*\(/.test(api) && /\/follow-ups\//.test(api),
  'without it the page has nothing to show');

check('A2 one update endpoint for cancel, done and edit',
  /async updateFollowUp\s*\(/.test(api) && /method: 'PATCH'/.test(api),
  'three actions, one honest call');

console.log('B. the hook follows the server');

check('B1 it loads with the tab and the search',
  /fetchFollowUps\(\{\s*status[^}]*search/.test(hook),
  'the tab must filter on the server, not guess locally');

check('B2 cancel and mark-done go through the endpoint',
  /act\(item\.id, \{ cancelled: true \}/.test(hook)
  && /act\(item\.id, \{ is_completed: true \}/.test(hook)
  && /updateFollowUp\(id, payload\)/.test(hook),
  'no local-only flips');

check('B3 an empty date is refused before the call',
  /if \(!edit\.followUpDate\)/.test(hook),
  'the same rule as the finish-visit form');

check('B4 refusals show the server sentence',
  /err\?\.message/.test(hook),
  '"already sent" must be the server words');

console.log('C. the screen');

check('C1 the page exists and uses the hook',
  /useRecalls\(\)/.test(view), 'no logic in JSX');

check('C2 four groups, including Cancelled',
  /id: 'upcoming'/.test(view) && /id: 'cancelled'/.test(view) && /Cancelled/.test(view),
  'a cancelled recall stays visible');

check('C3 a note-only recall says it will not be sent',
  /Note only/.test(view) && /no message will be sent/i.test(view),
  'the screen must not imply a send');

check('C4 Edit is only offered on an upcoming recall',
  /canEdit = item\.status === 'upcoming'/.test(view),
  'a sent message cannot be unsent');

check('C5 Cancel is only offered on an upcoming recall',
  /\{item\.status === 'upcoming' && \(/.test(view),
  'you cannot cancel what already left');

check('C6 the clinical note is never rendered',
  !/\bitem\.notes\b/.test(view) && !/notes:/.test(hook),
  'the list payload has no clinical note by design');

const liveVisits = read('../src/views/LiveVisitsView.jsx');
check('C7 the route and the Live Visits tab exist',
  /path="recalls"/.test(app) && /RecallsView/.test(liveVisits),
  'a page nobody can reach is dead code');

console.log('');
if (failures) {
  console.log(`FAILED ${failures}/${checks} checks`);
  process.exit(1);
}
console.log(`OK ${checks}/${checks} checks`);
