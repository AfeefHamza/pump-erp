# apps/employees/services.py
from django.db import transaction
from django.core.exceptions import ValidationError
from apps.organizations.models import Organisation, Outlet
from .models import Employee, EmployeeDesignation, EmployeeOutletAssignment

@transaction.atomic
def create_designation(organisation, code: str, name: str, **kwargs) -> EmployeeDesignation:
    """
    Creates a new EmployeeDesignation scoped to the organisation.
    """
    return EmployeeDesignation.objects.create(
        organisation=organisation,
        code=code,
        name=name,
        description=kwargs.get('description'),
        requires_nozzle_assignment=kwargs.get('requires_nozzle_assignment', False),
        is_system=kwargs.get('is_system', False),
        is_active=kwargs.get('is_active', True),
        display_order=kwargs.get('display_order', 0)
    )


@transaction.atomic
def create_employee(organisation, employee_code: str, display_name: str, designation, **kwargs) -> Employee:
    """
    Creates a new Employee record.
    """
    # Check uniqueness case-insensitively
    if Employee.objects.filter(organisation=organisation, employee_code__iexact=employee_code).exists():
        raise ValidationError({'employee_code': "An employee with this code already exists in the organisation."})

    return Employee.objects.create(
        organisation=organisation,
        employee_code=employee_code,
        display_name=display_name,
        designation=designation,
        phone_number=kwargs.get('phone_number'),
        alternate_phone_number=kwargs.get('alternate_phone_number'),
        address=kwargs.get('address'),
        date_of_birth=kwargs.get('date_of_birth'),
        joined_on=kwargs.get('joined_on'),
        left_on=kwargs.get('left_on'),
        status=kwargs.get('status', Employee.STATUS_ACTIVE),
        notes=kwargs.get('notes'),
        created_by=kwargs.get('created_by'),
        updated_by=kwargs.get('updated_by')
    )


@transaction.atomic
def update_employee(employee: Employee, **kwargs) -> Employee:
    """
    Updates field values on an existing Employee record.
    """
    for field in [
        'display_name', 'designation', 'phone_number', 'alternate_phone_number',
        'address', 'date_of_birth', 'joined_on', 'left_on', 'status', 'notes',
        'updated_by'
    ]:
        if field in kwargs:
            setattr(employee, field, kwargs[field])
    
    if 'employee_code' in kwargs:
        code = kwargs['employee_code'].strip()
        if Employee.objects.filter(organisation=employee.organisation, employee_code__iexact=code).exclude(id=employee.id).exists():
            raise ValidationError({'employee_code': "An employee with this code already exists in the organisation."})
        employee.employee_code = code

    employee.save()
    return employee


@transaction.atomic
def deactivate_employee(employee: Employee, updated_by=None) -> Employee:
    """
    Sets employee status to inactive.
    """
    employee.status = Employee.STATUS_INACTIVE
    employee.updated_by = updated_by
    employee.save()
    return employee


@transaction.atomic
def assign_employee_to_outlets(employee: Employee, assignments_data: list[dict]) -> list[EmployeeOutletAssignment]:
    """
    Assigns an employee to one or more outlets.
    assignments_data list format:
    [
        {
            'outlet_id': UUID,
            'is_primary': bool,
            'effective_from': Date or None,
            'effective_to': Date or None
        },
        ...
    ]
    """
    created_assignments = []
    # Fetch all outlets first to ensure tenant safety
    for assignment in assignments_data:
        outlet_id = assignment['outlet_id']
        try:
            outlet = Outlet.objects.get(id=outlet_id, organisation=employee.organisation)
        except Outlet.DoesNotExist:
            raise ValidationError(f"Outlet with id {outlet_id} does not exist in this organisation.")

        # Create or update assignment
        obj, created = EmployeeOutletAssignment.objects.update_or_create(
            employee=employee,
            outlet=outlet,
            defaults={
                'is_primary': assignment.get('is_primary', False),
                'effective_from': assignment.get('effective_from'),
                'effective_to': assignment.get('effective_to')
            }
        )
        created_assignments.append(obj)
        
    return created_assignments
