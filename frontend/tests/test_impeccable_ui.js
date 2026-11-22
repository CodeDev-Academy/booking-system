// Impeccable UI/UX Consolidation & Warm-Light Theme Contract
//
// Pins the owner-approved redesign:
//   1. Recalls is combined into Live Visits as a tab ('visits' | 'recalls').
//   2. Clinic Settings is organized into 3 tabs ('clinic' | 'services' | 'system')
//      with the 4 top KPI cards removed.
//   3. Staff & Reports is organized into 2 tabs ('roster' | 'analytics') with the
//      2 static filler security cards removed.
//   4. Requests Queue has 4 focused request tabs (no duplicate "Today's Schedule" tab).
//   5. Schedule Grid removes the fake "Abuja, NG" consumer bar and fake "Sarah Aliyu"
//      profile dropdown, and derives specialties dynamically from the real doctors.
//   6. LeftRail and Header do not duplicate the staff identity card 3-4 times.
//   7. Warm light theme consistency: zero mismatched #0c1a30 navy or #38bdf8 sky-blue
//      in views/components/styles, and fixed Operate heading scale (no fluid clamp).

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

const liveVisitsView = read('../src/views/LiveVisitsView.jsx');
const settingsView = read('../src/views/SettingsView.jsx');
const staffView = read('../src/views/StaffView.jsx');
const calendarView = read('../src/views/CalendarView.jsx');
const gridCalendar = read('../src/components/calendar/DoctorGridBookingCalendar.jsx');
const calendarStore = read('../src/stores/useCalendarStore.js');
const triageHook = read('../src/hooks/useTriageQueue.js');
const leftRail = read('../src/components/layout/LeftRail.jsx');
const header = read('../src/components/layout/Header.jsx');
const viewsCss = read('../src/styles/components/views.css');

console.log('A. Tab & Navigation Consolidation');

check('A1 Recalls is combined into Live Visits as a tab',
  /RecallsView\s+embedded/.test(liveVisitsView) && /Follow-Up Recalls/.test(liveVisitsView),
  'LiveVisitsView must host the Follow-Up Recalls tab');

check('A2 LeftRail combines Visits & Recalls into one front-desk item',
  /Visits &amp; Recalls/.test(leftRail) && !/to="\/recalls"/.test(leftRail),
  'LeftRail should have one unified Visits & Recalls nav item');

check('A3 Settings is split into 3 clean tabs (clinic, services, system)',
  /activeTab === 'clinic'/.test(settingsView)
  && /activeTab === 'services'/.test(settingsView)
  && /activeTab === 'system'/.test(settingsView)
  && !/className="kpi-row"/.test(settingsView),
  'SettingsView must use 3 tabs without the 4 top KPI boxes');

check('A4 Staff & Reports is split into 2 tabs (roster, analytics) without fake security KPI boxes',
  /activeSection === 'roster'/.test(staffView)
  && /activeSection === 'analytics'/.test(staffView)
  && !/Security Governance/.test(staffView)
  && !/Instant Access Revocation/.test(staffView),
  'StaffView must separate Team Roster and Reports & CSV without static filler cards');

const tabsBlock = triageHook.slice(
  triageHook.indexOf('const tabs = useMemo'),
  triageHook.indexOf('const prevNeedsAttentionRef')
);
check('A5 Requests Queue has 4 request tabs (duplicate Today tab removed)',
  !/id:\s*'today'/.test(tabsBlock) && !/Today's Schedule/.test(tabsBlock),
  'useTriageQueue must not duplicate Today Schedule inside Requests Queue');

console.log('B. Space & Chrome Deduplication');

check('B1 Schedule Grid removes the fake Abuja / Sarah Aliyu consumer bar',
  !/Abuja, NG/.test(gridCalendar) && !/Sarah Aliyu \(Front Desk\)/.test(gridCalendar),
  'DoctorGridBookingCalendar must not render the fake consumer header');

check('B2 Schedule Grid derives specialty pills from real doctors',
  /activeSpecialties/.test(gridCalendar),
  'DoctorGridBookingCalendar should filter by actual doctor specialties');

check('B2a the specialty filter compares the selected value exactly',
  /return \(doc\.specialty \|\| ''\) === selectedSpecialty;/.test(gridCalendar),
  'a tab that matches every doctor is a filter that lies');

check('B2b the calendar store reads the key the schedule API sends',
  /specialty:\s*docItem\.specialty\s*\|\|\s*docItem\.doctor_specialty/.test(calendarStore),
  'views_clinic.py sends `specialty`; reading `doctor_specialty` made every doctor "General Practice"');

check('B3 LeftRail has a single staff identity block in the footer',
  !/className="rail-staff-badge"/.test(leftRail) && /className="rail-footer"/.test(leftRail),
  'LeftRail must not render two staff identity cards');

check('B4 Header does not duplicate staff badge and sign-out button',
  !/header-staff-badge/.test(header) && !/onClick=\{logout\}/.test(header),
  'Header stays compact while LeftRail footer owns session identity and Sign Out');

console.log('C. Warm Light Theme & Operate Typography');

check('C1 views.css uses fixed Operate heading size instead of fluid clamp',
  /\.view-heading\s*\{[\s\S]{0,120}font-size:\s*var\(--text-lg\)/.test(viewsCss),
  '.view-heading must use fixed rem scale in Operate mode');

check('C2 zero mismatched #0c1a30 navy or #38bdf8 sky-blue in updated views',
  ![liveVisitsView, settingsView, staffView, calendarView, gridCalendar].some(
    (src) => /#0c1a30|#38bdf8/i.test(src)
  ),
  'all views must use the warm-light obsidian and amber palette');

console.log('');
if (failures) {
  console.log(`FAILED ${failures}/${checks} checks`);
  process.exit(1);
}
console.log(`OK ${checks}/${checks} checks`);
