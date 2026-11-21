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
    # Wave 5 / Step 5.6: ONE mount. The duplicate `/api/` prefix hid URL
    # mistakes (a client on the wrong prefix still worked) and doubled
    # maintenance; nothing in the app, the n8n workflows or the tests used it.
    path('api/v1/', include('appointments.urls')),
]
