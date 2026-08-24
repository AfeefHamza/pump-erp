# apps/organizations/urls.py
from django.urls import path
from .views import (
    OrganisationListView,
    OrganisationDetailView,
    OutletListCreateView,
    OutletDetailView,
    OnboardingStatusView,
    OnboardingCompleteView,
    FinancialYearListView,
    PermissionListView,
    UserEffectivePermissionsView,
    RoleListCreateView,
    RoleDetailView,
    MembershipListDetailView,
    MembershipDetailView,
    MembershipSuspendReactivateView,
    ActivationListCreateView,
    ActivationResendRevokeView,
    PublicActivationInspectView,
    PublicActivateSubmitView
)

urlpatterns = [
    # Public Activations (No org context path)
    path('activations/public/inspect/', PublicActivationInspectView.as_view(), name='public_activation_inspect'),
    path('activations/public/submit/', PublicActivateSubmitView.as_view(), name='public_activation_submit'),

    # Organisation listing and onboarding
    path('', OrganisationListView.as_view(), name='organisation_list'),
    path('<uuid:org_id>/', OrganisationDetailView.as_view(), name='organisation_detail'),
    path('<uuid:org_id>/outlets/', OutletListCreateView.as_view(), name='outlet_list_create'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/', OutletDetailView.as_view(), name='outlet_detail'),
    path('<uuid:org_id>/onboarding/status/', OnboardingStatusView.as_view(), name='onboarding_status'),
    path('<uuid:org_id>/onboarding/complete/', OnboardingCompleteView.as_view(), name='onboarding_complete'),
    path('<uuid:org_id>/financial-years/', FinancialYearListView.as_view(), name='financial_year_list'),

    # Permissions
    path('<uuid:org_id>/permissions/', PermissionListView.as_view(), name='permission_list'),
    path('<uuid:org_id>/effective-permissions/', UserEffectivePermissionsView.as_view(), name='user_effective_permissions'),

    # Roles
    path('<uuid:org_id>/roles/', RoleListCreateView.as_view(), name='role_list_create'),
    path('<uuid:org_id>/roles/<uuid:role_id>/', RoleDetailView.as_view(), name='role_detail'),

    # Memberships
    path('<uuid:org_id>/memberships/', MembershipListDetailView.as_view(), name='membership_list'),
    path('<uuid:org_id>/memberships/<uuid:membership_id>/', MembershipDetailView.as_view(), name='membership_detail'),
    path('<uuid:org_id>/memberships/<uuid:membership_id>/suspend-reactivate/', MembershipSuspendReactivateView.as_view(), name='membership_suspend_reactivate'),

    # Activations (Admin side)
    path('<uuid:org_id>/activations/', ActivationListCreateView.as_view(), name='activation_list_create'),
    path('<uuid:org_id>/activations/<uuid:activation_id>/action/', ActivationResendRevokeView.as_view(), name='activation_resend_revoke'),
]

