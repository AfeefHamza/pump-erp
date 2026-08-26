"""
URL configuration for config project.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/auth/', include('apps.users.urls')),
    path('api/v1/organisations/', include('apps.organizations.urls')),
    path('api/v1/organisations/', include('apps.forecourt.urls')),
    path('api/v1/organisations/', include('apps.employees.urls')),
    path('api/v1/organisations/', include('apps.shifts.urls')),
    path('api/v1/organisations/', include('apps.operations.urls')),
    path('api/v1/', include('apps.core.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
