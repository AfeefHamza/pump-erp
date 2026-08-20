# apps/core/tests.py
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from unittest.mock import patch

class HealthCheckTests(APITestCase):
    def test_health_check_endpoint_success(self):
        """
        Verify that GET /api/v1/health/ returns status 200 and database: connected.
        """
        url = reverse('health_check')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), {
            "status": "ok",
            "service": "pump-erp-api",
            "database": "connected"
        })

    @patch('django.db.connection.cursor')
    def test_health_check_endpoint_db_unavailable(self, mock_cursor):
        """
        Verify that GET /api/v1/health/ returns status 503 when database is unreachable.
        """
        mock_cursor.side_effect = Exception("Database connection failure")
        
        url = reverse('health_check')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.json(), {
            "status": "unavailable",
            "service": "pump-erp-api",
            "database": "unavailable"
        })
