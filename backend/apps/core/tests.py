# apps/core/tests.py
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status

class HealthCheckTests(APITestCase):
    def test_health_check_endpoint(self):
        """
        Verify that GET /api/v1/health/ returns status 200 and health indicators.
        """
        url = reverse('health_check')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), {
            "status": "ok",
            "service": "pump-erp-api"
        })
