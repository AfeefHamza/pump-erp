# apps/core/views.py
from django.db import connection
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """
    Public endpoint indicating API service health status.
    """
    try:
        # Check database connectivity
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        
        return Response({
            "status": "ok",
            "service": "pump-erp-api",
            "database": "connected"
        })
    except Exception:
        # Return HTTP 503 Service Unavailable when DB is unreachable
        return Response({
            "status": "unavailable",
            "service": "pump-erp-api",
            "database": "unavailable"
        }, status=503)
