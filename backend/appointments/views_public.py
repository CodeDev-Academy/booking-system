from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ClinicSetting, Doctor, Service
from .serializers_public import PublicDoctorSerializer, PublicServiceSerializer


class PublicBookingInfoView(APIView):
    """
    GET /api/v1/public/booking-info/

    Zero-partner route / Step 1: the public booking page must render without a
    staff login.

    The staff catalogue endpoints are closed on purpose, and opening them would
    expose the price field and the whole roster. This view is therefore narrow:
    the clinic name, the REAL hold minutes and wording (Django owns the copy),
    active services without prices, active doctors, opening hours and the bot
    username the page needs to build the Telegram handoff link.

    No secret, no patient data, no staff data ever appears here.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        clinic = ClinicSetting.get_settings()
        hold_minutes = clinic.offer_expiry_minutes or 60

        # Django decides the wording. The frontend renders this sentence as-is.
        notice = (
            f"Available slot offers are held for {hold_minutes} minutes once sent, "
            "so every patient gets fair access to the schedule."
        )

        services = Service.objects.filter(is_active=True).order_by('category', 'name')
        doctors = Doctor.objects.filter(is_active=True).order_by('name')

        return Response({
            'clinic_name': clinic.clinic_name,
            'timezone': settings.TIME_ZONE,
            'offer_hold_minutes': hold_minutes,
            'hold_expiry_minutes': clinic.hold_expiry_minutes,
            'notice': notice,
            'hours': {
                'open_time': clinic.open_time.strftime('%H:%M'),
                'close_time': clinic.close_time.strftime('%H:%M'),
                'working_days': clinic.working_days or [],
            },
            'services': PublicServiceSerializer(services, many=True).data,
            'doctors': PublicDoctorSerializer(doctors, many=True).data,
            'telegram_bot_username': getattr(settings, 'TELEGRAM_BOT_USERNAME', ''),
        }, status=status.HTTP_200_OK)
