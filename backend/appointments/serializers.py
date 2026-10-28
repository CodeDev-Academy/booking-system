from rest_framework import serializers
from .models import StaffUser


class StaffUserSerializer(serializers.ModelSerializer):
    """
    Public serializer for StaffUser profile. Excludes password and PIN hashes.
    Includes rich metadata fields (name, role_label, shift, avatar) aligned with frontend dashboard.
    """
    name = serializers.CharField(source='full_name', read_only=True)
    role_label = serializers.SerializerMethodField()
    shift = serializers.SerializerMethodField()
    avatar = serializers.SerializerMethodField()

    class Meta:
        model = StaffUser
        fields = [
            'id',
            'full_name',
            'name',
            'email',
            'role',
            'role_label',
            'shift',
            'specialty',
            'avatar',
            'is_active',
            'last_login',
            'created_at',
        ]
        read_only_fields = ['id', 'last_login', 'created_at']

    def get_role_label(self, obj):
        if obj.role == 'clinic_admin':
            return 'Practice Manager & Clinic Director'
        elif obj.role == 'receptionist':
            if 'sarah' in obj.email.lower() or 'lead' in obj.full_name.lower() or 'head' in obj.full_name.lower():
                return 'Lead Receptionist'
            return 'Front Desk Receptionist'
        return obj.get_role_display()

    def get_shift(self, obj):
        if obj.shift:
            return obj.shift
        if obj.role == 'clinic_admin':
            return 'General Practice Administration'
        if 'sarah' in obj.email.lower():
            return 'Morning Shift (08:00 – 16:00)'
        elif 'chioma' in obj.email.lower() or 'amina' in obj.email.lower():
            return 'Afternoon / Evening Shift (12:00 – 18:00)'
        return 'Day Shift (08:00 – 16:00)'

    def get_avatar(self, obj):
        parts = [p for p in obj.full_name.strip().split() if not p.lower().startswith('dr.') and not p.lower().startswith('dr')]
        if len(parts) >= 2:
            return f"{parts[0][0]}{parts[-1][0]}".upper()
        raw_parts = obj.full_name.strip().split()
        if len(raw_parts) >= 2:
            return f"{raw_parts[0][0]}{raw_parts[-1][0]}".upper()
        elif raw_parts:
            return raw_parts[0][:2].upper()
        return "SA"


class StaffLoginSerializer(serializers.Serializer):
    """
    Validates email and password credentials for staff login.
    Includes anti-bot honeypot field 'website_url'.
    """
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    website_url = serializers.CharField(required=False, allow_blank=True, default='')


class PinUnlockSerializer(serializers.Serializer):
    """
    Validates 4-digit quick-PIN for the 20-minute privacy lock screen.
    Accepts either 'pin' or 'quick_pin', and optional 'email'.
    """
    email = serializers.EmailField(required=False, allow_blank=True)
    pin = serializers.CharField(max_length=6, min_length=4, required=False)
    quick_pin = serializers.CharField(max_length=6, min_length=4, required=False)

    def validate(self, attrs):
        pin_val = attrs.get('pin') or attrs.get('quick_pin')
        if not pin_val:
            raise serializers.ValidationError({"pin": "This field is required."})
        attrs['pin'] = pin_val
        return attrs


class StaffUpdateSerializer(serializers.Serializer):
    """
    Serializer for updating staff member details (Administrator only).
    """
    name = serializers.CharField(required=False, allow_blank=True)
    full_name = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField(required=False)
    specialty = serializers.CharField(required=False, allow_blank=True)
    shift = serializers.CharField(required=False, allow_blank=True)
    status = serializers.CharField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)


class StaffPasswordResetSerializer(serializers.Serializer):
    """
    Admin serializer for setting/resetting a receptionist password.
    """
    password = serializers.CharField(min_length=6, required=False, write_only=True)
    new_password = serializers.CharField(min_length=6, required=False, write_only=True)

    def validate(self, attrs):
        pwd = attrs.get('new_password') or attrs.get('password')
        if not pwd or len(pwd) < 6:
            raise serializers.ValidationError({"password": "Password must be at least 6 characters."})
        attrs['password'] = pwd
        return attrs


class StaffCreateSerializer(serializers.ModelSerializer):
    """
    Admin serializer for provisioning new staff accounts.
    """
    password = serializers.CharField(write_only=True, min_length=8)
    pin = serializers.CharField(write_only=True, min_length=4, max_length=6, default='1234')

    class Meta:
        model = StaffUser
        fields = ['id', 'full_name', 'email', 'role', 'password', 'pin', 'is_active']

    def validate_role(self, value):
        if value not in ('receptionist', 'clinic_admin'):
            raise serializers.ValidationError(
                "Dashboard accounts are strictly limited to receptionist and clinic_admin. Doctor accounts are excluded."
            )
        return value

    def create(self, validated_data):
        raw_password = validated_data.pop('password')
        raw_pin = validated_data.pop('pin', '1234')
        staff = StaffUser(**validated_data)
        staff.set_password(raw_password)
        staff.set_pin(raw_pin)
        staff.save()
        return staff


class PinResetSerializer(serializers.Serializer):
    """
    Admin serializer for resetting a staff member's 4-digit quick-PIN.
    """
    new_pin = serializers.CharField(min_length=4, max_length=6)
