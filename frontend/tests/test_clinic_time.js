// Wave 3 / Step 3.1 - "One clock, the clinic's".
//
// The clinic runs on Africa/Lagos. Every date and hour the site shows must
// come from the clinic's clock (server-synced, clinic timezone), never from
// the visitor's computer - a wrong laptop clock or a foreign timezone must
// not shift the schedule.
//
// Part A is the real proof: the time service itself is EXECUTED in child
// processes whose fake computers are set to New York and Tokyo, and must
// still answer in Lagos time. Part B pins the wiring: the calendar, the day
// view, the walk-in anchor and the stores must all read the clock through
// the service instead of `new Date()`.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const servicePath = join(here, '../src/services/clinicTimeService.js');

let failures = 0;
let checks = 0;
function check(name, ok, detail) {
  checks += 1;
  if (!ok) failures += 1;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + name + (ok || !detail ? '' : '  -> ' + detail));
}

const read = (rel) => readFileSync(join(here, rel), 'utf8');

console.log('A. the service answers in clinic time on foreign computers');

const CHILD_SCRIPT = `
const svc = await import(${JSON.stringify('file:///' + servicePath.replace(/\\/g, '/'))});
const out = {};
const INSTANT = Date.parse('2026-11-23T09:30:00Z');        // Lagos 10:30 AM, Mon 23 Nov
const MIDNIGHT_CROSSER = Date.parse('2026-11-23T23:30:00Z'); // Lagos Mon 24 Nov 06:30
out.label = svc.clinicTimeLabel(INSTANT);
out.dayKey = svc.clinicDayKey(MIDNIGHT_CROSSER);
out.deviceDayKey = new Date(MIDNIGHT_CROSSER).toISOString().slice(0, 10);
out.dayStart = svc.clinicDayStartOfParts(2026, 10, 24); // monthIdx 10 = November
out.dayStartLabel = svc.clinicTimeLabel(out.dayStart);
out.dayStartKey = svc.clinicDayKey(out.dayStart);
out.todayStart = svc.clinicDayStartOffset(0);
out.todayStartLabel = svc.clinicTimeLabel(out.todayStart);
svc.configureClinicClock({ serverTime: new Date(Date.now() + 2 * 3600 * 1000).toISOString() });
out.skewCorrectedMs = svc.clinicNow() - Date.now();
console.log(JSON.stringify(out));
`;

const ZONES = ['Africa/Lagos', 'America/New_York', 'Asia/Tokyo'];
for (const zone of ZONES) {
  let out = null;
  let err = null;
  try {
    const stdout = execFileSync('node', ['--input-type=module', '-e', CHILD_SCRIPT], {
      env: { ...process.env, TZ: zone },
      timeout: 20000,
    }).toString();
    out = JSON.parse(stdout.trim().split('\n').pop());
  } catch (e) {
    err = (e.stderr || e.message || '').toString().slice(0, 160);
  }
  if (!out) {
    check('A0 service runs on a ' + zone + ' computer', false, err || 'no output');
    continue;
  }
  check('A1 ' + zone + ' labels the visit at clinic 10:30 AM', out.label === '10:30 AM', out.label);
  check('A2 ' + zone + ' day key crosses midnight in CLINIC time',
    out.dayKey === '2026-11-24', out.dayKey + ' (device says ' + out.deviceDayKey + ')');
  check('A3 ' + zone + ' clinic day start is clinic midnight',
    out.dayStartLabel === '12:00 AM' && out.dayStartKey === '2026-11-24',
    out.dayStartLabel + ' @ ' + out.dayStartKey);
  check('A4 ' + zone + ' today starts at clinic midnight',
    out.todayStartLabel === '12:00 AM', out.todayStartLabel);
  check('A5 ' + zone + ' a 2h-slow computer is corrected by the server clock',
    Math.abs(out.skewCorrectedMs - 2 * 3600 * 1000) < 3000,
    String(Math.round(out.skewCorrectedMs / 1000)) + 's');
}

console.log('B. every schedule surface reads the clock through the service');

const grid = read('../src/components/calendar/DoctorGridBookingCalendar.jsx');
const dayView = read('../src/components/calendar/CalendarDayView.jsx');
const calendarView = read('../src/views/CalendarView.jsx');
const mockData = read('../src/services/mockData.js');
const apiService = read('../src/services/apiService.js');
const visits = read('../src/stores/useVisitsStore.js');
const queue = read('../src/stores/useQueueStore.js');

check('B0 the service exists', existsSync(servicePath));
check('B1 the day engine (mockData) no longer builds local midnight',
  /startOfDayOffset[\s\S]{0,140}clinicDayStartOffset/.test(mockData) && !/setHours\(0,\s*0,\s*0,\s*0\)/.test(mockData),
  'startOfDayOffset must delegate to clinicDayStartOffset');
check('B2 "today" on the grid comes from the clinic clock',
  !grid.includes('const getInitialToday = () => new Date();') && grid.includes('clinicDayStartOffset'),
  'getInitialToday must use the clinic clock');
check('B3 the grid reads date parts through the service',
  grid.includes('clinicParts(') && !/new Date\(b\.start\)\.getFullYear\(\)/.test(grid),
  'block day-matching must compare clinic day keys');
check('B4 the grid formats hours through the service',
  grid.includes('clinicTimeLabel(') && !/toLocaleTimeString\('en-US'/.test(grid),
  'formatSlotTime must not use the device locale');
check('B5 the day view horizons start at clinic midnight',
  dayView.includes('clinicDayStartOffset(0)') && !/setHours\(0,\s*0,\s*0,\s*0\)/.test(dayView),
  'workload ranges are anchored to the clinic day');
check('B6 the walk-in date anchor uses clinic parts',
  calendarView.includes('clinicDayStartOfParts(') || calendarView.includes('clinicParts('),
  'CalendarView walk-in callback must not use new Date()');
check('B7 the frontend syncs the clock from the server',
  apiService.includes('server_time') && apiService.includes('configureClinicClock'),
  'apiService must call the health clock on boot');
check('B8 the visits board clocks elapsed time with the clinic clock',
  visits.includes('clinicNow('), 'elapsed timers must use clinicNow()');
check('B9 the queue ages requests with the clinic clock',
  queue.includes('clinicNow('), 'aging math must use clinicNow()');

console.log('');
if (failures) {
  console.log('FAILED: ' + failures + ' check(s) of ' + checks);
  process.exit(1);
}
console.log('ALL PASS (' + checks + ' checks)');
