from rest_framework import serializers


class HourlyDistributionItemSerializer(serializers.Serializer):
    hour = serializers.CharField()
    count = serializers.IntegerField()
    heightPct = serializers.IntegerField()


class TopServiceItemSerializer(serializers.Serializer):
    name = serializers.CharField()
    count = serializers.IntegerField()


class TopDoctorItemSerializer(serializers.Serializer):
    name = serializers.CharField()
    specialty = serializers.CharField(allow_blank=True, default='')
    completed_count = serializers.IntegerField()


class AnalyticsSummarySerializer(serializers.Serializer):
    totalAppointments = serializers.IntegerField()
    total_appointments = serializers.IntegerField()
    attendanceRatePct = serializers.FloatField()
    attendance_rate_pct = serializers.FloatField()
    noShowRatePct = serializers.FloatField()
    no_show_rate_pct = serializers.FloatField()
    avgTriageVelocityMin = serializers.FloatField()
    avg_triage_velocity_min = serializers.FloatField()
    todayRevenue = serializers.FloatField()
    today_revenue = serializers.FloatField()
    todayRevenueFormatted = serializers.CharField()
    today_revenue_formatted = serializers.CharField()
    breakdown = serializers.DictField()
    revenueByCategory = serializers.DictField()
    revenue_by_category = serializers.DictField()
    hourlyDistribution = HourlyDistributionItemSerializer(many=True)
    hourly_distribution = HourlyDistributionItemSerializer(many=True)
    topServices = TopServiceItemSerializer(many=True)
    top_services = TopServiceItemSerializer(many=True)
    topDoctors = TopDoctorItemSerializer(many=True)
    top_doctors = TopDoctorItemSerializer(many=True)
