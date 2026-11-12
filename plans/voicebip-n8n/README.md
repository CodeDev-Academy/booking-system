# Clinic Management System ⇄ n8n & Voicebip Integration Master Roadmap

## 📌 Overview
This directory stores the official architectural specifications, webhook schemas, and handover blueprints for connecting the **Clinic Management System** to **n8n** and **Voicebip** (Nigeria-first AI telephony on +234 carrier DIDs).

Each feature is planned independently and documented here as an isolated, handover-ready specification before system implementation begins.

---

## 🗺️ Feature Index & Planning Status

| # | Feature Name | Trigger Type | Primary Channels | Status | Handover Spec File |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **01** | **Receptionist Slot Dispatch** | Receptionist clicks *Approve & Dispatch* | Dual WhatsApp + SMS + Voicebip Call Nudge | **Planned & Ready** | [`01_slot_dispatch_whatsapp_call.md`](./01_slot_dispatch_whatsapp_call.md) |
| **02** | **Pre-Visit Reminders (24h & 2h)** | Automated Scheduled Cron | Dual WhatsApp + SMS (Zero Calls) | **Planned & Ready** | [`02_pre_visit_reminders_voicebip.md`](./02_pre_visit_reminders_voicebip.md) |
| **03** | **Doctor Emergency Disruption** | Receptionist marks Clinician on Sick Leave | Priority Voicebip Call + Dual WhatsApp & SMS | **Planned & Ready** | [`03_doctor_disruption_whatsapp_sms.md`](./03_doctor_disruption_whatsapp_sms.md) |
| **04** | **Offer Expiry & Re-engagement** | 60-Minute Expiry Sweeper | Dual WhatsApp + SMS (45m Nudge + 60m Recovery) | **Planned & Ready** | [`04_offer_expiry_reengagement.md`](./04_offer_expiry_reengagement.md) |
| **05** | **Post-Visit Welfare & Recall** | Visit Completed + Follow-up Due | WhatsApp / SMS Welfare Check-in | *Pending Planning* | `05_post_visit_welfare_recall.md` |

---

## 🔑 Shared Environment Variables & Secrets Reference

When your partner deploys n8n, these shared environment variables connect n8n to the clinic backend and Voicebip:

```env
# Clinic Management System Backend
DJANGO_API_BASE_URL=https://your-clinic-backend.up.railway.app
DJANGO_WEBHOOK_SECRET=clinic_dev_secret_2026

# Clinic Backend Outbound Webhook (Configured in Django backend/.env)
N8N_DISPATCH_WEBHOOK_URL=https://your-n8n-instance.com/webhook/dispatch-offers

# Voicebip Telephony Credentials
VOICEBIP_API_KEY=pk_live_xxxxxxxxxxxxxxxxxxxxxxxx
VOICEBIP_BASE_URL=https://api.voicebip.com/v1
VOICEBIP_FROM_NUMBER=+2341002223344

# WhatsApp Cloud API / Voicebip WhatsApp
WHATSAPP_PHONE_NUMBER_ID=xxxxxxxxxxxxxxxx
WHATSAPP_ACCESS_TOKEN=EAAG...
```

