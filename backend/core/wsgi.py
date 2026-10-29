"""
WSGI config for core project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/wsgi/
"""

import os
import logging
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

application = get_wsgi_application()

# Auto-initialize database tables and clinic seed data on server startup
# Ensures tables and clinic_settings exist regardless of hosting platform or ephemeral disk
try:
    from django.core.management import call_command
    call_command('migrate', interactive=False)
    call_command('seed_clinic')
    logging.info("Auto-init database & clinic seeding completed successfully.")
except Exception as e:
    logging.warning("Auto-init database skipped or failed: %s", str(e))
