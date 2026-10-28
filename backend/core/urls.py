from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse

def root_status(request):
    return JsonResponse({
        "status": "online",
        "clinic": "Cedarcare Specialist Clinic API",
        "docs": "/api/v1/",
    })

urlpatterns = [
    path('', root_status, name='root-status'),
    path('admin/', admin.site.urls),
    path('api/v1/', include('appointments.urls')),
    path('api/', include('appointments.urls')),
]
