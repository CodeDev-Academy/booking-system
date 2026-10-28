from rest_framework.views import exception_handler
from rest_framework import status


def clinic_exception_handler(exc, context):
    """
    Custom DRF exception handler that intercepts 401 Unauthorized responses.
    Whenever authentication fails (e.g. invalid token, expired token, or account deactivated),
    this handler ensures authentication cookies are cleared in the HTTP response headers
    so the client browser immediately purges revoked credentials.
    """
    response = exception_handler(exc, context)

    if response is not None and response.status_code == status.HTTP_401_UNAUTHORIZED:
        response.delete_cookie('clinic_access_token')
        response.delete_cookie('clinic_refresh_token')

    return response
