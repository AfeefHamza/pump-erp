# apps/users/tests.py
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes
from django.db import IntegrityError
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
import uuid

from apps.organizations.models import Organisation, OrganisationMembership

User = get_user_model()

class CustomUserModelTests(TestCase):
    def test_create_user_successful(self):
        user = User.objects.create_user(
            email="TEST@example.com",
            password="testpassword123",
            display_name="Test User",
            phone_number="+919876543210"
        )
        # Now emails are fully normalized to lowercase (both local and domain)
        self.assertEqual(user.email, "test@example.com")
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


class AuthAPITests(APITestCase):
    def setUp(self):
        self.signup_url = reverse('auth_signup')
        self.login_url = reverse('auth_login')
        self.logout_url = reverse('auth_logout')
        self.me_url = reverse('auth_me')
        self.csrf_url = reverse('auth_csrf')
        self.pw_reset_request_url = reverse('auth_password_reset_request')
        self.pw_reset_confirm_url = reverse('auth_password_reset_confirm')

        # Create a default user for login testing
        self.user_email = "owner@test.com"
        self.user_password = "securePassword123"
        self.user = User.objects.create_user(
            email=self.user_email,
            password=self.user_password,
            display_name="Default Owner"
        )
        # Give them an organisation
        self.org = Organisation.objects.create(name="Default Org", code="DEFORG")
        self.membership = OrganisationMembership.objects.create(
            user=self.user,
            organisation=self.org,
            membership_type=OrganisationMembership.TYPE_OWNER,
            status=OrganisationMembership.STATUS_ACTIVE
        )

    def test_successful_owner_signup(self):
        payload = {
            "full_name": "New Owner",
            "email": "newowner@test.com",
            "password": "strongPassword123",
            "password_confirm": "strongPassword123",
            "organisation_name": "New Fuel Company",
            "organisation_code": "NFCOMP"
        }
        response = self.client.post(self.signup_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["email"], "newowner@test.com")
        self.assertEqual(response.data["display_name"], "New Owner")

        # Verify organisation & membership creation
        org = Organisation.objects.get(code="NFCOMP")
        self.assertEqual(org.name, "New Fuel Company")
        
        user = User.objects.get(email="newowner@test.com")
        membership = OrganisationMembership.objects.get(user=user, organisation=org)
        self.assertEqual(membership.membership_type, OrganisationMembership.TYPE_OWNER)
        self.assertEqual(membership.status, OrganisationMembership.STATUS_ACTIVE)

        # Verify session is created (client is authenticated)
        self.client.credentials()  # Clear any headers
        me_response = self.client.get(self.me_url)
        self.assertEqual(me_response.status_code, status.HTTP_200_OK)

    def test_signup_atomic_rollback_on_organisation_failure(self):
        # organisation_code is missing/invalid or duplicate
        initial_user_count = User.objects.count()
        payload = {
            "full_name": "Failed User",
            "email": "faileduser@test.com",
            "password": "strongPassword123",
            "password_confirm": "strongPassword123",
            "organisation_name": "Fail Org",
            "organisation_code": "DEFORG"  # Duplicate organisation code
        }
        response = self.client.post(self.signup_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # Verify transaction rolled back (no user created)
        self.assertEqual(User.objects.count(), initial_user_count)

    def test_case_insensitive_duplicate_email_rejection(self):
        payload = {
            "full_name": "Dup Owner",
            "email": "OWNER@TEST.COM",  # Duplicate of self.user_email (case-insensitive)
            "password": "strongPassword123",
            "password_confirm": "strongPassword123",
            "organisation_name": "Dup Org",
            "organisation_code": "DUPORG"
        }
        response = self.client.post(self.signup_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_password_validation_rejection(self):
        payload = {
            "full_name": "Weak Password User",
            "email": "weak@test.com",
            "password": "123",  # Too short
            "password_confirm": "123",
            "organisation_name": "Weak Org",
            "organisation_code": "WEAKORG"
        }
        response = self.client.post(self.signup_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)

    def test_duplicate_organisation_code_rejection(self):
        payload = {
            "full_name": "New Owner 2",
            "email": "owner2@test.com",
            "password": "strongPassword123",
            "password_confirm": "strongPassword123",
            "organisation_name": "Apex Fuel Services",
            "organisation_code": "deforg"  # Case-insensitive duplicate of DEFORG
        }
        response = self.client.post(self.signup_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("organisation_code", response.data)

    def test_successful_email_login_case_insensitive(self):
        payload = {
            "email": "oWnEr@TeSt.CoM",  # Mixed case matching self.user_email
            "password": self.user_password
        }
        response = self.client.post(self.login_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], self.user_email)

    def test_invalid_login_generic_response(self):
        # 1. Non-existent email
        payload = {
            "email": "nonexistent@test.com",
            "password": "somePassword"
        }
        response = self.client.post(self.login_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("non_field_errors", response.data)
        self.assertEqual(response.data["non_field_errors"][0], "Invalid email or password.")

        # 2. Correct email, wrong password
        payload = {
            "email": self.user_email,
            "password": "wrongPassword"
        }
        response = self.client.post(self.login_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("non_field_errors", response.data)
        self.assertEqual(response.data["non_field_errors"][0], "Invalid email or password.")

    def test_inactive_user_login_rejection(self):
        self.user.is_active = False
        self.user.save()

        payload = {
            "email": self.user_email,
            "password": self.user_password
        }
        response = self.client.post(self.login_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["non_field_errors"][0], "This user account is inactive.")

    def test_current_user_endpoint_auth_enforced(self):
        # Unauthenticated request
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Authenticated request
        self.client.login(email=self.user_email, password=self.user_password)
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], self.user_email)
        self.assertEqual(len(response.data["organisations"]), 1)
        self.assertEqual(response.data["organisations"][0]["code"], "DEFORG")

    def test_sensitive_fields_never_returned(self):
        self.client.login(email=self.user_email, password=self.user_password)
        response = self.client.get(self.me_url)
        self.assertNotIn("password", response.data)
        self.assertNotIn("password_hash", response.data)
        self.assertNotIn("is_superuser", response.data)
        self.assertNotIn("is_staff", response.data)

    def test_post_only_logout(self):
        self.client.login(email=self.user_email, password=self.user_password)
        
        # GET logout should fail
        get_response = self.client.get(self.logout_url)
        self.assertEqual(get_response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        # POST logout should succeed
        post_response = self.client.post(self.logout_url)
        self.assertEqual(post_response.status_code, status.HTTP_200_OK)

        # Confirm session is cleared
        me_response = self.client.get(self.me_url)
        self.assertEqual(me_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_password_reset_request_prevents_user_enumeration(self):
        # 1. Active email
        response1 = self.client.post(self.pw_reset_request_url, {"email": self.user_email}, format='json')
        self.assertEqual(response1.status_code, status.HTTP_200_OK)
        self.assertEqual(response1.data["detail"], "Password reset link has been sent if the account exists.")

        # 2. Non-existent email
        response2 = self.client.post(self.pw_reset_request_url, {"email": "noone@test.com"}, format='json')
        self.assertEqual(response2.status_code, status.HTTP_200_OK)
        self.assertEqual(response2.data["detail"], "Password reset link has been sent if the account exists.")

    def test_password_reset_confirm_success(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)

        payload = {
            "uid": uid,
            "token": token,
            "password": "newSecurePassword123",
            "password_confirm": "newSecurePassword123"
        }
        response = self.client.post(self.pw_reset_confirm_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["detail"], "Password has been reset successfully.")

        # Verify password changed
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("newSecurePassword123"))

    def test_password_reset_confirm_invalid_or_expired_token(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        
        payload = {
            "uid": uid,
            "token": "invalid-token",
            "password": "newSecurePassword123",
            "password_confirm": "newSecurePassword123"
        }
        response = self.client.post(self.pw_reset_confirm_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["non_field_errors"][0], "Invalid or expired reset token.")
