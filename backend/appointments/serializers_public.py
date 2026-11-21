from rest_framework import serializers

from .models import Doctor, Service


class PublicServiceSerializer(serializers.ModelSerializer):
    """
    Zero-partner route / Step 1 — the catalogue entry a patient needs to pick a
    service, and nothing more.

    No `price`: patient-facing copy does not quote treatment prices, and this
    endpoint is reachable without a login.
    """

    class Meta:
        model = Service
        fields = ['id', 'name', 'category', 'duration_minutes']


class PublicDoctorSerializer(serializers.ModelSerializer):
    """Only what helps a patient express a preference — no contact, no roster data."""

    class Meta:
        model = Doctor
        fields = ['id', 'name', 'specialty']
