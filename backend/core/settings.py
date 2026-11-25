"""
Django settings for Clinic Booking System core project.
Configured by Brain Agent for agency-template deployment.
"""

from pathlib import Path
from datetime import timedelta
import os
import secrets as _secrets
import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Load Neon environment variables from project root (.env.local, .env) or backend dir
load_dotenv(BASE_DIR.parent / '.env.local')
load_dotenv(BASE_DIR.parent / '.env')
load_dotenv(BASE_DIR / '.env.local')
load_dotenv(BASE_DIR / '.env')

DEBUG = os.environ.get('DJANGO_DEBUG', 'True').lower() in ('true', '1', 'yes')


def _resolve_secret_key(debug, env_value):
    """
    Security audit F4 (2026-11-25). SECRET_KEY used to fall back to a literal
    committed in this file, and `render.yaml` never set DJANGO_SECRET_KEY - so
    the documented deployment signed every staff JWT with a string anyone who
    could read the repository knew. Whoever read it could forge a session for
    any staff id they had.

    The rule now: the key comes from the environment, or a real deployment
    refuses to boot. Development is not broken, but it gets an EPHEMERAL key
    generated for this process - tokens die on restart, and no secret value
    appears anywhere in source (a hygiene test enforces that).
    """
    value = (env_value or '').strip()
    if value:
        return value
    if debug:
        return _secrets.token_urlsafe(50)
    raise RuntimeError(
        'DJANGO_SECRET_KEY is required when DEBUG is False. Generate one with: '
        'python -c "import secrets; print(secrets.token_urlsafe(50))" - and set it '
        'in the deployment environment. Refusing to start with a signing key that '
        'is not secret.'
    )


SECRET_KEY = _resolve_secret_key(DEBUG, os.environ.get('DJANGO_SECRET_KEY'))

ALLOWED_HOSTS = os.environ.get('DJANGO_ALLOWED_HOSTS', '*').split(',')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third-Party Agency Extensions
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    
    # Clinical Domain Application
    'appointments',
]

try:
    import whitenoise
    HAS_WHITENOISE = True
except ImportError:
    HAS_WHITENOISE = False

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  # Top of middleware for CORS headers
    'django.middleware.security.SecurityMiddleware',
]

if HAS_WHITENOISE:
    MIDDLEWARE.append('whitenoise.middleware.WhiteNoiseMiddleware')

MIDDLEWARE.extend([
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
])

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'

# 1-Click Database Engine Switcher (SQLite -> MySQL / PostgreSQL via DATABASE_URL)
DATABASES = {
    'default': dj_database_url.config(
        default=f'sqlite:///{BASE_DIR / "db.sqlite3"}',
        conn_max_age=600,
        conn_health_checks=True,
    )
}

# Concurrency & Lock Resilience for SQLite in Development / Fast Test Execution
import sys
if 'test' in sys.argv:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'test_db.sqlite3',
            'OPTIONS': {
                'timeout': 20,
            }
        }
    }
elif DATABASES['default']['ENGINE'] == 'django.db.backends.sqlite3':
    DATABASES['default']['OPTIONS'] = {
        'timeout': 20,
    }

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Universal Timezone Configuration
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Africa/Lagos'  # Fixed clinic operating wall-clock time
USE_I18N = True
USE_TZ = True               # Strict UTC database normalization

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Django REST Framework Configuration
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'appointments.authentication.CookieJWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.AllowAny',
    ),
    'DEFAULT_RENDERER_CLASSES': (
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ),
    'EXCEPTION_HANDLER': 'appointments.exceptions.clinic_exception_handler',
}

# SimpleJWT Session Lifetime Configuration
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),  # 30-day session
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': False,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# Cross-Origin Resource Sharing (CORS) for React Frontend
cors_env = os.environ.get('CORS_ALLOWED_ORIGINS', '')
if cors_env:
    CORS_ALLOWED_ORIGINS = [origin.strip() for origin in cors_env.split(',') if origin.strip()]
else:
    CORS_ALLOWED_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5176",
        "http://localhost:5177",
        "http://127.0.0.1:5177",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

# SEC-02: Hardened CORS Origin Controls (prevent subdomain hijacking on Vercel/Railway/Render)
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https:\/\/.*cedarcare.*\.vercel\.app$",
    r"^https:\/\/.*clinic-booking.*\.vercel\.app$",
    r"^https:\/\/.*clinic.*\.railway\.app$",
    r"^https:\/\/booking-system-3-iojp\.onrender\.com$",
    r"^http:\/\/localhost:\d+$",
    r"^http:\/\/127\.0\.0\.1:\d+$",
    r"^http:\/\/192\.168\.\d+\.\d+:\d+$",
    r"^http:\/\/10\.\d+\.\d+\.\d+:\d+$",
    r"^http:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+:\d+$",
    r"^http:\/\/.*\.local:\d+$",
]
CORS_ALLOW_CREDENTIALS = True
# SEC-02: Never allow global wildcard origin reflection when credentials (cookies/tokens) are enabled
CORS_ALLOW_ALL_ORIGINS = False

# Neon Services Configuration (Provisioned via `neon deploy`)
NEON_BRANCH = os.environ.get('NEON_BRANCH', 'production')
NEON_AUTH_BASE_URL = os.environ.get('NEON_AUTH_BASE_URL', '')
NEON_AUTH_JWKS_URL = os.environ.get('NEON_AUTH_JWKS_URL', '')

# Telegram Bot Gateway Configuration (SEC-03: Strictly loaded from env / .env.local; zero hardcoded fallback in source)
TELEGRAM_BOT_TOKEN = (
    os.environ.get('TELEGRAM_BOT_TOKEN') or
    os.environ.get('Telegram_bot_father') or
    os.environ.get('TELEGRAM_BOT_FATHER') or
    ''
)
TELEGRAM_BOT_USERNAME = os.environ.get('TELEGRAM_BOT_USERNAME', 'babawo_bot')
TELEGRAM_WEBHOOK_SECRET = os.environ.get('TELEGRAM_WEBHOOK_SECRET', '')

# Option B (Layer 4) — dispatch enforcement switch. DEFAULT OFF.
# OFF: a dispatch with no reachable channel still succeeds and is only reported
#      through the advisory `delivery` / `delivery_warning` fields.
# ON:  the same dispatch is refused with 409 NO_REACHABLE_CHANNEL before any
#      offer is created or any provider is called.
DISPATCH_REQUIRE_REACHABLE_CHANNEL = (
    os.environ.get('DISPATCH_REQUIRE_REACHABLE_CHANNEL', '').strip().lower()
    in ('1', 'true', 'yes', 'on')
)

# n8n Dispatcher shared webhook secret (Phase 1 / Task 1.1).
# Sent by n8n as the `X-Webhook-Secret` header on every Django write call.
# Resolution order (services/webhook_security.py): ClinicSetting.webhook_secret ->
# custom_config['webhook_secret'] -> this env var. That is the whole list: an
# unconfigured receiver answers 401 on every guarded endpoint, in DEBUG too.
# Generate one per clinic: python -c "import secrets; print(secrets.token_urlsafe(32))"
WEBHOOK_SECRET = os.environ.get('WEBHOOK_SECRET', '')

