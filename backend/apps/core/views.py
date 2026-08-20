# apps/core/views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """
    Public endpoint indicating API service health status.
    """
    return Response({
        "status": "ok",
        "service": "pump-erp-api"
    })
