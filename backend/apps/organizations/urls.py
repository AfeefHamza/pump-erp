# apps/organizations/urls.py
from django.urls import path
from .views import (
    OrganisationListView,
    OrganisationDetailView,
    OutletListCreateView,
    OutletDetailView,
    OnboardingStatusView,
    OnboardingCompleteView,
    FinancialYearListView
)

urlpatterns = [
    path('', OrganisationListView.as_view(), name='organisation_list'),
    path('<uuid:org_id>/', OrganisationDetailView.as_view(), name='organisation_detail'),
    path('<uuid:org_id>/outlets/', OutletListCreateView.as_view(), name='outlet_list_create'),
    path('<uuid:org_id>/outlets/<uuid:outlet_id>/', OutletDetailView.as_view(), name='outlet_detail'),
    path('<uuid:org_id>/onboarding/status/', OnboardingStatusView.as_view(), name='onboarding_status'),
    path('<uuid:org_id>/onboarding/complete/', OnboardingCompleteView.as_view(), name='onboarding_complete'),
    path('<uuid:org_id>/financial-years/', FinancialYearListView.as_view(), name='financial_year_list'),
]
