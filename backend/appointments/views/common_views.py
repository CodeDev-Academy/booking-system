"""
Common utility views including healthcheck.
"""

from django.conf import settings
from django.db import connection
from django.http import JsonResponse


def healthcheck(request):
    """
    Production health check probing database connectivity and server status.
    Returns 200 OK if database responds, or 503 Service Unavailable if degraded.
    """
    db_healthy = True
    db_error = None
    try:
        connection.ensure_connection()
    except Exception as exc:
        db_healthy = False
        db_error = str(exc)

    status_code = 200 if db_healthy else 503
    payload = {
        'status': 'healthy' if db_healthy else 'degraded',
        'database': 'connected' if db_healthy else 'disconnected',
        'system': 'Clinic Booking System API',
        'version': '1.0.0',
        'timezone': settings.TIME_ZONE,
    }
    if db_error:
        payload['database_error'] = db_error

    return JsonResponse(payload, status=status_code)
