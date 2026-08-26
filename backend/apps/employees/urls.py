# apps/employees/urls.py
from django.urls import path
from .views import (
    EmployeeListCreateView, EmployeeDetailView, EmployeeOutletAssignmentView,
    EmployeeDesignationListCreateView, EmployeeDesignationDetailView
)

urlpatterns = [
    # Designations
    path('<uuid:org_id>/designations/', EmployeeDesignationListCreateView.as_view(), name='designation_list_create'),
    path('<uuid:org_id>/designations/<uuid:designation_id>/', EmployeeDesignationDetailView.as_view(), name='designation_detail'),

    # Employees
    path('<uuid:org_id>/employees/', EmployeeListCreateView.as_view(), name='employee_list_create'),
    path('<uuid:org_id>/employees/<uuid:employee_id>/', EmployeeDetailView.as_view(), name='employee_detail'),
    path('<uuid:org_id>/employees/<uuid:employee_id>/assignments/', EmployeeOutletAssignmentView.as_view(), name='employee_outlet_assignments'),
]
