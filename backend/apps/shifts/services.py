# apps/shifts/services.py
from django.db import transaction
from django.core.exceptions import ValidationError
from apps.organizations.models import Organisation, Outlet
from apps.employees.models import Employee, EmployeeDesignation
from apps.forecourt.models import Nozzle
from .models import ShiftDefinition, ShiftRoster, ShiftStaffAssignment, ShiftNozzleAssignment

@transaction.atomic
def create_shift_definition(organisation, outlet, code: str, name: str, starts_at, ends_at, **kwargs) -> ShiftDefinition:
    """
    Creates a new shift definition for an outlet.
    """
    if ShiftDefinition.objects.filter(outlet=outlet, code__iexact=code).exists():
        raise ValidationError({'code': "A shift definition with this code already exists for this outlet."})
    if ShiftDefinition.objects.filter(outlet=outlet, name__iexact=name).exists():
        raise ValidationError({'name': "A shift definition with this name already exists for this outlet."})

    return ShiftDefinition.objects.create(
        organisation=organisation,
        outlet=outlet,
        code=code,
        name=name,
        starts_at=starts_at,
        ends_at=ends_at,
        display_order=kwargs.get('display_order', 0),
        is_active=kwargs.get('is_active', True),
        notes=kwargs.get('notes')
    )


@transaction.atomic
def update_shift_definition(shift_def: ShiftDefinition, **kwargs) -> ShiftDefinition:
    """
    Updates an existing shift definition.
    """
    for field in ['name', 'starts_at', 'ends_at', 'display_order', 'is_active', 'notes']:
        if field in kwargs:
            setattr(shift_def, field, kwargs[field])

    if 'code' in kwargs:
        code = kwargs['code'].strip()
        if ShiftDefinition.objects.filter(outlet=shift_def.outlet, code__iexact=code).exclude(id=shift_def.id).exists():
            raise ValidationError({'code': "A shift definition with this code already exists for this outlet."})
        shift_def.code = code

    shift_def.save()
    return shift_def


@transaction.atomic
def create_or_update_roster(organisation, outlet, shift_definition, business_date, **kwargs) -> ShiftRoster:
    """
    Creates or updates a shift roster for a specific date and shift definition.
    """
    roster, created = ShiftRoster.objects.get_or_create(
        organisation=organisation,
        outlet=outlet,
        shift_definition=shift_definition,
        business_date=business_date,
        defaults={
            'notes': kwargs.get('notes'),
            'created_by': kwargs.get('user'),
            'updated_by': kwargs.get('user')
        }
    )

    if not created:
        if roster.is_locked:
            raise ValidationError("Roster is locked and cannot be edited.")
        if 'notes' in kwargs:
            roster.notes = kwargs['notes']
        roster.updated_by = kwargs.get('user')
        roster.save()

    return roster


@transaction.atomic
def assign_employee_to_roster(roster: ShiftRoster, employee: Employee, duty_designation: EmployeeDesignation, **kwargs) -> ShiftStaffAssignment:
    """
    Assigns an employee to a shift roster with a duty designation.
    """
    if roster.is_locked:
        raise ValidationError("Roster is locked and cannot be edited.")

    assignment, created = ShiftStaffAssignment.objects.update_or_create(
        roster=roster,
        employee=employee,
        defaults={
            'duty_designation': duty_designation,
            'is_primary_cashier': kwargs.get('is_primary_cashier', False),
            'notes': kwargs.get('notes')
        }
    )
    return assignment


@transaction.atomic
def assign_nozzles_to_employee(staff_assignment: ShiftStaffAssignment, nozzles: list[Nozzle]) -> list[ShiftNozzleAssignment]:
    """
    Assigns a list of nozzles to a staff member in a roster.
    Removes existing nozzle assignments for this staff first.
    """
    roster = staff_assignment.roster
    if roster.is_locked:
        raise ValidationError("Roster is locked and cannot be edited.")

    # Remove existing nozzle assignments for this staff assignment
    ShiftNozzleAssignment.objects.filter(staff_assignment=staff_assignment).delete()

    created_assignments = []
    for nozzle in nozzles:
        assignment = ShiftNozzleAssignment.objects.create(
            staff_assignment=staff_assignment,
            nozzle=nozzle
        )
        created_assignments.append(assignment)

    return created_assignments
