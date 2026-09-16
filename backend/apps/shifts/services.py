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
    OperationalShift, EmployeeShiftCard, OperationalShiftStaff, OperationalShiftNozzleAssignment,
    ShiftNozzleMeter, ShiftNozzlePriceSegment, ShiftMeterEvent,
    ShiftTestingRecord, ShiftTankDipObservation, ShiftActivityLog,
    Customer, CustomerOutletAssignment, FuelCreditSlip,
    EmployeeShiftCollection, EmployeeCashDenomination,
    EmployeeShiftDeduction, EmployeeShiftSettlement,
    ShiftReconciliation, CollectionAuditLog
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


# =============================================================================
# Milestone 10: Collection Accountability, Credit Slips & Reconciliation Services
# =============================================================================

def log_collection_activity(
    shift: OperationalShift,
    event_type: str,
    actor=None,
    employee=None,
    customer=None,
    reason=None,
    metadata=None
) -> CollectionAuditLog:
    """
    Creates an append-only activity history log for collection, credit slip, deduction,
    and reconciliation events.
    """
    return CollectionAuditLog.objects.create(
        organisation=shift.organisation,
        outlet=shift.outlet,
        shift=shift,
        employee=employee,
        customer=customer,
        actor=actor,
        event_type=event_type,
        reason=reason,
        metadata=metadata or {}
    )


@transaction.atomic
def create_customer(
    organisation,
    customer_code: str,
    display_name: str,
    customer_type: str = Customer.TYPE_BUSINESS,
    user=None,
    outlet_ids: list = None,
    **kwargs
) -> Customer:
    code = customer_code.strip()
    name = display_name.strip()
    if Customer.objects.filter(organisation=organisation, customer_code__iexact=code).exists():
        raise ValidationError({'customer_code': "A customer with this code already exists in the organisation."})

    customer = Customer(
        organisation=organisation,
        customer_code=code,
        display_name=name,
        customer_type=customer_type,
        phone_number=kwargs.get('phone_number'),
        alternate_phone_number=kwargs.get('alternate_phone_number'),
        email=kwargs.get('email'),
        billing_address=kwargs.get('billing_address'),
        GSTIN=kwargs.get('GSTIN'),
        credit_limit=kwargs.get('credit_limit', Decimal('0.00')) or Decimal('0.00'),
        credit_days=kwargs.get('credit_days', 0) or 0,
        status=kwargs.get('status', Customer.STATUS_ACTIVE),
        notes=kwargs.get('notes'),
        created_by=user,
        updated_by=user
    )
    customer.full_clean()
    customer.save()

    if outlet_ids:
        for o_id in outlet_ids:
            outlet = Outlet.objects.get(id=o_id, organisation=organisation)
            CustomerOutletAssignment.objects.create(customer=customer, outlet=outlet)

    return customer


@transaction.atomic
def update_customer(
    customer: Customer,
    user=None,
    outlet_ids: list = None,
    **kwargs
) -> Customer:
    if 'customer_code' in kwargs:
        code = kwargs['customer_code'].strip()
        if Customer.objects.filter(organisation=customer.organisation, customer_code__iexact=code).exclude(id=customer.id).exists():
            raise ValidationError({'customer_code': "A customer with this code already exists in the organisation."})
        customer.customer_code = code

    for field in ['display_name', 'customer_type', 'phone_number', 'alternate_phone_number', 'email', 'billing_address', 'GSTIN', 'credit_limit', 'credit_days', 'status', 'notes']:
        if field in kwargs:
            setattr(customer, field, kwargs[field])

    customer.updated_by = user
    customer.full_clean()
    customer.save()

    if outlet_ids is not None:
        customer.outlet_assignments.all().delete()
        for o_id in outlet_ids:
            outlet = Outlet.objects.get(id=o_id, organisation=customer.organisation)
            CustomerOutletAssignment.objects.create(customer=customer, outlet=outlet)

    return customer


@transaction.atomic
def deactivate_customer(customer: Customer, user=None) -> Customer:
    customer.status = Customer.STATUS_INACTIVE
    customer.updated_by = user
    customer.save(update_fields=['status', 'updated_by', 'updated_at'])
    return customer


def get_customer_credit_position(customer: Customer, outlet=None) -> dict:
    slips_qs = customer.credit_slips.all()
    if outlet:
        slips_qs = slips_qs.filter(outlet=outlet)

    active_slips = slips_qs.filter(status=FuelCreditSlip.STATUS_ACTIVE)
    void_slips = slips_qs.filter(status=FuelCreditSlip.STATUS_VOID)

    total_active_count = active_slips.count()
    total_void_count = void_slips.count()
    outstanding_amount = active_slips.aggregate(total=models.Sum('amount'))['total'] or Decimal('0.00')

    oldest_slip = active_slips.order_by('occurred_at').first()
    oldest_credit_date = oldest_slip.occurred_at if oldest_slip else None

    credit_limit = customer.credit_limit or Decimal('0.00')
    if credit_limit > Decimal('0.00'):
        credit_limit_usage_percent = ((outstanding_amount / credit_limit) * Decimal('100')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        is_exceeded = outstanding_amount > credit_limit
    else:
        credit_limit_usage_percent = Decimal('0.00')
        is_exceeded = False

    return {
        'customer_id': str(customer.id),
        'customer_code': customer.customer_code,
        'display_name': customer.display_name,
        'customer_type': customer.customer_type,
        'status': customer.status,
        'credit_limit': credit_limit,
        'credit_days': customer.credit_days or 0,
        'total_active_slips': total_active_count,
        'total_void_slips': total_void_count,
        'outstanding_credit_amount': outstanding_amount,
        'outstanding_operational_credit': outstanding_amount,
        'oldest_credit_date': oldest_credit_date.isoformat() if oldest_credit_date else None,
        'credit_limit_usage_percent': credit_limit_usage_percent,
        'is_credit_limit_exceeded': is_exceeded,
    }


def _normalize_occurred_at(val, default_func=None):
    from django.utils.dateparse import parse_datetime
    if not val:
        return default_func() if default_func else timezone.now()
    if isinstance(val, str):
        parsed = parse_datetime(val)
        if not parsed:
            try:
                from datetime import datetime
                parsed = datetime.fromisoformat(val.replace('Z', '+00:00'))
            except Exception:
                raise ValidationError({'occurred_at': "Invalid datetime format for occurred_at."})
        val = parsed
    if timezone.is_naive(val):
        val = timezone.make_aware(val)
    return val


def generate_credit_slip_number(outlet) -> str:
    count = FuelCreditSlip.objects.filter(outlet=outlet).count() + 1
    code = f"CS-{outlet.code.upper()}-{count:05d}"
    while FuelCreditSlip.objects.filter(outlet=outlet, slip_number__iexact=code).exists():
        count += 1
        code = f"CS-{outlet.code.upper()}-{count:05d}"
    return code


@transaction.atomic
def create_credit_slip(
    organisation,
    outlet,
    shift: OperationalShift,
    employee: Employee,
    customer: Customer,
    product: FuelProduct,
    quantity: Decimal,
    user,
    nozzle: Nozzle = None,
    occurred_at=None,
    slip_number: str = None,
    vehicle_number: str = None,
    driver_name: str = None,
    customer_reference: str = None,
    physical_slip_number: str = None,
    notes: str = None
) -> FuelCreditSlip:
    if customer.status != Customer.STATUS_ACTIVE:
        raise ValidationError({'customer': "Inactive customers cannot receive new credit slips."})

    if customer.organisation_id != organisation.id:
        raise ValidationError({'customer': "Customer does not belong to this organisation."})

    # Customer outlet authorization check
    if customer.outlet_assignments.exists() and not customer.outlet_assignments.filter(outlet=outlet).exists():
        raise ValidationError({'customer': f"Customer is not authorized for outlet '{outlet.name}'."})

    # Employee must belong to shift
    staff_member = shift.staff_members.filter(source_employee=employee).first()
    if not staff_member:
        raise ValidationError({'employee': f"Employee '{employee.display_name}' is not assigned to this operational shift."})

    # Settlement must not be reconciled
    settlement = EmployeeShiftSettlement.objects.filter(operational_shift=shift, employee=employee).first()
    if settlement and settlement.status == EmployeeShiftSettlement.STATUS_RECONCILED:
        raise ValidationError("Cannot add credit slips for an employee whose settlement is already reconciled. Reopen the settlement first.")

    has_explicit_time = bool(occurred_at)
    time_entry = _normalize_occurred_at(occurred_at)
    if not has_explicit_time and shift.closed_at and time_entry > shift.closed_at:
        time_entry = shift.closed_at

    if time_entry < shift.opened_at:
        raise ValidationError({'occurred_at': "Credit slip time cannot be earlier than shift opening time."})
    if shift.closed_at and time_entry > shift.closed_at:
        raise ValidationError({'occurred_at': "Credit slip time cannot be after shift closing time."})

    if quantity <= Decimal('0.000'):
        raise ValidationError({'quantity': "Quantity must be positive."})

    # Determine unit price from price segment at occurred_at
    unit_price = None
    if nozzle:
        if nozzle.outlet_id != outlet.id:
            raise ValidationError({'nozzle': "Nozzle must belong to the same outlet."})
        if nozzle.tank.product_id != product.id:
            raise ValidationError({'nozzle': "Product does not match the nozzle's fuel product."})

        meter = shift.meters.filter(nozzle=nozzle).first()
        if not meter:
            raise ValidationError({'nozzle': "Nozzle meter not found on this shift."})

        segments = list(meter.price_segments.all().order_by('sequence'))
        matched_seg = None
        for s in segments:
            if s.starts_at <= time_entry and (s.ends_at is None or s.ends_at >= time_entry):
                matched_seg = s
                break
        if not matched_seg and segments:
            matched_seg = segments[-1]
        if matched_seg:
            unit_price = matched_seg.unit_price

        # Quantity validation: check employee's net sold quantity on this nozzle interval
        shift_totals = calculate_shift_totals(shift)
        nozzle_data = next((n for n in shift_totals['nozzles'] if n['nozzle_id'] == str(nozzle.id)), None)
        nozzle_sale_qty = nozzle_data['sale_quantity'] if nozzle_data else Decimal('0.000')

        existing_credited_qty = FuelCreditSlip.objects.filter(
            operational_shift=shift,
            employee=employee,
            nozzle=nozzle,
            status=FuelCreditSlip.STATUS_ACTIVE
        ).aggregate(total=models.Sum('quantity'))['total'] or Decimal('0.000')

        if (meter.closing_reading is not None or nozzle_sale_qty > Decimal('0.000')) and existing_credited_qty + quantity > nozzle_sale_qty:
            raise ValidationError({
                'quantity': f"Total credited quantity ({existing_credited_qty + quantity} L) cannot exceed the employee's net sold quantity ({nozzle_sale_qty} L) on nozzle {nozzle.code}."
            })
    else:
        active_price = ProductPrice.objects.filter(
            outlet=outlet,
            product=product,
            is_active=True,
            effective_from__lte=time_entry
        ).order_by('-effective_from').first()
        if active_price:
            unit_price = active_price.price

        shift_totals = calculate_shift_totals(shift)
        emp_data = next((e for e in shift_totals['employees'] if e['employee_id'] == str(employee.id)), None)
        emp_sale_qty = emp_data['sale_quantity'] if emp_data else Decimal('0.000')
        existing_credited_qty = FuelCreditSlip.objects.filter(
            operational_shift=shift,
            employee=employee,
            product=product,
            status=FuelCreditSlip.STATUS_ACTIVE
        ).aggregate(total=models.Sum('quantity'))['total'] or Decimal('0.000')

        if existing_credited_qty + quantity > emp_sale_qty:
            raise ValidationError({
                'quantity': f"Total credited quantity ({existing_credited_qty + quantity} L) cannot exceed employee's net sold fuel quantity ({emp_sale_qty} L) on this shift."
            })

    if not unit_price or unit_price <= Decimal('0.0000'):
        raise ValidationError({'unit_price': f"No valid pricing found for product '{product.name}' at {time_entry}."})

    amount = (quantity * unit_price).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    slip_num = slip_number.strip() if slip_number else generate_credit_slip_number(outlet)

    credit_slip = FuelCreditSlip.objects.create(
        organisation=organisation,
        outlet=outlet,
        operational_shift=shift,
        employee=employee,
        customer=customer,
        slip_number=slip_num,
        occurred_at=time_entry,
        nozzle=nozzle,
        product=product,
        quantity=quantity,
        unit_price=unit_price,
        amount=amount,
        vehicle_number=vehicle_number,
        driver_name=driver_name,
        customer_reference=customer_reference,
        physical_slip_number=physical_slip_number,
        notes=notes,
        created_by=user,
        updated_by=user
    )

    log_collection_activity(
        shift=shift,
        event_type='credit_slip_created',
        actor=user,
        employee=employee,
        customer=customer,
        reason=f"Credit slip {credit_slip.slip_number} created for ₹{amount}",
        metadata={'slip_id': str(credit_slip.id), 'amount': str(amount), 'quantity': str(quantity)}
    )

    calculate_shift_reconciliation(shift, user=user)

    return credit_slip


@transaction.atomic
def update_credit_slip(credit_slip: FuelCreditSlip, user, **kwargs) -> FuelCreditSlip:
    settlement = EmployeeShiftSettlement.objects.filter(
        operational_shift=credit_slip.operational_shift,
        employee=credit_slip.employee
    ).first()
    if settlement and settlement.status == EmployeeShiftSettlement.STATUS_RECONCILED:
        raise ValidationError("Cannot modify credit slip: The employee's settlement is already reconciled. Reopen the settlement first.")

    for field in ['vehicle_number', 'driver_name', 'customer_reference', 'physical_slip_number', 'notes']:
        if field in kwargs:
            setattr(credit_slip, field, kwargs[field])

    credit_slip.updated_by = user
    credit_slip.full_clean()
    credit_slip.save()

    log_collection_activity(
        shift=credit_slip.operational_shift,
        event_type='credit_slip_updated',
        actor=user,
        employee=credit_slip.employee,
        customer=credit_slip.customer,
        reason=f"Credit slip {credit_slip.slip_number} updated",
        metadata={'slip_id': str(credit_slip.id)}
    )
    return credit_slip


@transaction.atomic
def void_credit_slip(credit_slip: FuelCreditSlip, user, reason: str) -> FuelCreditSlip:
    if not reason or not reason.strip():
        raise ValidationError("A mandatory reason is required to void a credit slip.")

    settlement = EmployeeShiftSettlement.objects.filter(
        operational_shift=credit_slip.operational_shift,
        employee=credit_slip.employee
    ).first()
    if settlement and settlement.status == EmployeeShiftSettlement.STATUS_RECONCILED:
        raise ValidationError("Cannot void credit slip: The employee's settlement is already reconciled. Reopen the settlement first.")

    if credit_slip.status == FuelCreditSlip.STATUS_VOID:
        raise ValidationError("Credit slip is already void.")

    now = timezone.now()
    credit_slip.status = FuelCreditSlip.STATUS_VOID
    credit_slip.void_reason = reason.strip()
    credit_slip.voided_by = user
    credit_slip.voided_at = now
    credit_slip.updated_by = user
    credit_slip.save(update_fields=['status', 'void_reason', 'voided_by', 'voided_at', 'updated_by', 'updated_at'])

    log_collection_activity(
        shift=credit_slip.operational_shift,
        event_type='credit_slip_voided',
        actor=user,
        employee=credit_slip.employee,
        customer=credit_slip.customer,
        reason=reason,
        metadata={'slip_id': str(credit_slip.id), 'amount': str(credit_slip.amount)}
    )

    calculate_shift_reconciliation(credit_slip.operational_shift, user=user)

    return credit_slip


@transaction.atomic
def set_cash_denominations(collection: EmployeeShiftCollection, denomination_items: list[dict]):
    collection.denominations.all().delete()
    for item in denomination_items:
        val = int(item['denomination_value'])
        qty = int(item['quantity'])
        if qty > 0:
            EmployeeCashDenomination.objects.create(
                collection=collection,
                denomination_value=val,
                quantity=qty,
                calculated_amount=Decimal(val * qty)
            )


@transaction.atomic
def create_employee_collection(
    organisation,
    outlet,
    shift: OperationalShift,
    employee: Employee,
    collection_method: str,
    amount: Decimal,
    occurred_at=None,
    user=None,
    denominations: list[dict] = None,
    reference_number: str = None,
    provider_name: str = None,
    terminal_or_account_reference: str = None,
    notes: str = None,
    allow_duplicate_reference: bool = False,
    override_reason: str = None
) -> EmployeeShiftCollection:
    if not shift.staff_members.filter(source_employee=employee).exists():
        raise ValidationError({'employee': f"Employee '{employee.display_name}' is not assigned to this operational shift."})

    settlement = EmployeeShiftSettlement.objects.filter(operational_shift=shift, employee=employee).first()
    if settlement and settlement.status == EmployeeShiftSettlement.STATUS_RECONCILED:
        raise ValidationError("Cannot add collections for an employee whose settlement is already reconciled. Reopen the settlement first.")

    if amount <= Decimal('0.00'):
        raise ValidationError({'amount': "Collection amount must be positive."})

    time_entry = _normalize_occurred_at(occurred_at)
    if time_entry < shift.opened_at:
        raise ValidationError({'occurred_at': "Collection time cannot be earlier than shift opening time."})

    clean_ref = reference_number.strip() if reference_number else None
    if collection_method in [EmployeeShiftCollection.METHOD_CARD, EmployeeShiftCollection.METHOD_UPI] and clean_ref:
        dup_qs = EmployeeShiftCollection.objects.filter(
            outlet=outlet,
            collection_method=collection_method,
            reference_number__iexact=clean_ref,
            status=EmployeeShiftCollection.STATUS_ACTIVE
        )
        if provider_name and provider_name.strip():
            dup_qs = dup_qs.filter(provider_name__iexact=provider_name.strip())

        if dup_qs.exists():
            if not allow_duplicate_reference:
                raise ValidationError({
                    'reference_number': f"A collection with reference '{clean_ref}' already exists for this provider/method. Requires authorized override."
                })
            if not override_reason or not override_reason.strip():
                raise ValidationError({
                    'override_reason': "An override reason is mandatory when saving a duplicate reference."
                })

    if collection_method == EmployeeShiftCollection.METHOD_CASH and denominations:
        denom_total = sum(
            (Decimal(d.get('denomination_value', 0)) * Decimal(d.get('quantity', 0)) for d in denominations),
            Decimal('0.00')
        )
        if denom_total != amount:
            raise ValidationError({
                'denominations': f"Calculated denomination total (₹{denom_total}) does not match the entered cash collection amount (₹{amount})."
            })

    collection = EmployeeShiftCollection.objects.create(
        organisation=organisation,
        outlet=outlet,
        operational_shift=shift,
        employee=employee,
        collection_method=collection_method,
        amount=amount,
        occurred_at=time_entry,
        reference_number=clean_ref,
        provider_name=provider_name.strip() if provider_name else None,
        terminal_or_account_reference=terminal_or_account_reference.strip() if terminal_or_account_reference else None,
        notes=notes,
        created_by=user,
        updated_by=user
    )

    if collection_method == EmployeeShiftCollection.METHOD_CASH and denominations:
        set_cash_denominations(collection, denominations)

    log_collection_activity(
        shift=shift,
        event_type='collection_created',
        actor=user,
        employee=employee,
        reason=f"{collection_method.upper()} collection of ₹{amount} recorded",
        metadata={'collection_id': str(collection.id), 'method': collection_method, 'amount': str(amount)}
    )

    calculate_shift_reconciliation(shift, user=user)

    return collection


@transaction.atomic
def update_employee_collection(
    collection: EmployeeShiftCollection,
    user,
    denominations: list[dict] = None,
    **kwargs
) -> EmployeeShiftCollection:
    settlement = EmployeeShiftSettlement.objects.filter(
        operational_shift=collection.operational_shift,
        employee=collection.employee
    ).first()
    if settlement and settlement.status == EmployeeShiftSettlement.STATUS_RECONCILED:
        raise ValidationError("Cannot modify collection: The employee's settlement is already reconciled. Reopen the settlement first.")

    if 'amount' in kwargs:
        amt = Decimal(kwargs['amount'])
        if amt <= Decimal('0.00'):
            raise ValidationError({'amount': "Amount must be positive."})
        collection.amount = amt

    if 'reference_number' in kwargs:
        collection.reference_number = kwargs['reference_number'].strip() if kwargs['reference_number'] else None
    if 'provider_name' in kwargs:
        collection.provider_name = kwargs['provider_name'].strip() if kwargs['provider_name'] else None
    if 'terminal_or_account_reference' in kwargs:
        collection.terminal_or_account_reference = kwargs['terminal_or_account_reference'].strip() if kwargs['terminal_or_account_reference'] else None
    if 'notes' in kwargs:
        collection.notes = kwargs['notes']

    if collection.collection_method == EmployeeShiftCollection.METHOD_CASH and denominations is not None:
        denom_total = sum(
            (Decimal(d.get('denomination_value', 0)) * Decimal(d.get('quantity', 0)) for d in denominations),
            Decimal('0.00')
        )
        if denom_total != collection.amount:
            raise ValidationError({
                'denominations': f"Calculated denomination total (₹{denom_total}) does not match the entered cash amount (₹{collection.amount})."
            })
        set_cash_denominations(collection, denominations)

    collection.updated_by = user
    collection.full_clean()
    collection.save()

    log_collection_activity(
        shift=collection.operational_shift,
        event_type='collection_updated',
        actor=user,
        employee=collection.employee,
        reason=f"Collection {collection.id} updated",
        metadata={'collection_id': str(collection.id), 'amount': str(collection.amount)}
    )

    calculate_shift_reconciliation(collection.operational_shift, user=user)

    return collection


@transaction.atomic
def void_employee_collection(collection: EmployeeShiftCollection, user, reason: str) -> EmployeeShiftCollection:
    if not reason or not reason.strip():
        raise ValidationError("A mandatory reason is required to void a collection.")

    settlement = EmployeeShiftSettlement.objects.filter(
        operational_shift=collection.operational_shift,
        employee=collection.employee
    ).first()
    if settlement and settlement.status == EmployeeShiftSettlement.STATUS_RECONCILED:
        raise ValidationError("Cannot void collection: The employee's settlement is already reconciled. Reopen the settlement first.")

    if collection.status == EmployeeShiftCollection.STATUS_VOID:
        raise ValidationError("Collection is already void.")

    now = timezone.now()
    collection.status = EmployeeShiftCollection.STATUS_VOID
    collection.void_reason = reason.strip()
    collection.voided_by = user
    collection.voided_at = now
    collection.updated_by = user
    collection.save(update_fields=['status', 'void_reason', 'voided_by', 'voided_at', 'updated_by', 'updated_at'])

    log_collection_activity(
        shift=collection.operational_shift,
        event_type='collection_voided',
        actor=user,
        employee=collection.employee,
        reason=reason,
        metadata={'collection_id': str(collection.id), 'amount': str(collection.amount)}
    )

    calculate_shift_reconciliation(collection.operational_shift, user=user)

    return collection


@transaction.atomic
def create_employee_shift_deduction(
    organisation,
    outlet,
    shift: OperationalShift,
    employee: Employee,
    deduction_type: str,
    direction: str,
    amount: Decimal,
    occurred_at=None,
    description: str = '',
    approval_reason: str = '',
    approved_by=None,
    user=None,
    payee: str = None,
    reference_number: str = None
) -> EmployeeShiftDeduction:
    if not shift.staff_members.filter(source_employee=employee).exists():
        raise ValidationError({'employee': f"Employee '{employee.display_name}' is not assigned to this operational shift."})

    settlement = EmployeeShiftSettlement.objects.filter(operational_shift=shift, employee=employee).first()
    if settlement and settlement.status == EmployeeShiftSettlement.STATUS_RECONCILED:
        raise ValidationError("Cannot add deduction for an employee whose settlement is already reconciled. Reopen the settlement first.")

    if amount <= Decimal('0.00'):
        raise ValidationError({'amount': "Amount must be positive."})

    if not description or not description.strip():
        raise ValidationError({'description': "Description is mandatory."})
    if not approval_reason or not approval_reason.strip():
        raise ValidationError({'approval_reason': "Approval reason is mandatory."})

    time_entry = _normalize_occurred_at(occurred_at)

    deduction = EmployeeShiftDeduction.objects.create(
        organisation=organisation,
        outlet=outlet,
        operational_shift=shift,
        employee=employee,
        deduction_type=deduction_type,
        direction=direction,
        amount=amount,
        occurred_at=time_entry,
        description=description.strip(),
        approval_reason=approval_reason.strip(),
        approved_by=approved_by,
        payee=payee.strip() if payee else None,
        reference_number=reference_number.strip() if reference_number else None,
        created_by=user
    )

    log_collection_activity(
        shift=shift,
        event_type='deduction_approved',
        actor=user,
        employee=employee,
        reason=approval_reason,
        metadata={'deduction_id': str(deduction.id), 'amount': str(amount), 'direction': direction}
    )

    calculate_shift_reconciliation(shift, user=user)

    return deduction


@transaction.atomic
def void_employee_shift_deduction(deduction: EmployeeShiftDeduction, user, reason: str) -> EmployeeShiftDeduction:
    if not reason or not reason.strip():
        raise ValidationError("A mandatory reason is required to void a deduction.")

    settlement = EmployeeShiftSettlement.objects.filter(
        operational_shift=deduction.operational_shift,
        employee=deduction.employee
    ).first()
    if settlement and settlement.status == EmployeeShiftSettlement.STATUS_RECONCILED:
        raise ValidationError("Cannot void deduction: The employee's settlement is already reconciled. Reopen the settlement first.")

    if deduction.status == EmployeeShiftDeduction.STATUS_VOID:
        raise ValidationError("Deduction is already void.")

    now = timezone.now()
    deduction.status = EmployeeShiftDeduction.STATUS_VOID
    deduction.void_reason = reason.strip()
    deduction.voided_by = user
    deduction.voided_at = now
    deduction.save(update_fields=['status', 'void_reason', 'voided_by', 'voided_at', 'updated_at'])

    log_collection_activity(
        shift=deduction.operational_shift,
        event_type='deduction_voided',
        actor=user,
        employee=deduction.employee,
        reason=reason,
        metadata={'deduction_id': str(deduction.id), 'amount': str(deduction.amount)}
    )

    calculate_shift_reconciliation(deduction.operational_shift, user=user)

    return deduction


def calculate_employee_settlement(shift: OperationalShift, employee: Employee) -> dict:
    shift_totals = calculate_shift_totals(shift)
    emp_data = next((e for e in shift_totals['employees'] if e['employee_id'] == str(employee.id)), None)
    expected_amount = emp_data['sale_amount'] if emp_data else Decimal('0.00')

    active_collections = list(EmployeeShiftCollection.objects.filter(
        operational_shift=shift,
        employee=employee,
        status=EmployeeShiftCollection.STATUS_ACTIVE
    ))
    cash_amount = sum((c.amount for c in active_collections if c.collection_method == 'cash'), Decimal('0.00'))
    card_amount = sum((c.amount for c in active_collections if c.collection_method == 'card'), Decimal('0.00'))
    upi_amount = sum((c.amount for c in active_collections if c.collection_method == 'upi'), Decimal('0.00'))
    fleet_card_amount = sum((c.amount for c in active_collections if c.collection_method == 'fleet_card'), Decimal('0.00'))

    credit_slip_amount = FuelCreditSlip.objects.filter(
        operational_shift=shift,
        employee=employee,
        status=FuelCreditSlip.STATUS_ACTIVE
    ).aggregate(total=models.Sum('amount'))['total'] or Decimal('0.00')

    active_deductions = list(EmployeeShiftDeduction.objects.filter(
        operational_shift=shift,
        employee=employee,
        status=EmployeeShiftDeduction.STATUS_ACTIVE
    ))
    approved_increase = sum((d.amount for d in active_deductions if d.direction == 'increases_accounted'), Decimal('0.00'))
    approved_decrease = sum((d.amount for d in active_deductions if d.direction == 'decreases_accounted'), Decimal('0.00'))

    total_accounted = cash_amount + card_amount + upi_amount + fleet_card_amount + credit_slip_amount + approved_increase - approved_decrease
    difference = total_accounted - expected_amount

    if difference == Decimal('0.00'):
        result = EmployeeShiftSettlement.RESULT_BALANCED
        shortage = Decimal('0.00')
        excess = Decimal('0.00')
    elif difference < Decimal('0.00'):
        result = EmployeeShiftSettlement.RESULT_SHORTAGE
        shortage = abs(difference)
        excess = Decimal('0.00')
    else:
        result = EmployeeShiftSettlement.RESULT_EXCESS
        shortage = Decimal('0.00')
        excess = difference

    nozzle_breakdown = []
    assignments = list(shift.nozzle_assignments.filter(
        shift_staff__source_employee=employee
    ).select_related('nozzle', 'nozzle__tank', 'nozzle__tank__product'))

    if assignments:
        for asm in assignments:
            meter = shift.meters.filter(nozzle=asm.nozzle).first()
            if not meter:
                continue
            a_start = asm.opening_reading if asm.opening_reading is not None else meter.opening_reading
            a_end = asm.closing_reading if asm.closing_reading is not None else (meter.closing_reading if meter.closing_reading is not None else a_start)
            if a_end < a_start:
                a_end = a_start
            qty = a_end - a_start
            seg = meter.price_segments.first()
            rate = seg.unit_price if seg else Decimal('0.00')
            prod = asm.nozzle.tank.product if (asm.nozzle and asm.nozzle.tank) else None
            amt = (qty * rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            nozzle_breakdown.append({
                'nozzle_id': str(asm.nozzle.id),
                'nozzle_code': asm.nozzle.code,
                'product_name': prod.name if prod else 'Fuel',
                'unit_price': rate,
                'quantity': qty,
                'amount': amt,
            })
    else:
        staff = shift.staff_members.filter(source_employee=employee).first()
        if staff and staff.assigned_nozzles:
            for n_id in staff.assigned_nozzles:
                meter = shift.meters.filter(nozzle_id=n_id).select_related('nozzle', 'nozzle__tank', 'nozzle__tank__product').first()
                if meter:
                    m_start = meter.opening_reading
                    m_end = meter.closing_reading if meter.closing_reading is not None else m_start
                    qty = max(Decimal('0.000'), m_end - m_start)
                    seg = meter.price_segments.first()
                    rate = seg.unit_price if seg else Decimal('0.00')
                    prod = meter.nozzle.tank.product if (meter.nozzle and meter.nozzle.tank) else None
                    amt = (qty * rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                    nozzle_breakdown.append({
                        'nozzle_id': str(meter.nozzle.id),
                        'nozzle_code': meter.nozzle.code,
                        'product_name': prod.name if prod else 'Fuel',
                        'unit_price': rate,
                        'quantity': qty,
                        'amount': amt,
                    })

    return {
        'employee_id': str(employee.id),
        'employee_name': employee.display_name,
        'employee_code': employee.employee_code,
        'expected_sale_amount': expected_amount,
        'nozzle_breakdown': nozzle_breakdown,
        'cash_amount': cash_amount,
        'card_amount': card_amount,
        'upi_amount': upi_amount,
        'fleet_card_amount': fleet_card_amount,
        'credit_slip_amount': credit_slip_amount,
        'approved_increase_adjustments': approved_increase,
        'approved_decrease_adjustments': approved_decrease,
        'total_accounted_amount': total_accounted,
        'difference_amount': difference,
        'shortage_amount': shortage,
        'excess_amount': excess,
        'result': result,
    }


def preview_employee_reconciliation(shift: OperationalShift, employee: Employee) -> dict:
    calc = calculate_employee_settlement(shift, employee)
    blocking_errors = []
    warnings = []

    if shift.status != OperationalShift.STATUS_CLOSED:
        blocking_errors.append("Operational shift must be closed before employee reconciliation can be confirmed.")

    existing_settlement = EmployeeShiftSettlement.objects.filter(
        operational_shift=shift,
        employee=employee
    ).first()

    if existing_settlement and existing_settlement.status == EmployeeShiftSettlement.STATUS_RECONCILED:
        blocking_errors.append("This employee's settlement is already reconciled.")

    if calc['result'] == 'shortage':
        warnings.append(f"Shortage of ₹{calc['shortage_amount']} detected. Acknowledgement and notes required.")
    elif calc['result'] == 'excess':
        warnings.append(f"Excess of ₹{calc['excess_amount']} detected. Acknowledgement and notes required.")

    return {
        'shift_id': str(shift.id),
        'employee_id': str(employee.id),
        'employee_name': employee.display_name,
        'employee_code': employee.employee_code,
        'shift_status': shift.status,
        'can_reconcile': len(blocking_errors) == 0,
        'blocking_reasons': blocking_errors,
        'blocking_errors': blocking_errors,
        'warnings': warnings,
        'expected_sale_amount': calc['expected_sale_amount'],
        'nozzle_breakdown': calc.get('nozzle_breakdown', []),
        'cash_amount': calc['cash_amount'],
        'card_amount': calc['card_amount'],
        'upi_amount': calc['upi_amount'],
        'fleet_card_amount': calc['fleet_card_amount'],
        'credit_slip_amount': calc['credit_slip_amount'],
        'approved_increase_adjustments': calc['approved_increase_adjustments'],
        'approved_decrease_adjustments': calc['approved_decrease_adjustments'],
        'total_accounted_amount': calc['total_accounted_amount'],
        'difference_amount': calc['difference_amount'],
        'shortage_amount': calc['shortage_amount'],
        'excess_amount': calc['excess_amount'],
        'result': calc['result'],
        'requires_acknowledgement': calc['result'] in ['shortage', 'excess'],
        'settlement_status': existing_settlement.status if existing_settlement else 'preparing',
        'reconciled_at': existing_settlement.reconciled_at.isoformat() if existing_settlement and existing_settlement.reconciled_at else None,
        'reconciled_by_name': (existing_settlement.reconciled_by.display_name or existing_settlement.reconciled_by.email) if existing_settlement and existing_settlement.reconciled_by else None,
        'reconciliation_notes': existing_settlement.reconciliation_notes if existing_settlement else None,
        'calculation': calc,
        'existing_settlement': {
            'id': str(existing_settlement.id) if existing_settlement else None,
            'status': existing_settlement.status if existing_settlement else None,
            'reconciled_at': existing_settlement.reconciled_at.isoformat() if existing_settlement and existing_settlement.reconciled_at else None,
            'reconciled_by': existing_settlement.reconciled_by.display_name or existing_settlement.reconciled_by.email if existing_settlement and existing_settlement.reconciled_by else None,
            'reconciliation_notes': existing_settlement.reconciliation_notes if existing_settlement else None,
        } if existing_settlement else None
    }


@transaction.atomic
def reconcile_employee_settlement(
    shift: OperationalShift,
    employee: Employee,
    user,
    notes: str = None,
    acknowledge_difference: bool = False
) -> EmployeeShiftSettlement:
    if shift.status != OperationalShift.STATUS_CLOSED:
        raise ValidationError("Employee settlement can only be reconciled after the operational shift is closed.")

    calc = calculate_employee_settlement(shift, employee)

    if calc['result'] in [EmployeeShiftSettlement.RESULT_SHORTAGE, EmployeeShiftSettlement.RESULT_EXCESS]:
        if not acknowledge_difference:
            raise ValidationError("Reconciliation with shortage or excess requires explicit acknowledgement.")
        if not notes or not notes.strip():
            raise ValidationError("Reconciliation with shortage or excess requires notes explaining the difference.")

    settlement, _ = EmployeeShiftSettlement.objects.select_for_update().get_or_create(
        operational_shift=shift,
        employee=employee,
        defaults={
            'organisation': shift.organisation,
            'outlet': shift.outlet
        }
    )

    if settlement.status == EmployeeShiftSettlement.STATUS_RECONCILED:
        raise ValidationError("Settlement is already reconciled.")

    now = timezone.now()
    settlement.expected_sale_amount = calc['expected_sale_amount']
    settlement.cash_amount = calc['cash_amount']
    settlement.card_amount = calc['card_amount']
    settlement.upi_amount = calc['upi_amount']
    settlement.fleet_card_amount = calc['fleet_card_amount']
    settlement.credit_slip_amount = calc['credit_slip_amount']
    settlement.approved_increase_adjustments = calc['approved_increase_adjustments']
    settlement.approved_decrease_adjustments = calc['approved_decrease_adjustments']
    settlement.total_accounted_amount = calc['total_accounted_amount']
    settlement.difference_amount = calc['difference_amount']
    settlement.result = calc['result']
    settlement.status = EmployeeShiftSettlement.STATUS_RECONCILED
    settlement.reconciled_by = user
    settlement.reconciled_at = now
    settlement.reconciliation_notes = notes.strip() if notes else None
    settlement.save()

    log_collection_activity(
        shift=shift,
        event_type='employee_settlement_reconciled',
        actor=user,
        employee=employee,
        reason=notes,
        metadata={
            'settlement_id': str(settlement.id),
            'expected': str(settlement.expected_sale_amount),
            'accounted': str(settlement.total_accounted_amount),
            'result': settlement.result
        }
    )

    calculate_shift_reconciliation(shift, user=user)

    return settlement


@transaction.atomic
def reopen_employee_settlement(settlement: EmployeeShiftSettlement, user, reason: str) -> EmployeeShiftSettlement:
    if not reason or not reason.strip():
        raise ValidationError("A mandatory reason is required to reopen an employee settlement.")

    if settlement.operational_shift.status != OperationalShift.STATUS_CLOSED:
        raise ValidationError("Settlement can only be reopened on a closed operational shift.")

    if settlement.status != EmployeeShiftSettlement.STATUS_RECONCILED:
        raise ValidationError("Only reconciled settlements can be reopened.")

    now = timezone.now()
    settlement.status = EmployeeShiftSettlement.STATUS_PREPARING
    settlement.reopened_by = user
    settlement.reopened_at = now
    settlement.reopen_reason = reason.strip()
    settlement.version += 1
    settlement.save(update_fields=['status', 'reopened_by', 'reopened_at', 'reopen_reason', 'version', 'updated_at'])

    log_collection_activity(
        shift=settlement.operational_shift,
        event_type='employee_settlement_reopened',
        actor=user,
        employee=settlement.employee,
        reason=reason,
        metadata={'settlement_id': str(settlement.id), 'version': settlement.version}
    )

    calculate_shift_reconciliation(settlement.operational_shift, user=user)

    return settlement


@transaction.atomic
def calculate_shift_reconciliation(shift: OperationalShift, user=None) -> ShiftReconciliation:
    shift_totals = calculate_shift_totals(shift)

    required_employees = []
    for emp_data in shift_totals['employees']:
        emp_id = emp_data['employee_id']
        emp = Employee.objects.get(id=emp_id)

        has_sales = emp_data['sale_amount'] > Decimal('0.00')
        has_collections = EmployeeShiftCollection.objects.filter(operational_shift=shift, employee=emp, status=EmployeeShiftCollection.STATUS_ACTIVE).exists()
        has_credit_slips = FuelCreditSlip.objects.filter(operational_shift=shift, employee=emp, status=FuelCreditSlip.STATUS_ACTIVE).exists()
        has_deductions = EmployeeShiftDeduction.objects.filter(operational_shift=shift, employee=emp, status=EmployeeShiftDeduction.STATUS_ACTIVE).exists()

        if has_sales or has_collections or has_credit_slips or has_deductions:
            required_employees.append(emp)

    if not required_employees:
        for sm in shift.staff_members.select_related('source_employee').all():
            required_employees.append(sm.source_employee)

    required_employee_count = len(required_employees)
    reconciled_employee_count = 0

    expected_sum = Decimal('0.00')
    accounted_sum = Decimal('0.00')
    gross_shortage = Decimal('0.00')
    gross_excess = Decimal('0.00')

    for emp in required_employees:
        settlement = EmployeeShiftSettlement.objects.filter(
            operational_shift=shift,
            employee=emp
        ).first()

        if settlement and settlement.status == EmployeeShiftSettlement.STATUS_RECONCILED:
            reconciled_employee_count += 1
            expected_sum += settlement.expected_sale_amount
            accounted_sum += settlement.total_accounted_amount
            gross_shortage += settlement.shortage_amount
            gross_excess += settlement.excess_amount
        else:
            calc = calculate_employee_settlement(shift, emp)
            expected_sum += calc['expected_sale_amount']
            accounted_sum += calc['total_accounted_amount']
            gross_shortage += calc['shortage_amount']
            gross_excess += calc['excess_amount']

    net_difference = accounted_sum - expected_sum

    if required_employee_count == 0:
        new_status = ShiftReconciliation.STATUS_RECONCILED
    elif reconciled_employee_count == 0:
        new_status = ShiftReconciliation.STATUS_PENDING
    elif reconciled_employee_count < required_employee_count:
        new_status = ShiftReconciliation.STATUS_PARTIAL
    else:
        new_status = ShiftReconciliation.STATUS_RECONCILED

    recon, _ = ShiftReconciliation.objects.select_for_update().get_or_create(
        operational_shift=shift,
        defaults={
            'organisation': shift.organisation,
            'outlet': shift.outlet,
            'expected_sale_amount': expected_sum,
            'total_accounted_amount': accounted_sum,
            'shortage_amount': gross_shortage,
            'excess_amount': gross_excess,
            'net_difference_amount': net_difference,
            'required_employee_count': required_employee_count,
            'reconciled_employee_count': reconciled_employee_count,
            'status': new_status
        }
    )

    old_status = recon.status
    recon.expected_sale_amount = expected_sum
    recon.total_accounted_amount = accounted_sum
    recon.shortage_amount = gross_shortage
    recon.excess_amount = gross_excess
    recon.net_difference_amount = net_difference
    recon.required_employee_count = required_employee_count
    recon.reconciled_employee_count = reconciled_employee_count
    recon.status = new_status

    if new_status == ShiftReconciliation.STATUS_RECONCILED and old_status != ShiftReconciliation.STATUS_RECONCILED:
        recon.completed_by = user
        recon.completed_at = timezone.now()
        log_collection_activity(
            shift=shift,
            event_type='shift_reconciliation_completed',
            actor=user,
            reason="All employee settlements reconciled",
            metadata={'status': new_status}
        )
    elif new_status != ShiftReconciliation.STATUS_RECONCILED and old_status == ShiftReconciliation.STATUS_RECONCILED:
        recon.completed_by = None
        recon.completed_at = None
        log_collection_activity(
            shift=shift,
            event_type='shift_reconciliation_reopened',
            actor=user,
            reason=f"Shift reconciliation reverted to {new_status}",
            metadata={'status': new_status}
        )

    recon.save()
    return recon


def get_employee_accountability_summary(shift: OperationalShift) -> list[dict]:
    shift_totals = calculate_shift_totals(shift)
    summaries = []

    for emp_data in shift_totals['employees']:
        emp_id = emp_data['employee_id']
        emp = Employee.objects.get(id=emp_id)

        settlement = EmployeeShiftSettlement.objects.filter(
            operational_shift=shift,
            employee=emp
        ).first()

        if settlement and settlement.status == EmployeeShiftSettlement.STATUS_RECONCILED:
            summaries.append({
                'employee_id': emp_id,
                'staff_id': emp_data['staff_id'],
                'employee_name': emp_data['employee_name'],
                'employee_code': emp_data['employee_code'],
                'designation': emp_data['designation'],
                'assigned_nozzles': emp_data['assigned_nozzles'],
                'nozzle_codes': emp_data.get('nozzle_codes', emp_data['assigned_nozzles']),
                'expected_sale_amount': settlement.expected_sale_amount,
                'cash_amount': settlement.cash_amount,
                'card_amount': settlement.card_amount,
                'upi_amount': settlement.upi_amount,
                'credit_slip_amount': settlement.credit_slip_amount,
                'approved_increase_adjustments': settlement.approved_increase_adjustments,
                'approved_decrease_adjustments': settlement.approved_decrease_adjustments,
                'total_accounted_amount': settlement.total_accounted_amount,
                'difference_amount': settlement.difference_amount,
                'shortage_amount': settlement.shortage_amount,
                'excess_amount': settlement.excess_amount,
                'result': settlement.result,
                'settlement_status': settlement.status,
                'settlement_id': str(settlement.id),
                'reconciled_at': settlement.reconciled_at.isoformat() if settlement.reconciled_at else None,
                'reconciled_by': settlement.reconciled_by.display_name or settlement.reconciled_by.email if settlement.reconciled_by else None,
                'reconciliation_notes': settlement.reconciliation_notes
            })
        else:
            calc = calculate_employee_settlement(shift, emp)
            summaries.append({
                'employee_id': emp_id,
                'staff_id': emp_data['staff_id'],
                'employee_name': emp_data['employee_name'],
                'employee_code': emp_data['employee_code'],
                'designation': emp_data['designation'],
                'assigned_nozzles': emp_data['assigned_nozzles'],
                'nozzle_codes': emp_data.get('nozzle_codes', emp_data['assigned_nozzles']),
                'expected_sale_amount': calc['expected_sale_amount'],
                'cash_amount': calc['cash_amount'],
                'card_amount': calc['card_amount'],
                'upi_amount': calc['upi_amount'],
                'credit_slip_amount': calc['credit_slip_amount'],
                'approved_increase_adjustments': calc['approved_increase_adjustments'],
                'approved_decrease_adjustments': calc['approved_decrease_adjustments'],
                'total_accounted_amount': calc['total_accounted_amount'],
                'difference_amount': calc['difference_amount'],
                'shortage_amount': calc['shortage_amount'],
                'excess_amount': calc['excess_amount'],
                'result': calc['result'],
                'settlement_status': 'preparing',
                'settlement_id': str(settlement.id) if settlement else None,
                'reconciled_at': None,
                'reconciled_by': None,
                'reconciliation_notes': None
            })

    return summaries


def recheck_chronological_continuity_chain(outlet, nozzle, from_business_date, from_starts_at) -> int:
    """
    Re-evaluates the chronological sequence of subsequent shifts for this nozzle.
    Never silently changes entered readings. Updates expected_opening_reading, continuity_status, and difference.
    Returns number of affected meters updated.
    """
    from .models import ShiftNozzleMeter
    from .selectors import derive_nozzle_opening_reading

    subsequent_meters = list(
        ShiftNozzleMeter.objects.filter(
            shift__outlet=outlet,
            nozzle=nozzle
        ).filter(
            models.Q(shift__business_date__gt=from_business_date) |
            models.Q(shift__business_date=from_business_date, shift__shift_definition__starts_at__gt=from_starts_at)
        ).select_related('shift', 'shift__shift_definition').order_by(
            'shift__business_date', 'shift__shift_definition__starts_at', 'shift__created_at'
        )
    )

    updated_count = 0
    for meter in subsequent_meters:
        curr_shift = meter.shift
        derived = derive_nozzle_opening_reading(
            outlet=outlet,
            nozzle=nozzle,
            as_of_time=curr_shift.scheduled_starts_at,
            shift_date=curr_shift.business_date,
            shift_def=curr_shift.shift_definition,
            exclude_shift_id=curr_shift.id
        )

        expected = derived.get('reading')
        if expected is not None:
            meter.expected_opening_reading = expected
            if meter.opening_reading == expected:
                meter.continuity_status = ShiftNozzleMeter.CONTINUITY_VALID
                meter.continuity_difference = Decimal('0.000')
            else:
                meter.continuity_status = ShiftNozzleMeter.CONTINUITY_CONFLICT
                meter.continuity_difference = meter.opening_reading - expected
        else:
            meter.expected_opening_reading = None
            meter.continuity_status = derived.get('continuity_status', ShiftNozzleMeter.CONTINUITY_AWAITING_PREDECESSOR)
            meter.continuity_difference = Decimal('0.000')

        meter.save()
        updated_count += 1

    return updated_count


@transaction.atomic
def atomic_save_shift_card(
    organisation,
    outlet,
    user,
    shift_definition,
    business_date,
    employee,
    nozzle_meters_data: list[dict],
    cash_data: dict | None = None,
    cards_data: list[dict] | None = None,
    upi_data: list[dict] | None = None,
    fleet_data: list[dict] | None = None,
    credit_slips_data: list[dict] | None = None,
    deductions_data: list[dict] | None = None,
    card_id: str | None = None,
    sequence: int = 1,
    actual_starts_at=None,
    actual_ends_at=None,
    mpd_slip_number: str | None = None,
    mpd_slip_attachment=None,
    notes: str | None = None,
    is_shortage_excess_acknowledged: bool = False,
    shortage_excess_acknowledgement_note: str | None = None
) -> EmployeeShiftCard:
    """
    Atomically creates or updates an EmployeeShiftCard:
    - Finds or creates parent OperationalShift (document-based)
    - Validates lock state
    - Validates employee assignment
    - Validates nozzle intervals are unique across active cards in this shift
    - Calculates fuel sales using Decimal arithmetic
    - Validates credit slips do not exceed employee's attributed sale quantity
    - Validates cash denominations if provided
    - Saves collections (cash, cards, upi, fleet) and pending deductions
    - Enforces shortage/excess acknowledgement and mandatory note
    - Recalculates settlement
    - Re-evaluates continuity chain for affected nozzles
    - Appends audit trail
    """
    from collections import defaultdict
    from apps.forecourt.models import ProductPrice, Nozzle, Tank
    from .models import (
        OperationalShift, EmployeeShiftCard, ShiftNozzleMeter,
        ShiftNozzlePriceSegment, ShiftTestingRecord,
        EmployeeShiftCollection, EmployeeCashDenomination,
        FuelCreditSlip, EmployeeShiftDeduction, EmployeeShiftSettlement,
        CollectionAuditLog, ShiftActivityLog
    )

    # 1. Scheduled window for shift
    start_dt = datetime.combine(business_date, shift_definition.starts_at)
    if shift_definition.crosses_midnight:
        end_dt = datetime.combine(business_date + timedelta(days=1), shift_definition.ends_at)
    else:
        end_dt = datetime.combine(business_date, shift_definition.ends_at)
    start_aware = timezone.make_aware(start_dt) if timezone.is_naive(start_dt) else start_dt
    end_aware = timezone.make_aware(end_dt) if timezone.is_naive(end_dt) else end_dt

    parent_shift, _ = OperationalShift.objects.get_or_create(
        organisation=organisation,
        outlet=outlet,
        shift_definition=shift_definition,
        business_date=business_date,
        defaults={
            'scheduled_starts_at': start_aware,
            'scheduled_ends_at': end_aware,
            'opened_at': start_aware,
            'closed_at': end_aware,
            'opened_by': user,
            'recorded_by': user,
            'status': OperationalShift.STATUS_CLOSED
        }
    )

    # Lock parent shift row for atomic update
    parent_shift = OperationalShift.objects.select_for_update().get(id=parent_shift.id)
    if parent_shift.is_locked:
        raise ValidationError({'shift': "Shift is locked and cannot be edited."})

    # Employee validation
    if employee.organisation_id != organisation.id:
        raise ValidationError({'employee': "Employee does not belong to this organisation."})
    if not employee.outlet_assignments.filter(outlet=outlet).exists():
        raise ValidationError({'employee': "Employee is not assigned to this outlet."})

    # Card retrieval or instantiation
    if card_id:
        try:
            card = EmployeeShiftCard.objects.select_for_update().get(id=card_id, parent_shift=parent_shift)
        except EmployeeShiftCard.DoesNotExist:
            raise ValidationError({'card': "Shift Card not found."})
        if card.status == EmployeeShiftCard.STATUS_VOID:
            raise ValidationError({'card': "Voided Shift Cards cannot be edited."})
    else:
        existing = EmployeeShiftCard.objects.filter(
            parent_shift=parent_shift,
            employee=employee,
            status=EmployeeShiftCard.STATUS_ACTIVE
        ).first()
        if existing:
            card = existing
        else:
            card = EmployeeShiftCard(
                organisation=organisation,
                outlet=outlet,
                parent_shift=parent_shift,
                employee=employee,
                created_by=user
            )

    # Check nozzle collision with other active cards in this shift
    nozzle_ids_in_payload = [m['nozzle_id'] for m in nozzle_meters_data]
    other_cards_meters = ShiftNozzleMeter.objects.filter(
        shift=parent_shift,
        nozzle_id__in=nozzle_ids_in_payload,
        shift_card__status=EmployeeShiftCard.STATUS_ACTIVE
    )
    if card.pk:
        other_cards_meters = other_cards_meters.exclude(shift_card=card)
    if other_cards_meters.exists():
        colliding_code = other_cards_meters.first().nozzle.code
        raise ValidationError({'meters': f"Nozzle {colliding_code} is already assigned to another active Shift Card in this shift."})

    # 2. Process Meters & Price Segments
    expected_sale_amount = Decimal('0.00')
    employee_sales_by_product = defaultdict(Decimal)
    saved_meters = []
    affected_nozzles_for_continuity = []

    for m_data in nozzle_meters_data:
        nozzle = Nozzle.objects.select_related('dispenser', 'tank', 'tank__product').get(id=m_data['nozzle_id'])
        opening_reading = Decimal(str(m_data['opening_reading']))
        closing_reading = Decimal(str(m_data['closing_reading'])) if m_data.get('closing_reading') is not None else None

        # Baseline / commissioning requirement
        from .selectors import derive_nozzle_opening_reading
        derived_baseline = derive_nozzle_opening_reading(
            outlet=outlet,
            nozzle=nozzle,
            as_of_time=start_aware,
            shift_date=business_date,
            shift_def=shift_definition,
            exclude_shift_id=parent_shift.id
        )
        if derived_baseline.get('requires_commissioning'):
            raise ValidationError({'meters': f"Nozzle {nozzle.code} has no baseline or history and requires commissioning before entering shift data."})

        if closing_reading is not None and closing_reading < opening_reading:
            raise ValidationError({'meters': f"Closing reading cannot be less than opening reading on nozzle {nozzle.code}."})

        gross = (closing_reading - opening_reading) if closing_reading is not None else Decimal('0.000')
        testing = Decimal(str(m_data.get('testing_quantity', '0.000')))
        if testing < Decimal('0.000'):
            raise ValidationError({'meters': f"Testing quantity cannot be negative on nozzle {nozzle.code}."})
        if testing > gross and closing_reading is not None:
            raise ValidationError({'meters': f"Testing quantity ({testing}L) cannot exceed gross dispensed ({gross}L) on nozzle {nozzle.code}."})

        returned_to_tank = m_data.get('returned_to_tank', True)
        dest_tank_id = m_data.get('destination_tank_id') or nozzle.tank_id
        dest_tank = Tank.objects.get(id=dest_tank_id)
        if returned_to_tank and dest_tank.product_id != nozzle.tank.product_id:
            raise ValidationError({'meters': f"Destination tank for returned testing must store {nozzle.tank.product.name}."})

        sale_qty = max(Decimal('0.000'), gross - testing)
        stock_depletion = max(Decimal('0.000'), gross - (testing if returned_to_tank else Decimal('0.000')))

        # Rate and amount
        segments_input = m_data.get('price_segments', [])
        meter_sale_amount = Decimal('0.00')

        if segments_input:
            seg_calc_list = []
            for seg_idx, s_in in enumerate(segments_input, start=1):
                s_open = Decimal(str(s_in['opening_reading']))
                s_close = Decimal(str(s_in['closing_reading'])) if s_in.get('closing_reading') is not None else closing_reading
                s_price = Decimal(str(s_in['unit_price']))
                s_gross = max(Decimal('0.000'), (s_close - s_open)) if s_close is not None else Decimal('0.000')
                s_test = Decimal(str(s_in.get('testing_quantity', '0.000')))
                s_sale_qty = max(Decimal('0.000'), s_gross - s_test)
                s_amount = (s_sale_qty * s_price).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                meter_sale_amount += s_amount
                seg_calc_list.append({
                    'sequence': seg_idx,
                    'opening_reading': s_open,
                    'closing_reading': s_close,
                    'unit_price': s_price,
                    'gross_quantity': s_gross,
                    'testing_quantity': s_test,
                    'sale_quantity': s_sale_qty,
                    'sale_amount': s_amount,
                    'starts_at': s_in.get('starts_at', start_aware),
                    'ends_at': s_in.get('ends_at')
                })
        else:
            price_obj = ProductPrice.objects.filter(
                outlet=outlet,
                product=nozzle.tank.product,
                effective_from__lte=start_aware
            ).filter(
                models.Q(effective_to__isnull=True) | models.Q(effective_to__gt=start_aware)
            ).order_by('-effective_from').first()
            rate = price_obj.selling_price if price_obj else Decimal('0.00')
            meter_sale_amount = (sale_qty * rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            seg_calc_list = [{
                'sequence': 1,
                'opening_reading': opening_reading,
                'closing_reading': closing_reading,
                'unit_price': rate,
                'gross_quantity': gross,
                'testing_quantity': testing,
                'sale_quantity': sale_qty,
                'sale_amount': meter_sale_amount,
                'starts_at': start_aware,
                'ends_at': end_aware
            }]

        expected_sale_amount += meter_sale_amount
        employee_sales_by_product[str(nozzle.tank.product_id)] += sale_qty

        derived_reading = derived_baseline.get('reading')
        passed_source = m_data.get('opening_source') or None
        passed_continuity = m_data.get('continuity_status') or None

        if passed_source and passed_continuity:
            meter_opening_source = passed_source
            meter_opening_ref = m_data.get('opening_source_reference')
            meter_continuity_status = passed_continuity
        elif derived_reading is not None and opening_reading == derived_reading:
            meter_opening_source = passed_source or derived_baseline.get('source', ShiftNozzleMeter.SOURCE_PREVIOUS_SHIFT_CARD)
            meter_opening_ref = derived_baseline.get('reference')
            meter_continuity_status = passed_continuity or ShiftNozzleMeter.CONTINUITY_VALID
        else:
            meter_opening_source = passed_source or ShiftNozzleMeter.SOURCE_PHYSICAL_SLIP_MISSING_PREDECESSOR
            meter_opening_ref = None
            meter_continuity_status = passed_continuity or ShiftNozzleMeter.CONTINUITY_AWAITING_PREDECESSOR

        expected_open_val = (
            Decimal(str(m_data['expected_opening_reading']))
            if m_data.get('expected_opening_reading') is not None
            else derived_reading
        )
        continuity_diff_val = (
            Decimal(str(m_data['continuity_difference']))
            if m_data.get('continuity_difference') is not None
            else ((opening_reading - derived_reading) if derived_reading is not None else Decimal('0.000'))
        )

        saved_meters.append({
            'nozzle': nozzle,
            'opening_reading': opening_reading,
            'expected_opening_reading': expected_open_val,
            'closing_reading': closing_reading,
            'opening_source': meter_opening_source,
            'opening_source_reference': meter_opening_ref,
            'continuity_status': meter_continuity_status,
            'continuity_difference': continuity_diff_val,
            'continuity_reason': m_data.get('continuity_reason'),
            'is_conflict_acknowledged': m_data.get('is_conflict_acknowledged', False),
            'manual_exception_type': m_data.get('manual_exception_type'),
            'manual_exception_reason': m_data.get('manual_exception_reason'),
            'gross_quantity': gross,
            'testing_quantity': testing,
            'sale_quantity': sale_qty,
            'stock_depletion_quantity': stock_depletion,
            'segments': seg_calc_list,
            'returned_to_tank': returned_to_tank,
            'destination_tank': dest_tank
        })

        if closing_reading is not None:
            affected_nozzles_for_continuity.append(nozzle)

    # 3. Credit Slips Validation
    credit_slips_clean = []
    for cs_data in (credit_slips_data or []):
        p_id = str(cs_data['product_id'])
        qty = Decimal(str(cs_data['quantity']))
        if qty <= Decimal('0.000'):
            raise ValidationError({'credit_slips': "Credit slip quantity must be positive."})
        attr_sale = employee_sales_by_product.get(p_id, Decimal('0.000'))
        if qty > attr_sale:
            raise ValidationError({'credit_slips': f"Credited quantity ({qty}L) cannot exceed employee's attributed sale quantity ({attr_sale}L)."})

        u_price = Decimal(str(cs_data['unit_price']))
        calc_amt = (qty * u_price).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        credit_slips_clean.append({
            'customer_id': cs_data['customer_id'],
            'nozzle_id': cs_data.get('nozzle_id'),
            'product_id': cs_data['product_id'],
            'quantity': qty,
            'unit_price': u_price,
            'amount': calc_amt,
            'slip_number': cs_data.get('slip_number') or f"CS-{timezone.now().strftime('%Y%m%d%H%M%S')}",
            'physical_slip_number': cs_data.get('physical_slip_number'),
            'vehicle_number': cs_data.get('vehicle_number'),
            'driver_name': cs_data.get('driver_name'),
            'customer_reference': cs_data.get('customer_reference'),
            'occurred_at': cs_data.get('occurred_at') or end_aware,
            'notes': cs_data.get('notes')
        })

    # 4. Cash & Denomination Validation
    cash_amount = Decimal(str(cash_data.get('amount', '0.00'))) if cash_data else Decimal('0.00')
    if cash_amount < Decimal('0.00'):
        raise ValidationError({'cash': "Cash amount cannot be negative."})

    denominations_clean = []
    if cash_data and 'denominations' in cash_data and cash_data['denominations']:
        denom_sum = Decimal('0.00')
        for d in cash_data['denominations']:
            val = int(d['denomination_value'])
            qty = int(d['quantity'])
            if qty < 0:
                raise ValidationError({'cash': "Denomination quantity cannot be negative."})
            d_amt = Decimal(val) * Decimal(qty)
            denom_sum += d_amt
            if qty > 0:
                denominations_clean.append({'denomination_value': val, 'quantity': qty, 'calculated_amount': d_amt})
        if denom_sum != cash_amount:
            raise ValidationError({'cash': f"Denomination total (₹{denom_sum}) must equal cash amount (₹{cash_amount})."})

    # 5. Non-cash collections validation
    cards_clean = []
    for c in (cards_data or []):
        amt = Decimal(str(c['amount']))
        if amt <= Decimal('0.00'):
            raise ValidationError({'cards': "Card payment amount must be positive."})
        cards_clean.append({
            'provider_name': c.get('provider_name'),
            'reference_number': c.get('reference_number'),
            'terminal_or_account_reference': c.get('terminal_or_account_reference'),
            'amount': amt,
            'occurred_at': c.get('occurred_at') or end_aware,
            'notes': c.get('notes')
        })

    upi_clean = []
    for u in (upi_data or []):
        amt = Decimal(str(u['amount']))
        if amt <= Decimal('0.00'):
            raise ValidationError({'upi': "UPI payment amount must be positive."})
        upi_clean.append({
            'provider_name': u.get('provider_name'),
            'reference_number': u.get('reference_number'),
            'amount': amt,
            'occurred_at': u.get('occurred_at') or end_aware,
            'notes': u.get('notes')
        })

    fleet_clean = []
    for f in (fleet_data or []):
        amt = Decimal(str(f['amount']))
        if amt <= Decimal('0.00'):
            raise ValidationError({'fleet': "Fleet card payment amount must be positive."})
        fleet_clean.append({
            'provider_name': f.get('provider_name'),
            'reference_number': f.get('reference_number'),
            'terminal_or_account_reference': f.get('terminal_or_account_reference'),
            'amount': amt,
            'occurred_at': f.get('occurred_at') or end_aware,
            'notes': f.get('notes')
        })

    # 6. Deductions (Default pending)
    deductions_clean = []
    for d in (deductions_data or []):
        amt = Decimal(str(d['amount']))
        if amt <= Decimal('0.00'):
            raise ValidationError({'deductions': "Deduction amount must be positive."})
        deductions_clean.append({
            'id': d.get('id'),
            'deduction_type': d.get('deduction_type', EmployeeShiftDeduction.TYPE_CASH_EXPENSE),
            'direction': d.get('direction') or (
                EmployeeShiftDeduction.DIRECTION_INCREASES
                if d.get('deduction_type', EmployeeShiftDeduction.TYPE_CASH_EXPENSE) in [EmployeeShiftDeduction.TYPE_CASH_EXPENSE, EmployeeShiftDeduction.TYPE_APPROVED_DEDUCTION]
                else EmployeeShiftDeduction.DIRECTION_DECREASES
            ),
            'amount': amt,
            'description': d.get('description') or "Shift cash expense",
            'payee': d.get('payee'),
            'reference_number': d.get('reference_number'),
            'occurred_at': d.get('occurred_at') or end_aware
        })

    # Accounted amount calculations
    # Note: Only APPROVED deductions affect accounted amount!
    # Any new deduction created through shift card is pending and does NOT reduce accounted amount yet!
    # Any existing approved deduction for this card/employee continues to count.
    existing_approved_inc = EmployeeShiftDeduction.objects.filter(
        operational_shift=parent_shift,
        employee=employee,
        status='active',
        approval_status=EmployeeShiftDeduction.APPROVAL_APPROVED,
        direction=EmployeeShiftDeduction.DIRECTION_INCREASES
    ).aggregate(s=models.Sum('amount'))['s'] or Decimal('0.00')

    existing_approved_dec = EmployeeShiftDeduction.objects.filter(
        operational_shift=parent_shift,
        employee=employee,
        status='active',
        approval_status=EmployeeShiftDeduction.APPROVAL_APPROVED,
        direction=EmployeeShiftDeduction.DIRECTION_DECREASES
    ).aggregate(s=models.Sum('amount'))['s'] or Decimal('0.00')

    cards_amount = sum((c['amount'] for c in cards_clean), Decimal('0.00'))
    upi_amount = sum((u['amount'] for u in upi_clean), Decimal('0.00'))
    fleet_amount = sum((f['amount'] for f in fleet_clean), Decimal('0.00'))
    credit_amount = sum((cs['amount'] for cs in credit_slips_clean), Decimal('0.00'))

    total_accounted = cash_amount + cards_amount + upi_amount + fleet_amount + credit_amount + existing_approved_inc - existing_approved_dec
    difference_amount = total_accounted - expected_sale_amount

    # Enforce Shortage/Excess Acknowledgement
    if difference_amount != Decimal('0.00'):
        if not is_shortage_excess_acknowledged:
            disc_type = "Excess" if difference_amount > Decimal('0.00') else "Shortage"
            raise ValidationError({'difference': f"A {disc_type} of ₹{abs(difference_amount)} exists. Acknowledgment and mandatory note are required to save."})
        if not shortage_excess_acknowledgement_note or not shortage_excess_acknowledgement_note.strip():
            raise ValidationError({'shortage_excess_acknowledgement_note': "Mandatory explanation note required when acknowledging a shortage or excess."})

    # 7. Save EmployeeShiftCard
    card.sequence = sequence
    card.actual_starts_at = actual_starts_at or start_aware
    card.actual_ends_at = actual_ends_at or end_aware
    card.mpd_slip_number = mpd_slip_number
    if mpd_slip_attachment:
        card.mpd_slip_attachment = mpd_slip_attachment
    card.notes = notes
    card.is_shortage_excess_acknowledged = is_shortage_excess_acknowledged
    card.shortage_excess_acknowledgement_note = shortage_excess_acknowledgement_note
    card.updated_by = user
    card.save()

    # 8. Save ShiftNozzleMeters
    for sm in saved_meters:
        meter_obj, _ = ShiftNozzleMeter.objects.update_or_create(
            shift=parent_shift,
            nozzle=sm['nozzle'],
            defaults={
                'shift_card': card,
                'tank': sm['nozzle'].tank,
                'product': sm['nozzle'].tank.product,
                'opening_reading': sm['opening_reading'],
                'expected_opening_reading': sm['expected_opening_reading'],
                'closing_reading': sm['closing_reading'],
                'opening_source': sm['opening_source'],
                'opening_source_reference': sm['opening_source_reference'],
                'continuity_status': sm['continuity_status'],
                'continuity_difference': sm['continuity_difference'],
                'continuity_reason': sm['continuity_reason'],
                'is_conflict_acknowledged': sm['is_conflict_acknowledged'],
                'manual_exception_type': sm['manual_exception_type'],
                'manual_exception_reason': sm['manual_exception_reason'],
                'gross_quantity': sm['gross_quantity'],
                'testing_quantity': sm['testing_quantity'],
                'sale_quantity': sm['sale_quantity'],
                'stock_depletion_quantity': sm['stock_depletion_quantity'],
            }
        )

        # Clear and recreate price segments for this meter
        meter_obj.price_segments.all().delete()
        for seg in sm['segments']:
            ShiftNozzlePriceSegment.objects.create(
                shift_nozzle_meter=meter_obj,
                product=sm['nozzle'].tank.product,
                sequence=seg['sequence'],
                starts_at=seg['starts_at'],
                ends_at=seg['ends_at'],
                opening_reading=seg['opening_reading'],
                closing_reading=seg['closing_reading'],
                unit_price=seg['unit_price'],
                gross_quantity=seg['gross_quantity'],
                testing_quantity=seg['testing_quantity'],
                sale_quantity=seg['sale_quantity'],
                sale_amount=seg['sale_amount']
            )

        # Testing records
        meter_obj.testing_records.all().delete()
        if sm['testing_quantity'] > Decimal('0.000'):
            ShiftTestingRecord.objects.create(
                organisation=organisation,
                outlet=outlet,
                shift=parent_shift,
                shift_nozzle_meter=meter_obj,
                quantity=sm['testing_quantity'],
                returned_to_tank=sm['returned_to_tank'],
                destination_tank=sm['destination_tank'],
                occurred_at=end_aware,
                created_by=user,
                updated_by=user
            )

    # 9. Save Collections
    # Remove previous active collections for this card to avoid duplicates
    card.collections.filter(status='active').delete()

    # Cash collection
    if cash_amount > Decimal('0.00'):
        cash_coll = EmployeeShiftCollection.objects.create(
            organisation=organisation,
            outlet=outlet,
            operational_shift=parent_shift,
            shift_card=card,
            employee=employee,
            collection_method=EmployeeShiftCollection.METHOD_CASH,
            amount=cash_amount,
            occurred_at=end_aware,
            created_by=user
        )
        for d in denominations_clean:
            EmployeeCashDenomination.objects.create(
                collection=cash_coll,
                denomination_value=d['denomination_value'],
                quantity=d['quantity'],
                calculated_amount=d['calculated_amount']
            )

    # Card payments
    for c in cards_clean:
        EmployeeShiftCollection.objects.create(
            organisation=organisation,
            outlet=outlet,
            operational_shift=parent_shift,
            shift_card=card,
            employee=employee,
            collection_method=EmployeeShiftCollection.METHOD_CARD,
            amount=c['amount'],
            provider_name=c['provider_name'],
            reference_number=c['reference_number'],
            terminal_or_account_reference=c['terminal_or_account_reference'],
            occurred_at=c['occurred_at'],
            notes=c['notes'],
            created_by=user
        )

    # UPI payments
    for u in upi_clean:
        EmployeeShiftCollection.objects.create(
            organisation=organisation,
            outlet=outlet,
            operational_shift=parent_shift,
            shift_card=card,
            employee=employee,
            collection_method=EmployeeShiftCollection.METHOD_UPI,
            amount=u['amount'],
            provider_name=u['provider_name'],
            reference_number=u['reference_number'],
            occurred_at=u['occurred_at'],
            notes=u['notes'],
            created_by=user
        )

    # Fleet card payments
    for f in fleet_clean:
        EmployeeShiftCollection.objects.create(
            organisation=organisation,
            outlet=outlet,
            operational_shift=parent_shift,
            shift_card=card,
            employee=employee,
            collection_method=EmployeeShiftCollection.METHOD_FLEET_CARD,
            amount=f['amount'],
            provider_name=f['provider_name'],
            reference_number=f['reference_number'],
            terminal_or_account_reference=f['terminal_or_account_reference'],
            occurred_at=f['occurred_at'],
            notes=f['notes'],
            created_by=user
        )

    # 10. Save Credit Slips
    card.credit_slips.filter(status='active').delete()
    for cs in credit_slips_clean:
        FuelCreditSlip.objects.create(
            organisation=organisation,
            outlet=outlet,
            operational_shift=parent_shift,
            shift_card=card,
            employee=employee,
            customer_id=cs['customer_id'],
            nozzle_id=cs['nozzle_id'],
            product_id=cs['product_id'],
            quantity=cs['quantity'],
            unit_price=cs['unit_price'],
            amount=cs['amount'],
            slip_number=cs['slip_number'],
            physical_slip_number=cs['physical_slip_number'],
            vehicle_number=cs['vehicle_number'],
            driver_name=cs['driver_name'],
            customer_reference=cs['customer_reference'],
            occurred_at=cs['occurred_at'],
            notes=cs['notes'],
            created_by=user
        )

    # 11. Save Deductions (Default pending)
    for d in deductions_clean:
        if d.get('id'):
            continue  # Do not duplicate existing
        EmployeeShiftDeduction.objects.create(
            organisation=organisation,
            outlet=outlet,
            operational_shift=parent_shift,
            shift_card=card,
            employee=employee,
            deduction_type=d['deduction_type'],
            direction=d['direction'],
            amount=d['amount'],
            description=d['description'],
            payee=d['payee'],
            reference_number=d['reference_number'],
            occurred_at=d['occurred_at'],
            approval_status=EmployeeShiftDeduction.APPROVAL_PENDING,
            created_by=user
        )

    # 12. Save EmployeeShiftSettlement
    result_val = (
        EmployeeShiftSettlement.RESULT_BALANCED if difference_amount == Decimal('0.00')
        else (EmployeeShiftSettlement.RESULT_SHORTAGE if difference_amount < Decimal('0.00')
              else EmployeeShiftSettlement.RESULT_EXCESS)
    )

    settlement, _ = EmployeeShiftSettlement.objects.update_or_create(
        operational_shift=parent_shift,
        employee=employee,
        defaults={
            'organisation': organisation,
            'outlet': outlet,
            'shift_card': card,
            'expected_sale_amount': expected_sale_amount,
            'cash_amount': cash_amount,
            'card_amount': cards_amount,
            'upi_amount': upi_amount,
            'fleet_card_amount': fleet_amount,
            'credit_slip_amount': credit_amount,
            'approved_increase_adjustments': existing_approved_inc,
            'approved_decrease_adjustments': existing_approved_dec,
            'total_accounted_amount': total_accounted,
            'difference_amount': difference_amount,
            'result': result_val,
            'shortage_acknowledged': is_shortage_excess_acknowledged,
            'shortage_acknowledged_notes': shortage_excess_acknowledgement_note,
            'status': EmployeeShiftSettlement.STATUS_RECONCILED
        }
    )

    # 13. Recheck continuity chain for affected nozzles
    for nozzle in affected_nozzles_for_continuity:
        recheck_chronological_continuity_chain(
            outlet=outlet,
            nozzle=nozzle,
            from_business_date=business_date,
            from_starts_at=shift_definition.starts_at
        )

    # 14. Audit Log
    CollectionAuditLog.objects.create(
        organisation=organisation,
        outlet=outlet,
        shift=parent_shift,
        shift_card=card,
        employee=employee,
        actor=user,
        event_type=CollectionAuditLog.EVENT_CARD_UPDATED if card_id else CollectionAuditLog.EVENT_CARD_CREATED,
        reason="Shift Card direct document save",
        metadata={
            'expected_amount': str(expected_sale_amount),
            'accounted_amount': str(total_accounted),
            'difference_amount': str(difference_amount),
            'result': result_val,
            'is_acknowledged': is_shortage_excess_acknowledged
        }
    )

    # 15. Sync inventory ledger movements (Milestone 11)
    from apps.inventory.services import sync_shift_card_stock_movements
    sync_shift_card_stock_movements(card, user)

    return card


@transaction.atomic
def void_shift_card(card: EmployeeShiftCard, user, reason: str) -> EmployeeShiftCard:
    """
    Voids an EmployeeShiftCard with mandatory reason:
    - Marks status as void
    - Retains complete historical audit log
    - Excludes from active totals
    """
    if not reason or not reason.strip():
        raise ValidationError({'reason': "A mandatory reason is required to void a Shift Card."})
    if card.parent_shift.is_locked:
        raise ValidationError({'shift': "Cannot void a card in a locked shift."})

    card.status = EmployeeShiftCard.STATUS_VOID
    card.voided_by = user
    card.voided_at = timezone.now()
    card.void_reason = reason.strip()
    card.save()

    # Soft void linked collections and credit slips
    card.collections.filter(status='active').update(
        status=EmployeeShiftCollection.STATUS_VOID,
        voided_by=user,
        voided_at=timezone.now(),
        void_reason=f"Shift Card voided: {reason.strip()}"
    )
    card.credit_slips.filter(status='active').update(
        status=FuelCreditSlip.STATUS_VOID,
        voided_by=user,
        voided_at=timezone.now(),
        void_reason=f"Shift Card voided: {reason.strip()}"
    )
    card.deductions.filter(status='active').update(
        status=EmployeeShiftDeduction.STATUS_VOID,
        voided_by=user,
        voided_at=timezone.now(),
        void_reason=f"Shift Card voided: {reason.strip()}"
    )

    # Reverse inventory ledger movements (Milestone 11)
    from apps.inventory.services import reverse_shift_card_stock_movements
    reverse_shift_card_stock_movements(card, user, reason.strip())

    # Recheck continuity chain for nozzles covered by this card
    for m in card.meters.all():
        recheck_chronological_continuity_chain(
            outlet=card.outlet,
            nozzle=m.nozzle,
            from_business_date=card.parent_shift.business_date,
            from_starts_at=card.parent_shift.shift_definition.starts_at
        )

    # Audit log
    CollectionAuditLog.objects.create(
        organisation=card.organisation,
        outlet=card.outlet,
        shift=card.parent_shift,
        shift_card=card,
        employee=card.employee,
        actor=user,
        event_type=CollectionAuditLog.EVENT_CARD_VOIDED,
        reason=reason.strip()
    )

    return card


@transaction.atomic
def lock_shift(shift: OperationalShift, user, reason: str = '', lock_source: str = 'manual', cash_account=None) -> OperationalShift:
    """
    Locks an OperationalShift:
    - Prohibits locking if unresolved meter continuity conflicts exist
    - Sets is_locked=True
    """
    shift = OperationalShift.objects.select_for_update().select_related(
        'organisation', 'outlet', 'shift_definition',
    ).get(pk=shift.pk)
    if shift.is_locked:
        return shift
    # Check for blocking continuity conflicts
    has_conflict = ShiftNozzleMeter.objects.filter(
        shift=shift,
        continuity_status=ShiftNozzleMeter.CONTINUITY_CONFLICT,
        is_conflict_acknowledged=False
    ).exists()
    if has_conflict:
        raise ValidationError({'shift': "Cannot lock shift: Unresolved meter continuity conflicts exist. Please resolve or acknowledge them first."})

    from apps.accounting.posting import post_shift_accounting
    post_shift_accounting(shift, cash_account=cash_account, user=user)

    shift.is_locked = True
    shift.locked_at = timezone.now()
    shift.locked_by = user
    shift.lock_source = lock_source
    shift.save()

    CollectionAuditLog.objects.create(
        organisation=shift.organisation,
        outlet=shift.outlet,
        shift=shift,
        actor=user,
        event_type=CollectionAuditLog.EVENT_SHIFT_LOCKED,
        reason=reason.strip() if reason else f"Shift locked via {lock_source}"
    )

    return shift


@transaction.atomic
def unlock_shift(shift: OperationalShift, user, reason: str) -> OperationalShift:
    """
    Controlled unlock of an OperationalShift:
    - Requires mandatory reason
    """
    if not reason or not reason.strip():
        raise ValidationError({'reason': "A mandatory reason is required to unlock a shift."})

    shift = OperationalShift.objects.select_for_update().select_related(
        'organisation', 'outlet', 'shift_definition',
    ).get(pk=shift.pk)
    if not shift.is_locked:
        return shift

    from apps.accounting.posting import reverse_shift_accounting
    reverse_shift_accounting(shift, reason.strip(), user=user)

    shift.is_locked = False
    shift.locked_at = None
    shift.locked_by = None
    shift.lock_source = None
    shift.save()

    CollectionAuditLog.objects.create(
        organisation=shift.organisation,
        outlet=shift.outlet,
        shift=shift,
        actor=user,
        event_type=CollectionAuditLog.EVENT_SHIFT_UNLOCKED,
        reason=reason.strip()
    )

    return shift


@transaction.atomic
def approve_shift_deduction(deduction, user, reason: str = "Approved by manager") -> EmployeeShiftDeduction:
    """
    Manager approval for a shift deduction/expense.
    Only approved deductions affect employee settlement.
    """
    if not isinstance(deduction, EmployeeShiftDeduction):
        deduction = EmployeeShiftDeduction.objects.get(id=deduction)

    if not reason or not reason.strip():
        raise ValidationError({'reason': "Mandatory reason required when approving a deduction."})
    if deduction.status != 'active':
        raise ValidationError({'deduction': "Cannot approve an inactive/void deduction."})

    deduction.approval_status = EmployeeShiftDeduction.APPROVAL_APPROVED
    deduction.approved_by = user
    deduction.approved_at = timezone.now()
    deduction.approval_reason = reason.strip()
    deduction.save()

    # Recalculate settlement if linked
    _recalculate_settlement_for_card(deduction.shift_card)

    CollectionAuditLog.objects.create(
        organisation=deduction.organisation,
        outlet=deduction.outlet,
        shift=deduction.operational_shift,
        shift_card=deduction.shift_card,
        employee=deduction.employee,
        actor=user,
        event_type=CollectionAuditLog.EVENT_DEDUCTION_APPROVED,
        reason=reason.strip()
    )

    return deduction


@transaction.atomic
def reject_shift_deduction(deduction, user, reason: str) -> EmployeeShiftDeduction:
    """
    Manager rejection for a shift deduction/expense.
    """
    if not isinstance(deduction, EmployeeShiftDeduction):
        deduction = EmployeeShiftDeduction.objects.get(id=deduction)

    if not reason or not reason.strip():
        raise ValidationError({'reason': "Mandatory reason required when rejecting a deduction."})
    if deduction.status != 'active':
        raise ValidationError({'deduction': "Cannot reject an inactive/void deduction."})

    deduction.approval_status = EmployeeShiftDeduction.APPROVAL_REJECTED
    deduction.rejected_by = user
    deduction.rejected_at = timezone.now()
    deduction.rejection_reason = reason.strip()
    deduction.save()

    _recalculate_settlement_for_card(deduction.shift_card)

    CollectionAuditLog.objects.create(
        organisation=deduction.organisation,
        outlet=deduction.outlet,
        shift=deduction.operational_shift,
        shift_card=deduction.shift_card,
        employee=deduction.employee,
        actor=user,
        event_type=CollectionAuditLog.EVENT_DEDUCTION_REJECTED,
        reason=reason.strip()
    )

    return deduction


def _recalculate_settlement_for_card(card):
    """
    Helper to recalculate EmployeeShiftSettlement totals when deductions are approved/rejected.
    """
    if not card or not hasattr(card, 'settlement'):
        return

    settlement = card.settlement
    parent_shift = card.parent_shift
    employee = card.employee

    appr_inc = EmployeeShiftDeduction.objects.filter(
        operational_shift=parent_shift,
        employee=employee,
        status='active',
        approval_status=EmployeeShiftDeduction.APPROVAL_APPROVED,
        direction=EmployeeShiftDeduction.DIRECTION_INCREASES
    ).aggregate(s=models.Sum('amount'))['s'] or Decimal('0.00')

    appr_dec = EmployeeShiftDeduction.objects.filter(
        operational_shift=parent_shift,
        employee=employee,
        status='active',
        approval_status=EmployeeShiftDeduction.APPROVAL_APPROVED,
        direction=EmployeeShiftDeduction.DIRECTION_DECREASES
    ).aggregate(s=models.Sum('amount'))['s'] or Decimal('0.00')

    settlement.approved_increase_adjustments = appr_inc
    settlement.approved_decrease_adjustments = appr_dec
    settlement.total_accounted_amount = (
        settlement.cash_amount + settlement.card_amount + settlement.upi_amount +
        settlement.fleet_card_amount + settlement.credit_slip_amount + appr_inc - appr_dec
    )
    settlement.difference_amount = settlement.total_accounted_amount - settlement.expected_sale_amount
    settlement.result = (
        EmployeeShiftSettlement.RESULT_BALANCED if settlement.difference_amount == Decimal('0.00')
        else (EmployeeShiftSettlement.RESULT_SHORTAGE if settlement.difference_amount < Decimal('0.00')
              else EmployeeShiftSettlement.RESULT_EXCESS)
    )
    settlement.save()

