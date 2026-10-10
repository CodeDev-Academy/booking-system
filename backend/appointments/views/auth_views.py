"""
Staff Authentication & Governance API Views.
Supports:
1. 30-Day Session Login with JWT tokens
2. 20-Min Screen Quick PIN Unlock
3. Admin Governance (1-click staff deactivation and PIN reset)
"""

import hashlib
from rest_framework import status, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.decorators import action
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate, get_user_model
from django.utils import timezone
from appointments.models import StaffUser, AuditLog
from appointments.serializers import StaffUserSerializer

User = get_user_model()


class LoginView(APIView):
    """
    POST /api/v1/auth/login/
    Authenticates staff by email and password, issuing SimpleJWT credentials.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email', '').strip()
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '')

        identifier = email or username
        if not identifier or not password:
            return Response(
                {'error': 'Email/username and password are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Look up user by email or username
        user = User.objects.filter(email__iexact=identifier).first() or \
               User.objects.filter(username__iexact=identifier).first()

        if not user or not user.check_password(password):
            return Response(
                {'error': 'Invalid credentials.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        if not user.is_active:
            return Response(
                {'error': 'User account has been deactivated.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Check StaffUser profile
        staff_profile = getattr(user, 'staff_profile', None)
        if staff_profile and not staff_profile.is_active:
            return Response(
                {'error': 'Staff access is revoked. Please contact the clinic administrator.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])

        profile_data = {
            'id': str(staff_profile.id) if staff_profile else str(user.id),
            'user_id': user.id,
            'username': user.username,
            'email': user.email,
            'full_name': user.get_full_name() or user.username,
            'role': staff_profile.role if staff_profile else ('clinic_admin' if user.is_superuser else 'receptionist'),
            'is_active': True,
        }

        AuditLog.objects.create(
            actor=profile_data['full_name'],
            action="STAFF_LOGIN",
            entity_name="StaffUser",
            entity_id=profile_data['id'],
            changes={'login_time': user.last_login.isoformat()}
        )

        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': profile_data,
        }, status=status.HTTP_200_OK)


class PinUnlockView(APIView):
    """
    POST /api/v1/auth/pin-unlock/
    Validates a 4-digit numeric quick PIN after the 20-minute idle screen lock.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        pin = str(request.data.get('pin', '')).strip()
        user_id = request.data.get('user_id')
        email = request.data.get('email')

        if not pin:
            return Response({'error': 'PIN is required.'}, status=status.HTTP_400_BAD_REQUEST)

        staff_qs = StaffUser.objects.filter(is_active=True)
        if user_id:
            staff = staff_qs.filter(user_id=user_id).first()
        elif email:
            staff = staff_qs.filter(user__email__iexact=email).first()
        else:
            # Fallback to current authenticated user or default first staff
            if request.user.is_authenticated:
                staff = getattr(request.user, 'staff_profile', None)
            else:
                staff = staff_qs.first()

        pin_hash = hashlib.sha256(pin.encode()).hexdigest()
        default_1234_hash = hashlib.sha256('1234'.encode()).hexdigest()

        # Check against stored hash or default PIN '1234'
        if staff and (staff.quick_pin_hash == pin_hash or pin_hash == default_1234_hash):
            return Response({
                'success': True,
                'message': 'Screen unlocked successfully.',
                'staff': {
                    'id': str(staff.id),
                    'full_name': staff.full_name,
                    'role': staff.role,
                }
            }, status=status.HTTP_200_OK)

        return Response(
            {'success': False, 'error': 'Incorrect PIN.'},
            status=status.HTTP_401_UNAUTHORIZED
        )


class StaffAdminViewSet(viewsets.ModelViewSet):
    """
    Admin endpoints for managing staff roster and security policies.
    """
    queryset = StaffUser.objects.all().select_related('user')
    serializer_class = StaffUserSerializer
    permission_classes = [AllowAny]

    @action(detail=True, methods=['post'], url_path='deactivate')
    def deactivate(self, request, pk=None):
        """
        POST /api/v1/admin/staff/{id}/deactivate/
        Immediately revokes account access and marks is_active=False.
        """
        staff = self.get_object()
        staff.is_active = False
        staff.save(update_fields=['is_active'])

        user = staff.user
        user.is_active = False
        user.save(update_fields=['is_active'])

        AuditLog.objects.create(
            actor="Clinic Admin",
            action="DEACTIVATED_STAFF",
            entity_name="StaffUser",
            entity_id=str(staff.id),
            changes={'staff_name': staff.full_name, 'email': staff.email, 'status': 'deactivated'}
        )

        return Response({
            'staff_id': str(staff.id),
            'is_active': False,
            'revoked': True,
            'message': f"Account for {staff.full_name} has been revoked."
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='reset-pin')
    def reset_pin(self, request, pk=None):
        """
        POST /api/v1/admin/staff/{id}/reset-pin/
        Resets a receptionist's PIN to the default '1234' or provided new PIN.
        """
        staff = self.get_object()
        new_pin = str(request.data.get('new_pin', '1234')).strip()
        staff.quick_pin_hash = hashlib.sha256(new_pin.encode()).hexdigest()
        staff.save(update_fields=['quick_pin_hash'])

        AuditLog.objects.create(
            actor="Clinic Admin",
            action="RESET_STAFF_PIN",
            entity_name="StaffUser",
            entity_id=str(staff.id),
            changes={'staff_name': staff.full_name}
        )

        return Response({
            'staff_id': str(staff.id),
            'default_pin': new_pin,
            'message': f"PIN reset successfully for {staff.full_name}."
        }, status=status.HTTP_200_OK)
