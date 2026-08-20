"""
URL configuration for config project.
"""
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/auth/', include('apps.users.urls')),
    path('api/v1/organisations/', include('apps.organizations.urls')),
    path('api/v1/', include('apps.core.urls')),
]
