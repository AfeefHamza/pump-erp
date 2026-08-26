# apps/shifts/selectors.py
from datetime import datetime, time, date
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
