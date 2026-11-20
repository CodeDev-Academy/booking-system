// Wave 3 / Step 3.6 - "the staff screen tells the truth".
//
// The review (Batch 3 High + Medium): the staff edit modal's role changes
// were UI-only (the backend ignored `role`); the duty-status select called
// nothing; the modal held and could REVEAL the current password and PIN from
// local state; createStaff sent fields the backend never reads; and the
// privacy lock screen printed the workstation PIN outright.
//
// With the backend half already green (AdminStaffDetailView now persists
// `role`), this pins the frontend half. Node only.

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
  return src.slice(a, b === -1 ? a + 12000 : b);
}

console.log('T. the store persists real edits');

const staffSrc = read('../src/stores/useStaffStore.js');
const update = fnBody(staffSrc, 'updateStaffMember', 'setDutyStatus');
check('T1 an edit awaits the backend before committing',
  /updateStaffMember:\s*async/.test(staffSrc) && /await apiService\s*\.\s*updateStaff/.test(update || ''),
  'a failed edit used to commit anyway with a success toast');
check('T2 a display label is mapped to a real backend role',
  /'clinic_admin'/.test(update || '') && /'receptionist'/.test(update || ''),
  'the modal sends labels like "Lead Receptionist"; the backend wants a real role');
check('T3 a doctor\'s duty status drives the real endpoint',
  /updateDoctorDutyStatus/.test(update || ''),
  'the duty select used to change nothing outside the browser');
check('T4 the saved row never carries a password or PIN',
  !/password:\s*newPassword/.test(update || '') && !/pin:\s*newPin/.test(update || ''),
  'credentials must not live in browser state');

const resetPwd = fnBody(staffSrc, 'confirmResetPassword', 'toggleStaffActive');
check('T5 a password reset awaits the backend and stores no secret on the row',
  /await apiService\s*\.\s*resetStaffPassword/.test(resetPwd || '')
    && !/s\.password\s*=\s*newPassword|password:\s*newPassword/.test(resetPwd || ''),
  'the row used to keep the new password in browser state');
const resetPin = fnBody(staffSrc, 'confirmResetPin', 'addStaffMember');
const liveTryAt = (resetPin || '').indexOf('try {');
const pinStoreAt = (resetPin || '').indexOf('pin: newPin');
check('T6 a PIN reset awaits the backend and stores no secret on the row',
  /await apiService\s*\.\s*resetStaffPin/.test(resetPin || '')
    && (pinStoreAt === -1 || pinStoreAt < liveTryAt),
  'the LIVE branch must not store the PIN; demo rows may (pitch lock screen)');

console.log('M. the modal and lock screen stop showing secrets');

const modalSrc = read('../src/components/admin/StaffEditModal.jsx');
check('M1 the modal never reads a stored password or PIN',
  !/staff\.password/.test(modalSrc) && !/staff\.pin/.test(modalSrc),
  'the row may not even HAVE one in live mode');
check('M2 no reveal toggle for current credentials',
  !/showPassword|showPin/.test(modalSrc),
  'Eye toggles revealed values the browser should never hold');
check('M3 the save payload carries no credentials',
  !/password,/.test(modalSrc.split('handleSaveAll')[1] || ''),
  'the save round-tripped password/pin back into the row');

const lockSrc = read('../src/components/layout/PrivacyLockModal.jsx');
check('M4 the lock screen prints no PIN',
  !/demo-pin-hint/.test(lockSrc) && !/currentStaff\?\.pin/.test(lockSrc),
  'the lock screen printed the workstation PIN outright');

console.log('C. the wire sends only what the backend reads');

const apiSrc = read('../src/services/apiService.js');
const createStaff = fnBody(apiSrc, 'async createStaff', 'async updateStaff');
check('C1 createStaff sends no unread shift_start/shift_end',
  !/shift_start:/.test(createStaff || '') && !/shift_end:/.test(createStaff || ''),
  'the backend never read those fields');

console.log('');
if (failures) {
  console.log('FAILED: ' + failures + ' check(s) of ' + checks);
  process.exit(1);
}
console.log('ALL PASS (' + checks + ' checks)');
