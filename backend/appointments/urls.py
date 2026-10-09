"""
URL patterns for appointments API.
"""

from django.urls import path
from appointments import views

app_name = 'appointments'

urlpatterns = [
    path('health/', views.healthcheck, name='api-health'),
]
