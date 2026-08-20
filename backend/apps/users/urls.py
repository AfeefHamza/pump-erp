# apps/users/urls.py
from django.urls import path
from .views import (
    SignupView,
    LoginView,
    LogoutView,
    MeView,
    CSRFInitializeView,
    PasswordResetRequestView,
    PasswordResetConfirmView
)

urlpatterns = [
    path('signup/', SignupView.as_view(), name='auth_signup'),
    path('login/', LoginView.as_view(), name='auth_login'),
    path('logout/', LogoutView.as_view(), name='auth_logout'),
    path('me/', MeView.as_view(), name='auth_me'),
    path('csrf/', CSRFInitializeView.as_view(), name='auth_csrf'),
    path('password-reset/request/', PasswordResetRequestView.as_view(), name='auth_password_reset_request'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='auth_password_reset_confirm'),
]
