# apps/users/tests.py
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.db import IntegrityError
import uuid

User = get_user_model()

class CustomUserModelTests(TestCase):
    def test_create_user_successful(self):
        user = User.objects.create_user(
            email="TEST@example.com",
            password="testpassword123",
            display_name="Test User",
            phone_number="+919876543210"
        )
        # normalize_email normalizes the domain part to lowercase
        self.assertEqual(user.email, "TEST@example.com")
        self.assertEqual(user.display_name, "Test User")
        self.assertEqual(user.phone_number, "+919876543210")
        self.assertTrue(user.is_active)
        self.assertIsInstance(user.id, uuid.UUID)
        self.assertTrue(user.check_password("testpassword123"))

    def test_create_user_email_normalized(self):
        user = User.objects.create_user(
            email="test@EXAMPLE.COM",
            password="password"
        )
        self.assertEqual(user.email, "test@example.com")

    def test_create_user_missing_email_raises_error(self):
        with self.assertRaises(ValueError):
            User.objects.create_user(email="", password="password")

    def test_create_user_duplicate_email_raises_error(self):
        User.objects.create_user(email="dup@example.com", password="password1")
        # Direct creation through model or save
        with self.assertRaises(IntegrityError):
            User.objects.create(email="dup@example.com", username="other")

    def test_create_superuser(self):
        admin_user = User.objects.create_superuser(
            email="admin@example.com",
            password="adminpassword"
        )
        self.assertTrue(admin_user.is_staff)
        self.assertTrue(admin_user.is_superuser)
        self.assertTrue(admin_user.is_active)
