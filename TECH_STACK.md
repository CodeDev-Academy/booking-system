# Technology Stack & Tooling Decisions

## 1. Stack Matrix

| Layer | Selected Tech | Version / Standard | Justification |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | React.js | `^18.3` | Modular component architecture, wide ecosystem, standard across modern agency web applications. |
| **Styling & Design System** | Vanilla CSS (CSS Variables) | Modern CSS3 | Ultra-fast load times, zero build tool dependency bloat, granular customization for client white-labeling. |
| **Backend Framework** | Python + Django | `Django 5.x` | Built-in ORM with atomic transactions, rock-solid security, instant Django admin portal for clinic staff. |
| **API Layer** | Django REST Framework (DRF) | `3.15+` | Clean JSON serializers, rate limiting, OpenAPI schema generation, and viewsets. |
| **Database** | SQLite (Dev) / MySQL or Postgres (Prod) | SQLite 3 / MySQL 8.0 | Zero-setup local prototyping via SQLite; 1-click transition to MySQL/Postgres in production via Django ORM. |
| **Workflow Automation** | n8n | Latest Community Edition | Visual orchestrator for messaging webhooks, 60s cron jobs, and reminders. |
| **Messaging Channel** | **Telegram Bot API** (Primary) | Bot API 7.x | Zero developer account friction, instant free bot token via `@BotFather`, rich Inline Keyboards, and WebApp forms. WhatsApp Cloud API supported as secondary toggle. |
| **Frontend Hosting** | Vercel | Production Edge | Instant global edge CDN distribution, zero-config React deployments. |
| **Backend & n8n Hosting** | Railway | Cloud Container | Simple deployment for Django WSGI/ASGI + persistent volume for SQLite/n8n workflows. |

---

## 2. Dependency Constraints & Security
- **Python Environment**: Dedicated virtualenv (`venv`).
- **Data Protection**: Zero raw plain-text storage of sensitive medical diagnoses; NDPA-compliant data fields.
- **Frontend Assets**: Inter/Outfit Google Fonts, Lucide icons, glassmorphism tokens.
