# Production Deployment Guide: Coolify Agency Setup (`DEPLOYMENT_GUIDE.md`)

This guide outlines the production deployment architecture, 1-click onboarding steps, and environment configuration for hosting the **Receptionist-Approved Clinic Booking System** entirely on **Coolify** (Frontend, Backend, n8n, and Database).

---

## 1. High-Level Coolify Architecture

```
                                  ┌───────────────────────────────┐
                                  │      Client / Patient Phone   │
                                  │   (Anywhere on 4G/5G / WiFi)  │
                                  └───────────────┬───────────────┘
                                                  │ HTTPS
                                                  ▼
                         ┌────────────────────────────────────────────────┐
                         │           Coolify Traefik Reverse Proxy        │
                         │      (Automatic Let's Encrypt SSL & Routing)   │
                         └───────┬────────────────┬───────────────┬───────┘
                                 │                │               │
        https://clinic.domain.ng │                │               │ https://n8n.domain.ng
                                 ▼                │               ▼
┌──────────────────────────────────────────┐      │     ┌───────────────────────────────────┐
│        frontend (Nginx Alpine)           │      │     │       n8n Automation Engine       │
│  • React 18 SPA (Vite) + Vanilla CSS     │      │     │  • 01 Intake Webhook              │
│  • try_files $uri /index.html (Zero 404s)│      │     │  • 02 60s Expiry Sweeper Cron     │
│  • Port 80 (Internal)                    │      │     │  • 03 Reminders (24h / 2h)        │
└──────────────────────────────────────────┘      │     │  • 04 Patient Response Router     │
                                                  │     │  • 05 Slot Offer Dispatcher       │
                                                  │     │  • Port 5678 (Internal)           │
                                                  │     └─────────────────┬─────────────────┘
                         https://api.domain.ng    ▼                       │
                        ┌──────────────────────────────────────────┐      │ Internal Webhooks
                        │        backend (Django REST + Gunicorn)  │◄─────┘
                        │  • 2 Gunicorn Workers + 4 Threads (SSE)  │
                        │  • Deterministic Availability Engine     │
                        │  • Concurrency-Safe select_for_update    │
                        │  • Port 8000 (Internal)                  │
                        └─────────────────┬────────────────────────┘
                                          │
                                          │ PostgreSQL Connection
                                          ▼
                        ┌──────────────────────────────────────────┐
                        │     PostgreSQL Database (Neon / Coolify) │
                        │  • 22 Applied Relational Migrations      │
                        │  • ACID Row-Level Locking                │
                        │  • Immutable Audit Trail                 │
                        └──────────────────────────────────────────┘
```

---

## 2. 1-Click Turnkey Deployment on Coolify

The repository contains a turnkey `docker-compose.yml` pre-configured with:
- **`backend`**: Django REST API running with Gunicorn threaded workers (`-k gthread --threads 4`) to support real-time Server-Sent Events (SSE) without worker starvation.
- **`frontend`**: React Vite application built into Nginx Alpine with SPA client-side routing (`try_files $uri /index.html`), gzip compression, and security headers.
- **`n8n`**: Official `n8nio/n8n:latest` image with persistent storage for workflows.

### Step 1: Create a New Project in Coolify
1. In your Coolify dashboard, click **+ Projects** ➔ **+ Add Project**.
2. Select your environment (e.g. `production`).

### Step 2: Deploy via Docker Compose
1. Click **+ New Resource** ➔ **Docker Compose**.
2. Select your GitHub / Git Repository containing this project.
3. Choose the branch (e.g., `main`).
4. Set **Compose File Location**: `/docker-compose.yml`.

### Step 3: Configure Domains in Coolify
In the Coolify UI under **Domains / Traefik Configuration**, assign your public domains:
- **Frontend**: `https://clinic.yourdomain.com` (or `https://reception.yourdomain.com`) ➔ mapped to `frontend:80`
- **Backend API**: `https://api.yourdomain.com` ➔ mapped to `backend:8000`
- **n8n Automation**: `https://n8n.yourdomain.com` ➔ mapped to `n8n:5678`

*Coolify will automatically generate and renew Let's Encrypt SSL certificates for all 3 subdomains.*

---

## 3. Environment Variables Configuration

In Coolify, open the **Environment Variables** tab for your Docker Compose resource and set:

| Variable | Recommended Production Value | Description |
| :--- | :--- | :--- |
| `DJANGO_SECRET_KEY` | `generate-a-random-64-char-string` | Cryptographic secret for session and token signing |
| `DJANGO_DEBUG` | `False` | Disables debug mode in production |
| `DJANGO_ALLOWED_HOSTS` | `api.yourdomain.com,backend` | Permitted Host headers |
| `CORS_ALLOWED_ORIGINS` | `https://clinic.yourdomain.com` | Permitted frontend origin for REST & SSE calls |
| `DATABASE_URL` | `postgresql://user:pass@ep-xyz-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require` | Connection string to live Neon PostgreSQL (or Coolify PostgreSQL) |
| `DJANGO_WEBHOOK_SECRET` | `cbs-secure-webhook-token-2026` | Shared secret header between n8n sweeper and Django |
| `N8N_DISPATCH_WEBHOOK_URL`| `http://n8n:5678/webhook/dispatch-offers` | Internal webhook URL for Django to trigger n8n when slots are approved |
| `VITE_API_BASE_URL` | `https://api.yourdomain.com/api/v1` | Public API URL compiled into the React frontend |
| `N8N_HOST` | `n8n.yourdomain.com` | Public domain for n8n UI |
| `WEBHOOK_URL` | `https://n8n.yourdomain.com/` | Public base URL for n8n webhook listeners |
| `GENERIC_TIMEZONE` | `Africa/Lagos` | Timezone for schedulers and timestamps |

> [!IMPORTANT]
> **Database IP Notice**: In cloud Linux environments (like Coolify), do **NOT** include `&hostaddr=...` in your `DATABASE_URL`. Use the standard domain-based Neon pooler string with `?sslmode=require`.

---

## 4. First-Boot Database Seeding

When the containers finish deploying:
1. Open the **`backend`** container terminal in Coolify (or run via SSH / Coolify execute command).
2. Run the clinic seeder to establish the initial staff accounts, doctors, and specialties:
   ```bash
   python manage.py seed_clinic
   ```
3. This creates:
   - **Lead Receptionist**: `sarah.aliyu@cedarcare.ng` (Password: `password123`, Quick-PIN: `1234`)
   - **Clinic Admin**: `admin@cedarcare.ng` (Password: `adminpassword123`, Quick-PIN: `9999`)
   - **Doctors**: Dr. Bello, Dr. Okafor, Dr. Babawo
   - **Services**: Dental Consultation, Tooth Extraction, Eye Examination, ENT, General Practice

---

## 5. Setting Up n8n Workflows in Coolify

1. Open `https://n8n.yourdomain.com` and create your administrative account.
2. In the n8n sidebar, click **Workflows** ➔ **Import from File...** and import the 5 workflows from the `n8n/` directory:
   - `01_intake_webhook.json` (Inbound Web / WhatsApp / Telegram patient intake)
   - `02_hold_and_offer_expiry_cron.json` (60-second background sweeper)
   - `03_reminder_flows.json` (24-hour and 2-hour pre-visit notifications)
   - `04_patient_response_handler.json` (Handles patient selection, confirm, reschedule)
   - `05_slot_offer_dispatcher.json` (Dispatches interactive slot offers to patient phone)
3. Set the Workflow Environment Variables inside n8n:
   - `CBS_API_URL`: `http://backend:8000/api/v1` (Using internal Docker network) or `https://api.yourdomain.com/api/v1`
   - `CBS_WEBHOOK_SECRET`: The same secret string configured in `DJANGO_WEBHOOK_SECRET`
4. Toggle all 5 workflows to **Active**.

---

## 6. How Your Live Client Demonstration Works

Once deployed to Coolify:

1. **Receptionist Access**:
   - Open `https://clinic.yourdomain.com` on your laptop or tablet.
   - Log in with `sarah.aliyu@cedarcare.ng` / `password123`.
2. **Client Phone Booking**:
   - Give the client the intake link (or open it on their phone): `https://clinic.yourdomain.com/simulator` or your public booking widget.
   - The client can be on **cellular data (MTN, Airtel, etc.) anywhere in the world** — zero shared Wi-Fi needed.
   - The client submits their name, phone number, and preferred appointment time.
3. **Live Receptionist Triage**:
   - The receptionist dashboard receives the real-time event via Server-Sent Events (SSE) accompanied by an audio chime.
   - Click **Review Request** ➔ The backend Availability Engine calculates valid doctor slots based on working shifts and buffers.
   - Click **Approve & Dispatch** ➔ The request enters the 60-minute offer window, and n8n dispatches the candidate times directly to the client's phone.
4. **Automated Background Lifecycle**:
   - The n8n 60s cron monitors slot holds and offers.
   - If the client doesn't confirm within 60 minutes, the offer automatically expires and transitions to the **Expired Requests** tab without human intervention.
