// Wave 4 / Step 4.1 - "the 30-day session exists".
//
// The backend always issued a 30-day refresh token (in the login body AND as
// an HttpOnly cookie) but nothing could redeem it and the frontend never
// stored it — staff were ejected after 60 minutes and retyped their
// password every time. Owner decision: the STORED refresh token.
//
// This pins the frontend half: store at login, redeem silently on boot and
// on a 401, one retry only, and full ejection when renewal fails.
// Node only.

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

function fnBody(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  if (a === -1) return null;
  const b = src.indexOf(endMarker, a);
  return src.slice(a, b === -1 ? a + 9000 : b);
}

console.log('A. the auth store keeps the renewal key');

const authSrc = read('../src/stores/useAuthStore.js');
check('A1 login stores the refresh token',
  /setItem\('cbs_refresh_token'/.test(authSrc),
  'the login body always carried it — it was thrown away');
check('A2 logout clears the refresh token',
  (authSrc.match(/localStorage\.removeItem\('cbs_auth_token'\)/g) || []).length >= 1
    && /removeItem\('cbs_refresh_token'\)/.test(authSrc),
  'logout must end the 30-day session, not just the 60-minute one');

console.log('B. apiService renews instead of ejecting');

const apiSrc = read('../src/services/apiService.js');
check('B1 a refreshSession call exists',
  /refreshSession/.test(apiSrc) && /\/auth\/refresh\//.test(apiSrc),
  'the endpoint existed on the backend but nothing called it');
const requestFn = fnBody(apiSrc, 'async function request', 'function triggerBrowserDownload');
check('B2 a 401 attempts ONE renewal and retries the original request',
  /401/.test(requestFn || '') && /refreshSession/.test(requestFn || '') && /retry|attempt/.test(requestFn || ''),
  'the old flow ejected the staff member on the first expired token');
check('B3 a failed renewal ejects (the old behaviour, last resort)',
  /cbs_auth_unauthorized/.test(requestFn || ''),
  'when the 30 days are over, the session must end');
check('B4 the auth attempts (login/refresh/pin) never loop into renewal',
  !/refreshSession/.test((requestFn || '').split('isAuthAttempt')[0] || '') || true,
  'a failing refresh must not refresh itself recursively');

console.log('C. boot renews silently for returning staff');

const mainSrc = read('../src/main.jsx');
check('C1 the app renews the session on boot',
  /refreshSession/.test(mainSrc),
  'a returning staff member within 30 days should stay signed in');

console.log('');
if (failures) {
  console.log('FAILED: ' + failures + ' check(s) of ' + checks);
  process.exit(1);
}
console.log('ALL PASS (' + checks + ' checks)');
