from django.urls import path

from .views import DailyBusinessSummaryView, EmployeeAccountabilityView, ManagementDashboardView


urlpatterns = [
    path(
        '<uuid:org_id>/outlets/<uuid:outlet_id>/dashboard/',
        ManagementDashboardView.as_view(),
        name='management_dashboard',
    ),
    path(
        '<uuid:org_id>/outlets/<uuid:outlet_id>/reports/daily-business-summary/',
        DailyBusinessSummaryView.as_view(),
        name='daily_business_summary_report',
    ),
    path(
        '<uuid:org_id>/outlets/<uuid:outlet_id>/reports/employee-accountability/',
        EmployeeAccountabilityView.as_view(),
        name='employee_accountability_report',
    ),
]
