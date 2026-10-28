import datetime
from decimal import Decimal
from django.utils import timezone
from django.db.models import Count, Sum, Q, Value
from django.db.models.functions import Coalesce
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from .models import Appointment, BookingRequest, SlotOffer, Doctor, Service, ClinicSetting
from .permissions import IsStaffAuthenticated
from .views_appointment import ExportAppointmentsCSVView, ExportAttendanceCSVView
from .serializers_analytics import AnalyticsSummarySerializer


class AnalyticsSummaryView(APIView):
    """
    GET /api/v1/analytics/summary/
    Aggregates operational KPIs for the Receptionist Hub and Admin Bento grid:
    - Total bookings & status breakdown
    - Attendance reliability rate (%) & No-show rate (%)
    - Front-desk average triage velocity (minutes from request intake to dispatch)
    - Today's estimated clinic revenue in local currency (e.g. ₦)
    - Revenue breakdown by clinical service category
    - Hourly patient intake distribution trend (08:00 - 17:00 WAT)
    - Top performing services and doctors
    Supports optional date filtering via ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
    """
    permission_classes = [IsStaffAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        clinic = ClinicSetting.get_settings()
        currency_symbol = clinic.custom_config.get('currency_symbol', '₦')

        # 1. Parse optional date range query params
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')

        start_date = None
        end_date = None
        if start_date_str:
            try:
                start_date = datetime.date.fromisoformat(start_date_str)
            except ValueError:
                pass
        if end_date_str:
            try:
                end_date = datetime.date.fromisoformat(end_date_str)
            except ValueError:
                pass

        # 2. Base QuerySet with date range filtering
        base_qs = Appointment.objects.all()
        if start_date:
            base_qs = base_qs.filter(start_datetime__date__gte=start_date)
        if end_date:
            base_qs = base_qs.filter(start_datetime__date__lte=end_date)

        # 3. Aggregated counts & rates (Risk EC-1 & EC-2)
        counts = base_qs.aggregate(
            total=Count('id'),
            completed=Count('id', filter=Q(status='completed')),
            no_show=Count('id', filter=Q(status='no_show')),
            arrived=Count('id', filter=Q(status='arrived')),
            in_consultation=Count('id', filter=Q(status='in_consultation')),
            confirmed=Count('id', filter=Q(status='confirmed')),
            cancelled=Count('id', filter=Q(status='cancelled')),
            held=Count('id', filter=Q(status='held')),
        )

        total_appts = counts['total'] or 0
        completed = counts['completed'] or 0
        no_shows = counts['no_show'] or 0
        denom = completed + no_shows

        # Guard division by zero (Risk EC-1)
        attendance_rate_pct = round((completed / denom) * 100, 1) if denom > 0 else 100.0
        no_show_rate_pct = round((no_shows / denom) * 100, 1) if denom > 0 else 0.0

        # 4. Today's Revenue Aggregation (Risk EC-4)
        today_appts = Appointment.objects.filter(
            start_datetime__date=today,
            status__in=['confirmed', 'arrived', 'in_consultation', 'completed']
        )
        today_rev_agg = today_appts.aggregate(
            total=Coalesce(Sum('service__price'), Value(Decimal('0.00')))
        )
        today_revenue = float(today_rev_agg['total'])
        today_revenue_formatted = f"{currency_symbol}{today_revenue:,.0f}" if today_revenue > 0 else f"{currency_symbol}0"

        # 5. Revenue by Category (over base query)
        cat_qs = base_qs.filter(
            status__in=['confirmed', 'arrived', 'in_consultation', 'completed']
        ).values('service__category').annotate(
            total=Coalesce(Sum('service__price'), Value(Decimal('0.00')))
        ).order_by('-total')
        revenue_by_category = {
            (item['service__category'] or 'General'): float(item['total'])
            for item in cat_qs
        }

        # 6. Front-Desk Average Triage Velocity
        offers_qs = SlotOffer.objects.select_related('request').filter(offered_at__isnull=False)
        if start_date:
            offers_qs = offers_qs.filter(offered_at__date__gte=start_date)
        if end_date:
            offers_qs = offers_qs.filter(offered_at__date__lte=end_date)

        diffs = []
        seen_requests = set()
        for off in offers_qs:
            if off.request_id and off.request_id not in seen_requests and off.request and off.request.created_at:
                seen_requests.add(off.request_id)
                delta_sec = (off.offered_at - off.request.created_at).total_seconds()
                if delta_sec >= 0:
                    diffs.append(delta_sec / 60.0)
        avg_triage_velocity_min = round(sum(diffs) / len(diffs), 1) if diffs else 0.0

        # 7. Hourly Patient Intake Distribution (08:00 - 17:00 WAT, Risk EC-3)
        hours_map = {f"{h:02d}:00": 0 for h in range(8, 18)}
        for appt in base_qs:
            if appt.start_datetime:
                local_dt = timezone.localtime(appt.start_datetime)
                hour_str = f"{local_dt.hour:02d}:00"
                if hour_str in hours_map:
                    hours_map[hour_str] += 1

        max_count = max(hours_map.values()) if any(hours_map.values()) else 1
        max_count = max(max_count, 1)
        hourly_distribution = [
            {
                "hour": h,
                "count": cnt,
                "heightPct": round((cnt / max_count) * 100)
            }
            for h, cnt in hours_map.items()
        ]

        # 8. Top Performing Services
        top_services_qs = base_qs.values('service__name').annotate(
            count=Count('id')
        ).order_by('-count')[:5]
        top_services = [
            {"name": s['service__name'], "count": s['count']}
            for s in top_services_qs if s['service__name']
        ]

        # 9. Top Performing Doctors (by completed visits)
        top_doctors_qs = base_qs.filter(status='completed').values(
            'doctor__name', 'doctor__specialty'
        ).annotate(
            completed_count=Count('id')
        ).order_by('-completed_count')[:5]
        top_doctors = [
            {
                "name": d['doctor__name'],
                "specialty": d['doctor__specialty'] or '',
                "completed_count": d['completed_count']
            }
            for d in top_doctors_qs if d['doctor__name']
        ]

        # 10. Assemble Response (dual camelCase + snake_case support)
        breakdown = {
            "total": total_appts,
            "confirmed": counts['confirmed'] or 0,
            "arrived": counts['arrived'] or 0,
            "in_consultation": counts['in_consultation'] or 0,
            "completed": completed,
            "no_show": no_shows,
            "cancelled": counts['cancelled'] or 0,
            "held": counts['held'] or 0,
        }

        data = {
            "totalAppointments": total_appts,
            "total_appointments": total_appts,
            "attendanceRatePct": attendance_rate_pct,
            "attendance_rate_pct": attendance_rate_pct,
            "noShowRatePct": no_show_rate_pct,
            "no_show_rate_pct": no_show_rate_pct,
            "avgTriageVelocityMin": avg_triage_velocity_min,
            "avg_triage_velocity_min": avg_triage_velocity_min,
            "todayRevenue": today_revenue,
            "today_revenue": today_revenue,
            "todayRevenueFormatted": today_revenue_formatted,
            "today_revenue_formatted": today_revenue_formatted,
            "breakdown": breakdown,
            "revenueByCategory": revenue_by_category,
            "revenue_by_category": revenue_by_category,
            "hourlyDistribution": hourly_distribution,
            "hourly_distribution": hourly_distribution,
            "topServices": top_services,
            "top_services": top_services,
            "topDoctors": top_doctors,
            "top_doctors": top_doctors,
        }

        serializer = AnalyticsSummarySerializer(data=data)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
