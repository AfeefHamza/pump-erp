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


from datetime import datetime, date, timedelta, time
from decimal import Decimal, ROUND_HALF_UP
from django.utils import timezone
from django.db import models
from apps.forecourt.models import FuelProduct, Tank, Dispenser, ProductPrice
from apps.forecourt.services import set_product_price
from apps.operations.services import convert_dip_to_volume
from apps.operations.selectors import check_outlet_operational_readiness
from .models import (
    OperationalShift, OperationalShiftStaff, OperationalShiftNozzleAssignment,
    ShiftNozzleMeter, ShiftNozzlePriceSegment, ShiftMeterEvent,
    ShiftTestingRecord, ShiftTankDipObservation, ShiftActivityLog
)
from .selectors import (
    derive_nozzle_opening_reading, calculate_shift_totals,
    preview_shift_closing_data, check_can_reopen_shift
)


def log_shift_activity(shift, event_type, actor, reason=None, metadata=None) -> ShiftActivityLog:
    """
    Creates an append-only audit log entry for an operational shift.
    """
    return ShiftActivityLog.objects.create(
        organisation=shift.organisation,
        outlet=shift.outlet,
        shift=shift,
        event_type=event_type,
        actor=actor,
        reason=reason,
        metadata=metadata or {}
    )


def prepare_shift_opening(organisation, outlet, shift_definition, business_date) -> dict:
    """
    Prepares shift opening:
    - Checks outlet operational readiness
    - Checks if any other shift is currently open
    - Checks if shift for date already exists
    - Checks planned roster for that date/shift
    - Derives opening readings and current prices for all active nozzles
    - Previews assignments and available employees
    """
    readiness = check_outlet_operational_readiness(outlet)
    
    # Active open shift check
    open_shift = OperationalShift.objects.filter(
        outlet=outlet,
        status=OperationalShift.STATUS_OPEN
    ).select_related('shift_definition', 'opened_by').first()

    # Existing shift for same definition & date check
    existing_shift = OperationalShift.objects.filter(
        outlet=outlet,
        shift_definition=shift_definition,
        business_date=business_date
    ).first()

    # Check planned roster
    roster = ShiftRoster.objects.filter(
        outlet=outlet,
        shift_definition=shift_definition,
        business_date=business_date
    ).first()

    roster_assignments = {} # nozzle_id -> employee_id
    if roster:
        for sa in roster.staff_assignments.prefetch_related('nozzle_assignments'):
            for na in sa.nozzle_assignments.all():
                roster_assignments[str(na.nozzle_id)] = str(sa.employee_id)

    # Active nozzles with derived readings and prices
    active_nozzles = list(
        Nozzle.objects.filter(outlet=outlet, status=Nozzle.STATUS_ACTIVE)
        .select_related('dispenser', 'tank', 'tank__product')
    )

    nozzle_previews = []
    now = timezone.now()
    for n in active_nozzles:
        derived = derive_nozzle_opening_reading(outlet, n, as_of_time=now)
        price_obj = ProductPrice.objects.filter(
            outlet=outlet,
            product=n.tank.product,
            effective_from__lte=now
        ).filter(
            models.Q(effective_to__isnull=True) | models.Q(effective_to__gt=now)
        ).order_by('-effective_from').first()

        if not price_obj:
            price_obj = ProductPrice.objects.filter(
                outlet=outlet,
                product=n.tank.product
            ).order_by('-effective_from').first()

        nozzle_previews.append({
            'nozzle_id': str(n.id),
            'nozzle_code': n.code,
            'nozzle_name': n.name,
            'dispenser_id': str(n.dispenser.id),
            'dispenser_name': n.dispenser.name,
            'product_id': str(n.tank.product.id),
            'product_name': n.tank.product.name,
            'product_code': n.tank.product.code,
            'tank_id': str(n.tank.id),
            'tank_code': n.tank.code,
            'derived_opening_reading': derived['reading'],
            'opening_source': derived['source'],
            'opening_source_reference': derived['reference'],
            'opening_source_description': derived['source_description'],
            'requires_manual_exception': derived['source'] == ShiftNozzleMeter.SOURCE_MANUAL_EXCEPTION,
            'current_price': price_obj.selling_price if price_obj else None,
            'preselected_employee_id': roster_assignments.get(str(n.id))
        })

    # Available active employees
    employees = list(
        Employee.objects.filter(
            organisation=organisation,
            outlet_assignments__outlet=outlet,
            status=Employee.STATUS_ACTIVE
        ).select_related('designation')
    )

    employee_list = [{
        'id': str(e.id),
        'code': e.employee_code,
        'name': e.display_name,
        'designation_id': str(e.designation.id) if e.designation else None,
        'designation_name': e.designation.name if e.designation else "Staff",
    } for e in employees]

    can_open = readiness['ready'] and (open_shift is None) and (existing_shift is None)

    return {
        'outlet_id': str(outlet.id),
        'shift_definition_id': str(shift_definition.id),
        'business_date': str(business_date),
        'can_open': can_open,
        'readiness': readiness,
        'active_open_shift': {
            'id': str(open_shift.id),
            'shift_name': open_shift.shift_definition.name,
            'business_date': str(open_shift.business_date),
            'opened_at': open_shift.opened_at.isoformat()
        } if open_shift else None,
        'existing_shift': {
            'id': str(existing_shift.id),
            'status': existing_shift.status
        } if existing_shift else None,
        'has_planned_roster': roster is not None,
        'nozzles': nozzle_previews,
        'employees': employee_list
    }


@transaction.atomic
def open_operational_shift(organisation, outlet, shift_definition, business_date,
                           staff_assignments_data: list[dict], manual_exceptions_data: dict,
                           notes: str | None, user) -> OperationalShift:
    """
    Atomically opens an operational shift for an outlet:
    - Enforces operational readiness
    - Locks outlet to prevent concurrent opening
    - Validates no other shift is currently open
    - Validates business date uniqueness
    - Ensures every active nozzle has exactly one primary handler
    - Snapshots staff and nozzle assignments
    - Initializes opening totalizers and price segments
    - Records audit log
    """
    # 1. Row-lock outlet to prevent race condition
    Outlet.objects.select_for_update().get(id=outlet.id)

    # 2. Readiness check
    readiness = check_outlet_operational_readiness(outlet)
    if not readiness['ready']:
        missing = "; ".join(readiness['missing_requirements'])
        raise ValidationError(f"Outlet is not operationally ready to open a shift: {missing}")

    # 3. Only one open shift per outlet
    if OperationalShift.objects.filter(outlet=outlet, status=OperationalShift.STATUS_OPEN).exists():
        raise ValidationError("Another operational shift is currently open for this outlet. Only one shift may be open at a time.")

    # 4. Uniqueness per outlet, shift definition and business date
    if OperationalShift.objects.filter(outlet=outlet, shift_definition=shift_definition, business_date=business_date).exists():
        raise ValidationError(f"A shift for {shift_definition.name} on {business_date} already exists for this outlet.")

    # 5. Determine scheduled start and end timestamps
    now = timezone.now()
    # Construct scheduled timestamps
    sched_starts_at = datetime.combine(business_date, shift_definition.starts_at)
    if shift_definition.crosses_midnight:
        sched_ends_at = datetime.combine(business_date + timedelta(days=1), shift_definition.ends_at)
    else:
        sched_ends_at = datetime.combine(business_date, shift_definition.ends_at)

    if timezone.is_naive(sched_starts_at):
        sched_starts_at = timezone.make_aware(sched_starts_at)
    if timezone.is_naive(sched_ends_at):
        sched_ends_at = timezone.make_aware(sched_ends_at)

    # 6. Verify nozzle coverage: every active nozzle must have one primary employee
    active_nozzles = list(
        Nozzle.objects.filter(outlet=outlet, status=Nozzle.STATUS_ACTIVE)
        .select_related('dispenser', 'tank', 'tank__product')
    )
    if not active_nozzles:
        raise ValidationError("Cannot open shift: No active nozzles configured for this outlet.")

    # Check staff assignments
    assigned_nozzle_ids = set()
    nozzle_to_emp_data = {} # nozzle_id -> staff_data

    for staff_data in staff_assignments_data:
        emp_id = staff_data.get('employee_id')
        if not emp_id:
            raise ValidationError("Each staff assignment must include an employee_id.")

        nozzle_ids = staff_data.get('nozzle_ids', [])
        for nid in nozzle_ids:
            nid_str = str(nid)
            if nid_str in assigned_nozzle_ids:
                raise ValidationError(f"Nozzle {nid_str} is assigned to multiple employees. Each nozzle can have only one handler.")
            assigned_nozzle_ids.add(nid_str)
            nozzle_to_emp_data[nid_str] = staff_data

    # Verify all active nozzles are assigned
    for n in active_nozzles:
        if str(n.id) not in assigned_nozzle_ids:
            raise ValidationError(f"Active nozzle '{n.code}' ({n.name}) must be assigned to an employee before opening the shift.")

    # Check for planned roster
    source_roster = ShiftRoster.objects.filter(
        outlet=outlet,
        shift_definition=shift_definition,
        business_date=business_date
    ).first()

    # 7. Create OperationalShift
    shift = OperationalShift.objects.create(
        organisation=organisation,
        outlet=outlet,
        shift_definition=shift_definition,
        source_roster=source_roster,
        business_date=business_date,
        scheduled_starts_at=sched_starts_at,
        scheduled_ends_at=sched_ends_at,
        opened_at=now,
        status=OperationalShift.STATUS_OPEN,
        notes=notes,
        opened_by=user
    )

    # 8. Snapshot staff members
    staff_obj_map = {} # emp_id -> OperationalShiftStaff
    for staff_data in staff_assignments_data:
        emp_id = staff_data['employee_id']
        try:
            employee = Employee.objects.get(id=emp_id, organisation=organisation)
        except Employee.DoesNotExist:
            raise ValidationError(f"Employee {emp_id} does not exist.")

        # Ensure employee is active and assigned to this outlet
        if employee.status != Employee.STATUS_ACTIVE:
            raise ValidationError(f"Employee {employee.display_name} is inactive.")
        if not employee.outlet_assignments.filter(outlet=outlet).exists():
            raise ValidationError(f"Employee {employee.display_name} is not assigned to this outlet.")

        designation_name = employee.designation.name if employee.designation else "Staff"
        staff_member = OperationalShiftStaff.objects.create(
            shift=shift,
            source_employee=employee,
            duty_designation=employee.designation,
            employee_code_snapshot=employee.employee_code,
            employee_name_snapshot=employee.display_name,
            designation_snapshot=designation_name,
            notes=staff_data.get('notes'),
            effective_from=now,
            added_by=user
        )
        staff_obj_map[str(emp_id)] = staff_member

    # 9. Derive opening meters, snapshot nozzle assignments, and create price segments
    for nozzle in active_nozzles:
        staff_data = nozzle_to_emp_data[str(nozzle.id)]
        staff_member = staff_obj_map[str(staff_data['employee_id'])]

        # Derive opening reading or check manual exception
        manual_exc = manual_exceptions_data.get(str(nozzle.id)) or manual_exceptions_data.get(nozzle.code)
        if manual_exc:
            exc_type = manual_exc.get('type')
            exc_reason = manual_exc.get('reason')
            reading_val = Decimal(str(manual_exc.get('reading')))
            if reading_val < 0:
                raise ValidationError(f"Opening reading for nozzle {nozzle.code} cannot be negative.")
            if not exc_reason or not exc_reason.strip():
                raise ValidationError(f"A mandatory reason is required for manual opening reading exception on nozzle {nozzle.code}.")
            
            opening_reading = reading_val
            opening_source = ShiftNozzleMeter.SOURCE_MANUAL_EXCEPTION
            source_ref = None
            manual_type = exc_type
            manual_reason = exc_reason.strip()
        else:
            derived = derive_nozzle_opening_reading(outlet, nozzle, as_of_time=now)
            if derived['reading'] is None:
                raise ValidationError(f"No previous reading or opening balance found for nozzle {nozzle.code}. A manual opening exception with reason is required.")
            opening_reading = derived['reading']
            opening_source = derived['source']
            source_ref = derived['reference']
            manual_type = None
            manual_reason = None

        # ShiftNozzleMeter
        meter = ShiftNozzleMeter.objects.create(
            shift=shift,
            nozzle=nozzle,
            staff_assignment=staff_member,
            opening_reading=opening_reading,
            opening_source=opening_source,
            opening_source_reference=source_ref,
            manual_exception_type=manual_type,
            manual_exception_reason=manual_reason
        )

        # OperationalShiftNozzleAssignment with opening reading & time
        OperationalShiftNozzleAssignment.objects.create(
            shift=shift,
            shift_staff=staff_member,
            nozzle=nozzle,
            dispenser_name_snapshot=nozzle.dispenser.name,
            nozzle_name_snapshot=nozzle.name,
            product=nozzle.tank.product,
            product_name_snapshot=nozzle.tank.product.name,
            effective_from=now,
            opening_reading=opening_reading,
            assignment_type='shift_start',
            created_by=user
        )

        # Fetch active price
        active_price = ProductPrice.objects.filter(
            outlet=outlet,
            product=nozzle.tank.product,
            effective_from__lte=now
        ).filter(
            models.Q(effective_to__isnull=True) | models.Q(effective_to__gt=now)
        ).order_by('-effective_from').first()

        if not active_price:
            active_price = ProductPrice.objects.filter(
                outlet=outlet,
                product=nozzle.tank.product
            ).order_by('-effective_from').first()

        if not active_price:
            raise ValidationError(f"No active selling price configured for product {nozzle.tank.product.name}.")

        # ShiftNozzlePriceSegment (Initial segment)
        ShiftNozzlePriceSegment.objects.create(
            shift_nozzle_meter=meter,
            product=nozzle.tank.product,
            sequence=1,
            starts_at=now,
            opening_reading=opening_reading,
            unit_price=active_price.selling_price,
            price_history_reference=active_price
        )

    # 10. Audit log
    log_shift_activity(
        shift=shift,
        event_type='shift_opened',
        actor=user,
        reason=notes,
        metadata={
            'business_date': str(business_date),
            'shift_definition': shift_definition.name,
            'nozzle_count': len(active_nozzles),
            'staff_count': len(staff_assignments_data)
        }
    )

    return shift


@transaction.atomic
def add_staff_to_open_shift(
    shift: OperationalShift,
    employee_id,
    duty_designation_id=None,
    notes: str = None,
    assigned_nozzle_ids: list = None,
    user=None
) -> OperationalShiftStaff:
    """
    Adds staff to an open shift:
    - Allows adding non-nozzle staff (supervisor, manager, helper, support).
    - Prevents bypassing handover: can only assign nozzles that have NO active handler.
    """
    shift = OperationalShift.objects.select_for_update().get(id=shift.id)
    if shift.status != OperationalShift.STATUS_OPEN:
        raise ValidationError("Staff can only be added to an open operational shift.")

    try:
        employee = Employee.objects.get(id=employee_id, organisation=shift.organisation)
    except Employee.DoesNotExist:
        raise ValidationError("Employee does not exist.")

    if employee.status != Employee.STATUS_ACTIVE:
        raise ValidationError(f"Employee '{employee.display_name}' is not active.")

    if not employee.outlet_assignments.filter(outlet=shift.outlet, effective_to__isnull=True).exists():
        raise ValidationError(f"Employee '{employee.display_name}' is not assigned to this outlet.")

    # Guard: Rule 10: Cannot bypass handover rules
    assigned_nozzles = []
    if assigned_nozzle_ids:
        for nid in assigned_nozzle_ids:
            try:
                nozzle = Nozzle.objects.get(id=nid, outlet=shift.outlet)
            except Nozzle.DoesNotExist:
                raise ValidationError(f"Nozzle {nid} does not exist at this outlet.")

            active_existing = OperationalShiftNozzleAssignment.objects.filter(
                shift=shift,
                nozzle=nozzle,
                effective_to__isnull=True
            ).first()
            if active_existing:
                raise ValidationError(
                    f"Nozzle '{nozzle.code}' already has an active attendant ({active_existing.shift_staff.employee_name_snapshot}). "
                    f"Use 'Transfer Nozzle' to hand over this nozzle with verified meter totalizer readings."
                )
            assigned_nozzles.append(nozzle)

    duty_desig = None
    if duty_designation_id:
        try:
            duty_desig = EmployeeDesignation.objects.get(id=duty_designation_id, organisation=shift.organisation)
            desig_name = duty_desig.name
        except EmployeeDesignation.DoesNotExist:
            raise ValidationError("Specified duty designation does not exist.")
    else:
        duty_desig = employee.designation
        desig_name = employee.designation.name if employee.designation else "Staff"

    now = timezone.now()

    staff_member = OperationalShiftStaff.objects.filter(shift=shift, source_employee=employee).first()
    if staff_member:
        staff_member.effective_to = None
        staff_member.duty_designation = duty_desig
        staff_member.designation_snapshot = desig_name
        if notes:
            staff_member.notes = notes
        staff_member.save()
    else:
        staff_member = OperationalShiftStaff.objects.create(
            shift=shift,
            source_employee=employee,
            duty_designation=duty_desig,
            employee_code_snapshot=employee.employee_code,
            employee_name_snapshot=employee.display_name,
            designation_snapshot=desig_name,
            notes=notes,
            effective_from=now,
            added_by=user
        )

    for nozzle in assigned_nozzles:
        meter = ShiftNozzleMeter.objects.filter(shift=shift, nozzle=nozzle).first()
        op_reading = meter.opening_reading if meter else Decimal('0.000')
        OperationalShiftNozzleAssignment.objects.create(
            shift=shift,
            shift_staff=staff_member,
            nozzle=nozzle,
            dispenser_name_snapshot=nozzle.dispenser.name,
            nozzle_name_snapshot=nozzle.name,
            product=nozzle.tank.product,
            product_name_snapshot=nozzle.tank.product.name,
            effective_from=now,
            opening_reading=op_reading,
            assignment_type='shift_start',
            created_by=user
        )
        if meter:
            meter.staff_assignment = staff_member
            meter.save(update_fields=['staff_assignment'])

    recalculate_shift_totals(shift)

    log_shift_activity(
        shift=shift,
        event_type='staff_added',
        actor=user,
        reason=notes,
        metadata={
            'employee_name': employee.display_name,
            'employee_code': employee.employee_code,
            'designation': desig_name,
            'assigned_nozzles': [n.code for n in assigned_nozzles]
        }
    )

    return staff_member


@transaction.atomic
def transfer_nozzle_assignment(
    shift: OperationalShift,
    nozzle_id,
    new_employee_id,
    handover_reading,
    handover_time=None,
    reason: str = '',
    user=None
) -> OperationalShiftNozzleAssignment:
    """
    Atomically hands over an active nozzle assignment to another employee:
    - Transaction-locks shift, meter, and active assignment.
    - Validates authoritative meter readings and continuity.
    - Ends previous attendant assignment at handover reading & time.
    - Starts new attendant assignment at identical reading.
    - Preserves exact interval sales and testing attribution.
    """
    shift = OperationalShift.objects.select_for_update().get(id=shift.id)
    if shift.status != OperationalShift.STATUS_OPEN:
        raise ValidationError("Nozzle handover can only be performed while the shift is open.")

    if not reason or not reason.strip():
        raise ValidationError("A mandatory reason is required for attendant nozzle handover.")

    now = timezone.now()
    if handover_time is None:
        handover_time = now

    try:
        meter = ShiftNozzleMeter.objects.select_for_update().get(shift=shift, nozzle_id=nozzle_id)
    except ShiftNozzleMeter.DoesNotExist:
        raise ValidationError("Nozzle meter does not exist on this shift.")

    active_assignment = OperationalShiftNozzleAssignment.objects.select_for_update().filter(
        shift=shift,
        nozzle_id=nozzle_id,
        effective_to__isnull=True
    ).first()
    if not active_assignment:
        raise ValidationError(f"No active attendant assignment found for nozzle {meter.nozzle.code}.")

    try:
        handover_dec = Decimal(str(handover_reading))
    except Exception:
        raise ValidationError("Handover reading must be a valid numeric decimal.")

    if handover_dec < 0:
        raise ValidationError("Handover reading cannot be negative.")

    start_reading = active_assignment.opening_reading if active_assignment.opening_reading is not None else meter.opening_reading
    if handover_dec < start_reading:
        raise ValidationError(
            f"Handover reading ({handover_dec}) cannot be lower than the attendant's starting reading ({start_reading}) on nozzle {meter.nozzle.code}."
        )

    if meter.closing_reading is not None and handover_dec > meter.closing_reading:
        raise ValidationError(
            f"Handover reading ({handover_dec}) cannot exceed the recorded closing reading ({meter.closing_reading}) on nozzle {meter.nozzle.code}."
        )

    if handover_time < active_assignment.effective_from:
        raise ValidationError(
            f"Handover time ({handover_time.isoformat()}) cannot precede assignment start time ({active_assignment.effective_from.isoformat()})."
        )
    if handover_time > now:
        raise ValidationError("Handover time cannot be in the future.")

    # Must not precede later recorded testing, price changes, meter events
    if meter.testing_records.filter(occurred_at__gt=handover_time).exists():
        raise ValidationError(
            "Cannot set handover timestamp prior to recorded fuel tests on this nozzle. Please enter the current or subsequent time."
        )
    if meter.meter_events.filter(occurred_at__gt=handover_time).exists():
        raise ValidationError(
            "Cannot set handover timestamp prior to recorded meter events on this nozzle."
        )
    if meter.price_segments.filter(starts_at__gt=handover_time).exists():
        raise ValidationError(
            "Cannot set handover timestamp prior to a price change on this nozzle."
        )

    try:
        new_employee = Employee.objects.get(id=new_employee_id, organisation=shift.organisation)
    except Employee.DoesNotExist:
        raise ValidationError("Target employee does not exist.")

    if new_employee.status != Employee.STATUS_ACTIVE:
        raise ValidationError(f"Target employee '{new_employee.display_name}' is inactive.")
    if not new_employee.outlet_assignments.filter(outlet=shift.outlet, effective_to__isnull=True).exists():
        raise ValidationError(f"Target employee '{new_employee.display_name}' is not assigned to this outlet.")

    if active_assignment.shift_staff.source_employee_id == new_employee.id:
        raise ValidationError(f"Nozzle {meter.nozzle.code} is already assigned to {new_employee.display_name}.")

    new_staff = OperationalShiftStaff.objects.filter(shift=shift, source_employee=new_employee).first()
    if not new_staff:
        designation_name = new_employee.designation.name if new_employee.designation else "Staff"
        new_staff = OperationalShiftStaff.objects.create(
            shift=shift,
            source_employee=new_employee,
            duty_designation=new_employee.designation,
            employee_code_snapshot=new_employee.employee_code,
            employee_name_snapshot=new_employee.display_name,
            designation_snapshot=designation_name,
            effective_from=handover_time,
            added_by=user
        )

    prev_emp_name = active_assignment.shift_staff.employee_name_snapshot
    active_assignment.effective_to = handover_time
    active_assignment.closing_reading = handover_dec
    active_assignment.save(update_fields=['effective_to', 'closing_reading'])

    new_assignment = OperationalShiftNozzleAssignment.objects.create(
        shift=shift,
        shift_staff=new_staff,
        nozzle=meter.nozzle,
        dispenser_name_snapshot=meter.nozzle.dispenser.name,
        nozzle_name_snapshot=meter.nozzle.name,
        product=meter.nozzle.tank.product,
        product_name_snapshot=meter.nozzle.tank.product.name,
        effective_from=handover_time,
        opening_reading=handover_dec,
        assignment_type='handover',
        reason=reason.strip(),
        created_by=user
    )

    meter.staff_assignment = new_staff
    meter.save(update_fields=['staff_assignment'])

    shift.version += 1
    shift.save(update_fields=['version'])

    recalculate_shift_totals(shift)

    log_shift_activity(
        shift=shift,
        event_type='nozzle_handover',
        actor=user,
        reason=reason.strip(),
        metadata={
            'nozzle_code': meter.nozzle.code,
            'from_employee': prev_emp_name,
            'to_employee': new_staff.employee_name_snapshot,
            'handover_reading': str(handover_dec),
            'handover_time': handover_time.isoformat()
        }
    )

    return new_assignment


@transaction.atomic
def correct_nozzle_assignment(
    shift: OperationalShift,
    nozzle_id,
    new_employee_id,
    reason: str = '',
    user=None
) -> OperationalShiftNozzleAssignment:
    """
    Corrects a nozzle assignment only when no dispensing has occurred since the assignment started.
    Mandatory reason required. Does not create artificial sales intervals.
    """
    shift = OperationalShift.objects.select_for_update().get(id=shift.id)
    if shift.status != OperationalShift.STATUS_OPEN:
        raise ValidationError("Assignment corrections can only be made while the shift is open.")

    if not reason or not reason.strip():
        raise ValidationError("A mandatory reason is required for assignment correction.")

    meter = ShiftNozzleMeter.objects.select_for_update().get(shift=shift, nozzle_id=nozzle_id)
    active_assignment = OperationalShiftNozzleAssignment.objects.select_for_update().filter(
        shift=shift,
        nozzle_id=nozzle_id,
        effective_to__isnull=True
    ).first()
    if not active_assignment:
        raise ValidationError(f"No active assignment found for nozzle {meter.nozzle.code}.")

    start_reading = active_assignment.opening_reading if active_assignment.opening_reading is not None else meter.opening_reading
    if meter.closing_reading is not None and meter.closing_reading > start_reading:
        raise ValidationError(
            f"Dispensing has already occurred on nozzle {meter.nozzle.code} (meter is at {meter.closing_reading}). "
            f"Use 'Transfer Nozzle' with a verified handover reading instead of correction."
        )

    if meter.testing_records.filter(occurred_at__gte=active_assignment.effective_from).exists():
        raise ValidationError(
            f"Fuel testing was recorded under this assignment on nozzle {meter.nozzle.code}. "
            f"Use 'Transfer Nozzle' to preserve test attribution."
        )

    try:
        new_employee = Employee.objects.get(id=new_employee_id, organisation=shift.organisation)
    except Employee.DoesNotExist:
        raise ValidationError("Target employee does not exist.")

    if new_employee.status != Employee.STATUS_ACTIVE:
        raise ValidationError(f"Target employee '{new_employee.display_name}' is inactive.")
    if not new_employee.outlet_assignments.filter(outlet=shift.outlet, effective_to__isnull=True).exists():
        raise ValidationError(f"Target employee '{new_employee.display_name}' is not assigned to this outlet.")

    new_staff = OperationalShiftStaff.objects.filter(shift=shift, source_employee=new_employee).first()
    if not new_staff:
        designation_name = new_employee.designation.name if new_employee.designation else "Staff"
        new_staff = OperationalShiftStaff.objects.create(
            shift=shift,
            source_employee=new_employee,
            duty_designation=new_employee.designation,
            employee_code_snapshot=new_employee.employee_code,
            employee_name_snapshot=new_employee.display_name,
            designation_snapshot=designation_name,
            effective_from=active_assignment.effective_from,
            added_by=user
        )

    prev_name = active_assignment.shift_staff.employee_name_snapshot
    active_assignment.shift_staff = new_staff
    active_assignment.assignment_type = 'correction'
    active_assignment.reason = reason.strip()
    active_assignment.save(update_fields=['shift_staff', 'assignment_type', 'reason'])

    meter.staff_assignment = new_staff
    meter.save(update_fields=['staff_assignment'])

    recalculate_shift_totals(shift)

    log_shift_activity(
        shift=shift,
        event_type='nozzle_assignment_corrected',
        actor=user,
        reason=reason.strip(),
        metadata={
            'nozzle_code': meter.nozzle.code,
            'corrected_from': prev_name,
            'corrected_to': new_staff.employee_name_snapshot
        }
    )

    return active_assignment





@transaction.atomic
def activate_nozzle_midshift(
    shift: OperationalShift,
    nozzle_id,
    employee_id,
    starting_reading,
    reason: str = '',
    user=None
) -> ShiftNozzleMeter:
    """
    Controlled activation of an unassigned / newly introduced nozzle on an open shift.
    Requires an authorized exception and reason.
    """
    shift = OperationalShift.objects.select_for_update().get(id=shift.id)
    if shift.status != OperationalShift.STATUS_OPEN:
        raise ValidationError("Nozzles can only be activated while the shift is open.")

    if not reason or not reason.strip():
        raise ValidationError("A mandatory reason is required for mid-shift nozzle activation.")

    if ShiftNozzleMeter.objects.filter(shift=shift, nozzle_id=nozzle_id).exists():
        raise ValidationError("This nozzle is already active on this operational shift.")

    try:
        nozzle = Nozzle.objects.select_related('dispenser', 'tank', 'tank__product').get(
            id=nozzle_id, outlet=shift.outlet
        )
    except Nozzle.DoesNotExist:
        raise ValidationError("Nozzle does not exist at this outlet.")

    try:
        starting_dec = Decimal(str(starting_reading))
    except Exception:
        raise ValidationError("Starting reading must be a valid numeric decimal.")

    if starting_dec < 0:
        raise ValidationError("Starting reading cannot be negative.")

    try:
        employee = Employee.objects.get(id=employee_id, organisation=shift.organisation)
    except Employee.DoesNotExist:
        raise ValidationError("Employee does not exist.")

    if employee.status != Employee.STATUS_ACTIVE:
        raise ValidationError(f"Employee '{employee.display_name}' is inactive.")
    if not employee.outlet_assignments.filter(outlet=shift.outlet, effective_to__isnull=True).exists():
        raise ValidationError(f"Employee '{employee.display_name}' is not assigned to this outlet.")

    staff_member = OperationalShiftStaff.objects.filter(shift=shift, source_employee=employee).first()
    if not staff_member:
        desig_name = employee.designation.name if employee.designation else "Staff"
        staff_member = OperationalShiftStaff.objects.create(
            shift=shift,
            source_employee=employee,
            duty_designation=employee.designation,
            employee_code_snapshot=employee.employee_code,
            employee_name_snapshot=employee.display_name,
            designation_snapshot=desig_name,
            effective_from=timezone.now(),
            added_by=user
        )

    now = timezone.now()

    meter = ShiftNozzleMeter.objects.create(
        shift=shift,
        nozzle=nozzle,
        staff_assignment=staff_member,
        opening_reading=starting_dec,
        opening_source=ShiftNozzleMeter.SOURCE_MANUAL_EXCEPTION,
        manual_exception_type='midshift_activation',
        manual_exception_reason=reason.strip()
    )

    active_price = ProductPrice.objects.filter(
        outlet=shift.outlet,
        product=nozzle.tank.product,
        effective_from__lte=now
    ).filter(
        models.Q(effective_to__isnull=True) | models.Q(effective_to__gt=now)
    ).order_by('-effective_from').first()

    if not active_price:
        raise ValidationError(f"No active selling price configured for product {nozzle.tank.product.name}.")

    ShiftNozzlePriceSegment.objects.create(
        shift_nozzle_meter=meter,
        product=nozzle.tank.product,
        sequence=1,
        starts_at=now,
        opening_reading=starting_dec,
        unit_price=active_price.selling_price,
        price_history_reference=active_price
    )

    OperationalShiftNozzleAssignment.objects.create(
        shift=shift,
        shift_staff=staff_member,
        nozzle=nozzle,
        dispenser_name_snapshot=nozzle.dispenser.name,
        nozzle_name_snapshot=nozzle.name,
        product=nozzle.tank.product,
        product_name_snapshot=nozzle.tank.product.name,
        effective_from=now,
        opening_reading=starting_dec,
        assignment_type='midshift_activation',
        reason=reason.strip(),
        created_by=user
    )

    recalculate_shift_totals(shift)

    log_shift_activity(
        shift=shift,
        event_type='nozzle_activated_midshift',
        actor=user,
        reason=reason.strip(),
        metadata={
            'nozzle_code': nozzle.code,
            'attendant': staff_member.employee_name_snapshot,
            'starting_reading': str(starting_dec)
        }
    )

    return meter


@transaction.atomic
def update_open_shift_assignments(shift: OperationalShift, staff_assignments_data: list[dict], user) -> OperationalShift:
    """
    Backwards-compatible batch update for open shift assignments.
    """
    shift = OperationalShift.objects.select_for_update().get(id=shift.id)
    if shift.status != OperationalShift.STATUS_OPEN:
        raise ValidationError("Assignments can only be updated while the shift is open.")

    for staff_data in staff_assignments_data:
        emp_id = staff_data.get('employee_id')
        if not emp_id:
            continue
        add_staff_to_open_shift(
            shift=shift,
            employee_id=emp_id,
            notes=staff_data.get('notes'),
            user=user
        )

    return shift


@transaction.atomic
def recalculate_shift_totals(shift: OperationalShift) -> dict:
    """
    Recalculates cached metrics for all meters and price segments on an operational shift.
    """
    meters = list(shift.meters.all().prefetch_related('price_segments', 'testing_records'))
    for meter in meters:
        tests = list(meter.testing_records.all())
        m_testing = sum((t.quantity for t in tests), Decimal('0.000'))
        m_ret_testing = sum((t.quantity for t in tests if t.returned_to_tank), Decimal('0.000'))

        segments = list(meter.price_segments.all().order_by('sequence'))
        m_gross = Decimal('0.000')

        for seg in segments:
            if seg.closing_reading is not None:
                seg_gross = max(Decimal('0.000'), seg.closing_reading - seg.opening_reading)
            else:
                seg_gross = Decimal('0.000')

            # Testing per segment
            seg_testing = sum((
                t.quantity for t in tests
                if t.price_segment_id == seg.id or (t.price_segment_id is None and (seg.sequence == 1 or seg.ends_at is None))
            ), Decimal('0.000'))

            seg_sale = max(Decimal('0.000'), seg_gross - seg_testing)
            seg_amount = (seg_sale * seg.unit_price).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

            seg.gross_quantity = seg_gross
            seg.testing_quantity = seg_testing
            seg.sale_quantity = seg_sale
            seg.sale_amount = seg_amount
            seg.save()

            m_gross += seg_gross

        meter.gross_quantity = m_gross
        meter.testing_quantity = m_testing
        meter.sale_quantity = max(Decimal('0.000'), m_gross - m_testing)
        meter.stock_depletion_quantity = max(Decimal('0.000'), m_gross - m_ret_testing)
        meter.save()

    return calculate_shift_totals(shift)


@transaction.atomic
def record_closing_meter_reading(shift: OperationalShift, nozzle: Nozzle, closing_reading: Decimal, user, reason=None) -> ShiftNozzleMeter:
    """
    Records or corrects a closing meter reading for a nozzle on an open shift.
    """
    if shift.status != OperationalShift.STATUS_OPEN:
        raise ValidationError("Meter readings can only be recorded while the shift is open.")

    closing_val = Decimal(str(closing_reading))
    if closing_val < 0:
        raise ValidationError("Closing reading cannot be negative.")

    try:
        meter = ShiftNozzleMeter.objects.select_for_update().get(shift=shift, nozzle=nozzle)
    except ShiftNozzleMeter.DoesNotExist:
        raise ValidationError(f"Nozzle {nozzle.code} meter not found for this shift.")

    active_seg = meter.price_segments.filter(ends_at__isnull=True).order_by('-sequence').first()
    if not active_seg:
        active_seg = meter.price_segments.order_by('-sequence').first()

    if active_seg and closing_val < active_seg.opening_reading:
        raise ValidationError(f"Closing reading ({closing_val}) cannot be lower than opening reading ({active_seg.opening_reading}) for nozzle {nozzle.code}.")

    old_reading = meter.closing_reading
    meter.closing_reading = closing_val
    meter.save()

    if active_seg:
        active_seg.closing_reading = closing_val
        active_seg.save()

    recalculate_shift_totals(shift)

    event_type = 'meter_reading_corrected' if old_reading is not None else 'meter_reading_recorded'
    log_shift_activity(
        shift=shift,
        event_type=event_type,
        actor=user,
        reason=reason,
        metadata={
            'nozzle_id': str(nozzle.id),
            'nozzle_code': nozzle.code,
            'old_reading': str(old_reading) if old_reading is not None else None,
            'new_reading': str(closing_val)
        }
    )

    return meter


@transaction.atomic
def record_meter_event(shift: OperationalShift, nozzle: Nozzle, event_type: str,
                       reading_before: Decimal, reading_after: Decimal, reason: str, user) -> ShiftMeterEvent:
    """
    Records a controlled meter event (reset, replacement, rollover, correction):
    - Closes active continuous price segment at reading_before
    - Stores event details with mandatory reason
    - Opens new price segment at reading_after
    - Avoids negative calculation while preserving both readings
    """
    if shift.status != OperationalShift.STATUS_OPEN:
        raise ValidationError("Meter events can only be recorded while the shift is open.")

    if not reason or not reason.strip():
        raise ValidationError("A reason is mandatory when recording a meter event.")

    r_before = Decimal(str(reading_before))
    r_after = Decimal(str(reading_after))
    if r_before < 0 or r_after < 0:
        raise ValidationError("Meter readings cannot be negative.")

    try:
        meter = ShiftNozzleMeter.objects.select_for_update().get(shift=shift, nozzle=nozzle)
    except ShiftNozzleMeter.DoesNotExist:
        raise ValidationError(f"Nozzle {nozzle.code} meter not found for this shift.")

    active_seg = meter.price_segments.filter(ends_at__isnull=True).order_by('-sequence').first()
    if not active_seg:
        active_seg = meter.price_segments.order_by('-sequence').first()

    if active_seg and r_before < active_seg.opening_reading:
        raise ValidationError(f"Reading before event ({r_before}) cannot be lower than segment opening reading ({active_seg.opening_reading}).")

    now = timezone.now()

    # 1. Close current segment at reading_before
    if active_seg:
        active_seg.closing_reading = r_before
        active_seg.ends_at = now
        active_seg.save()

    # 2. Record ShiftMeterEvent
    event = ShiftMeterEvent.objects.create(
        shift_nozzle_meter=meter,
        event_type=event_type,
        reading_before=r_before,
        reading_after=r_after,
        occurred_at=now,
        reason=reason.strip(),
        recorded_by=user
    )

    # 3. Create next price segment starting at reading_after
    next_seq = (active_seg.sequence + 1) if active_seg else 1
    unit_price = active_seg.unit_price if active_seg else Decimal('0.0000')
    price_ref = active_seg.price_history_reference if active_seg else None

    ShiftNozzlePriceSegment.objects.create(
        shift_nozzle_meter=meter,
        product=nozzle.tank.product,
        sequence=next_seq,
        starts_at=now,
        opening_reading=r_after,
        unit_price=unit_price,
        price_history_reference=price_ref
    )

    # Reset nozzle closing reading so new post-event closing reading is entered
    meter.closing_reading = None
    meter.save()

    recalculate_shift_totals(shift)

    log_shift_activity(
        shift=shift,
        event_type='meter_event_recorded',
        actor=user,
        reason=reason.strip(),
        metadata={
            'event_type': event_type,
            'nozzle_code': nozzle.code,
            'reading_before': str(r_before),
            'reading_after': str(r_after)
        }
    )

    return event


@transaction.atomic
def record_testing(shift: OperationalShift, nozzle: Nozzle, quantity: Decimal,
                   returned_to_tank: bool, destination_tank: Tank | None = None,
                   occurred_at: datetime | None = None, notes: str | None = None, user=None) -> ShiftTestingRecord:
    """
    Records fuel testing for a nozzle on an open shift.
    """
    if shift.status != OperationalShift.STATUS_OPEN:
        raise ValidationError("Testing records can only be added while the shift is open.")

    qty = Decimal(str(quantity))
    if qty <= 0:
        raise ValidationError("Testing quantity must be positive.")

    now = timezone.now()
    when = occurred_at or now

    if returned_to_tank:
        if not destination_tank:
            raise ValidationError("Destination tank is required when testing is returned to tank.")
        if destination_tank.outlet_id != shift.outlet_id:
            raise ValidationError("Destination tank must belong to the same outlet.")
        if destination_tank.product_id != nozzle.tank.product_id:
            raise ValidationError("Destination tank must store the same fuel product as the nozzle.")

    try:
        meter = ShiftNozzleMeter.objects.get(shift=shift, nozzle=nozzle)
    except ShiftNozzleMeter.DoesNotExist:
        raise ValidationError(f"Nozzle {nozzle.code} meter not found on this shift.")

    # Match price segment active at time of testing
    seg = meter.price_segments.filter(starts_at__lte=when).filter(
        models.Q(ends_at__isnull=True) | models.Q(ends_at__gte=when)
    ).order_by('-sequence').first()
    if not seg:
        seg = meter.price_segments.order_by('-sequence').first()

    test_record = ShiftTestingRecord.objects.create(
        organisation=shift.organisation,
        outlet=shift.outlet,
        shift=shift,
        shift_nozzle_meter=meter,
        price_segment=seg,
        quantity=qty,
        returned_to_tank=returned_to_tank,
        destination_tank=destination_tank if returned_to_tank else None,
        occurred_at=when,
        notes=notes,
        created_by=user,
        updated_by=user
    )

    recalculate_shift_totals(shift)

    log_shift_activity(
        shift=shift,
        event_type='testing_created',
        actor=user,
        metadata={
            'nozzle_code': nozzle.code,
            'quantity': str(qty),
            'returned_to_tank': returned_to_tank
        }
    )

    return test_record


@transaction.atomic
def update_testing(testing_record: ShiftTestingRecord, quantity: Decimal,
                   returned_to_tank: bool, destination_tank: Tank | None = None,
                   occurred_at: datetime | None = None, notes: str | None = None, user=None) -> ShiftTestingRecord:
    """
    Updates a testing record on an open shift.
    """
    shift = testing_record.shift
    if shift.status != OperationalShift.STATUS_OPEN:
        raise ValidationError("Testing records can only be modified while the shift is open.")

    qty = Decimal(str(quantity))
    if qty <= 0:
        raise ValidationError("Testing quantity must be positive.")

    when = occurred_at or testing_record.occurred_at
    if returned_to_tank:
        if not destination_tank:
            raise ValidationError("Destination tank is required when testing is returned to tank.")
        if destination_tank.outlet_id != shift.outlet_id:
            raise ValidationError("Destination tank must belong to the same outlet.")
        nozzle = testing_record.shift_nozzle_meter.nozzle
        if destination_tank.product_id != nozzle.tank.product_id:
            raise ValidationError("Destination tank must store the same fuel product as the nozzle.")

    testing_record.quantity = qty
    testing_record.returned_to_tank = returned_to_tank
    testing_record.destination_tank = destination_tank if returned_to_tank else None
    testing_record.occurred_at = when
    testing_record.notes = notes
    testing_record.updated_by = user
    testing_record.save()

    recalculate_shift_totals(shift)

    log_shift_activity(
        shift=shift,
        event_type='testing_updated',
        actor=user,
        metadata={
            'testing_id': str(testing_record.id),
            'quantity': str(qty),
            'returned_to_tank': returned_to_tank
        }
    )

    return testing_record


@transaction.atomic
def delete_testing(testing_record: ShiftTestingRecord, user=None) -> None:
    """
    Deletes a testing record from an open shift.
    """
    shift = testing_record.shift
    if shift.status != OperationalShift.STATUS_OPEN:
        raise ValidationError("Testing records can only be deleted while the shift is open.")

    tid = str(testing_record.id)
    nozzle_code = testing_record.shift_nozzle_meter.nozzle.code
    qty = str(testing_record.quantity)

    testing_record.delete()
    recalculate_shift_totals(shift)

    log_shift_activity(
        shift=shift,
        event_type='testing_deleted',
        actor=user,
        metadata={'testing_id': tid, 'nozzle_code': nozzle_code, 'quantity': qty}
    )


@transaction.atomic
def record_shift_dip(shift: OperationalShift, tank: Tank, observation_type: str,
                     raw_dip_value: Decimal, raw_dip_unit: str,
                     density: Decimal | None = None, manual_quantity: Decimal | None = None,
                     manual_quantity_reason: str | None = None,
                     measured_at: datetime | None = None, notes: str | None = None, user=None) -> ShiftTankDipObservation:
    """
    Records or updates a tank dip observation on an open shift.
    Uses server-side conversion service convert_dip_to_volume.
    """
    if shift.status != OperationalShift.STATUS_OPEN:
        raise ValidationError("Dip observations can only be recorded while the shift is open.")

    if tank.outlet_id != shift.outlet_id:
        raise ValidationError("Tank must belong to the shift's outlet.")

    if observation_type not in [ShiftTankDipObservation.OBS_OPENING, ShiftTankDipObservation.OBS_CLOSING]:
        raise ValidationError("Observation type must be 'opening' or 'closing'.")

    when = measured_at or timezone.now()
    raw_val = Decimal(str(raw_dip_value))
    if raw_val < 0:
        raise ValidationError("Raw dip value cannot be negative.")

    density_val = Decimal(str(density)) if density is not None else None

    # Conversion
    if manual_quantity is not None:
        if not manual_quantity_reason or not manual_quantity_reason.strip():
            raise ValidationError("A reason is mandatory when manually entering converted physical quantity.")
        conv_qty = Decimal(str(manual_quantity))
        conv_method = 'manual_quantity'
        chart = None
        assignment = None
    else:
        conversion = convert_dip_to_volume(
            tank=tank,
            measured_height=raw_val,
            input_unit=raw_dip_unit,
            measured_at=when
        )
        conv_qty = conversion['volume']
        chart = conversion['chart']
        assignment = conversion['assignment']
        conv_method = conversion['method']

    dip_obs, created = ShiftTankDipObservation.objects.update_or_create(
        shift=shift,
        tank=tank,
        observation_type=observation_type,
        defaults={
            'organisation': shift.organisation,
            'outlet': shift.outlet,
            'measured_at': when,
            'raw_dip_value': raw_val,
            'raw_dip_unit': raw_dip_unit,
            'converted_quantity': conv_qty,
            'calibration_assignment': assignment,
            'calibration_chart': chart,
            'conversion_method': conv_method,
            'density': density_val,
            'manual_quantity_reason': manual_quantity_reason.strip() if manual_quantity_reason else None,
            'notes': notes,
            'recorded_by': user
        }
    )

    log_shift_activity(
        shift=shift,
        event_type='dip_recorded',
        actor=user,
        metadata={
            'tank_code': tank.code,
            'observation_type': observation_type,
            'raw_dip': str(raw_val),
            'unit': raw_dip_unit,
            'converted_quantity': str(conv_qty)
        }
    )

    return dip_obs


@transaction.atomic
def apply_product_price_change_during_shift(outlet: Outlet, product: FuelProduct,
                                            new_price: Decimal, effective_at: datetime | None,
                                            nozzle_snapshot_readings: dict, actor):
    """
    Atomic price change during live shift:
    1. Finds open shift for outlet. If none, applies standard price update.
    2. Finds active nozzles dispensing product on this shift.
    3. Requires snapshot reading for EVERY active nozzle dispensing that product.
    4. Validates readings are continuous and non-decreasing.
    5. Atomically closes current segments and creates new segments at new price.
    6. Updates product price history record.
    7. Recalculates shift totals.
    """
    open_shift = OperationalShift.objects.filter(outlet=outlet, status=OperationalShift.STATUS_OPEN).first()
    new_price_dec = Decimal(str(new_price))
    if new_price_dec <= 0:
        raise ValidationError("New price must be greater than zero.")

    when = effective_at or timezone.now()

    if not open_shift:
        # No open shift: normal price change
        return set_product_price(
            organisation=outlet.organisation,
            outlet=outlet,
            product=product,
            selling_price=new_price_dec,
            effective_from=when,
            created_by=actor
        )

    # Open shift exists: find affected nozzles
    affected_meters = list(
        ShiftNozzleMeter.objects.filter(
            shift=open_shift,
            nozzle__tank__product=product
        ).select_related('nozzle')
    )

    if not affected_meters:
        # Product not dispensed by any active nozzles on this shift
        return set_product_price(
            organisation=outlet.organisation,
            outlet=outlet,
            product=product,
            selling_price=new_price_dec,
            effective_from=when,
            created_by=actor
        )

    # Verify that every affected nozzle has a snapshot reading
    for m in affected_meters:
        nid_str = str(m.nozzle_id)
        if nid_str not in nozzle_snapshot_readings and m.nozzle.code not in nozzle_snapshot_readings:
            raise ValidationError(f"Snapshot meter reading is required for nozzle {m.nozzle.code}.")

        raw_snap = nozzle_snapshot_readings.get(nid_str)
        if raw_snap is None:
            raw_snap = nozzle_snapshot_readings.get(m.nozzle.code)
        snap_val = Decimal(str(raw_snap))

        active_seg = m.price_segments.filter(ends_at__isnull=True).order_by('-sequence').first()
        if not active_seg:
            active_seg = m.price_segments.order_by('-sequence').first()

        if active_seg and snap_val < active_seg.opening_reading:
            raise ValidationError(f"Snapshot reading ({snap_val}) cannot be lower than opening reading ({active_seg.opening_reading}) for nozzle {m.nozzle.code}.")

    # Close current price segments atomically
    for m in affected_meters:
        nid_str = str(m.nozzle_id)
        raw_snap = nozzle_snapshot_readings.get(nid_str)
        if raw_snap is None:
            raw_snap = nozzle_snapshot_readings.get(m.nozzle.code)
        snap_val = Decimal(str(raw_snap))

        active_seg = m.price_segments.filter(ends_at__isnull=True).order_by('-sequence').first()
        if active_seg:
            active_seg.closing_reading = snap_val
            active_seg.ends_at = when
            active_seg.save()

    # Create new product price record in price history
    new_price_record = set_product_price(
        organisation=outlet.organisation,
        outlet=outlet,
        product=product,
        selling_price=new_price_dec,
        effective_from=when,
        created_by=actor
    )

    # Open new price segments at the new price starting at snapshot reading
    for m in affected_meters:
        nid_str = str(m.nozzle_id)
        raw_snap = nozzle_snapshot_readings.get(nid_str)
        if raw_snap is None:
            raw_snap = nozzle_snapshot_readings.get(m.nozzle.code)
        snap_val = Decimal(str(raw_snap))

        last_seq = m.price_segments.all().aggregate(max_seq=models.Max('sequence'))['max_seq'] or 1
        ShiftNozzlePriceSegment.objects.create(
            shift_nozzle_meter=m,
            product=product,
            sequence=last_seq + 1,
            starts_at=when,
            opening_reading=snap_val,
            unit_price=new_price_dec,
            price_history_reference=new_price_record
        )

    recalculate_shift_totals(open_shift)

    log_shift_activity(
        shift=open_shift,
        event_type='price_changed',
        actor=actor,
        metadata={
            'product_name': product.name,
            'new_price': str(new_price_dec),
            'effective_at': when.isoformat(),
            'affected_nozzles': [m.nozzle.code for m in affected_meters]
        }
    )

    return new_price_record


@transaction.atomic
def close_operational_shift(shift: OperationalShift, user) -> OperationalShift:
    """
    Atomically closes an operational shift after full validation.
    """
    shift = OperationalShift.objects.select_for_update().get(id=shift.id)
    if shift.status != OperationalShift.STATUS_OPEN:
        raise ValidationError("Shift is not open.")

    preview = preview_shift_closing_data(shift)
    if not preview['can_close']:
        errors = "; ".join(preview['blocking_errors'])
        raise ValidationError(f"Cannot close shift: {errors}")

    now = timezone.now()

    # Ensure all active segments are closed
    for meter in shift.meters.all():
        active_seg = meter.price_segments.filter(ends_at__isnull=True).order_by('-sequence').first()
        if active_seg:
            active_seg.closing_reading = meter.closing_reading
            active_seg.ends_at = now
            active_seg.save()

    # Close active nozzle assignments
    for na in shift.nozzle_assignments.filter(effective_to__isnull=True):
        na.effective_to = now
        meter = shift.meters.filter(nozzle=na.nozzle).first()
        if meter and meter.closing_reading is not None:
            na.closing_reading = meter.closing_reading
        na.save(update_fields=['effective_to', 'closing_reading'])

    # Close active staff periods
    shift.staff_members.filter(effective_to__isnull=True).update(effective_to=now)

    recalculate_shift_totals(shift)

    shift.status = OperationalShift.STATUS_CLOSED
    shift.closed_at = now
    shift.closed_by = user
    shift.save()

    log_shift_activity(
        shift=shift,
        event_type='shift_closed',
        actor=user,
        metadata={
            'closed_at': now.isoformat(),
            'total_sale_qty': str(preview['totals']['overall']['total_sale_quantity']),
            'total_sale_amount': str(preview['totals']['overall']['total_fuel_sale_amount'])
        }
    )

    return shift


@transaction.atomic
def reopen_operational_shift(shift: OperationalShift, user, reason: str) -> OperationalShift:
    """
    Reopens the latest closed shift for an outlet with mandatory justification.
    """
    shift = OperationalShift.objects.select_for_update().get(id=shift.id)
    
    can_reopen, err_msg = check_can_reopen_shift(shift)
    if not can_reopen:
        raise ValidationError(err_msg)

    if not reason or not reason.strip():
        raise ValidationError("A mandatory reason is required to reopen a shift.")

    now = timezone.now()
    clean_reason = reason.strip()

    shift.status = OperationalShift.STATUS_OPEN
    shift.reopened_by = user
    shift.reopened_at = now
    shift.reopen_reason = clean_reason
    shift.save()

    # Re-open active price segment so operations can continue
    for meter in shift.meters.all():
        last_seg = meter.price_segments.order_by('-sequence').first()
        if last_seg and last_seg.ends_at:
            last_seg.ends_at = None
            last_seg.save()

    recalculate_shift_totals(shift)

    log_shift_activity(
        shift=shift,
        event_type='shift_reopened',
        actor=user,
        reason=clean_reason,
        metadata={'reopened_at': now.isoformat()}
    )

    return shift


@transaction.atomic
def discard_open_operational_shift(shift: OperationalShift, user, reason: str = '') -> None:
    """
    Safely deletes/discards an open operational shift and its associated operational records.
    Only shifts in 'open' status can be discarded to protect accounting and totalizer audit integrity.
    """
    shift = OperationalShift.objects.select_for_update().get(id=shift.id)

    if shift.status != OperationalShift.STATUS_OPEN:
        raise ValidationError(
            "Only open shifts can be discarded or deleted. Closed shifts cannot be deleted to preserve financial audit and meter totalizer continuity."
        )

    # Clean up dependent meters and assignments first to prevent ProtectedError on ShiftNozzleMeter.staff_assignment
    shift.meters.all().delete()
    shift.nozzle_assignments.all().delete()
    shift.staff_members.all().delete()
    shift.dip_observations.all().delete()
    shift.testing_records.all().delete()
    shift.activity_logs.all().delete()
    shift.delete()

