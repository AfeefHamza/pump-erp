# apps/inventory/services.py
from decimal import Decimal
from django.db import transaction, IntegrityError
from django.core.exceptions import ValidationError, PermissionDenied
from django.utils import timezone
from apps.organizations.models import Organisation, Outlet
from apps.forecourt.models import Tank, FuelProduct, Nozzle
from apps.organizations.permissions import require_permission, has_permission
from .models import (
    TankStockMovement, TankStockBalanceProjection,
    StockAdjustment, StockAdjustmentAttachment
)


def get_or_create_tank_projection(tank: Tank) -> TankStockBalanceProjection:
    projection, _ = TankStockBalanceProjection.objects.get_or_create(
        tank=tank,
        defaults={
            'organisation': tank.organisation,
            'outlet': tank.outlet,
            'current_book_stock': Decimal('0.0000'),
            'has_chronology_conflict': False,
            'has_negative_balance_history': False,
        }
    )
    return projection


def recalculate_tank_projection(tank: Tank) -> TankStockBalanceProjection:
    """
    Recalculates the mutable projection for a tank by traversing its immutable
    movement ledger in strict chronological order.
    NEVER mutates TankStockMovement records.
    """
    with transaction.atomic():
        # Lock the projection record
        projection, _ = TankStockBalanceProjection.objects.select_for_update().get_or_create(
            tank=tank,
            defaults={
                'organisation': tank.organisation,
                'outlet': tank.outlet,
                'current_book_stock': Decimal('0.0000'),
            }
        )

        movements = list(
            TankStockMovement.objects.filter(tank=tank).order_by('effective_at', 'created_at', 'id')
        )

        running_balance = Decimal('0.0000')
        first_neg_at = None
        has_negative = False
        last_mv_time = None

        for m in movements:
            if m.direction == TankStockMovement.DIR_IN:
                running_balance += m.quantity
            else:
                running_balance -= m.quantity

            if running_balance < Decimal('0.0000'):
                has_negative = True
                if first_neg_at is None:
                    first_neg_at = m.effective_at

            last_mv_time = m.effective_at

        projection.current_book_stock = running_balance
        projection.last_movement_at = last_mv_time
        projection.has_negative_balance_history = has_negative
        projection.has_chronology_conflict = has_negative
        projection.first_negative_balance_at = first_neg_at
        projection.save()

        return projection


@transaction.atomic
def post_tank_stock_movement(
    organisation: Organisation,
    outlet: Outlet,
    tank: Tank,
    fuel_product: FuelProduct,
    product_code_snapshot: str,
    product_name_snapshot: str,
    movement_type: str,
    direction: str,
    quantity: Decimal,
    effective_at,
    source_type: str,
    source_id,
    idempotency_key: str,
    source_line_id=None,
    reversal_of: TankStockMovement | None = None,
    reason: str | None = None,
    created_by=None,
    metadata: dict | None = None,
) -> TankStockMovement:
    """
    Atomically posts an immutable append-only stock movement into the ledger.
    Guarantees idempotency at the database level via idempotency_key.
    Recalculates the tank's projection upon completion.
    """
    # Check if already exists idempotently
    existing = TankStockMovement.objects.filter(idempotency_key=idempotency_key).first()
    if existing:
        return existing

    try:
        movement = TankStockMovement.objects.create(
            organisation=organisation,
            outlet=outlet,
            tank=tank,
            fuel_product=fuel_product,
            product_code_snapshot=product_code_snapshot,
            product_name_snapshot=product_name_snapshot,
            movement_type=movement_type,
            direction=direction,
            quantity=quantity,
            effective_at=effective_at,
            source_type=source_type,
            source_id=source_id,
            source_line_id=source_line_id,
            reversal_of=reversal_of,
            reason=reason,
            idempotency_key=idempotency_key,
            created_by=created_by,
            metadata=metadata or {}
        )
    except IntegrityError:
        # Concurrent insert race condition caught by unique constraint
        existing = TankStockMovement.objects.filter(idempotency_key=idempotency_key).first()
        if existing:
            return existing
        if source_line_id is not None:
            return TankStockMovement.objects.get(
                source_type=source_type,
                source_id=source_id,
                source_line_id=source_line_id,
                movement_type=movement_type,
                tank=tank
            )
        else:
            return TankStockMovement.objects.get(
                source_type=source_type,
                source_id=source_id,
                source_line_id__isnull=True,
                movement_type=movement_type,
                tank=tank
            )

    recalculate_tank_projection(tank)
    return movement


@transaction.atomic
def post_opening_balance_movements(batch, user) -> list[TankStockMovement]:
    """
    Posts initial_opening_balance movements for all confirmed tank balances in an OpeningBalanceBatch.
    """
    movements = []
    for tob in batch.tank_balances.select_related('tank', 'tank__product').all():
        if tob.book_quantity <= Decimal('0.0000'):
            continue

        idemp_key = f"open_bal_{batch.id}_{tob.id}_{tob.tank_id}"
        mv = post_tank_stock_movement(
            organisation=batch.organisation,
            outlet=batch.outlet,
            tank=tob.tank,
            fuel_product=tob.tank.product,
            product_code_snapshot=tob.tank.product.code,
            product_name_snapshot=tob.tank.product.name,
            movement_type=TankStockMovement.TYPE_INITIAL_OPENING_BALANCE,
            direction=TankStockMovement.DIR_IN,
            quantity=tob.book_quantity,
            effective_at=batch.effective_at,
            source_type='opening_balance',
            source_id=batch.id,
            source_line_id=tob.id,
            idempotency_key=idemp_key,
            reason=f"Confirmed Opening Balance for {tob.tank.name}",
            created_by=user
        )
        movements.append(mv)
    return movements


@transaction.atomic
def post_tanker_receipt_movements(receipt, user) -> list[TankStockMovement]:
    """
    Posts tanker_receipt movements for each allocated tank in a confirmed TankerReceipt.
    """
    from apps.purchases.models import TankerReceipt
    if receipt.status != TankerReceipt.STATUS_CONFIRMED:
        raise ValidationError("Only confirmed tanker receipts can post stock movements.")

    movements = []
    for line in receipt.product_lines.select_related('product').all():
        for alloc in line.allocations.select_related('tank').all():
            if alloc.allocated_book_quantity <= Decimal('0.0000'):
                continue

            idemp_key = f"tanker_receipt_alloc_{alloc.id}"
            mv = post_tank_stock_movement(
                organisation=receipt.organisation,
                outlet=receipt.outlet,
                tank=alloc.tank,
                fuel_product=line.product,
                product_code_snapshot=line.product.code,
                product_name_snapshot=line.product.name,
                movement_type=TankStockMovement.TYPE_TANKER_RECEIPT,
                direction=TankStockMovement.DIR_IN,
                quantity=alloc.allocated_book_quantity,
                effective_at=receipt.effective_at,
                source_type='tanker_receipt_allocation',
                source_id=receipt.id,
                source_line_id=alloc.id,
                idempotency_key=idemp_key,
                reason=f"Tanker Receipt {receipt.receipt_number} from {receipt.supplier_name_snapshot} (Invoice {receipt.invoice_number})",
                created_by=user,
                metadata={
                    'receipt_number': receipt.receipt_number,
                    'invoice_number': receipt.invoice_number,
                    'supplier_name': receipt.supplier_name_snapshot,
                    'vehicle_registration': receipt.vehicle_registration,
                }
            )
            movements.append(mv)

    return movements


@transaction.atomic
def reverse_tanker_receipt_movements(receipt, user, reason: str) -> list[TankStockMovement]:
    """
    Reverses all posted movements for a voided tanker receipt.
    """
    active_mvs = TankStockMovement.objects.filter(
        source_id=receipt.id,
        source_type='tanker_receipt_allocation',
        movement_type=TankStockMovement.TYPE_TANKER_RECEIPT
    )

    reversals = []
    for m in active_mvs:
        if m.reversals.exists():
            continue  # already reversed

        idemp_key = f"rev_rcpt_{receipt.id}_{m.id}"
        rev = post_tank_stock_movement(
            organisation=m.organisation,
            outlet=m.outlet,
            tank=m.tank,
            fuel_product=m.fuel_product,
            product_code_snapshot=m.product_code_snapshot,
            product_name_snapshot=m.product_name_snapshot,
            movement_type=TankStockMovement.TYPE_REVERSAL,
            direction=TankStockMovement.DIR_OUT if m.direction == TankStockMovement.DIR_IN else TankStockMovement.DIR_IN,
            quantity=m.quantity,
            effective_at=receipt.effective_at,
            source_type='tanker_receipt_void',
            source_id=receipt.id,
            source_line_id=m.source_line_id,
            reversal_of=m,
            idempotency_key=idemp_key,
            reason=f"Reversal of {m.movement_type}: Receipt {receipt.receipt_number} voided ({reason})",
            created_by=user
        )
        reversals.append(rev)

    return reversals


@transaction.atomic
def sync_shift_card_stock_movements(card, user) -> list[TankStockMovement]:
    """
    Synchronizes stock movements for an active EmployeeShiftCard.
    - Resolves historical tank and product for nozzle dispensing (OUT).
    - Posts returned testing as separate IN movements.
    - Idempotent: does not duplicate or rewrite history.
    - If card was modified, reverses stale movements and creates replacements.
    """
    from apps.shifts.models import ShiftNozzleMeter, ShiftTestingRecord

    movements = []
    card_effective_time = card.actual_ends_at or card.created_at

    # 1. Meter dispensing
    meters = ShiftNozzleMeter.objects.filter(shift_card=card).select_related(
        'tank', 'product', 'nozzle', 'nozzle__tank', 'nozzle__tank__product'
    )

    for meter in meters:
        if meter.gross_quantity <= Decimal('0.000'):
            continue

        # Historical nozzle-to-tank resolution via immutable meter snapshot
        tank = meter.tank or meter.nozzle.tank
        product = meter.product or tank.product

        idemp_key = f"shift_card_disp_{card.id}_{meter.id}_{meter.gross_quantity}"

        # Check if identical movement already exists
        existing = TankStockMovement.objects.filter(idempotency_key=idemp_key).first()
        if existing:
            movements.append(existing)
            continue

        # If an older movement exists for this meter with a different quantity, reverse it
        older_mvs = TankStockMovement.objects.filter(
            source_type__in=['shift_card_meter', 'shift_card_meter_replacement'],
            source_id=card.id,
            source_line_id=meter.id,
            movement_type=TankStockMovement.TYPE_NOZZLE_DISPENSING
        )
        is_replacement = False
        for old_m in older_mvs:
            if not old_m.reversals.exists():
                is_replacement = True
                rev_key = f"rev_shift_card_meter_{old_m.id}_{timezone.now().timestamp()}"
                post_tank_stock_movement(
                    organisation=old_m.organisation,
                    outlet=old_m.outlet,
                    tank=old_m.tank,
                    fuel_product=old_m.fuel_product,
                    product_code_snapshot=old_m.product_code_snapshot,
                    product_name_snapshot=old_m.product_name_snapshot,
                    movement_type=TankStockMovement.TYPE_REVERSAL,
                    direction=TankStockMovement.DIR_IN,
                    quantity=old_m.quantity,
                    effective_at=old_m.effective_at,
                    source_type='shift_card_meter_correction',
                    source_id=card.id,
                    source_line_id=meter.id,
                    reversal_of=old_m,
                    idempotency_key=rev_key,
                    reason=f"Shift Card {card.id} meter {meter.nozzle.code} edited",
                    created_by=user
                )

        src_type = 'shift_card_meter_replacement' if is_replacement else 'shift_card_meter'

        mv = post_tank_stock_movement(
            organisation=card.organisation,
            outlet=card.outlet,
            tank=tank,
            fuel_product=product,
            product_code_snapshot=product.code,
            product_name_snapshot=product.name,
            movement_type=TankStockMovement.TYPE_NOZZLE_DISPENSING,
            direction=TankStockMovement.DIR_OUT,
            quantity=meter.gross_quantity,
            effective_at=card_effective_time,
            source_type=src_type,
            source_id=card.id,
            source_line_id=meter.id,
            idempotency_key=idemp_key,
            reason=f"Gross dispensing on {meter.nozzle.code} by {card.employee.display_name} ({card.parent_shift.business_date})",
            created_by=user,
            metadata={
                'shift_card_id': str(card.id),
                'employee_name': card.employee.display_name,
                'nozzle_code': meter.nozzle.code,
                'opening_reading': str(meter.opening_reading),
                'closing_reading': str(meter.closing_reading) if meter.closing_reading else None,
            }
        )
        movements.append(mv)

    # 2. Testing returns
    # Query testing records associated with this card's meters
    testing_records = ShiftTestingRecord.objects.filter(
        shift_nozzle_meter__shift_card=card,
        returned_to_tank=True,
        quantity__gt=Decimal('0.000')
    ).select_related('destination_tank', 'destination_tank__product', 'shift_nozzle_meter__nozzle__tank')

    for test_rec in testing_records:
        dest_tank = test_rec.destination_tank or test_rec.shift_nozzle_meter.nozzle.tank
        dest_product = dest_tank.product
        test_effective = test_rec.occurred_at or card_effective_time

        idemp_key = f"shift_card_test_return_{card.id}_{test_rec.id}_{test_rec.quantity}"

        existing = TankStockMovement.objects.filter(idempotency_key=idemp_key).first()
        if existing:
            movements.append(existing)
            continue

        older_test_mvs = TankStockMovement.objects.filter(
            source_type='shift_card_testing',
            source_id=card.id,
            source_line_id=test_rec.id,
            movement_type=TankStockMovement.TYPE_TESTING_RETURN
        )
        for old_tm in older_test_mvs:
            if not old_tm.reversals.exists():
                rev_key = f"rev_shift_test_{old_tm.id}_{timezone.now().timestamp()}"
                post_tank_stock_movement(
                    organisation=old_tm.organisation,
                    outlet=old_tm.outlet,
                    tank=old_tm.tank,
                    fuel_product=old_tm.fuel_product,
                    product_code_snapshot=old_tm.product_code_snapshot,
                    product_name_snapshot=old_tm.product_name_snapshot,
                    movement_type=TankStockMovement.TYPE_REVERSAL,
                    direction=TankStockMovement.DIR_OUT,
                    quantity=old_tm.quantity,
                    effective_at=old_tm.effective_at,
                    source_type='shift_card_testing_correction',
                    source_id=card.id,
                    source_line_id=test_rec.id,
                    reversal_of=old_tm,
                    idempotency_key=rev_key,
                    reason=f"Shift Card {card.id} testing return {test_rec.id} corrected",
                    created_by=user
                )

        mv = post_tank_stock_movement(
            organisation=card.organisation,
            outlet=card.outlet,
            tank=dest_tank,
            fuel_product=dest_product,
            product_code_snapshot=dest_product.code,
            product_name_snapshot=dest_product.name,
            movement_type=TankStockMovement.TYPE_TESTING_RETURN,
            direction=TankStockMovement.DIR_IN,
            quantity=test_rec.quantity,
            effective_at=test_effective,
            source_type='shift_card_testing',
            source_id=card.id,
            source_line_id=test_rec.id,
            idempotency_key=idemp_key,
            reason=f"Testing fuel returned to {dest_tank.name} from {test_rec.shift_nozzle_meter.nozzle.code}",
            created_by=user,
            metadata={
                'shift_card_id': str(card.id),
                'testing_id': str(test_rec.id),
                'destination_tank_code': dest_tank.code
            }
        )
        movements.append(mv)

    return movements


@transaction.atomic
def reverse_shift_card_stock_movements(card, user, reason: str) -> list[TankStockMovement]:
    """
    Reverses all posted movements for a voided Shift Card.
    """
    active_mvs = TankStockMovement.objects.filter(
        source_id=card.id,
        source_type__in=['shift_card_meter', 'shift_card_meter_replacement', 'shift_card_testing']
    )

    reversals = []
    for m in active_mvs:
        if m.reversals.exists():
            continue

        idemp_key = f"rev_shift_card_{card.id}_{m.id}"
        rev = post_tank_stock_movement(
            organisation=m.organisation,
            outlet=m.outlet,
            tank=m.tank,
            fuel_product=m.fuel_product,
            product_code_snapshot=m.product_code_snapshot,
            product_name_snapshot=m.product_name_snapshot,
            movement_type=TankStockMovement.TYPE_REVERSAL,
            direction=TankStockMovement.DIR_OUT if m.direction == TankStockMovement.DIR_IN else TankStockMovement.DIR_IN,
            quantity=m.quantity,
            effective_at=m.effective_at,
            source_type='shift_card_void',
            source_id=card.id,
            source_line_id=m.source_line_id,
            reversal_of=m,
            idempotency_key=idemp_key,
            reason=f"Shift Card voided ({reason})",
            created_by=user
        )
        reversals.append(rev)

    return reversals


@transaction.atomic
def record_stock_adjustment(
    organisation: Organisation,
    outlet: Outlet,
    tank: Tank,
    adjustment_type: str,
    quantity: Decimal,
    effective_at,
    reason_category: str,
    explanation: str,
    user,
    attachment_file=None
) -> StockAdjustment:
    """
    Controlled stock adjustment creation.
    Requires 'fuel_stock.adjust' permission.
    Atomically posts immutable movement to TankStockMovement and updates projection.
    """
    require_permission(user, organisation, 'fuel_stock.adjust', outlet=outlet)

    if adjustment_type not in [StockAdjustment.TYPE_INCREASE, StockAdjustment.TYPE_DECREASE]:
        raise ValidationError({'adjustment_type': "Invalid adjustment type."})

    if quantity <= Decimal('0.0000'):
        raise ValidationError({'quantity': "Quantity must be greater than zero."})

    adj = StockAdjustment.objects.create(
        organisation=organisation,
        outlet=outlet,
        tank=tank,
        adjustment_type=adjustment_type,
        quantity=quantity,
        effective_at=effective_at,
        reason_category=reason_category,
        explanation=explanation,
        created_by=user,
        authorised_by=user
    )

    if attachment_file:
        StockAdjustmentAttachment.objects.create(
            adjustment=adj,
            file=attachment_file,
            file_name=attachment_file.name,
            file_size=attachment_file.size,
            content_type=getattr(attachment_file, 'content_type', 'application/octet-stream'),
            uploaded_by=user
        )

    direction = TankStockMovement.DIR_IN if adjustment_type == StockAdjustment.TYPE_INCREASE else TankStockMovement.DIR_OUT
    movement_type = (
        TankStockMovement.TYPE_STOCK_ADJUSTMENT_INCREASE
        if adjustment_type == StockAdjustment.TYPE_INCREASE
        else TankStockMovement.TYPE_STOCK_ADJUSTMENT_DECREASE
    )

    idemp_key = f"stock_adj_{adj.id}"
    post_tank_stock_movement(
        organisation=organisation,
        outlet=outlet,
        tank=tank,
        fuel_product=tank.product,
        product_code_snapshot=tank.product.code,
        product_name_snapshot=tank.product.name,
        movement_type=movement_type,
        direction=direction,
        quantity=quantity,
        effective_at=effective_at,
        source_type='stock_adjustment',
        source_id=adj.id,
        idempotency_key=idemp_key,
        reason=f"Stock Adjustment ({reason_category}): {explanation}",
        created_by=user
    )

    return adj


@transaction.atomic
def reverse_stock_adjustment(
    adjustment: StockAdjustment,
    user,
    reversal_reason: str
) -> StockAdjustment:
    """
    Reverses an authorized stock adjustment.
    Requires 'fuel_stock.adjust' permission.
    """
    require_permission(user, adjustment.organisation, 'fuel_stock.adjust', outlet=adjustment.outlet)

    if adjustment.is_reversed:
        raise ValidationError("This stock adjustment has already been reversed.")

    if not reversal_reason or not reversal_reason.strip():
        raise ValidationError({'reversal_reason': "A reason is mandatory when reversing a stock adjustment."})

    adjustment.is_reversed = True
    adjustment.reversed_at = timezone.now()
    adjustment.reversed_by = user
    adjustment.reversal_reason = reversal_reason
    adjustment.save()

    # Find the original movement
    orig_mv = TankStockMovement.objects.filter(
        source_id=adjustment.id,
        source_type='stock_adjustment'
    ).first()

    if orig_mv and not orig_mv.reversals.exists():
        rev_key = f"rev_stock_adj_{adjustment.id}"
        post_tank_stock_movement(
            organisation=adjustment.organisation,
            outlet=adjustment.outlet,
            tank=adjustment.tank,
            fuel_product=orig_mv.fuel_product,
            product_code_snapshot=orig_mv.product_code_snapshot,
            product_name_snapshot=orig_mv.product_name_snapshot,
            movement_type=TankStockMovement.TYPE_REVERSAL,
            direction=TankStockMovement.DIR_OUT if orig_mv.direction == TankStockMovement.DIR_IN else TankStockMovement.DIR_IN,
            quantity=orig_mv.quantity,
            effective_at=orig_mv.effective_at,
            source_type='stock_adjustment_reversal',
            source_id=adjustment.id,
            reversal_of=orig_mv,
            idempotency_key=rev_key,
            reason=f"Reversal of Stock Adjustment: {reversal_reason}",
            created_by=user
        )

    return adjustment


@transaction.atomic
def backfill_operational_stock_data(organisation=None, outlet=None) -> dict:
    """
    Idempotently backfills stock ledger movements for:
    1. Existing confirmed opening balances (OpeningBalanceBatch)
    2. Existing active/completed EmployeeShiftCards (meter dispensing and returned testing)
    Can be run repeatedly with zero risk of duplication.
    """
    from apps.operations.models import OpeningBalanceBatch
    from apps.shifts.models import EmployeeShiftCard

    batches_qs = OpeningBalanceBatch.objects.filter(status=OpeningBalanceBatch.STATUS_CONFIRMED)
    cards_qs = EmployeeShiftCard.objects.filter(status=EmployeeShiftCard.STATUS_ACTIVE)

    if organisation:
        batches_qs = batches_qs.filter(organisation=organisation)
        cards_qs = cards_qs.filter(organisation=organisation)
    if outlet:
        batches_qs = batches_qs.filter(outlet=outlet)
        cards_qs = cards_qs.filter(outlet=outlet)

    initial_count = TankStockMovement.objects.count()

    opening_count = 0
    for batch in batches_qs:
        mvs = post_opening_balance_movements(batch, batch.confirmed_by)
        opening_count += len(mvs)

    shift_card_count = 0
    for card in cards_qs:
        mvs = sync_shift_card_stock_movements(card, card.created_by)
        shift_card_count += len(mvs)

    # Recalculate projections for all affected tanks
    tanks_qs = Tank.objects.all()
    if organisation:
        tanks_qs = tanks_qs.filter(organisation=organisation)
    if outlet:
        tanks_qs = tanks_qs.filter(outlet=outlet)

    for tank in tanks_qs:
        recalculate_tank_projection(tank)

    new_movements_created = TankStockMovement.objects.count() - initial_count

    return {
        'opening_balance_movements_processed': opening_count,
        'shift_card_movements_processed': shift_card_count,
        'new_movements_created': new_movements_created,
        'tanks_recalculated': tanks_qs.count()
    }
