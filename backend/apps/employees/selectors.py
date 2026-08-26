# apps/employees/selectors.py
from django.db import models
from .models import Employee, EmployeeDesignation, EmployeeOutletAssignment

def employees_for_organisation(organisation) -> models.QuerySet:
    """
    Returns all employees in the organisation.
    """
    return Employee.objects.filter(organisation=organisation).select_related('designation')


def designations_for_organisation(organisation) -> models.QuerySet:
    """
    Returns all designations in the organisation.
    """
    return EmployeeDesignation.objects.filter(organisation=organisation)


def active_employees_for_outlet(outlet, business_date=None) -> models.QuerySet:
    """
    Returns all active employees assigned to a specific outlet.
    Optionally, checks effective assignment date ranges if business_date is provided.
    """
    qs = Employee.objects.filter(
        organisation=outlet.organisation,
        status=Employee.STATUS_ACTIVE,
        outlet_assignments__outlet=outlet
    )
    
    if business_date:
        # Check that assignment is active on business_date
        qs = qs.filter(
            models.Q(outlet_assignments__effective_from__isnull=True) | 
            models.Q(outlet_assignments__effective_from__lte=business_date)
        ).filter(
            models.Q(outlet_assignments__effective_to__isnull=True) | 
            models.Q(outlet_assignments__effective_to__gte=business_date)
        )
        
    return qs.distinct()
