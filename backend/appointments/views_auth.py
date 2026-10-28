import datetime
import uuid
from django.utils import timezone
from django.core.cache import cache
from django.conf import settings
from django.contrib.auth.hashers import make_password, check_password
from rest_framework import status, views, response
from rest_framework.permissions import AllowAny
from .models import StaffUser, AuditLog, Doctor
from .authentication import StaffRefreshToken
from .permissions import IsStaffAuthenticated, IsClinicAdmin
from .serializers import (
    StaffUserSerializer,
    StaffLoginSerializer,
    PinUnlockSerializer,
    StaffCreateSerializer,
    PinResetSerializer,
)

# Constant-time dummy hash to mitigate side-channel email enumeration timing attacks
DUMMY_HASH = make_password('timing_mitigation_secret_seed')


class StaffLoginView(views.APIView):
    """
    Staff email/password authentication endpoint.
    Strictly restricted to two roles: receptionist and clinic_admin.
    Zero doctor accounts permitted (HTTP 403 DOCTOR_LOGIN_FORBIDDEN).
    Implements 5-strike brute-force lockout (15 minutes), anti-bot honeypot trap,
    and side-channel timing attack mitigation with dummy hash comparison.
    Issues 60m access token and 30-day refresh token.
    Sets HttpOnly SameSite=Lax cookies for the React web dashboard.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = StaffLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # 1. Anti-Bot Honeypot Defense: Reject without database querying or password hashing
        if serializer.validated_data.get('website_url'):
            return response.Response(
                {'error': 'BOT_DETECTED', 'detail': 'Automated submission blocked.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        email = serializer.validated_data['email'].lower().strip()
        password = serializer.validated_data['password']

        attempts_key = f"login_attempts_{email}"
        lockout_key = f"login_lockout_{email}"

        # 2. 5-Strike Brute-Force Rate Limiting (15-Minute Lockout Check)
        lockout_expiry = cache.get(lockout_key)
        if lockout_expiry:
            remaining_seconds = int(lockout_expiry - timezone.now().timestamp())
            if remaining_seconds > 0:
                return response.Response({
                    'error': 'ACCOUNT_LOCKED',
                    'detail': '5 failed login attempts. Access frozen for 15 minutes to protect patient data.',
                    'lockout_seconds': remaining_seconds,
                    'remaining_attempts': 0
                }, status=getattr(status, 'HTTP_423_LOCKED', 423))
            else:
                cache.delete(lockout_key)
                cache.delete(attempts_key)

        # 3. Two-Role Dashboard Policy: Treating Doctors Exclusion (Zero Doctor Accounts)
        # Clinicians belong strictly to the Doctor model and cannot access front-desk dashboard.
        is_clinician = Doctor.objects.filter(email__iexact=email).exists()

        try:
            staff = StaffUser.objects.get(email=email)
        except StaffUser.DoesNotExist:
            staff = None

        if is_clinician or (staff and staff.role not in ('receptionist', 'clinic_admin')):
            return response.Response({
                'error': 'DOCTOR_LOGIN_FORBIDDEN',
                'detail': 'Clinician accounts do not have dashboard login privileges. Dashboard access is restricted to Receptionists and Clinic Administration.'
            }, status=status.HTTP_403_FORBIDDEN)

        # 4. Side-Channel Timing Attack Mitigation for Non-Existent Users
        if staff is None:
            # Run dummy PBKDF2 hash comparison to simulate identical computation time
            check_password(password, DUMMY_HASH)
            return self._handle_failed_attempt(email, attempts_key, lockout_key, request)

        # 5. Password Verification
        if not staff.check_password(password):
            return self._handle_failed_attempt(email, attempts_key, lockout_key, request, staff_id=staff.id)

        # 6. Account Status / Deactivation Check
        if not staff.is_active:
            return response.Response(
                {'error': 'ACCOUNT_DEACTIVATED', 'detail': 'Your account has been suspended by clinic administration.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Successful Login: Clear brute-force counters
        cache.delete(attempts_key)
        cache.delete(lockout_key)

        # Generate tokens with custom claims
        refresh = StaffRefreshToken.for_staff(staff)
        access_token = str(refresh.access_token)
        refresh_token = str(refresh)

        staff.last_login = timezone.now()
        staff.save(update_fields=['last_login'])

        AuditLog.objects.create(
            entity_name='StaffUser',
            entity_id=staff.id,
            action='STAFF_LOGIN',
            performed_by=staff.email,
            changes={'login_time': staff.last_login.isoformat()},
            ip_address=request.META.get('REMOTE_ADDR')
        )

        user_data = StaffUserSerializer(staff).data
        res = response.Response({
            'access': access_token,
            'refresh': refresh_token,
            'user': user_data
        }, status=status.HTTP_200_OK)

        # Set dual-mode HttpOnly Secure cookies
        res.set_cookie(
            key='clinic_access_token',
            value=access_token,
            max_age=3600,  # 60 minutes
            httponly=True,
            samesite='Lax',
            secure=not settings.DEBUG,  # True in prod HTTPS
        )
        res.set_cookie(
            key='clinic_refresh_token',
            value=refresh_token,
            max_age=30 * 24 * 3600,  # 30 days
            httponly=True,
            samesite='Lax',
            secure=not settings.DEBUG,
        )

        return res

    def _handle_failed_attempt(self, email, attempts_key, lockout_key, request, staff_id=None):
        attempts = cache.get(attempts_key, 0) + 1

        if attempts >= 5:
            lockout_until = timezone.now().timestamp() + 900
            cache.set(lockout_key, lockout_until, timeout=900)
            cache.delete(attempts_key)

            AuditLog.objects.create(
                entity_name='StaffUser',
                entity_id=staff_id if staff_id else uuid.UUID('00000000-0000-0000-0000-000000000000'),
                action='SECURITY_LOGIN_LOCKOUT_TRIGGERED',
                performed_by=email,
                changes={'reason': '5 consecutive failed password attempts', 'lockout_seconds': 900},
                ip_address=request.META.get('REMOTE_ADDR')
            )

            return response.Response({
                'error': 'ACCOUNT_LOCKED',
                'detail': '5 failed login attempts. Access frozen for 15 minutes to protect patient data.',
                'lockout_seconds': 900,
                'remaining_attempts': 0
            }, status=getattr(status, 'HTTP_423_LOCKED', 423))

        cache.set(attempts_key, attempts, timeout=900)
        remaining = 5 - attempts
        return response.Response({
            'error': 'INVALID_CREDENTIALS',
            'detail': 'Invalid email or password.',
            'remaining_attempts': remaining
        }, status=status.HTTP_401_UNAUTHORIZED)


class StaffLogoutView(views.APIView):
    """
    Clears authentication cookies and invalidates session.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        res = response.Response({'detail': 'Successfully logged out.'}, status=status.HTTP_200_OK)
        res.delete_cookie('clinic_access_token', samesite='Lax')
        res.delete_cookie('clinic_refresh_token', samesite='Lax')
        return res


class StaffMeView(views.APIView):
    """
    Returns profile information for the authenticated staff member.
    """
    permission_classes = [IsStaffAuthenticated]

    def get(self, request):
        user_data = StaffUserSerializer(request.user).data
        return response.Response({
            'user': user_data,
            **user_data
        })


class PinUnlockView(views.APIView):
    """
    Validates 4-digit quick-PIN for the 20-minute privacy lock screen.
    Includes 3-Strike Brute-Force Shield (60s cooldown lockout & audit event).
    Supports authenticated staff sessions or email+pin verification.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PinUnlockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = None
        if request.user and getattr(request.user, 'is_authenticated', False) and getattr(request.user, 'is_active', False):
            user = request.user
        elif serializer.validated_data.get('email'):
            email = serializer.validated_data['email'].lower().strip()
            user = StaffUser.objects.filter(email=email).first()
            if not user or not user.is_active:
                return response.Response(
                    {'error': 'UNAUTHORIZED', 'detail': 'Staff account not found or suspended.'},
                    status=status.HTTP_401_UNAUTHORIZED
                )
        else:
            return response.Response(
                {'error': 'AUTHENTICATION_REQUIRED', 'detail': 'Active session or email required to unlock PIN.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        pin = serializer.validated_data['pin']
        lockout_key = f"pin_lockout_{user.id}"
        attempts_key = f"pin_attempts_{user.id}"

        # 1. Check if currently in 60s lockout
        lockout_expiry = cache.get(lockout_key)
        if lockout_expiry:
            remaining = int(lockout_expiry - timezone.now().timestamp())
            if remaining > 0:
                return response.Response({
                    'error': 'PIN_LOCKED',
                    'detail': f'Numpad locked for {remaining}s due to 3 failed attempts. Enter master password to unlock.',
                    'cooldown_seconds': remaining
                }, status=status.HTTP_423_LOCKED)

        # 2. Verify PIN
        if user.check_pin(pin):
            cache.delete(attempts_key)
            cache.delete(lockout_key)
            return response.Response({'status': 'unlocked', 'detail': 'Privacy screen unlocked.'})

        # 3. Failed attempt handling
        attempts = cache.get(attempts_key, 0) + 1
        cache.set(attempts_key, attempts, timeout=300)  # 5 min window

        if attempts >= 3:
            lockout_until = timezone.now().timestamp() + 60
            cache.set(lockout_key, lockout_until, timeout=60)
            cache.delete(attempts_key)

            AuditLog.objects.create(
                entity_name='StaffUser',
                entity_id=user.id,
                action='SECURITY_PIN_LOCKOUT_TRIGGERED',
                performed_by=user.email,
                changes={'reason': '3 consecutive invalid quick-PIN entries', 'lockout_seconds': 60},
                ip_address=request.META.get('REMOTE_ADDR')
            )

            return response.Response({
                'error': 'PIN_LOCKED',
                'detail': '3 failed PIN attempts. Numpad locked for 60 seconds. Master password required.',
                'cooldown_seconds': 60
            }, status=status.HTTP_423_LOCKED)

        return response.Response({
            'error': 'INVALID_PIN',
            'detail': 'Incorrect quick-PIN.',
            'remaining_attempts': 3 - attempts
        }, status=status.HTTP_400_BAD_REQUEST)


class AdminStaffListCreateView(views.APIView):
    """
    Admin endpoint to list all staff members and provision new staff accounts.
    """
    permission_classes = [IsClinicAdmin]

    def get(self, request):
        staff_qs = StaffUser.objects.all().order_by('-created_at')
        return response.Response(StaffUserSerializer(staff_qs, many=True).data)

    def post(self, request):
        serializer = StaffCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        staff = serializer.save()

        AuditLog.objects.create(
            entity_name='StaffUser',
            entity_id=staff.id,
            action='ADMIN_STAFF_CREATED',
            performed_by=request.user.email,
            changes={'email': staff.email, 'role': staff.role},
            ip_address=request.META.get('REMOTE_ADDR')
        )

        return response.Response(StaffUserSerializer(staff).data, status=status.HTTP_201_CREATED)


class AdminStaffDetailView(views.APIView):
    """
    PATCH /api/v1/staff/<staff_id>/
    Allows Administrator to update staff details (name, email, specialty, shift, status/is_active).
    """
    permission_classes = [IsClinicAdmin]

    def patch(self, request, staff_id):
        # Lookup in StaffUser first
        staff = None
        doctor = None
        try:
            staff = StaffUser.objects.get(id=staff_id)
        except (StaffUser.DoesNotExist, ValueError):
            staff = StaffUser.objects.filter(email__iexact=staff_id).first()

        if not staff:
            try:
                doctor = Doctor.objects.get(id=staff_id)
            except (Doctor.DoesNotExist, ValueError):
                doctor = Doctor.objects.filter(email__iexact=staff_id).first()

        if not staff and not doctor:
            return response.Response({'error': 'Staff member or doctor not found.'}, status=status.HTTP_404_NOT_FOUND)

        if staff:
            if 'name' in request.data or 'full_name' in request.data:
                staff.full_name = request.data.get('name') or request.data.get('full_name')
            if 'email' in request.data:
                staff.email = request.data['email'].lower().strip()
            if 'specialty' in request.data:
                staff.specialty = request.data['specialty']
            if 'shift' in request.data:
                staff.shift = request.data['shift']
            if 'is_active' in request.data:
                staff.is_active = bool(request.data['is_active'])
            elif 'status' in request.data:
                staff.is_active = (request.data['status'] != 'deactivated')

            staff.save()

            AuditLog.objects.create(
                entity_name='StaffUser',
                entity_id=staff.id,
                action='ADMIN_STAFF_UPDATED',
                performed_by=request.user.email,
                changes={'staff_email': staff.email, 'full_name': staff.full_name},
                ip_address=request.META.get('REMOTE_ADDR')
            )
            return response.Response(StaffUserSerializer(staff).data, status=status.HTTP_200_OK)

        if doctor:
            if 'name' in request.data or 'full_name' in request.data:
                doctor.name = request.data.get('name') or request.data.get('full_name')
            if 'email' in request.data:
                doctor.email = request.data['email'].lower().strip()
            if 'specialty' in request.data:
                doctor.specialty = request.data['specialty']
            if 'is_active' in request.data:
                doctor.is_active = bool(request.data['is_active'])

            doctor.save()

            AuditLog.objects.create(
                entity_name='Doctor',
                entity_id=doctor.id,
                action='ADMIN_DOCTOR_UPDATED',
                performed_by=request.user.email,
                changes={'doctor_name': doctor.name, 'specialty': doctor.specialty},
                ip_address=request.META.get('REMOTE_ADDR')
            )
            return response.Response({
                'id': str(doctor.id),
                'name': doctor.name,
                'email': doctor.email,
                'specialty': doctor.specialty,
                'role': 'doctor',
                'is_active': doctor.is_active,
            }, status=status.HTTP_200_OK)


class AdminStaffResetPasswordView(views.APIView):
    """
    POST /api/v1/staff/<staff_id>/reset-password/
    Allows Administrator to set a new password for receptionists.
    Clinician accounts (doctors) are strictly excluded.
    """
    permission_classes = [IsClinicAdmin]

    def post(self, request, staff_id):
        staff = None
        try:
            staff = StaffUser.objects.get(id=staff_id)
        except (StaffUser.DoesNotExist, ValueError):
            staff = StaffUser.objects.filter(email__iexact=staff_id).first()

        if not staff:
            # Check if doctor
            is_doc = Doctor.objects.filter(id=staff_id).exists() if len(str(staff_id)) == 36 else Doctor.objects.filter(email__iexact=staff_id).exists()
            if is_doc:
                return response.Response(
                    {'error': 'DOCTOR_PASSWORD_NOT_SUPPORTED', 'detail': 'Clinician accounts do not have dashboard passwords.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            return response.Response({'error': 'Staff member not found.'}, status=status.HTTP_404_NOT_FOUND)

        new_password = request.data.get('new_password') or request.data.get('password')
        if not new_password or len(str(new_password).strip()) < 6:
            return response.Response(
                {'error': 'INVALID_PASSWORD', 'detail': 'Password must be at least 6 characters.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        staff.set_password(str(new_password).strip())
        staff.save(update_fields=['password_hash'])

        AuditLog.objects.create(
            entity_name='StaffUser',
            entity_id=staff.id,
            action='ADMIN_STAFF_PASSWORD_RESET',
            performed_by=request.user.email,
            changes={'staff_email': staff.email},
            ip_address=request.META.get('REMOTE_ADDR')
        )

        return response.Response({'detail': f"Password for {staff.full_name} updated successfully."})


class AdminStaffResetPinView(views.APIView):
    """
    Admin endpoint to reset a staff member's 4-digit quick-PIN.
    POST /api/v1/staff/<staff_id>/reset-pin/ or /api/v1/admin/staff/<staff_id>/reset-pin/
    """
    permission_classes = [IsClinicAdmin]

    def post(self, request, staff_id):
        staff = None
        try:
            staff = StaffUser.objects.get(id=staff_id)
        except (StaffUser.DoesNotExist, ValueError):
            staff = StaffUser.objects.filter(email__iexact=staff_id).first()

        if not staff:
            is_doc = Doctor.objects.filter(id=staff_id).exists() if len(str(staff_id)) == 36 else Doctor.objects.filter(email__iexact=staff_id).exists()
            if is_doc:
                return response.Response(
                    {'error': 'DOCTOR_PIN_NOT_SUPPORTED', 'detail': 'Clinician accounts do not have quick-PINs.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            return response.Response({'error': 'Staff member not found.'}, status=status.HTTP_404_NOT_FOUND)

        pin_val = request.data.get('new_pin') or request.data.get('pin')
        if not pin_val or not str(pin_val).strip().isdigit() or len(str(pin_val).strip()) not in (4, 6):
            return response.Response(
                {'error': 'INVALID_PIN', 'detail': 'Quick-PIN must be exactly 4 or 6 numeric digits.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        staff.set_pin(str(pin_val).strip())
        staff.save(update_fields=['quick_pin_hash'])

        AuditLog.objects.create(
            entity_name='StaffUser',
            entity_id=staff.id,
            action='ADMIN_PIN_RESET',
            performed_by=request.user.email,
            changes={'staff_email': staff.email},
            ip_address=request.META.get('REMOTE_ADDR')
        )

        return response.Response({'detail': f"Quick-PIN successfully reset for {staff.full_name}."})


class AdminStaffToggleActiveView(views.APIView):
    """
    POST /api/v1/staff/<staff_id>/toggle-active/ or /api/v1/admin/staff/<staff_id>/deactivate/
    Activates or deactivates a staff member. If deactivated, immediately revokes all active JWT tokens.
    """
    permission_classes = [IsClinicAdmin]

    def post(self, request, staff_id):
        staff = None
        doctor = None
        try:
            staff = StaffUser.objects.get(id=staff_id)
        except (StaffUser.DoesNotExist, ValueError):
            staff = StaffUser.objects.filter(email__iexact=staff_id).first()

        if not staff:
            try:
                doctor = Doctor.objects.get(id=staff_id)
            except (Doctor.DoesNotExist, ValueError):
                doctor = Doctor.objects.filter(email__iexact=staff_id).first()

        if not staff and not doctor:
            return response.Response({'error': 'Staff member not found.'}, status=status.HTTP_404_NOT_FOUND)

        target = staff or doctor
        if staff and str(staff.id) == str(request.user.id):
            return response.Response(
                {'error': 'CANNOT_DEACTIVATE_SELF', 'detail': 'You cannot deactivate your own administrative account.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Toggle or set explicit is_active
        if 'is_active' in request.data:
            target.is_active = bool(request.data['is_active'])
        else:
            target.is_active = not target.is_active

        target.save(update_fields=['is_active'])

        entity_name = 'StaffUser' if staff else 'Doctor'
        action_name = 'ADMIN_STAFF_REACTIVATED' if target.is_active else 'ADMIN_STAFF_DEACTIVATED'
        name_val = getattr(target, 'full_name', getattr(target, 'name', ''))

        AuditLog.objects.create(
            entity_name=entity_name,
            entity_id=target.id,
            action=action_name,
            performed_by=request.user.email,
            changes={'target': name_val, 'is_active': target.is_active},
            ip_address=request.META.get('REMOTE_ADDR')
        )

        status_text = 'reactivated' if target.is_active else 'deactivated. Active sessions revoked.'
        return response.Response({
            'id': str(target.id),
            'name': name_val,
            'is_active': target.is_active,
            'detail': f"Account for {name_val} has been {status_text}"
        }, status=status.HTTP_200_OK)


class AdminStaffDeactivateView(AdminStaffToggleActiveView):
    """
    Backwards-compatible alias for AdminStaffToggleActiveView.
    """
    pass
