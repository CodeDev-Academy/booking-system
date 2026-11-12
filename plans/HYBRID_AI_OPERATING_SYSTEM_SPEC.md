# Hybrid Website AI Operating System
## Architecture, Database Access & Two-Way Integration Specification

**DOCUMENT STATUS**: Architecture & Integration Specification — REVIEW VERSION  
**ALIGNMENT**: For alignment between the Clinic Dashboard / Backend Developer and the Dispatcher & External Integrations Developer (n8n / VoiceBip).  
**SELECTED ARCHITECTURE**: Type 3 — Two-Way Synchronization  
**SELECTED ACCESS METHOD**: Option B — Secure Backend API  
**DASHBOARD UPDATES**: API Operations + Realtime Updates + Scheduled Reconciliation  

---

## 1. Purpose and Overall Vision
We are extending an existing clinic dashboard into a **Hybrid Website AI Operating System**. The dashboard remains the business owner's main operational workstation. The website backend and database manage clinic records, while the Dispatcher coordinates AI agents, automation, and external services.

* **Website and Database**: Business interface and authoritative store for customers, appointments, services, campaigns, and activity history.
* **Dispatcher (n8n)**: Central controller and orchestration layer. It receives events and commands, applies workflow logic, coordinates external providers, and returns results to the website.
* **External Providers**: Flexible and include VoiceBip, WhatsApp, Meta, Google, email, calendar, payment services, and other integrations. The architecture does not depend on a single fixed provider.

> **Core Principle**: The website is the business operating interface; the database is the authoritative business record; the Dispatcher is the orchestration layer; external networks provide connected capabilities.

---

## 2. Three Depths of Website Connection

* **Type 1 — The Front Door**: Website forms, booking enquiries, chat widgets, and entry points send leads to the Dispatcher. The Dispatcher processes the lead and triggers the relevant workflow (primarily inbound).
* **Type 2 — Shared Knowledge**: Agents retrieve current business information through an approved interface (services, prices, opening hours, policies, appointment availability). Primarily read access.
* **Type 3 — Two-Way Synchronization (SELECTED MODEL)**: The website and Dispatcher exchange commands, events, and operational results. Leads, statuses, appointments, call outcomes, message statuses, and campaign results are written back to the website.
  *(Type 3 encompasses the capabilities of Types 1 and 2 where needed. These are integration depths, not separate systems.)*

---

## 3. Selected Architecture: Secure Backend API (Option B)

The Dispatcher communicates with the website exclusively through authenticated backend API endpoints provided by the website developer. The Dispatcher **does not require unrestricted direct database credentials**.

```
┌────────────────────────────────────────────────────────┐
│                   WEBSITE FRONTEND                     │
│      Clinic dashboard, customers, appointments         │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                  WEBSITE BACKEND / API                 │
│      Authentication, permissions, business rules       │
└─────────────┬────────────────────────────▲─────────────┘
              │                            │
┌─────────────▼──────────────┐ ┌───────────┴─────────────┐
│      WEBSITE DATABASE      │ │       DISPATCHER        │
│  Authoritative business    │ │     (n8n Engine)        │
│          records           │ └───────────┬─────────────┘
└────────────────────────────┘             │
                               ┌───────────▼─────────────┐
                               │   EXTERNAL PROVIDERS    │
                               │  VoiceBip, Meta, etc.   │
                               └─────────────────────────┘
```

---

## 4. How Communication Works: The Hybrid Triad

1. **A. API Operations**: The Dispatcher uses authenticated endpoints to retrieve or update records: customers, campaigns, availability, bookings, and interaction results.
2. **B. Realtime Updates**: After a database change is saved, the website backend notifies the dashboard via Server-Sent Events (SSE) / realtime subscriptions. Realtime improves instant visibility; it is not the authoritative record.
3. **C. Scheduled Reconciliation**: Scheduled sweeper cron checks detect missed notifications, failed updates, or records requiring synchronization, providing resilience and recovery.

---

## 5. The Two Communication Directions

* **Website $\rightarrow$ Dispatcher**: The website initiates an operation (e.g., receptionist launches a campaign, requests follow-up, or dispatches slot offers). Commands are persisted before being treated as accepted for processing.
* **Dispatcher $\rightarrow$ Website**: The Dispatcher returns external results (e.g., new lead, completed call outcome, confirmed appointment, message status, or campaign result). It submits updates through the website API; the dashboard displays the saved changes.

---

## 6. Database and Data Consistency Requirements

The website database is the authoritative business record. It uses related relational tables rather than one oversized table across 6 functional areas:

| Data Area | Example Information Stored |
| :--- | :--- |
| **Clinic / Business** | Business ID, clinic profile, contact details, operating hours, services, and settings. |
| **Customers / Patients** | Customer ID, name, normalized phone, email, lead source, status, preferences, consent. |
| **Campaigns** | Campaign ID, clinic ID, promotion details, target audience, selected channels, status, results. |
| **Appointments** | Appointment ID, customer ID, service, date/time, assigned staff, booking and reminder statuses. |
| **Interactions** | Interaction ID, provider, call/message status, transcript or summary, result, timestamps. |
| **Events / Integrations** | Event ID, event type, source, related record, processing status, retry details, timestamps. |

* **Identifiers**: Stable UUIDs and human-readable codes (`REQ-YYYY-XXXX`, `AP-XXXX`) are retained across the website, Dispatcher, and external providers.
* **Duplicate Protection**: Automatic E.164 phone normalization with customer ID as primary identifier. Idempotency keys prevent duplicate records from repeated deliveries.
* **Booking Consistency**: Backend validates and locks an appointment (`SELECT FOR UPDATE`) before the Dispatcher or agent informs the patient it is confirmed, preventing double-booking.

---

## 7. Required API Capabilities from Website Developer

| Capability | Purpose |
| :--- | :--- |
| **Customer read/create/update** | Retrieve, create, or update customer records and lead status. |
| **Campaign and audience retrieval** | Retrieve campaign settings and eligible customers. |
| **Services and prices** | Provide current clinic services, prices, and scheduling policies. |
| **Availability check** | Check valid appointment slots, shifts, buffers, and constraints. |
| **Appointment create/update/cancel** | Secure or modify bookings atomically and return confirmed results. |
| **Interaction records** | Save call outcomes, summaries, transcripts, and message delivery statuses. |
| **Campaign result updates** | Record execution progress, completion, and outreach results. |

*Example route grouping*: `/api/v1/customers/`, `/api/v1/campaigns/`, `/api/v1/appointments/`, `/api/v1/interactions/`, `/api/v1/events/`.

---

## 8. Security & Access Control
* **Dedicated Integration Credentials**: Dispatcher authenticates with scoped API tokens or `X-Webhook-Secret`.
* **Clinic-Level Data Isolation**: Multi-tenant/instance separation ensures one business cannot touch another's records.
* **No Secrets in Frontend**: Privileged provider tokens (VoiceBip API keys, WhatsApp tokens) stay strictly on the backend/Dispatcher.
* **Server-Side Validation**: Every write operation is validated by Django business rules; never trusts the client alone.
* **Privacy & Audit Logging**: Append-only audit logs with masked phone numbers (`+234 801 **** 5678`) complying with NDPR/HIPAA.

---

## 9. Architectural Advantages & Engineering Solutions

| Disadvantage / Risk | Required Practical Solution |
| :--- | :--- |
| **1. Dependence on API** | Agree on required API capabilities before workflow development; maintain shared checklist. |
| **2. Network Latency** | Efficient endpoints, cached read-only data, optimized availability checks, keep heavy work out of live call paths. |
| **3. More Website Dev Work** | Build consistent, reusable REST endpoints rather than fragmented one-off routes. |
| **4. Breaking Changes** | Use versioned routes (`/api/v1/`); communicate changes before modifying shared contracts. |
| **5. High Volume Bottlenecks** | Use pagination, atomic transactions, rate limits, and efficient database indexing. |
| **6. Temporary Failures** | Persist pending updates, retry safely, use idempotency keys, log failures, run scheduled reconciliation. |
| **7. Missed Realtime Updates** | Database remains single source of truth; re-fetch on reconnection, reconcile via cron sweepers. |
| **8. Inconsistent Data Contracts** | Agree on shared IDs, event names, ISO-8601 timestamps, and field formats jointly. |

---

## 10. End-to-End Reference Scenarios (Clinic Dashboard)

* **Scenario A — Lead Arrives from Ad or Web Form**: Lead received $\rightarrow$ Dispatcher normalizes E.164 phone $\rightarrow$ calls Clinic API to create/update customer $\rightarrow$ DB saves $\rightarrow$ Dashboard displays new card via SSE $\rightarrow$ Dispatcher triggers voice/message sequence.
* **Scenario B — Agent Completes Conversation**: Voice/message provider returns result $\rightarrow$ Dispatcher maps to standard format $\rightarrow$ Dispatcher updates customer status and interaction record via API $\rightarrow$ Dashboard shows call outcome/summary.
* **Scenario C — Patient Requests Appointment**: Agent captures desired service/time $\rightarrow$ Dispatcher queries Clinic API availability $\rightarrow$ Backend validates and creates atomic hold $\rightarrow$ Confirmed result returned to agent $\rightarrow$ Calendar displays appointment.
* **Scenario D — Appointment Reminders**: Scheduled Dispatcher cron queries Clinic API for upcoming appointments $\rightarrow$ Dispatcher triggers WhatsApp/SMS $\rightarrow$ Saves delivery status via API $\rightarrow$ Dashboard shows reminder status.
* **Scenario E — Staff Launch Campaign**: Staff creates campaign in dashboard $\rightarrow$ Website persists command and triggers Dispatcher $\rightarrow$ Dispatcher retrieves audience $\rightarrow$ Coordinates VoiceBip/WhatsApp outreach $\rightarrow$ Results written back to Clinic API $\rightarrow$ Dashboard displays real-time progress.

---

## 11. Division of Responsibilities

| Website / Database Developer (Our Scope) | Dispatcher / Integration Developer (Partner Scope) |
| :--- | :--- |
| Build and maintain clinic website & dashboard. | Build and maintain n8n orchestration workflows. |
| Design and maintain database schema & relations. | Connect n8n to approved website API endpoints. |
| Implement backend REST API, auth & permissions. | Receive external webhooks and process events. |
| Enforce clinic business rules & atomic booking locks. | Coordinate voice, messaging, ads & external providers. |
| Implement dashboard realtime updates (SSE). | Normalize provider responses & submit website updates. |
| Document endpoints & communicate schema/API changes. | Manage retries, logs, execution failures & reconciliation. |

---

## 12. Six-Stage Development & Integration Sequence
* **Stage 1 — Architecture Agreement**: Both developers confirm the Type 3 / Option B model. *(COMPLETE)*
* **Stage 2 — Website Proposal**: Website developer shares proposed schema, API list, authentication, and realtime mechanism. *(OUR CURRENT STAGE)*
* **Stage 3 — Dispatcher Review**: Dispatcher developer verifies interface supports customers, campaigns, bookings, and interactions.
* **Stage 4 — Integration Contract**: Joint agreement on payloads, event names, UUIDs, errors, and retries.
* **Stage 5 — Incremental Testing**: Test one end-to-end journey (Feature 1 slot dispatch), then expand.
* **Stage 6 — Ongoing Coordination**: Ongoing schema sync and maintenance.

