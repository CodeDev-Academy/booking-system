# Deployment Guide & Production Environment Setup

## 1. Multi-Target Deployment Architecture

| Component | Target Platform | Build/Deploy Mechanism | Environment Variables |
| :--- | :--- | :--- | :--- |
| **Frontend Dashboard** | **Vercel** | Git push $\rightarrow$ Vite/React build | `VITE_API_BASE_URL`, `VITE_CLINIC_NAME` |
| **Backend API Engine** | **Railway** | Dockerfile / `nixpacks` Django WSGI | `DJANGO_SECRET_KEY`, `DATABASE_URL`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` |
| **Database** | **Railway** | Managed PostgreSQL / SQLite persistent volume | `DATABASE_URL` |
| **Workflow Engine** | **Railway** | Docker image `n8nio/n8n:latest` | `N8N_ENCRYPTION_KEY`, `WEBHOOK_URL`, `DJANGO_API_KEY` |

---

## 2. Railway Backend & n8n Setup

### Step 1: Django Backend Container (`railway.json` / Dockerfile)
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
RUN python manage.py collectstatic --noinput
EXPOSE 8000
CMD ["gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]
```

### Step 2: n8n Service on Railway
- Deploy template: `n8nio/n8n`
- Add persistent volume mounted at `/home/node/.n8n`
- Configure Environment Variables:
  - `N8N_HOST`: `your-n8n-domain.up.railway.app`
  - `WEBHOOK_URL`: `https://your-n8n-domain.up.railway.app/`
  - `GENERIC_TIMEZONE`: `Africa/Lagos`

---

## 3. Vercel Frontend Deployment

1. Link repository to Vercel.
2. Root Directory: `frontend`
3. Framework Preset: `Vite`
4. Set Environment Variable:
   ```
   VITE_API_BASE_URL=https://your-backend-production.up.railway.app/api/v1
   ```
5. Deploy.
