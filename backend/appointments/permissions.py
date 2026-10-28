from rest_framework import permissions


class IsStaffAuthenticated(permissions.BasePermission):
    """
    Allows access only to authenticated and active staff members.
    Strict Two-Role Dashboard Policy: Restricted solely to receptionist and clinic_admin.
    """
    def has_permission(self, request, view):
        return bool(
            request.user and
            getattr(request.user, 'is_authenticated', False) and
            getattr(request.user, 'is_active', False) and
            getattr(request.user, 'role', None) in ('receptionist', 'clinic_admin')
        )


class IsClinicAdmin(permissions.BasePermission):
    """
    Allows access only to staff members with the 'clinic_admin' role.
    """
    def has_permission(self, request, view):
        return bool(
            request.user and
            getattr(request.user, 'is_authenticated', False) and
            getattr(request.user, 'is_active', False) and
            getattr(request.user, 'role', None) == 'clinic_admin'
        )


class IsReceptionistOrAdmin(permissions.BasePermission):
    """
    Allows access to receptionists and clinic administrators.
    """
    def has_permission(self, request, view):
        return bool(
            request.user and
            getattr(request.user, 'is_authenticated', False) and
            getattr(request.user, 'is_active', False) and
            getattr(request.user, 'role', None) in ['receptionist', 'clinic_admin']
        )


class IsDoctorOrAdmin(permissions.BasePermission):
    """
    Allows access to clinical doctors and administrators.
    """
    def has_permission(self, request, view):
        return bool(
            request.user and
            getattr(request.user, 'is_authenticated', False) and
            getattr(request.user, 'is_active', False) and
            getattr(request.user, 'role', None) in ['doctor', 'clinic_admin']
        )
