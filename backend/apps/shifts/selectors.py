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


def derive_nozzle_opening_reading(outlet, nozzle) -> dict:
    """
    Derives opening totalizer for an active nozzle:
    1. Looks up the latest closed operational shift at this outlet having a closing reading for this nozzle.
    2. If not found, looks up the confirmed NozzleOpeningBalance from the outlet's confirmed opening batch.
    3. If neither exists, returns manual_exception indicator.
    """
    from .models import OperationalShift, ShiftNozzleMeter
    from apps.operations.models import OpeningBalanceBatch, NozzleOpeningBalance

    # 1. Previous closed shift
    prev_meter = ShiftNozzleMeter.objects.filter(
        shift__outlet=outlet,
        shift__status=OperationalShift.STATUS_CLOSED,
        nozzle=nozzle,
        closing_reading__isnull=False
    ).select_related('shift', 'shift__shift_definition').order_by(
        '-shift__closed_at', '-shift__business_date', '-shift__opened_at'
    ).first()

    if prev_meter and prev_meter.closing_reading is not None:
        return {
            'reading': prev_meter.closing_reading,
            'source': ShiftNozzleMeter.SOURCE_PREVIOUS_SHIFT,
            'reference': str(prev_meter.shift.id),
            'source_description': f"Previous Shift: {prev_meter.shift.shift_definition.name} ({prev_meter.shift.business_date})"
        }

    # 2. Confirmed Opening Balance
    confirmed_balance = NozzleOpeningBalance.objects.filter(
        batch__outlet=outlet,
        batch__status=OpeningBalanceBatch.STATUS_CONFIRMED,
        nozzle=nozzle
    ).select_related('batch').order_by('-batch__confirmed_at').first()

    if confirmed_balance:
        return {
            'reading': confirmed_balance.totalizer_reading,
            'source': ShiftNozzleMeter.SOURCE_OPENING_BALANCE,
            'reference': str(confirmed_balance.batch.id),
            'source_description': f"Confirmed Opening Balance ({confirmed_balance.batch.effective_at.strftime('%Y-%m-%d')})"
        }

    # 3. Manual Exception required
    return {
        'reading': None,
        'source': ShiftNozzleMeter.SOURCE_MANUAL_EXCEPTION,
        'reference': None,
        'source_description': "Requires manual setup exception"
    }


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
                'is_primary_cashier': sm.is_primary_cashier,
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
    Returns structured timeline of staff join events, cashier transfers, and nozzle handovers.
    """
    cashier_periods = []
    for cp in shift.cashier_periods.select_related('staff', 'changed_by').order_by('-effective_from'):
        cashier_periods.append({
            'id': str(cp.id),
            'staff_id': str(cp.staff_id),
            'employee_name': cp.staff.employee_name_snapshot,
            'employee_code': cp.staff.employee_code_snapshot,
            'effective_from': cp.effective_from.isoformat(),
            'effective_to': cp.effective_to.isoformat() if cp.effective_to else None,
            'is_active': cp.effective_to is None,
            'changed_by_name': cp.changed_by.get_full_name() or cp.changed_by.email if cp.changed_by else None,
            'reason': cp.reason
        })

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
        'cashier_periods': cashier_periods,
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
