"""
Django settings for Clinic Booking System core project.
Agency Template Architecture.
Zero-friction local dev + full production support.
"""

import os
import sys
from pathlib import Path
import urllib.parse
import importlib.util

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Lightweight .env loader using standard library
env_file = BASE_DIR / '.env'
if env_file.exists():
    with open(env_file, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, val = line.split('=', 1)
                os.environ.setdefault(key.strip(), val.strip().strip("'\""))

# SECURITY & DEBUG SETTINGS
DEBUG = os.environ.get('DJANGO_DEBUG', 'False').lower() in ('true', '1', 'yes')

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY')
if not SECRET_KEY:
    if DEBUG or os.environ.get('DJANGO_DEV_MODE', '1') == '1':
        SECRET_KEY = 'django-insecure-cedarcare-clinic-template-dev-key-2026-wuse2-abuja'
    else:
        raise ValueError("DJANGO_SECRET_KEY environment variable must be set in production.")

raw_hosts = os.environ.get('DJANGO_ALLOWED_HOSTS', '*' if DEBUG or os.environ.get('DJANGO_DEV_MODE', '1') == '1' else '')
ALLOWED_HOSTS = [h.strip() for h in raw_hosts.split(',') if h.strip()]

# Check optional production modules
has_whitenoise = importlib.util.find_spec('whitenoise') is not None

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
]

if has_whitenoise:
    INSTALLED_APPS.append('whitenoise.runserver_nostatic')

INSTALLED_APPS.extend([
    'django.contrib.staticfiles',
    # Third-party packages
    'rest_framework',
    'corsheaders',
    # Core Clinic Apps
    'appointments.apps.AppointmentsConfig',
])

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
]

if has_whitenoise:
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
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'
ASGI_APPLICATION = 'core.asgi.application'

# Database Configuration
# Automatically parses DATABASE_URL (PostgreSQL, MySQL, or SQLite)
# Defaults to local SQLite db.sqlite3
DATABASE_URL = os.environ.get('DATABASE_URL')

if DATABASE_URL and (DATABASE_URL.startswith('postgres://') or DATABASE_URL.startswith('postgresql://')):
    url = urllib.parse.urlparse(DATABASE_URL)
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': url.path[1:],
            'USER': url.username,
            'PASSWORD': url.password,
            'HOST': url.hostname,
            'PORT': url.port or 5432,
            'CONN_MAX_AGE': 600,
        }
    }
elif DATABASE_URL and (DATABASE_URL.startswith('mysql://') or DATABASE_URL.startswith('mysqlclient://')):
    url = urllib.parse.urlparse(DATABASE_URL)
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.mysql',
            'NAME': url.path[1:],
            'USER': url.username,
            'PASSWORD': url.password,
            'HOST': url.hostname,
            'PORT': url.port or 3306,
            'CONN_MAX_AGE': 600,
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
            'CONN_MAX_AGE': 0,  # Avoid file-lock deadlocks on SQLite
        }
    }

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 8},
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Internationalization & Timezone (Africa/Lagos)
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Africa/Lagos'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
if has_whitenoise:
    STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Django REST Framework Configuration
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.AllowAny',
    ],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ],
    'DEFAULT_PARSER_CLASSES': [
        'rest_framework.parsers.JSONParser',
        'rest_framework.parsers.FormParser',
        'rest_framework.parsers.MultiPartParser',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
}

# CORS Configuration (Strict origin whitelist with credentials support)
CORS_ALLOW_ALL_ORIGINS = False
raw_cors = os.environ.get(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173'
)
CORS_ALLOWED_ORIGINS = [origin.strip() for origin in raw_cors.split(',') if origin.strip()]
CORS_ALLOW_CREDENTIALS = True
