# apps/inventory/selectors.py
from decimal import Decimal
from django.db import models
from django.utils import timezone
from apps.organizations.models import Organisation, Outlet
from apps.forecourt.models import Tank
from apps.shifts.models import ShiftTankDipObservation
from apps.operations.models import TankOpeningBalance, OpeningBalanceBatch
from .models import (
    TankStockMovement, TankStockBalanceProjection,
    StockAdjustment
)
from .services import get_or_create_tank_projection, recalculate_tank_projection


def get_latest_physical_dip_for_tank(tank: Tank, at_datetime=None) -> dict | None:
    """
    Unified physical dip selector across:
    1. ShiftTankDipObservation (closing / opening / standalone dips)
    2. TankerReceiptTankAllocation (post-unloading dip)
    3. TankOpeningBalance (opening balance physical observation)
    Returns the most recent valid observation prior to or at at_datetime.
    """
    if not at_datetime:
        at_datetime = timezone.now()

    candidates = []

    # 1. Shift tank dips
    shift_dips = ShiftTankDipObservation.objects.filter(
        tank=tank,
        measured_at__lte=at_datetime
    ).select_related('calibration_chart').order_by('-measured_at')[:3]

    for sd in shift_dips:
        candidates.append({
            'volume': sd.converted_quantity,
            'dip_height': sd.raw_dip_value,
            'dip_unit': sd.raw_dip_unit,
            'measured_at': sd.measured_at,
            'source_type': f"Shift Dip ({sd.observation_type})",
            'source_reference': str(sd.id),
            'chart_name': sd.calibration_chart.name if sd.calibration_chart else None,
        })

    # 2. Tanker receipt allocations (post-unloading dips)
    from apps.purchases.models import TankerReceiptTankAllocation, TankerReceipt
    receipt_allocs = TankerReceiptTankAllocation.objects.filter(
        tank=tank,
        product_line__receipt__status=TankerReceipt.STATUS_CONFIRMED,
        product_line__receipt__unloading_end_time__lte=at_datetime,
        post_unloading_volume__isnull=False
    ).select_related('product_line__receipt', 'calibration_chart').order_by('-product_line__receipt__unloading_end_time')[:3]

    for ra in receipt_allocs:
        candidates.append({
            'volume': ra.post_unloading_volume,
            'dip_height': ra.post_unloading_dip_height,
            'dip_unit': ra.post_unloading_dip_unit,
            'measured_at': ra.product_line.receipt.unloading_end_time,
            'source_type': f"Tanker Receipt Post-Dip ({ra.product_line.receipt.receipt_number})",
            'source_reference': str(ra.id),
            'chart_name': ra.calibration_chart.name if ra.calibration_chart else None,
        })

    # 3. Confirmed opening balance batch
    opening_bal = TankOpeningBalance.objects.filter(
        tank=tank,
        batch__status=OpeningBalanceBatch.STATUS_CONFIRMED,
        batch__effective_at__lte=at_datetime,
        physical_quantity__isnull=False
    ).select_related('batch', 'calibration_assignment__chart').order_by('-batch__effective_at').first()

    if opening_bal:
        candidates.append({
            'volume': opening_bal.physical_quantity,
            'dip_height': opening_bal.raw_dip_value,
            'dip_unit': opening_bal.raw_dip_unit,
            'measured_at': opening_bal.batch.effective_at,
            'source_type': "Opening Balance Dip",
            'source_reference': str(opening_bal.id),
            'chart_name': opening_bal.calibration_assignment.chart.name if (opening_bal.calibration_assignment and opening_bal.calibration_assignment.chart) else None,
        })

    if not candidates:
        return None

    # Pick the candidate with the latest measured_at
    candidates.sort(key=lambda x: x['measured_at'], reverse=True)
    return candidates[0]


def get_tank_stock_summary(organisation: Organisation, outlet: Outlet) -> dict:
    """
    Returns live summary of fuel stock for all active tanks in an outlet:
    Capacity, calculated book stock from projection, latest physical dip,
    variance, capacity utilization, last movement timestamp, and conflict indicators.
    """
    tanks = Tank.objects.filter(
        organisation=organisation,
        outlet=outlet,
        status=Tank.STATUS_ACTIVE
    ).select_related('product').order_by('code')

    tank_summaries = []
    total_book_stock = Decimal('0.0000')
    total_physical_stock = Decimal('0.0000')
    has_physical_count = 0
    conflict_alert_count = 0

    for tank in tanks:
        # Get or calculate projection
        projection = getattr(tank, 'stock_projection', None)
        if not projection:
            projection = recalculate_tank_projection(tank)

        book_stock = projection.current_book_stock
        latest_dip = get_latest_physical_dip_for_tank(tank)

        physical_stock = latest_dip['volume'] if latest_dip else None
        if physical_stock is not None:
            variance = physical_stock - book_stock
            total_physical_stock += physical_stock
            has_physical_count += 1
        else:
            variance = None

        total_book_stock += book_stock

        if projection.has_chronology_conflict or projection.has_negative_balance_history:
            conflict_alert_count += 1
            status_code = 'conflict'
        elif variance is not None:
            if variance < Decimal('-0.0010'):
                status_code = 'shortage'
            elif variance > Decimal('0.0010'):
                status_code = 'excess'
            else:
                status_code = 'balanced'
        else:
            status_code = 'no_dip'

        available_capacity = max(Decimal('0.0000'), tank.capacity - book_stock)
        capacity_utilization = (
            (book_stock / tank.capacity * 100).quantize(Decimal('0.1'))
            if tank.capacity > Decimal('0') else Decimal('0.0')
        )

        tank_summaries.append({
            'tank_id': str(tank.id),
            'tank_code': tank.code,
            'tank_name': tank.name,
            'product_id': str(tank.product.id),
            'product_name': tank.product.name,
            'product_code': tank.product.code,
            'product_category': tank.product.category,
            'capacity': tank.capacity,
            'safe_fill_capacity': tank.safe_fill_capacity or tank.capacity,
            'current_book_stock': book_stock,
            'latest_physical_stock': physical_stock,
            'latest_dip_details': latest_dip,
            'variance': variance,
            'status': status_code,
            'available_capacity': available_capacity,
            'capacity_utilization_pct': capacity_utilization,
            'last_movement_at': projection.last_movement_at,
            'has_chronology_conflict': projection.has_chronology_conflict,
            'has_negative_balance_history': projection.has_negative_balance_history,
            'first_negative_balance_at': projection.first_negative_balance_at,
        })

    net_variance = (total_physical_stock - total_book_stock) if has_physical_count > 0 else None

    return {
        'outlet_id': str(outlet.id),
        'outlet_name': outlet.name,
        'tanks': tank_summaries,
        'metrics': {
            'total_tanks': len(tank_summaries),
            'total_book_stock': total_book_stock,
            'total_physical_stock': total_physical_stock if has_physical_count > 0 else None,
            'net_variance': net_variance,
            'conflict_alert_count': conflict_alert_count,
        }
    }


def get_tank_movement_ledger(
    organisation: Organisation,
    outlet: Outlet,
    tank_id,
    from_date=None,
    to_date=None,
    movement_type=None,
    direction=None
) -> dict:
    """
    Returns the chronological movement ledger for a tank.
    Running balance is computed dynamically in query chronology.
    """
    try:
        tank = Tank.objects.select_related('product').get(
            id=tank_id,
            organisation=organisation,
            outlet=outlet
        )
    except Tank.DoesNotExist:
        return {'error': "Tank not found."}

    # Query all movements chronologically to compute running balance correctly
    all_movements = TankStockMovement.objects.filter(
        tank=tank
    ).select_related('created_by').order_by('effective_at', 'created_at', 'id')

    running_balance = Decimal('0.0000')
    ledger_entries = []

    for m in all_movements:
        in_qty = m.quantity if m.direction == TankStockMovement.DIR_IN else Decimal('0.0000')
        out_qty = m.quantity if m.direction == TankStockMovement.DIR_OUT else Decimal('0.0000')

        if m.direction == TankStockMovement.DIR_IN:
            running_balance += m.quantity
        else:
            running_balance -= m.quantity

        is_negative = running_balance < Decimal('0.0000')

        # Filter criteria check
        if from_date and m.effective_at < from_date:
            continue
        if to_date and m.effective_at > to_date:
            continue
        if movement_type and m.movement_type != movement_type:
            continue
        if direction and m.direction != direction:
            continue

        ledger_entries.append({
            'id': str(m.id),
            'effective_at': m.effective_at,
            'created_at': m.created_at,
            'movement_type': m.movement_type,
            'direction': m.direction,
            'in_quantity': in_qty,
            'out_quantity': out_qty,
            'running_balance': running_balance,
            'is_negative_balance': is_negative,
            'source_type': m.source_type,
            'source_id': str(m.source_id),
            'source_line_id': str(m.source_line_id) if m.source_line_id else None,
            'reversal_of_id': str(m.reversal_of_id) if m.reversal_of_id else None,
            'is_reversal': m.movement_type == TankStockMovement.TYPE_REVERSAL,
            'reason': m.reason,
            'created_by_name': m.created_by.display_name if m.created_by else 'System',
            'metadata': m.metadata,
        })

    # Return reverse chronological for table display if desired
    ledger_entries.reverse()

    projection = get_or_create_tank_projection(tank)

    return {
        'tank_id': str(tank.id),
        'tank_code': tank.code,
        'tank_name': tank.name,
        'product_name': tank.product.name,
        'product_code': tank.product.code,
        'capacity': tank.capacity,
        'current_book_stock': projection.current_book_stock,
        'has_chronology_conflict': projection.has_chronology_conflict,
        'movements': ledger_entries,
        'total_movements': len(ledger_entries),
    }


def get_day_close_inventory_readiness(organisation: Organisation, outlet: Outlet, business_date=None) -> dict:
    """
    Exposes readiness information for Day Close consumption:
    - Unconfirmed tanker receipts
    - Negative tank balances / chronology conflicts
    - Unacknowledged stock variances
    - Missing required dips
    """
    from apps.purchases.models import TankerReceipt, TankerReceiptTankAllocation

    unconfirmed_receipts = TankerReceipt.objects.filter(
        organisation=organisation,
        outlet=outlet,
        status=TankerReceipt.STATUS_RECORDED
    )
    if business_date:
        unconfirmed_receipts = unconfirmed_receipts.filter(invoice_date__lte=business_date)

    conflicted_tanks = TankStockBalanceProjection.objects.filter(
        organisation=organisation,
        outlet=outlet,
        has_chronology_conflict=True
    ).select_related('tank')

    unacknowledged_variances = TankerReceiptTankAllocation.objects.filter(
        product_line__receipt__organisation=organisation,
        product_line__receipt__outlet=outlet,
        product_line__receipt__status=TankerReceipt.STATUS_CONFIRMED,
        variance_status__in=[
            TankerReceiptTankAllocation.STATUS_SHORTAGE,
            TankerReceiptTankAllocation.STATUS_EXCESS
        ]
    ).select_related('product_line__receipt', 'tank')

    is_ready = (
        not unconfirmed_receipts.exists() and
        not conflicted_tanks.exists() and
        not unacknowledged_variances.exists()
    )

    return {
        'ready': is_ready,
        'unconfirmed_receipts_count': unconfirmed_receipts.count(),
        'unconfirmed_receipts': [
            {
                'id': str(r.id),
                'receipt_number': r.receipt_number,
                'supplier': r.supplier_name_snapshot,
                'invoice_number': r.invoice_number,
                'invoice_date': r.invoice_date,
            }
            for r in unconfirmed_receipts[:10]
        ],
        'conflicted_tanks_count': conflicted_tanks.count(),
        'conflicted_tanks': [
            {
                'tank_id': str(ct.tank.id),
                'tank_code': ct.tank.code,
                'current_stock': ct.current_book_stock,
                'first_negative_at': ct.first_negative_balance_at
            }
            for ct in conflicted_tanks
        ],
        'unacknowledged_variances_count': unacknowledged_variances.count(),
        'unacknowledged_variances': [
            {
                'allocation_id': str(uv.id),
                'receipt_number': uv.product_line.receipt.receipt_number,
                'tank_code': uv.tank.code,
                'variance': uv.variance,
                'status': uv.variance_status,
            }
            for uv in unacknowledged_variances[:10]
        ]
    }
