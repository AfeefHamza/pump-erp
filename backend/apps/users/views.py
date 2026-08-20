# apps/users/views.py
from django.contrib.auth import authenticate, login, logout, get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.contrib.auth.password_validation import validate_password
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator
from django.core.mail import send_mail
from django.conf import settings
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.core.exceptions import ValidationError as DjangoValidationError

from .serializers import (
    SignupSerializer,
    LoginSerializer,
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer,
    UserSerializer
)

User = get_user_model()

class SignupView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            # Log the user into session immediately after signup
            login(request, user, backend='apps.users.auth_backends.CaseInsensitiveModelBackend')
            return Response(
                UserSerializer(user, context={'request': request}).data,
                status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if serializer.is_valid():
            email = serializer.validated_data['email']
            password = serializer.validated_data['password']

            # Case-insensitivity is handled by our CaseInsensitiveModelBackend
            user = authenticate(request, username=email, password=password)

            if user is None:
                return Response(
                    {"non_field_errors": ["Invalid email or password."]},
                    status=status.HTTP_400_BAD_REQUEST
                )

            if not user.is_active:
                return Response(
                    {"non_field_errors": ["This user account is inactive."]},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # login(request, user) handles session rotation automatically
            login(request, user)
            return Response(
                UserSerializer(user, context={'request': request}).data,
                status=status.HTTP_200_OK
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response(
            {"detail": "Successfully logged out."},
            status=status.HTTP_200_OK
        )

class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

class CSRFInitializeView(APIView):
    permission_classes = [AllowAny]

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        # ensure_csrf_cookie sets the cookie, get_token returns it in the response body
        return Response(
            {"csrfToken": get_token(request)},
            status=status.HTTP_200_OK
        )

class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        if serializer.is_valid():
            email = serializer.validated_data['email'].strip().lower()
            try:
                user = User.objects.get(email__iexact=email)
                if user.is_active:
                    # Generate reset credentials
                    uid = urlsafe_base64_encode(force_bytes(user.pk))
                    token = default_token_generator.make_token(user)
                    
                    # Construct frontend reset URL
                    reset_base_url = getattr(settings, 'PASSWORD_RESET_URL', 'http://localhost:5173/reset-password')
                    reset_link = f"{reset_base_url}?uid={uid}&token={token}"
                    
                    subject = "Reset Your Pump ERP Password"
                    message = (
                        f"Hello {user.display_name or 'User'},\n\n"
                        f"Please use the following link to reset your password:\n"
                        f"{reset_link}\n\n"
                        f"If you did not request this, please ignore this email.\n"
                    )
                    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@pump-erp.com')
                    
                    # Send email using Django backend
                    send_mail(subject, message, from_email, [user.email])
            except User.DoesNotExist:
                # Silently ignore to prevent user enumeration
                pass
            
            # Always return generic success response
            return Response(
                {"detail": "Password reset link has been sent if the account exists."},
                status=status.HTTP_200_OK
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        if serializer.is_valid():
            uidb64 = serializer.validated_data['uid']
            token = serializer.validated_data['token']
            password = serializer.validated_data['password']

            try:
                uid = force_str(urlsafe_base64_decode(uidb64))
                user = User.objects.get(pk=uid)
            except (TypeError, ValueError, OverflowError, User.DoesNotExist):
                user = None

            if user is not None and default_token_generator.check_token(user, token):
                # Validate the new password
                try:
                    validate_password(password, user=user)
                except DjangoValidationError as e:
                    return Response(
                        {"password": list(e.messages)},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                # Set password and save.
                # Note: This will automatically invalidate other active sessions since the 
                # password hash changes.
                user.set_password(password)
                user.save()
                return Response(
                    {"detail": "Password has been reset successfully."},
                    status=status.HTTP_200_OK
                )
            
            return Response(
                {"non_field_errors": ["Invalid or expired reset token."]},
                status=status.HTTP_400_BAD_REQUEST
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
