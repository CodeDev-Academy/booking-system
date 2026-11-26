# SESSION_HANDOVER.md — pick up here (cold start)

> Read this first, then `AGENTS.md` (rules) and `PROGRESS.md` / `TEST.md` (detail).
> Written 2026-11-25 after T-787 shipped. Keep this file current when you finish a step.

## 1. Where the code is

- **Working branch:** `partner-readiness/phase-1-2` @ `6112d90` (pushed).
- **`main` / `origin/main` = `7f8bcd9`. NEVER commit to `main`.** Assert this before and after every push.
- The branch is 100+ commits ahead of `main`; the merge decision belongs to the owner.
- Latest commits:
  - `2395d40` T-788 env contract names · `5c8c657` T-788 real secrets (code + 8 tests) · docs T-788 (this commit)
  - `afbc22e` docs: security audit run 1 recorded
  - `050b354` + `96b087e` T-787 follow-up (CalendarWeekView) · `470ab22` + `bcb5d2e` T-787 (dead calendar views)
  - `6112d90` + `1aaf7f9` T-786 reserve slots · `8c654ce` + `8881277` T-785 lunch wire
- 8 untracked `.tmp_n8n*.py` scratch files in the root — pre-existing, do not commit.

## 2. Just shipped (do not rebuild)

- **T-788 — the two published secrets are gone (audit F3 + F4).** `settings.py` now resolves
  `DJANGO_SECRET_KEY` through `_resolve_secret_key()`: env value wins, `DEBUG=True` mints an
  ephemeral per-process key, `DEBUG=False` with no key **refuses to boot**. The
  `DEV_FALLBACK_WEBHOOK_SECRET` constant and its DEBUG branch are deleted from
  `webhook_security.py`, so nothing configured = 401 on all five guarded endpoints, in every mode.
  `backend/.env.example`, `n8n/.env.example` and `docker-compose.yml` were fixed to match the names
  the code actually reads (they did not). 8 new `SecretHygieneTests`, red first. **Owner still
  owes:** rotate any environment that used the published values, and declare both variables in
  `render.yaml` when staging gets set up.
- **T-787 — dead calendar views deleted.** `CalendarDayView.jsx` + `MasterCalendarGrid.jsx`
  removed (nothing live imported them; the day view still hardcoded a 12:00–13:00 lunch).
  The two harnesses that read the dead file as text now pin the live
  `DoctorGridBookingCalendar.jsx` instead (B5 = clinic-midnight day/month anchors,
  R4 = open-slot count from real appointments). The third orphan, `CalendarWeekView.jsx`
  (invented utilisation %), was deleted too on the owner's go-ahead. The calendar folder
  now holds only components something mounts.
- **T-785 — lunch is a real setting.** Settings saves flat `lunch_break_start/end` + `working_days`;
  one clinic-wide hours + lunch control; `GET /calendar/schedule/` returns a `clinic` block; the grid
  draws the saved lunch interleaved with appointments; no break (start = end) or Sunday draws none.
- **T-786 — reserve slots are real rows.** `GET/POST /clinic/reserve-slots/`,
  `DELETE /clinic/reserve-slots/{id}/`; schedule feed returns `reserve_slots`; grid draws real cards +
  real count; Settings has a Reserve Slots manager (list/add/remove). Refusals: 400 invalid/outside
  hours/unknown doctor; 409 `RESERVE_OVERLAPS_BOOKING` / `DUPLICATE_RESERVE`.

## 3. Run the dev environment

Servers die often. Restart them:

```powershell
# backend (from backend/) — NOTE: --noreload, so RESTART after any backend edit
Start-Process python -ArgumentList "manage.py","runserver","127.0.0.1:8000","--noreload" -WorkingDirectory "<repo>\backend" -WindowStyle Hidden
# frontend (from frontend/)
Start-Process npm -ArgumentList "run","dev","--","--port","5173","--strictPort" -WorkingDirectory "<repo>\frontend" -WindowStyle Hidden
```

- Backend `http://127.0.0.1:8000`, frontend `http://localhost:5173`.
- Login: `admin@clinic.com` / `adminpassword123`. Clinic timezone `Africa/Lagos`.
- Webhook secret: **not written in this file any more** (audit F3). Read it from `backend/.env`; n8n must carry the same string as `DJANGO_WEBHOOK_SECRET`. The old literal is retired.
- Settings route is `/admin/settings`; calendar `/calendar`; queue `/queue`.
- **Browser auth** (for the in-app browser): fetch `POST /api/v1/auth/login/`, then set localStorage
  `cbs_auth_token`, `cbs_refresh_token`, and `cbs_auth_session` =
  `{"state":{"isAuthenticated":true,"currentStaff":<user>,"pin":""},"version":0}`. Reload.
- Data loads async — wait for a real string ("visits this week", "Weekly Operating Hours") before reading the DOM.

## 4. Gates (run before committing)

```powershell
# frontend harnesses (from frontend/) — expect 17 files, 229/229 checks
Get-ChildItem tests -Filter *.js | ForEach-Object { node $_.FullName }
npm run build
# backend (from backend/) — expect 529/529 OK
python manage.py test appointments --verbosity 1
```

Current truth: **17 harnesses 229/229 · 11 n8n harnesses green · build clean · Django 529/529 OK.**

## 5. How we work (non-negotiable)

- **Red-first:** write the failing test/harness, see it red, then implement to green.
- **One small verified step at a time.** No big-bang builds. Owner approves scope before building.
- **Commits:** code + harness first, docs second. Never commit `main`.
- **Django owns all placement/wording/refusal text.** n8n only delivers. Frontend surfaces the server's sentence.
- **Frontend logic vs design split:** state/API/countdown in `stores/`, `hooks/`, `services/`;
  `components/` are presentational. Warm light theme (stone/white/black/amber), no navy/sky-blue.
- **Sync docs** on every change: `TEST.md`, `PROGRESS.md`, `API_REFERENCE.md`, and others as needed.
- After a step: update this file + `PROGRESS.md`.

## 6. Dev database state

- 3 doctors (Bello, Okafor, Babawo), real appointments, ~13 seed emergency reserves, recalls.
- Lunch currently at the clinic default **13:00–14:00** (a legitimate value; set it in Settings to change).
- Migrations `0001`–`0011` applied **locally only**. Reseed with `python manage.py seed_clinic`.
- `backend/.env` has only `WEBHOOK_SECRET`. **No `TELEGRAM_BOT_TOKEN`** → Telegram sends record
  `failed, "Telegram is not configured (no bot token)"`.

## 7. Blocked / known gaps

- **Staging deploy** awaits Railway/Vercel access; migrations 0009–0011 not run there.
- **Telegram token** missing (owner action). Partner creds absent (VoiceBip, Meta WhatsApp).
- **CI, Docker, Postgres/MySQL** verification not started (SQLite only so far).
- No known dead calendar components left (T-787 removed all three orphans); the CSS classes
  they used may still sit in `calendar.css` — harmless, prune only if it bothers you.

## 8. Next candidates (owner chooses)

**Security audit run 1 (2026-11-25) reorders these.** Report:
`C:\Users\User\security-audit-skill\booking-system\run-1\REPORT.md` (11 confirmed, 5 open).

1. ~~Rotate + require the two shared secrets~~ — **done in code (T-788)**: fallbacks deleted,
   boot refuses without a key, examples and docs scrubbed. **Still owed:** generate fresh values
   for this machine and any deployed host, and add `DJANGO_SECRET_KEY` + `WEBHOOK_SECRET` to
   `render.yaml` during the staging step.
2. ~~Add the missing verify node to n8n workflow 01~~ — **done (T-789)**: verify → IF → 401 trio,
   fail closed on an unset secret.
3. ~~Make `PROVIDER_MOCK` explicit and downgrade `mock:true`~~ — **done (T-789)**: only `true`/`false`
   accepted (throws otherwise), and a simulator answer is logged as the new `simulated` status
   (migration `0012`) instead of `sent`.
4. **Stop `seed_clinic` on boot** (`render.yaml:12`, `Procfile:1`) and gate it behind
   `SEED_CLINIC_ALLOWED=1`.
5. Then the session model: cookie-only auth, JWT blacklist on logout/reset, query-param auth
   narrowed to the stream route; fix `bool()` casts at `views_auth.py:504,675`.
6. Deploy staging (Railway/Vercel) + run migrations **0009–0012** there.
7. Add the Telegram bot token and prove a real send.
8. The `main` merge decision (100+ commits ahead).
9. CI / Docker / Postgres verification (`select_for_update` is untested on the engine that matters).
10. Dead code + performance cleanup: see `run-1\ENGINEERING-REVIEW.md`
    (`DoctorScheduleSummaryStrip.jsx`, `neonAuth.js`, 16 unused exports, 8 `.tmp_n8n*.py`,
    duplicate `resolve_doctor_or_default`, N+1 in `DoctorWorkloadView`, no idempotency pruning).

## 9. Key files

- Backend API: `backend/appointments/views_clinic.py`, `urls.py`, `serializers_clinic.py`, `models.py`,
  engine `services/availability.py` + `services/slot_rules.py`, tests `tests.py`.
- Frontend stores: `useSettingsStore.js`, `useCalendarStore.js`; hook `useClinicSettings.js`;
  API client `services/apiService.js`; clinic clock `services/clinicTimeService.js`.
- Grid: `components/calendar/DoctorGridBookingCalendar.jsx`.
- Settings UI: `views/SettingsView.jsx`, `components/settings/OperatingHoursBento.jsx`,
  `components/settings/ReserveSlotsBento.jsx`, styles `styles/components/settings.css`.
- Harnesses: `frontend/tests/test_settings_truth.js` (lunch), `test_reserve_slots.js` (reserves),
  `test_impeccable_ui.js`, `test_calendar_truth.js`.