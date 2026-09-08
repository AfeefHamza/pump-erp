# apps/shifts/selectors.py
from datetime import datetime, time, date
from decimal import Decimal, ROUND_HALF_UP
from django.db import models
from .models import ShiftDefinition, ShiftRoster, ShiftStaffAssignment, ShiftNozzleAssignment
from apps.forecourt.models import Nozzle

def shift_definitions_for_outlet(outlet) -> models.QuerySet:
    return ShiftDefinition.objects.filter(outlet=outlet)


def active_shift_definitions_for_outlet(outlet) -> models.QuerySet:
    return ShiftDefinition.objects.filter(outlet=outlet, is_active=True)


def check_shift_overlaps(outlet, exclude_id=None) -> list[dict]:
    """
    Checks all active shift definitions for an outlet and returns pairs of overlapping shifts.
    """
    shifts = list(ShiftDefinition.objects.filter(outlet=outlet, is_active=True))
    if exclude_id:
        shifts = [s for s in shifts if s.id != exclude_id]

    overlaps = []
    
    # Helper to check if two time intervals overlap (including midnight crossing)
    # A time interval is represented as (start, end) on a 24h clock.
    def times_overlap(s1, e1, s2, e2):
        # Normalize into minutes from midnight
        m1_start = s1.hour * 60 + s1.minute
        m1_end = e1.hour * 60 + e1.minute
        m2_start = s2.hour * 60 + s2.minute
        m2_end = e2.hour * 60 + e2.minute

        # Get list of active minute slots for shift 1
        if m1_end <= m1_start: # crosses midnight
            s1_slots = set(range(m1_start, 24*60)) | set(range(0, m1_end))
        else:
            s1_slots = set(range(m1_start, m1_end))

        # Get list of active minute slots for shift 2
        if m2_end <= m2_start: # crosses midnight
            s2_slots = set(range(m2_start, 24*60)) | set(range(0, m2_end))
        else:
            s2_slots = set(range(m2_start, m2_end))

        # Overlap if intersection is non-empty
        return len(s1_slots & s2_slots) > 0

    for i in range(len(shifts)):
        for j in range(i + 1, len(shifts)):
            s1 = shifts[i]
            s2 = shifts[j]
            if times_overlap(s1.starts_at, s1.ends_at, s2.starts_at, s2.ends_at):
                overlaps.append({
                    'shift1': {'id': s1.id, 'name': s1.name, 'code': s1.code, 'time': f"{s1.starts_at}-{s1.ends_at}"},
                    'shift2': {'id': s2.id, 'name': s2.name, 'code': s2.code, 'time': f"{s2.starts_at}-{s2.ends_at}"},
                    'message': f"Shift '{s1.name}' ({s1.starts_at.strftime('%H:%M')} to {s1.ends_at.strftime('%H:%M')}) overlaps with Shift '{s2.name}' ({s2.starts_at.strftime('%H:%M')} to {s2.ends_at.strftime('%H:%M')})."
                })
    return overlaps


def get_roster_details(roster: ShiftRoster) -> dict:
    """
    Returns complete details of a roster, including assignments and nozzle mapping status.
    """
    staff_assignments = roster.staff_assignments.select_related('employee', 'duty_designation').prefetch_related('nozzle_assignments__nozzle')
    
    # Get all active nozzles at this outlet
    all_nozzles = Nozzle.objects.filter(outlet=roster.outlet, status=Nozzle.STATUS_ACTIVE).select_related('dispenser', 'tank', 'tank__product')
    
    # Map assigned nozzles
    assigned_nozzle_ids = set()
    nozzle_mapping = {} # nozzle_id -> staff_assignment_id
    for assignment in staff_assignments:
        for na in assignment.nozzle_assignments.all():
            assigned_nozzle_ids.add(na.nozzle_id)
            nozzle_mapping[na.nozzle_id] = assignment.id

    nozzle_list = []
    for nozzle in all_nozzles:
        nozzle_list.append({
            'id': nozzle.id,
            'code': nozzle.code,
            'name': nozzle.name,
            'dispenser_id': nozzle.dispenser_id,
            'dispenser_name': nozzle.dispenser.name,
            'product_name': nozzle.product.name,
            'tank_code': nozzle.tank.code,
            'assigned_to_staff_id': nozzle_mapping.get(nozzle.id),
            'is_assigned': nozzle.id in assigned_nozzle_ids
        })

    return {
        'roster_id': roster.id,
        'outlet_id': roster.outlet_id,
        'business_date': roster.business_date,
        'shift_definition_id': roster.shift_definition_id,
        'is_locked': roster.is_locked,
        'notes': roster.notes,
        'staff_assignments': staff_assignments,
        'nozzles': nozzle_list
    }


def get_open_shift_for_outlet(outlet):
    """
    Returns the currently active open OperationalShift for the outlet, or None.
    """
    from .models import OperationalShift
    return OperationalShift.objects.filter(
        outlet=outlet,
        status=OperationalShift.STATUS_OPEN
    ).select_related('shift_definition', 'opened_by').first()


def derive_nozzle_opening_reading(outlet, nozzle, as_of_time=None, shift_date=None, shift_def=None, exclude_shift_id=None, business_date=None, shift_definition=None) -> dict:
    """
    Derives opening totalizer for a nozzle:
    1. Preceding Shift Card / shift closing reading (chronological sequence by date & shift definition).
    2. Valid Nozzle Commissioning record on or before as_of_time.
    3. Confirmed Opening Balance on or before as_of_time.
    4. If earlier shift expected but missing -> physical_slip_missing_predecessor (awaiting_predecessor).
    5. If never commissioned -> manual_exception (requires_commissioning=True).
    """
    from .models import OperationalShift, ShiftNozzleMeter
    from apps.operations.models import OpeningBalanceBatch, NozzleOpeningBalance, NozzleCommissioning
    from django.utils import timezone
    from datetime import datetime, time

    from apps.forecourt.models import Nozzle
    if isinstance(outlet, Nozzle):
        if isinstance(nozzle, (datetime, date)):
            shift_date = shift_date or nozzle
        outlet, nozzle = outlet.outlet, outlet

    shift_date = shift_date or business_date
    shift_def = shift_def or shift_definition
    effective_cutoff = as_of_time or timezone.now()

    # 1. Chronological preceding shift closing
    prev_meter_qs = ShiftNozzleMeter.objects.filter(
        shift__outlet=outlet,
        nozzle=nozzle,
        closing_reading__isnull=False
    )
    if exclude_shift_id:
        prev_meter_qs = prev_meter_qs.exclude(shift_id=exclude_shift_id)

    if shift_date and shift_def:
        prev_meter_qs = prev_meter_qs.filter(
            models.Q(shift__business_date__lt=shift_date) |
            models.Q(shift__business_date=shift_date, shift__shift_definition__starts_at__lt=shift_def.starts_at)
        ).order_by(
            '-shift__business_date', '-shift__shift_definition__starts_at', '-shift__created_at'
        )
    elif as_of_time:
        prev_meter_qs = prev_meter_qs.filter(
            models.Q(shift__closed_at__lte=as_of_time) |
            models.Q(shift__scheduled_starts_at__lt=as_of_time)
        ).order_by(
            '-shift__business_date', '-shift__scheduled_starts_at', '-shift__created_at'
        )
    else:
        prev_meter_qs = prev_meter_qs.order_by(
            '-shift__business_date', '-shift__scheduled_starts_at', '-shift__created_at'
        )

    prev_meter = prev_meter_qs.select_related('shift', 'shift__shift_definition').first()

    if prev_meter and prev_meter.closing_reading is not None:
        return {
            'reading': prev_meter.closing_reading,
            'source': ShiftNozzleMeter.SOURCE_PREVIOUS_SHIFT_CARD,
            'reference': str(prev_meter.shift.id),
            'source_description': f"Previous Shift: {prev_meter.shift.shift_definition.name} ({prev_meter.shift.business_date})",
            'continuity_status': ShiftNozzleMeter.CONTINUITY_VALID,
            'requires_commissioning': False
        }

    # 2. Valid Nozzle Commissioning reading
    comm_qs = NozzleCommissioning.objects.filter(
        outlet=outlet,
        nozzle=nozzle,
        effective_at__lte=effective_cutoff
    ).order_by('-effective_at', '-created_at')
    commissioning = comm_qs.first()

    if commissioning:
        return {
            'reading': commissioning.initial_totalizer,
            'source': ShiftNozzleMeter.SOURCE_COMMISSIONING,
            'reference': str(commissioning.id),
            'source_description': "Opening source: Nozzle Commissioning",
            'continuity_status': ShiftNozzleMeter.CONTINUITY_VALID,
            'requires_commissioning': False
        }

    # 3. Confirmed Opening Balance
    ob_qs = NozzleOpeningBalance.objects.filter(
        batch__outlet=outlet,
        batch__status=OpeningBalanceBatch.STATUS_CONFIRMED,
        nozzle=nozzle
    )
    if as_of_time:
        ob_qs = ob_qs.filter(batch__effective_at__lte=as_of_time)

    confirmed_balance = ob_qs.select_related('batch').order_by('-batch__confirmed_at').first()

    if confirmed_balance:
        return {
            'reading': confirmed_balance.totalizer_reading,
            'source': ShiftNozzleMeter.SOURCE_INITIAL_OPENING_BALANCE,
            'reference': str(confirmed_balance.batch.id),
            'source_description': "Opening source: Initial Opening Balance",
            'continuity_status': ShiftNozzleMeter.CONTINUITY_VALID,
            'requires_commissioning': False
        }

    # 4. Check if nozzle had ANY baseline historically on or before effective_cutoff
    has_any_comm = NozzleCommissioning.objects.filter(outlet=outlet, nozzle=nozzle, effective_at__lte=effective_cutoff).exists()
    has_any_ob = NozzleOpeningBalance.objects.filter(
        batch__outlet=outlet,
        batch__status=OpeningBalanceBatch.STATUS_CONFIRMED,
        nozzle=nozzle
    )
    if as_of_time:
        has_any_ob = has_any_ob.filter(batch__effective_at__lte=as_of_time)
    has_any_ob = has_any_ob.exists()

    has_any_prior_meters = prev_meter_qs.exists()

    if has_any_comm or has_any_ob or has_any_prior_meters:
        # Predecessor shift is simply missing in backdated entry
        return {
            'reading': None,
            'source': ShiftNozzleMeter.SOURCE_PHYSICAL_SLIP_MISSING_PREDECESSOR,
            'reference': None,
            'source_description': "Opening source: Physical Slip (Missing Predecessor)",
            'continuity_status': ShiftNozzleMeter.CONTINUITY_AWAITING_PREDECESSOR,
            'requires_commissioning': False
        }

    # 5. Uncommissioned nozzle: baseline required
    return {
        'reading': None,
        'source': ShiftNozzleMeter.SOURCE_MANUAL_EXCEPTION,
        'reference': None,
        'source_description': "Commissioning Required: Nozzle has no opening balance or commissioning baseline.",
        'continuity_status': ShiftNozzleMeter.CONTINUITY_EXCEPTION,
        'requires_commissioning': True
    }


def get_historical_nozzles_for_shift(outlet, as_of_time=None) -> list:
    """
    Returns nozzles that were operating at this outlet as of the physical shift time.
    Excludes nozzles commissioned strictly after as_of_time unless they had an earlier baseline.
    """
    from apps.operations.models import NozzleCommissioning, NozzleOpeningBalance, OpeningBalanceBatch
    from apps.forecourt.models import Nozzle
    from django.utils import timezone
    cutoff = as_of_time or timezone.now()

    all_outlet_nozzles = list(
        Nozzle.objects.filter(outlet=outlet)
        .select_related('dispenser', 'tank', 'tank__product')
        .order_by('dispenser__name', 'code')
    )

    valid_nozzles = []
    for n in all_outlet_nozzles:
        # If created strictly after cutoff, check if backdated commissioning exists
        if n.created_at and n.created_at > cutoff:
            has_earlier_comm = NozzleCommissioning.objects.filter(nozzle=n, effective_at__lte=cutoff).exists()
            has_earlier_ob = NozzleOpeningBalance.objects.filter(
                nozzle=n, batch__status=OpeningBalanceBatch.STATUS_CONFIRMED, batch__effective_at__lte=cutoff
            ).exists()
            if not (has_earlier_comm or has_earlier_ob):
                continue

        # Check if first commissioned strictly after cutoff
        comm_after = NozzleCommissioning.objects.filter(nozzle=n, effective_at__gt=cutoff).exists()
        if comm_after:
            comm_before = NozzleCommissioning.objects.filter(nozzle=n, effective_at__lte=cutoff).exists()
            ob_before = NozzleOpeningBalance.objects.filter(
                nozzle=n, batch__status=OpeningBalanceBatch.STATUS_CONFIRMED, batch__effective_at__lte=cutoff
            ).exists()
            if not (comm_before or ob_before):
                continue

        valid_nozzles.append(n)

    return valid_nozzles


def get_historical_employees_for_shift(outlet, business_date=None) -> list:
    """
    Returns employees active or historically assigned to this outlet on the business date.
    """
    from apps.employees.models import Employee
    from datetime import date
    target_date = business_date or date.today()

    employees = list(
        Employee.objects.filter(
            organisation=outlet.organisation,
            outlet_assignments__outlet=outlet
        ).select_related('designation').distinct().order_by('display_name')
    )

    valid_employees = []
    for emp in employees:
        if emp.joined_on and emp.joined_on > target_date:
            continue
        if emp.left_on and emp.left_on < target_date:
            continue
        valid_employees.append(emp)

    return valid_employees


def get_last_entered_business_date(outlet, user=None) -> str:
    """
    Returns the last entered business date for this outlet/user, or today if none.
    """
    from .models import OperationalShift, EmployeeShiftCard
    from datetime import date

    cards = EmployeeShiftCard.objects.filter(outlet=outlet)
    if user:
        user_card = cards.filter(created_by=user).order_by('-created_at').first()
        if user_card:
            return str(user_card.parent_shift.business_date)

    latest_card = cards.order_by('-created_at').first()
    if latest_card:
        return str(latest_card.parent_shift.business_date)

    latest_shift = OperationalShift.objects.filter(outlet=outlet).order_by('-created_at').first()
    if latest_shift:
        return str(latest_shift.business_date)

    return str(date.today())


def calculate_shift_totals(shift) -> dict:
    """
    Calculates aggregated shift totals server-side:
    - Per nozzle
    - Per employee
    - Per product
    - Per shift
    """
    from decimal import Decimal
    meters = list(
        shift.meters.select_related(
            'nozzle', 'nozzle__dispenser', 'nozzle__tank', 'nozzle__tank__product',
            'staff_assignment', 'staff_assignment__source_employee'
        ).prefetch_related('price_segments', 'testing_records')
    )

    # Initialize employee map for ALL staff members on shift (including non-nozzle staff)
    employee_map = {}
    for sm in shift.staff_members.select_related('source_employee').all():
        emp = sm.source_employee
        e_id = str(emp.id)
        if e_id not in employee_map:
            employee_map[e_id] = {
                'employee_id': e_id,
                'staff_id': str(sm.id),
                'employee_name': sm.employee_name_snapshot,
                'employee_code': sm.employee_code_snapshot,
                'designation': sm.designation_snapshot,
                'effective_from': sm.effective_from.isoformat() if sm.effective_from else None,
                'effective_to': sm.effective_to.isoformat() if sm.effective_to else None,
                'assigned_nozzles': [],
                'nozzle_codes': [],
                'gross_quantity': Decimal('0.000'),
                'testing_quantity': Decimal('0.000'),
                'sale_quantity': Decimal('0.000'),
                'sale_amount': Decimal('0.00')
            }

    # Pre-fetch all assignments on this shift
    all_assignments = list(
        shift.nozzle_assignments.select_related('shift_staff', 'shift_staff__source_employee')
        .order_by('effective_from')
    )

    nozzle_totals = []
    product_map = {}

    total_gross = Decimal('0.000')
    total_testing = Decimal('0.000')
    total_returned_testing = Decimal('0.000')
    total_unreturned_testing = Decimal('0.000')
    total_sale_qty = Decimal('0.000')
    total_stock_depletion = Decimal('0.000')
    total_fuel_sale_amount = Decimal('0.00')

    for meter in meters:
        prod = meter.nozzle.tank.product
        emp_staff = meter.staff_assignment

        # Calculate testing
        tests = list(meter.testing_records.all())
        m_testing = sum((t.quantity for t in tests), Decimal('0.000'))
        m_ret_testing = sum((t.quantity for t in tests if t.returned_to_tank), Decimal('0.000'))
        m_unret_testing = sum((t.quantity for t in tests if not t.returned_to_tank), Decimal('0.000'))

        # Segments
        segments = list(meter.price_segments.all().order_by('sequence'))
        m_gross = Decimal('0.000')
        m_sale_amount = Decimal('0.00')

        for seg in segments:
            if seg.closing_reading is not None:
                seg_gross = max(Decimal('0.000'), seg.closing_reading - seg.opening_reading)
            else:
                seg_gross = Decimal('0.000')
            m_gross += seg_gross
            m_sale_amount += seg.sale_amount

        m_sale_qty = max(Decimal('0.000'), m_gross - m_testing)
        m_stock_depletion = max(Decimal('0.000'), m_gross - m_ret_testing)

        nozzle_totals.append({
            'meter_id': str(meter.id),
            'nozzle_id': str(meter.nozzle.id),
            'nozzle_code': meter.nozzle.code,
            'nozzle_name': meter.nozzle.name,
            'dispenser_name': meter.nozzle.dispenser.name,
            'product_id': str(prod.id),
            'product_name': prod.name,
            'product_code': prod.code,
            'employee_name': emp_staff.employee_name_snapshot if emp_staff else 'Unassigned',
            'opening_reading': meter.opening_reading,
            'closing_reading': meter.closing_reading,
            'gross_quantity': m_gross,
            'testing_quantity': m_testing,
            'returned_testing': m_ret_testing,
            'unreturned_testing': m_unret_testing,
            'sale_quantity': m_sale_qty,
            'stock_depletion_quantity': m_stock_depletion,
            'sale_amount': m_sale_amount
        })

        # Product summary aggregation
        p_id = str(prod.id)
        if p_id not in product_map:
            product_map[p_id] = {
                'product_id': p_id,
                'product_name': prod.name,
                'product_code': prod.code,
                'gross_quantity': Decimal('0.000'),
                'testing_quantity': Decimal('0.000'),
                'returned_testing': Decimal('0.000'),
                'unreturned_testing': Decimal('0.000'),
                'sale_quantity': Decimal('0.000'),
                'stock_depletion': Decimal('0.000'),
                'sale_amount': Decimal('0.00')
            }
        product_map[p_id]['gross_quantity'] += m_gross
        product_map[p_id]['testing_quantity'] += m_testing
        product_map[p_id]['returned_testing'] += m_ret_testing
        product_map[p_id]['unreturned_testing'] += m_unret_testing
        product_map[p_id]['sale_quantity'] += m_sale_qty
        product_map[p_id]['stock_depletion'] += m_stock_depletion
        product_map[p_id]['sale_amount'] += m_sale_amount

        # Exact interval employee allocation for this nozzle
        nozzle_assignments = [a for a in all_assignments if a.nozzle_id == meter.nozzle_id]
        if not nozzle_assignments and emp_staff:
            # Fallback if no specific assignment records exist
            e_id = str(emp_staff.source_employee_id)
            if e_id in employee_map:
                if meter.nozzle.code not in employee_map[e_id]['assigned_nozzles']:
                    employee_map[e_id]['assigned_nozzles'].append(meter.nozzle.code)
                    employee_map[e_id]['nozzle_codes'].append(meter.nozzle.code)
                employee_map[e_id]['gross_quantity'] += m_gross
                employee_map[e_id]['testing_quantity'] += m_testing
                employee_map[e_id]['sale_quantity'] += m_sale_qty
                employee_map[e_id]['sale_amount'] += m_sale_amount
        else:
            for assignment in nozzle_assignments:
                asm_staff = assignment.shift_staff
                asm_emp = asm_staff.source_employee
                e_id = str(asm_emp.id)

                if e_id in employee_map:
                    if meter.nozzle.code not in employee_map[e_id]['assigned_nozzles']:
                        employee_map[e_id]['assigned_nozzles'].append(meter.nozzle.code)
                        employee_map[e_id]['nozzle_codes'].append(meter.nozzle.code)

                # Meter interval handled by this employee
                a_start = assignment.opening_reading if assignment.opening_reading is not None else meter.opening_reading
                if assignment.closing_reading is not None:
                    a_end = assignment.closing_reading
                elif meter.closing_reading is not None:
                    a_end = meter.closing_reading
                else:
                    a_end = a_start

                if a_end < a_start:
                    a_end = a_start

                a_gross = a_end - a_start

                # Exact intersection with price segments
                a_amount = Decimal('0.00')
                for seg in segments:
                    seg_start = seg.opening_reading
                    seg_end = seg.closing_reading if seg.closing_reading is not None else (meter.closing_reading if meter.closing_reading is not None else seg_start)
                    overlap_start = max(a_start, seg_start)
                    overlap_end = min(a_end, seg_end)
                    if overlap_end > overlap_start:
                        vol = overlap_end - overlap_start
                        a_amount += (vol * seg.unit_price).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

                # Exact testing attribution for this assignment period
                def is_test_in_assignment(t, asm):
                    if asm.effective_from and t.occurred_at < asm.effective_from:
                        return False
                    if asm.effective_to and t.occurred_at > asm.effective_to:
                        return False
                    return True

                a_tests = [t for t in tests if is_test_in_assignment(t, assignment)]
                a_testing = sum((t.quantity for t in a_tests), Decimal('0.000'))
                a_sale_qty = max(Decimal('0.000'), a_gross - a_testing)

                # Deduct testing amount at applicable segment price
                for t in a_tests:
                    t_seg = segments[0] if segments else None
                    for s in segments:
                        if s.starts_at <= t.occurred_at and (s.ends_at is None or s.ends_at >= t.occurred_at):
                            t_seg = s
                            break
                    if t_seg:
                        t_amt = (t.quantity * t_seg.unit_price).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                        a_amount = max(Decimal('0.00'), a_amount - t_amt)

                if e_id in employee_map:
                    employee_map[e_id]['gross_quantity'] += a_gross
                    employee_map[e_id]['testing_quantity'] += a_testing
                    employee_map[e_id]['sale_quantity'] += a_sale_qty
                    employee_map[e_id]['sale_amount'] += a_amount

        # Overall shift totals
        total_gross += m_gross
        total_testing += m_testing
        total_returned_testing += m_ret_testing
        total_unreturned_testing += m_unret_testing
        total_sale_qty += m_sale_qty
        total_stock_depletion += m_stock_depletion
        total_fuel_sale_amount += m_sale_amount

    return {
        'shift_id': str(shift.id),
        'nozzles': nozzle_totals,
        'products': list(product_map.values()),
        'employees': list(employee_map.values()),
        'overall': {
            'total_gross_quantity': total_gross,
            'total_testing_quantity': total_testing,
            'returned_testing_quantity': total_returned_testing,
            'unreturned_testing_quantity': total_unreturned_testing,
            'total_sale_quantity': total_sale_qty,
            'total_stock_depletion': total_stock_depletion,
            'total_fuel_sale_amount': total_fuel_sale_amount
        }
    }


def get_shift_staff_history(shift) -> dict:
    """
    Returns structured timeline of nozzle handovers and staff assignment history.
    """
    nozzle_handovers = []
    for na in shift.nozzle_assignments.select_related('shift_staff', 'nozzle', 'created_by').order_by('-effective_from'):
        nozzle_handovers.append({
            'id': str(na.id),
            'nozzle_id': str(na.nozzle_id),
            'nozzle_code': na.nozzle.code,
            'nozzle_name': na.nozzle.name,
            'employee_name': na.shift_staff.employee_name_snapshot,
            'employee_code': na.shift_staff.employee_code_snapshot,
            'effective_from': na.effective_from.isoformat(),
            'effective_to': na.effective_to.isoformat() if na.effective_to else None,
            'opening_reading': str(na.opening_reading) if na.opening_reading is not None else None,
            'closing_reading': str(na.closing_reading) if na.closing_reading is not None else None,
            'assignment_type': na.assignment_type,
            'reason': na.reason,
            'is_active': na.effective_to is None,
            'created_by_name': na.created_by.get_full_name() or na.created_by.email if na.created_by else None,
        })

    return {
        'shift_id': str(shift.id),
        'nozzle_handovers': nozzle_handovers
    }



def preview_shift_closing_data(shift) -> dict:
    """
    Validates readiness to close shift, returning blocking errors, warnings, and totals preview.
    """
    from apps.forecourt.models import Tank
    totals = calculate_shift_totals(shift)
    blocking_errors = []
    warnings = []

    if shift.status != 'open':
        blocking_errors.append("Shift is not open.")

    # Validate meters
    meters = list(shift.meters.select_related('nozzle').prefetch_related('price_segments', 'testing_records'))
    for m in meters:
        if m.closing_reading is None:
            blocking_errors.append(f"Nozzle {m.nozzle.code} is missing closing totalizer reading.")
        elif m.closing_reading < m.opening_reading:
            # Check if meter events explain lower reading
            has_events = m.meter_events.exists()
            if not has_events:
                blocking_errors.append(f"Nozzle {m.nozzle.code}: Closing reading ({m.closing_reading}) cannot be lower than opening reading ({m.opening_reading}).")

        # Price segments check
        active_seg = m.price_segments.filter(ends_at__isnull=True).order_by('-sequence').first()
        if active_seg and active_seg.opening_reading is not None and m.closing_reading is not None:
            if m.closing_reading < active_seg.opening_reading:
                blocking_errors.append(f"Nozzle {m.nozzle.code}: Closing reading ({m.closing_reading}) is lower than active segment opening reading ({active_seg.opening_reading}).")

        # Testing exceeding gross dispensing
        gross = Decimal('0.000')
        for s in m.price_segments.all():
            if s.closing_reading is not None:
                gross += max(Decimal('0.000'), s.closing_reading - s.opening_reading)
            elif m.closing_reading is not None:
                gross += max(Decimal('0.000'), m.closing_reading - s.opening_reading)

        test_qty = sum((t.quantity for t in m.testing_records.all()), Decimal('0.000'))
        if test_qty > gross:
            blocking_errors.append(f"Nozzle {m.nozzle.code}: Testing quantity ({test_qty}L) cannot exceed dispensed meter quantity ({gross}L).")

    # Dip observations checks (generate warnings, not blocking errors)
    active_tanks = Tank.objects.filter(outlet=shift.outlet, status=Tank.STATUS_ACTIVE)
    dips = list(shift.dip_observations.all())
    opening_dip_tank_ids = {d.tank_id for d in dips if d.observation_type == 'opening'}
    closing_dip_tank_ids = {d.tank_id for d in dips if d.observation_type == 'closing'}

    missing_opening_dips = [t.code for t in active_tanks if t.id not in opening_dip_tank_ids]
    missing_closing_dips = [t.code for t in active_tanks if t.id not in closing_dip_tank_ids]

    if missing_opening_dips:
        warnings.append(f"Tanks missing opening dip observation: {', '.join(missing_opening_dips)}.")
    if missing_closing_dips:
        warnings.append(f"Tanks missing closing dip observation: {', '.join(missing_closing_dips)}.")

    return {
        'can_close': len(blocking_errors) == 0,
        'blocking_errors': blocking_errors,
        'warnings': warnings,
        'meters_summary': {
            'total': len(meters),
            'completed': sum(1 for m in meters if m.closing_reading is not None),
            'pending': sum(1 for m in meters if m.closing_reading is None)
        },
        'totals': totals
    }


def check_can_reopen_shift(shift) -> tuple[bool, str | None]:
    """
    Checks if a closed shift can be reopened:
    - Must be closed
    - Must be the latest closed shift for this outlet
    - No later shift may exist (no shift created or opened after this one)
    """
    from .models import OperationalShift
    if shift.status != OperationalShift.STATUS_CLOSED:
        return False, "Only closed shifts can be reopened."

    if shift.settlements.filter(status='reconciled').exists():
        return False, "Cannot reopen shift: One or more employee settlements are reconciled. All employee settlements must be reopened first."

    later_shift = OperationalShift.objects.filter(
        outlet=shift.outlet,
        opened_at__gt=shift.opened_at
    ).exists()
    if later_shift:
        return False, "Only the latest closed shift for an outlet may be reopened. A later shift already exists."

    subsequent_created = OperationalShift.objects.filter(
        outlet=shift.outlet,
        created_at__gt=shift.created_at
    ).exists()
    if subsequent_created:
        return False, "Cannot reopen because a newer shift record has been created for this outlet."

    return True, None


def get_shift_card_preparation_data(organisation, outlet, shift_definition, business_date, employee_id=None) -> dict:
    """
    Prepares data for creating/editing a Shift Card:
    - Calculates scheduled start/end times handling crosses_midnight
    - Finds existing parent OperationalShift if any
    - Resolves historical active nozzles for this shift time
    - Groups nozzles by dispenser and product
    - Derives expected opening totalizer and continuity status
    - Checks effective fuel product prices
    - Checks planned roster assignment
    - Lists active/historical employees assigned to this outlet
    """
    from datetime import datetime, time, timedelta
    from django.utils import timezone
    from apps.forecourt.models import ProductPrice, Dispenser
    from .models import OperationalShift, ShiftRoster, EmployeeShiftCard, ShiftNozzleMeter

    start_dt = datetime.combine(business_date, shift_definition.starts_at)
    if shift_definition.crosses_midnight:
        end_dt = datetime.combine(business_date + timedelta(days=1), shift_definition.ends_at)
    else:
        end_dt = datetime.combine(business_date, shift_definition.ends_at)

    start_aware = timezone.make_aware(start_dt) if timezone.is_naive(start_dt) else start_dt
    end_aware = timezone.make_aware(end_dt) if timezone.is_naive(end_dt) else end_dt

    parent_shift = OperationalShift.objects.filter(
        outlet=outlet,
        shift_definition=shift_definition,
        business_date=business_date
    ).first()

    roster = ShiftRoster.objects.filter(
        outlet=outlet,
        shift_definition=shift_definition,
        business_date=business_date
    ).first()
    roster_nozzle_map = {}
    if roster:
        for sa in roster.staff_assignments.prefetch_related('nozzle_assignments'):
            for na in sa.nozzle_assignments.all():
                roster_nozzle_map[str(na.nozzle_id)] = str(sa.employee_id)

    covered_nozzle_map = {}
    if parent_shift:
        active_cards = parent_shift.employee_cards.filter(status=EmployeeShiftCard.STATUS_ACTIVE).prefetch_related('meters')
        for card in active_cards:
            for m in card.meters.all():
                covered_nozzle_map[str(m.nozzle_id)] = {
                    'card_id': str(card.id),
                    'employee_id': str(card.employee_id),
                    'employee_name': card.employee.display_name
                }

    nozzles = get_historical_nozzles_for_shift(outlet, as_of_time=start_aware)
    nozzle_items = []
    for n in nozzles:
        n_id_str = str(n.id)
        derived = derive_nozzle_opening_reading(
            outlet=outlet,
            nozzle=n,
            as_of_time=start_aware,
            shift_date=business_date,
            shift_def=shift_definition,
            exclude_shift_id=parent_shift.id if parent_shift else None
        )

        price_obj = ProductPrice.objects.filter(
            outlet=outlet,
            product=n.tank.product,
            effective_from__lte=start_aware
        ).filter(
            models.Q(effective_to__isnull=True) | models.Q(effective_to__gt=start_aware)
        ).order_by('-effective_from').first()
        if not price_obj:
            price_obj = ProductPrice.objects.filter(
                outlet=outlet,
                product=n.tank.product
            ).order_by('-effective_from').first()

        current_rate = price_obj.selling_price if price_obj else Decimal('0.00')

        nozzle_items.append({
            'nozzle_id': n_id_str,
            'nozzle_code': n.code,
            'nozzle_name': n.name,
            'nozzle_number': n.nozzle_number,
            'dispenser_id': str(n.dispenser_id),
            'dispenser_name': n.dispenser.name,
            'dispenser_code': n.dispenser.code,
            'product_id': str(n.tank.product_id),
            'product_name': n.tank.product.name,
            'product_code': n.tank.product.code,
            'tank_id': str(n.tank_id),
            'tank_code': n.tank.code,
            'derived_opening_reading': str(derived['reading']) if derived['reading'] is not None else None,
            'opening_source': derived['source'],
            'opening_source_description': derived['source_description'],
            'continuity_status': derived['continuity_status'],
            'requires_commissioning': derived.get('requires_commissioning', False),
            'current_rate': str(current_rate),
            'preselected_employee_id': roster_nozzle_map.get(n_id_str),
            'allocated_card': covered_nozzle_map.get(n_id_str)
        })

    employees = get_historical_employees_for_shift(outlet, business_date=business_date)
    employee_items = [{
        'id': str(e.id),
        'code': e.employee_code,
        'name': e.display_name,
        'designation_name': e.designation.name if e.designation else "Staff",
        'status': e.status
    } for e in employees]

    dispensers = list(
        Dispenser.objects.filter(outlet=outlet).order_by('name')
    )
    dispenser_items = [{
        'id': str(d.id),
        'name': d.name,
        'code': d.code,
        'nozzle_ids': [str(n.id) for n in nozzles if n.dispenser_id == d.id]
    } for d in dispensers if any(n.dispenser_id == d.id for n in nozzles)]

    return {
        'outlet_id': str(outlet.id),
        'shift_definition_id': str(shift_definition.id),
        'shift_definition_name': shift_definition.name,
        'business_date': str(business_date),
        'scheduled_starts_at': start_aware.isoformat(),
        'scheduled_ends_at': end_aware.isoformat(),
        'parent_shift_id': str(parent_shift.id) if parent_shift else None,
        'is_locked': parent_shift.is_locked if parent_shift else False,
        'lock_source': parent_shift.lock_source if parent_shift else None,
        'has_planned_roster': roster is not None,
        'nozzles': nozzle_items,
        'dispensers': dispenser_items,
        'employees': employee_items
    }


def get_parent_shift_summary(shift) -> dict:
    """
    Aggregates all active EmployeeShiftCards for a parent OperationalShift.
    """
    from .models import EmployeeShiftCard, ShiftNozzleMeter
    from decimal import Decimal

    active_cards = list(
        shift.employee_cards.filter(status=EmployeeShiftCard.STATUS_ACTIVE)
        .select_related('employee', 'employee__designation')
        .prefetch_related(
            'meters', 'meters__nozzle', 'meters__nozzle__tank', 'meters__nozzle__tank__product',
            'collections', 'credit_slips', 'deductions'
        )
    )

    historical_nozzles = get_historical_nozzles_for_shift(shift.outlet, as_of_time=shift.scheduled_starts_at)
    historical_nozzle_ids = {n.id for n in historical_nozzles}

    covered_nozzle_ids = set()
    cards_summary = []

    gross_litres = Decimal('0.000')
    testing_litres = Decimal('0.000')
    net_sale_litres = Decimal('0.000')
    expected_amount = Decimal('0.00')
    accounted_amount = Decimal('0.00')
    gross_shortage = Decimal('0.00')
    gross_excess = Decimal('0.00')

    has_continuity_conflict = False

    for card in active_cards:
        card_gross = Decimal('0.000')
        card_testing = Decimal('0.000')
        card_sale_qty = Decimal('0.000')
        card_sale_amount = Decimal('0.00')
        meters_data = []

        for m in card.meters.all():
            covered_nozzle_ids.add(m.nozzle_id)
            card_gross += m.gross_quantity
            card_testing += m.testing_quantity
            card_sale_qty += m.sale_quantity

            m_amount = sum((s.sale_amount for s in m.price_segments.all()), Decimal('0.00'))
            card_sale_amount += m_amount

            if m.continuity_status == 'conflict' and not m.is_conflict_acknowledged:
                has_continuity_conflict = True

            meters_data.append({
                'meter_id': str(m.id),
                'nozzle_id': str(m.nozzle_id),
                'nozzle_code': m.nozzle.code,
                'product_name': m.nozzle.tank.product.name,
                'opening_reading': str(m.opening_reading),
                'expected_opening_reading': str(m.expected_opening_reading) if m.expected_opening_reading is not None else None,
                'closing_reading': str(m.closing_reading) if m.closing_reading is not None else None,
                'gross_quantity': str(m.gross_quantity),
                'testing_quantity': str(m.testing_quantity),
                'sale_quantity': str(m.sale_quantity),
                'sale_amount': str(m_amount),
                'continuity_status': m.continuity_status,
                'continuity_difference': str(m.continuity_difference),
                'is_conflict_acknowledged': m.is_conflict_acknowledged
            })

        cash_total = sum((c.amount for c in card.collections.all() if c.status == 'active' and c.collection_method == 'cash'), Decimal('0.00'))
        card_total = sum((c.amount for c in card.collections.all() if c.status == 'active' and c.collection_method == 'card'), Decimal('0.00'))
        upi_total = sum((c.amount for c in card.collections.all() if c.status == 'active' and c.collection_method == 'upi'), Decimal('0.00'))
        fleet_total = sum((c.amount for c in card.collections.all() if c.status == 'active' and c.collection_method == 'fleet_card'), Decimal('0.00'))
        credit_total = sum((cs.amount for cs in card.credit_slips.all() if cs.status == 'active'), Decimal('0.00'))

        appr_inc = sum((d.amount for d in card.deductions.all() if d.status == 'active' and d.approval_status == 'approved' and d.direction == 'increases_accounted'), Decimal('0.00'))
        appr_dec = sum((d.amount for d in card.deductions.all() if d.status == 'active' and d.approval_status == 'approved' and d.direction == 'decreases_accounted'), Decimal('0.00'))
        pending_deductions_count = sum(1 for d in card.deductions.all() if d.status == 'active' and d.approval_status == 'pending')

        card_accounted = cash_total + card_total + upi_total + fleet_total + credit_total + appr_inc - appr_dec
        card_diff = card_accounted - card_sale_amount

        if card_diff < Decimal('0.00'):
            gross_shortage += abs(card_diff)
        elif card_diff > Decimal('0.00'):
            gross_excess += card_diff

        gross_litres += card_gross
        testing_litres += card_testing
        net_sale_litres += card_sale_qty
        expected_amount += card_sale_amount
        accounted_amount += card_accounted

        all_card_deductions = []
        for d in card.deductions.all():
            if d.status == 'active':
                all_card_deductions.append({
                    'id': str(d.id),
                    'shift_card_id': str(card.id),
                    'employee_id': str(card.employee_id),
                    'employee_name': card.employee.display_name,
                    'description': d.description,
                    'payee': d.payee,
                    'amount': str(d.amount),
                    'deduction_type': d.deduction_type,
                    'direction': d.direction,
                    'approval_status': d.approval_status,
                    'occurred_at': d.occurred_at.isoformat() if d.occurred_at else None
                })

        cards_summary.append({
            'id': str(card.id),
            'card_id': str(card.id),
            'employee_id': str(card.employee_id),
            'employee_name': card.employee.display_name,
            'employee_code': card.employee.employee_code,
            'sequence': card.sequence,
            'status': card.status,
            'mpd_slip_number': card.mpd_slip_number,
            'has_attachment': bool(card.mpd_slip_attachment),
            'nozzles': [m.nozzle.code for m in card.meters.all()],
            'meters': meters_data,
            'total_litres_sold': float(card_sale_qty),
            'total_sale_amount': float(card_sale_amount),
            'total_collected_amount': float(card_accounted),
            'difference_amount': float(card_diff),
            'cash_total': str(cash_total),
            'card_total': str(card_total),
            'upi_total': str(upi_total),
            'fleet_total': str(fleet_total),
            'credit_total': str(credit_total),
            'approved_increases': str(appr_inc),
            'approved_decreases': str(appr_dec),
            'pending_deductions_count': pending_deductions_count,
            'expected_amount': str(card_sale_amount),
            'accounted_amount': str(card_accounted),
            'result': card.balance_result,
            'completeness_status': card.completeness_status,
            'is_shortage_excess_acknowledged': card.is_shortage_excess_acknowledged,
            'acknowledgement_note': card.shortage_excess_acknowledgement_note,
            'deductions': all_card_deductions
        })

    all_deductions = []
    for c in cards_summary:
        all_deductions.extend(c.get('deductions', []))

    covered_nozzle_map = {}
    for card in active_cards:
        for m in card.meters.all():
            if m.nozzle_id not in covered_nozzle_map:
                covered_nozzle_map[m.nozzle_id] = {
                    'id': str(m.nozzle_id),
                    'code': m.nozzle.code,
                    'name': m.nozzle.name,
                    'product_name': m.nozzle.tank.product.name,
                    'employee_name': card.employee.display_name
                }
    covered_nozzles_list = list(covered_nozzle_map.values())

    missing_nozzles = [
        {
            'id': str(n.id),
            'nozzle_id': str(n.id),
            'code': n.code,
            'nozzle_code': n.code,
            'name': n.name,
            'nozzle_name': n.name,
            'dispenser_name': n.dispenser.name,
            'product_name': n.tank.product.name
        }
        for n in historical_nozzles if n.id not in covered_nozzle_ids
    ]

    net_difference = accounted_amount - expected_amount

    is_complete = (
        len(missing_nozzles) == 0 and
        len(active_cards) > 0 and
        all(c['completeness_status'] == 'complete' for c in cards_summary) and
        not has_continuity_conflict
    )

    dips_data = [{
        'id': str(d.id),
        'tank_id': str(d.tank_id),
        'tank_code': d.tank.code,
        'product_name': d.tank.product.name,
        'observation_type': d.observation_type,
        'raw_dip_value': str(d.raw_dip_value),
        'raw_dip_unit': d.raw_dip_unit,
        'converted_quantity': str(d.converted_quantity),
        'density': str(d.density) if d.density is not None else None,
        'measured_at': d.measured_at.isoformat()
    } for d in shift.dip_observations.select_related('tank', 'tank__product').order_by('observation_type', 'tank__code')]

    shift_info = {
        'id': str(shift.id),
        'shift_id': str(shift.id),
        'outlet_id': str(shift.outlet_id),
        'outlet_name': shift.outlet.name,
        'shift_definition_id': str(shift.shift_definition_id),
        'shift_definition_name': shift.shift_definition.name,
        'business_date': str(shift.business_date),
        'scheduled_starts_at': shift.scheduled_starts_at.isoformat(),
        'scheduled_ends_at': shift.scheduled_ends_at.isoformat(),
        'starts_at': shift.shift_definition.starts_at.strftime('%H:%M') if hasattr(shift.shift_definition, 'starts_at') else '',
        'ends_at': shift.shift_definition.ends_at.strftime('%H:%M') if hasattr(shift.shift_definition, 'ends_at') else '',
        'recorded_at': shift.created_at.isoformat(),
        'recorded_by': shift.recorded_by.display_name if shift.recorded_by else (shift.opened_by.display_name if shift.opened_by else None),
        'is_locked': shift.is_locked,
        'locked_at': shift.locked_at.isoformat() if shift.locked_at else None,
        'locked_by': shift.locked_by.display_name if shift.locked_by else None,
        'lock_source': shift.lock_source,
        'status': shift.status,
    }

    totals_info = {
        'total_litres_sold': float(net_sale_litres),
        'total_sale_amount': float(expected_amount),
        'total_collected_amount': float(accounted_amount),
        'difference_amount': float(net_difference),
        'gross_shortage': float(gross_shortage),
        'gross_excess': float(gross_excess),
    }

    coverage_info = {
        'covered_nozzles': covered_nozzles_list,
        'missing_nozzles': missing_nozzles,
        'total_historical_nozzles': len(historical_nozzles),
    }

    return {
        # Structured top-level objects for UI
        'shift': shift_info,
        'totals': totals_info,
        'coverage': coverage_info,
        'cards': cards_summary,
        'deductions': all_deductions,
        # Flat legacy keys for backward-compatibility
        'shift_id': str(shift.id),
        'outlet_id': str(shift.outlet_id),
        'outlet_name': shift.outlet.name,
        'shift_definition_id': str(shift.shift_definition_id),
        'shift_definition_name': shift.shift_definition.name,
        'business_date': str(shift.business_date),
        'scheduled_starts_at': shift.scheduled_starts_at.isoformat(),
        'scheduled_ends_at': shift.scheduled_ends_at.isoformat(),
        'starts_at': shift_info['starts_at'],
        'ends_at': shift_info['ends_at'],
        'recorded_at': shift_info['recorded_at'],
        'recorded_by': shift_info['recorded_by'],
        'is_locked': shift.is_locked,
        'locked_at': shift_info['locked_at'],
        'locked_by': shift_info['locked_by'],
        'lock_source': shift.lock_source,
        'status': shift.status,
        'completeness_status': 'complete' if is_complete else 'incomplete',
        'cards_count': len(active_cards),
        'covered_nozzles_count': len(covered_nozzle_ids),
        'missing_nozzles': missing_nozzles,
        'gross_litres': str(gross_litres),
        'testing_litres': str(testing_litres),
        'net_sale_litres': str(net_sale_litres),
        'expected_amount': str(expected_amount),
        'accounted_amount': str(accounted_amount),
        'gross_shortage': str(gross_shortage),
        'gross_excess': str(gross_excess),
        'net_difference': str(net_difference),
        'has_continuity_conflict': has_continuity_conflict,
        'dips': dips_data
    }
