FROM python:3.12-slim

# Prevent Python from writing .pyc files and enable unbuffered output for live logs
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies required for psycopg and SSL
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY . /app/

# Create directory for static assets
RUN mkdir -p /app/staticfiles

# Expose backend port
EXPOSE 8000

# Entrypoint script to run migrations, seed initial clinic data, collectstatic, and start Gunicorn with threaded workers for SSE
CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py seed_clinic && python manage.py collectstatic --noinput && gunicorn core.wsgi:application --bind 0.0.0.0:8000 --workers 2 --threads 4 --worker-class gthread --access-logfile - --error-logfile -"]

