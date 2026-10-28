# Production Deployment & Agency Onboarding Guide (`DEPLOYMENT_GUIDE.md`)

This guide outlines the production deployment architecture, 1-click onboarding steps, and environment configuration for the **MedPulse / Cedarcare Receptionist-Approved Clinic Booking System**.

---

## 1. High-Level Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      VERCEL (Frontend)                      │
│   • React 18 SPA (Vite) + Vanilla CSS Token System          │
│   • Zero runtime server / instant global CDN delivery        │
│   • Domain: https://reception.yourclinic.com                │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS (REST API + SSE Stream)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     RAILWAY (Backend App)                   │
│   • Django 5 + Django REST Framework                        │
│   • Gunicorn WSGI workers (Concurrency-safe)                │
│   • Deterministic Availability Engine + SSE Event Bus       │
│   • Domain: https://api.yourclinic.com                      │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼                               ▼
┌──────────────────────────────┐┌─────────────────────────────┐
│      RAILWAY POSTGRESQL      ││    RAILWAY n8n WORKFLOW     │
│   • Managed PostgreSQL 16    ││   • Docker: n8nio/n8n:latest│
│   • Row-level locks          ││   • Inbound Intake / Sweeper│
│   • Immutable Audit Trail    ││   • 24h & 2h Reminders Flow │
└──────────────────────────────┘└─────────────────────────────┘
```

---

## 2. Railway Backend Deployment (Django + PostgreSQL)

### Step 1: Provision Railway PostgreSQL Database
1. Create a new project on [Railway.app](https://railway.app).
2. Click **+ New** ➔ **Database** ➔ **Add PostgreSQL**.
3. Railway automatically generates the `DATABASE_URL` connection string.

### Step 2: Deploy Django Backend
1. Click **+ New** ➔ **GitHub Repo** ➔ select your repository.
2. Under **Settings** ➔ **Root Directory**, set to `/backend`.
3. Add the following **Environment Variables**:

| Variable | Example Value | Description |
| :--- | :--- | :--- |
| `DJANGO_SECRET_KEY` | `prod_django_secret_k3y_987654` | Long, random cryptographic key |
| `DEBUG` | `False` | Disables debug mode in production |
| `ALLOWED_HOSTS` | `.railway.app,api.yourclinic.com` | Hostnames permitted to connect |
| `CORS_ALLOWED_ORIGINS` | `https://reception.yourclinic.com` | Allowed frontend domains |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Auto-wired by Railway to Postgres |
| `TELEGRAM_BOT_TOKEN` | `123456789:ABCdefGHIjkl...` | Bot token from @BotFather |
| `TELEGRAM_WEBHOOK_SECRET`| `cl1n1c_tg_s3cr3t_2026` | Secret token verified on inbound webhooks |
| `DJANGO_WEBHOOK_SECRET` | `clinic_dev_secret_2026` | Shared secret header between n8n and Django |

### Step 3: Deployment Procfile / Start Command
In `backend/Procfile`:
```procfile
web: python manage.py migrate && python manage.py collectstatic --noinput && gunicorn core.wsgi:application --bind 0.0.0.0:$PORT --workers 3
```

To seed the initial clinic database on first boot, run in Railway CLI or deploy terminal:
```bash
python manage.py seed_clinic
```

---

## 3. Vercel Frontend Deployment (React + Vite)

1. Open [Vercel.com](https://vercel.com) and click **Add New...** ➔ **Project**.
2. Select your repository.
3. Configure Project Settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add Environment Variables:

| Variable | Value | Description |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `https://api.yourclinic.com/api/v1` | Production Django API endpoint |
| `VITE_CLINIC_NAME` | `Cedarcare Specialist Clinic` | Display name for patient frames |

5. Click **Deploy**. The site will build in <30 seconds and issue an SSL certificate.

---

## 4. n8n Automation Engine Deployment (Railway Docker)

1. In your Railway project, click **+ New** ➔ **Docker Image** ➔ enter `n8nio/n8n:latest`.
2. Add a **Persistent Volume** mounted at `/home/node/.n8n` (minimum 2GB).
3. Set Environment Variables:
   - `N8N_HOST`: `n8n.yourclinic.com`
   - `WEBHOOK_URL`: `https://n8n.yourclinic.com/`
   - `GENERIC_TIMEZONE`: `Africa/Lagos`
   - `DJANGO_API_BASE_URL`: `https://api.yourclinic.com`
   - `DJANGO_WEBHOOK_SECRET`: `clinic_dev_secret_2026`
   - `TELEGRAM_BOT_TOKEN`: `123456789:ABCdefGHI...`
4. Import the 5 production workflow JSONs from [`n8n/`](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/n8n/) into the n8n UI and switch them to **Active**.

---

## 5. Telegram Bot Webhook Activation

### Option A: Direct Django Integration (`django_direct`)
```bash
curl -F "url=https://api.yourclinic.com/api/v1/webhooks/telegram/inbound/" \
     -F "secret_token=cl1n1c_tg_s3cr3t_2026" \
     https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook
```

### Option B: Visual n8n Automation Engine (`n8n_webhook`)
```bash
curl -F "url=https://n8n.yourclinic.com/webhook/messaging/inbound" \
     https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook
```

---

## 6. Onboarding a New Clinic Client in 15 Minutes

1. **Duplicate or Configure Settings**:
   - Customize [`client-config.example.json`](file:///c:/Users/User/OneDrive/Desktop/Project/Clinic%20Booking%20system/client-config.example.json) with client name, doctors, and operating hours.
   - Upload via `POST /api/v1/clinic/settings/import/` or via UI at `/admin/settings`.
2. **Create Staff Logins**:
   - Create doctor and receptionist profiles via `/admin/staff` or CLI.
   - Assign initial 4-digit numeric Quick-PINs for screen lock.
3. **Verify Zero Double-Booking Health Check**:
   - Run health check: `curl https://api.yourclinic.com/api/v1/health/`
   - Confirm response: `{"status": "healthy", "service": "Clinic Booking API", "version": "1.0.0"}`.
