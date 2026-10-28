from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.tokens import RefreshToken
from .models import StaffUser


class StaffRefreshToken(RefreshToken):
    """
    Custom SimpleJWT RefreshToken for StaffUser domain model.
    Injects user claims (id, email, role, full_name) into token payload.
    """
    @classmethod
    def for_staff(cls, staff_user):
        token = cls()
        token['user_id'] = str(staff_user.id)
        token['email'] = staff_user.email
        token['role'] = staff_user.role
        token['full_name'] = staff_user.full_name
        return token


class CookieJWTAuthentication(JWTAuthentication):
    """
    Dual-Mode Authentication Backend:
    1. Checks HTTP 'Authorization: Bearer <token>' header.
    2. Falls back to 'clinic_access_token' HttpOnly cookie (immune to XSS token theft).
    3. Enforces real-time is_active database check for instant session killswitch.
    """

    def authenticate(self, request):
        header = self.get_header(request)
        raw_token = None

        if header is not None:
            raw_token = self.get_raw_token(header)
        else:
            raw_token = request.COOKIES.get('clinic_access_token')

        if raw_token is None:
            return None

        if isinstance(raw_token, str):
            raw_token = raw_token.encode('utf-8')

        validated_token = self.get_validated_token(raw_token)
        user_id = validated_token.get('user_id')

        if not user_id:
            raise exceptions.AuthenticationFailed('Invalid token payload: missing user_id.')

        try:
            user = StaffUser.objects.get(id=user_id)
        except StaffUser.DoesNotExist:
            raise exceptions.AuthenticationFailed('Staff account no longer exists.')

        # Real-time killswitch: immediate 401 ejection on admin deactivation
        if not user.is_active:
            raise exceptions.AuthenticationFailed(
                'ACCOUNT_DEACTIVATED: Your account has been suspended by clinic administration.'
            )

        # Strict Two-Role Dashboard Policy: Doctor accounts have zero dashboard access
        if user.role not in ('receptionist', 'clinic_admin'):
            raise exceptions.PermissionDenied(
                'DOCTOR_LOGIN_FORBIDDEN: Clinician accounts do not have dashboard login privileges. Dashboard access is restricted to Receptionists and Clinic Administration.'
            )

        # DRF compatibility flag
        user.is_authenticated = True
        return (user, validated_token)
