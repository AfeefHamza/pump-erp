# apps/purchases/services.py
from decimal import Decimal
from django.db import transaction
from django.core.exceptions import ValidationError, PermissionDenied
from django.utils import timezone
from apps.organizations.models import Organisation, Outlet
from apps.forecourt.models import Tank, FuelProduct
from apps.operations.services import convert_dip_to_volume
from apps.organizations.permissions import require_permission, has_permission
from .models import (
    Supplier, TankerReceipt, TankerReceiptProductLine,
    TankerReceiptTankAllocation, TankerReceiptAttachment
)


@transaction.atomic
def create_supplier(
    organisation: Organisation,
    code: str,
    name: str,
    contact_person: str | None = None,
    phone: str | None = None,
    email: str | None = None,
    tax_number: str | None = None,
    address: str | None = None
) -> Supplier:
    supplier = Supplier(
        organisation=organisation,
        code=code,
        name=name,
        contact_person=contact_person,
        phone=phone,
        email=email,
        tax_number=tax_number,
        address=address
    )
    supplier.full_clean()
    supplier.save()
    return supplier


@transaction.atomic
def update_supplier(supplier: Supplier, **kwargs) -> Supplier:
    for attr, val in kwargs.items():
        if hasattr(supplier, attr):
            setattr(supplier, attr, val)
    supplier.full_clean()
    supplier.save()
    return supplier


def preview_dip_volume_for_tank(tank: Tank, height: Decimal, unit: str, measured_at=None) -> dict:
    """
    Helper to preview converted dip volume using existing calibration service.
    """
    return convert_dip_to_volume(tank, height, unit, measured_at=measured_at)


@transaction.atomic
def create_tanker_receipt(
    organisation: Organisation,
    outlet: Outlet,
    receipt_number: str,
    supplier: Supplier,
    invoice_number: str,
    invoice_date,
    vehicle_registration: str,
    unloading_end_time,
    product_lines_data: list[dict],
    user,
    delivery_challan_number: str | None = None,
    driver_name: str | None = None,
    driver_phone: str | None = None,
    seal_details: str | None = None,
    unloading_start_time=None,
    notes: str | None = None
) -> TankerReceipt:
    """
    Creates a new TankerReceipt in 'recorded' status.
    Allows flexible / partial allocations while recorded.
    """
    require_permission(user, organisation, 'tanker_receipt.create', outlet=outlet)

    receipt = TankerReceipt(
        organisation=organisation,
        outlet=outlet,
        receipt_number=receipt_number,
        supplier=supplier,
        supplier_name_snapshot=supplier.name,
        supplier_code_snapshot=supplier.code,
        invoice_number=invoice_number,
        invoice_date=invoice_date,
        delivery_challan_number=delivery_challan_number,
        vehicle_registration=vehicle_registration,
        driver_name=driver_name,
        driver_phone=driver_phone,
        seal_details=seal_details,
        unloading_start_time=unloading_start_time,
        unloading_end_time=unloading_end_time,
        status=TankerReceipt.STATUS_RECORDED,
        notes=notes,
        created_by=user,
        updated_by=user
    )
    receipt.full_clean()
    receipt.save()

    for line_data in product_lines_data:
        product = line_data['product']
        inv_qty = Decimal(str(line_data['invoice_quantity']))
        acc_qty = Decimal(str(line_data.get('accepted_book_quantity', inv_qty)))
        unit_rate = Decimal(str(line_data['unit_rate'])) if line_data.get('unit_rate') is not None else None
        inv_density = Decimal(str(line_data['invoice_density'])) if line_data.get('invoice_density') is not None else None
        obs_density = Decimal(str(line_data['observed_density'])) if line_data.get('observed_density') is not None else None
        obs_temp = Decimal(str(line_data['observed_temperature'])) if line_data.get('observed_temperature') is not None else None
        override_reason = line_data.get('quantity_override_reason')
        remarks = line_data.get('remarks')

        line = TankerReceiptProductLine.objects.create(
            receipt=receipt,
            product=product,
            invoice_quantity=inv_qty,
            accepted_book_quantity=acc_qty,
            unit_rate=unit_rate,
            invoice_density=inv_density,
            observed_density=obs_density,
            observed_temperature=obs_temp,
            quantity_override_reason=override_reason,
            remarks=remarks
        )

        for alloc_data in line_data.get('allocations', []):
            dest_tank = alloc_data['tank']
            alloc_qty = Decimal(str(alloc_data['allocated_book_quantity']))
            pre_h = Decimal(str(alloc_data['pre_unloading_dip_height'])) if alloc_data.get('pre_unloading_dip_height') is not None else None
            pre_u = alloc_data.get('pre_unloading_dip_unit', 'millimetre')
            post_h = Decimal(str(alloc_data['post_unloading_dip_height'])) if alloc_data.get('post_unloading_dip_height') is not None else None
            post_u = alloc_data.get('post_unloading_dip_unit', 'millimetre')

            pre_vol = None
            post_vol = None
            chart = None
            method = None

            # Convert dips if provided
            if pre_h is not None:
                try:
                    conv = convert_dip_to_volume(dest_tank, pre_h, pre_u, measured_at=unloading_end_time)
                    pre_vol = conv['volume']
                    chart = conv['chart']
                    method = conv['method']
                except ValidationError:
                    pass

            if post_h is not None:
                try:
                    conv = convert_dip_to_volume(dest_tank, post_h, post_u, measured_at=unloading_end_time)
                    post_vol = conv['volume']
                    chart = conv['chart']
                    method = conv['method']
                except ValidationError:
                    pass

            TankerReceiptTankAllocation.objects.create(
                product_line=line,
                tank=dest_tank,
                allocated_book_quantity=alloc_qty,
                pre_unloading_dip_height=pre_h,
                pre_unloading_dip_unit=pre_u,
                pre_unloading_volume=pre_vol,
                post_unloading_dip_height=post_h,
                post_unloading_dip_unit=post_u,
                post_unloading_volume=post_vol,
                calibration_chart=chart,
                conversion_method=method,
                notes=alloc_data.get('notes')
            )

    return receipt


@transaction.atomic
def update_tanker_receipt(
    receipt: TankerReceipt,
    data: dict,
    user
) -> TankerReceipt:
    """
    Updates an unconfirmed tanker receipt.
    """
    require_permission(user, receipt.organisation, 'tanker_receipt.update', outlet=receipt.outlet)

    if receipt.status != TankerReceipt.STATUS_RECORDED:
        raise ValidationError(f"Cannot edit receipt in '{receipt.status}' status. Only recorded receipts can be edited.")

    # Update header fields
    simple_fields = [
        'receipt_number', 'invoice_number', 'invoice_date', 'delivery_challan_number',
        'vehicle_registration', 'driver_name', 'driver_phone', 'seal_details',
        'unloading_start_time', 'unloading_end_time', 'notes'
    ]
    for f in simple_fields:
        if f in data:
            setattr(receipt, f, data[f])

    if 'supplier' in data:
        supplier = data['supplier']
        receipt.supplier = supplier
        receipt.supplier_name_snapshot = supplier.name
        receipt.supplier_code_snapshot = supplier.code

    receipt.updated_by = user
    receipt.full_clean()
    receipt.save()

    # If product lines provided, recreate them
    if 'product_lines' in data:
        receipt.product_lines.all().delete()
        for line_data in data['product_lines']:
            product = line_data['product']
            inv_qty = Decimal(str(line_data['invoice_quantity']))
            acc_qty = Decimal(str(line_data.get('accepted_book_quantity', inv_qty)))
            unit_rate = Decimal(str(line_data['unit_rate'])) if line_data.get('unit_rate') is not None else None
            inv_density = Decimal(str(line_data['invoice_density'])) if line_data.get('invoice_density') is not None else None
            obs_density = Decimal(str(line_data['observed_density'])) if line_data.get('observed_density') is not None else None
            obs_temp = Decimal(str(line_data['observed_temperature'])) if line_data.get('observed_temperature') is not None else None
            override_reason = line_data.get('quantity_override_reason')
            remarks = line_data.get('remarks')

            line = TankerReceiptProductLine.objects.create(
                receipt=receipt,
                product=product,
                invoice_quantity=inv_qty,
                accepted_book_quantity=acc_qty,
                unit_rate=unit_rate,
                invoice_density=inv_density,
                observed_density=obs_density,
                observed_temperature=obs_temp,
                quantity_override_reason=override_reason,
                remarks=remarks
            )

            for alloc_data in line_data.get('allocations', []):
                dest_tank = alloc_data['tank']
                alloc_qty = Decimal(str(alloc_data['allocated_book_quantity']))
                pre_h = Decimal(str(alloc_data['pre_unloading_dip_height'])) if alloc_data.get('pre_unloading_dip_height') is not None else None
                pre_u = alloc_data.get('pre_unloading_dip_unit', 'millimetre')
                post_h = Decimal(str(alloc_data['post_unloading_dip_height'])) if alloc_data.get('post_unloading_dip_height') is not None else None
                post_u = alloc_data.get('post_unloading_dip_unit', 'millimetre')

                pre_vol = None
                post_vol = None
                chart = None
                method = None

                if pre_h is not None:
                    try:
                        conv = convert_dip_to_volume(dest_tank, pre_h, pre_u, measured_at=receipt.unloading_end_time)
                        pre_vol = conv['volume']
                        chart = conv['chart']
                        method = conv['method']
                    except ValidationError:
                        pass

                if post_h is not None:
                    try:
                        conv = convert_dip_to_volume(dest_tank, post_h, post_u, measured_at=receipt.unloading_end_time)
                        post_vol = conv['volume']
                        chart = conv['chart']
                        method = conv['method']
                    except ValidationError:
                        pass

                TankerReceiptTankAllocation.objects.create(
                    product_line=line,
                    tank=dest_tank,
                    allocated_book_quantity=alloc_qty,
                    pre_unloading_dip_height=pre_h,
                    pre_unloading_dip_unit=pre_u,
                    pre_unloading_volume=pre_vol,
                    post_unloading_dip_height=post_h,
                    post_unloading_dip_unit=post_u,
                    post_unloading_volume=post_vol,
                    calibration_chart=chart,
                    conversion_method=method,
                    notes=alloc_data.get('notes')
                )

    return receipt


@transaction.atomic
def confirm_tanker_receipt(receipt_id, user) -> TankerReceipt:
    """
    Atomically confirms a TankerReceipt and posts immutable ledger movements.
    Protected with select_for_update().
    Enforces:
    - Dedicated 'tanker_receipt.confirm' permission
    - Allocation sum == line accepted book quantity
    - Book quantity override permission and reason if accepted != invoice
    - Tank-capacity validation
    """
    receipt = TankerReceipt.objects.select_for_update().get(id=receipt_id)
    require_permission(user, receipt.organisation, 'tanker_receipt.confirm', outlet=receipt.outlet)

    if receipt.status == TankerReceipt.STATUS_CONFIRMED:
        return receipt

    if receipt.status == TankerReceipt.STATUS_VOIDED:
        raise ValidationError("Cannot confirm a voided tanker receipt.")

    lines = list(receipt.product_lines.prefetch_related('allocations', 'allocations__tank').all())
    if not lines:
        raise ValidationError("Receipt has no fuel product lines.")

    from apps.inventory.services import post_tanker_receipt_movements, get_or_create_tank_projection

    for line in lines:
        allocations = list(line.allocations.all())
        if not allocations:
            raise ValidationError(f"Product line '{line.product.name}' has no destination tank allocations.")

        total_allocated = sum((a.allocated_book_quantity for a in allocations), Decimal('0.0000'))
        if total_allocated != line.accepted_book_quantity:
            raise ValidationError(
                f"Allocation mismatch for product '{line.product.name}': "
                f"Total allocated ({total_allocated}L) must exactly equal accepted book quantity ({line.accepted_book_quantity}L)."
            )

        # Check override permission
        if line.invoice_quantity != line.accepted_book_quantity:
            if not has_permission(user, receipt.organisation, 'fuel_stock.override_book_quantity', outlet=receipt.outlet):
                raise PermissionDenied("You do not have permission to override accepted book quantity.")
            if not line.quantity_override_reason:
                raise ValidationError(f"A mandatory reason is required for accepted quantity override on '{line.product.name}'.")

        # Tank capacity validation
        for alloc in allocations:
            proj = get_or_create_tank_projection(alloc.tank)
            projected_fill = proj.current_book_stock + alloc.allocated_book_quantity
            max_tolerated = alloc.tank.capacity * Decimal('1.05')
            if projected_fill > max_tolerated:
                raise ValidationError(
                    f"Allocating {alloc.allocated_book_quantity}L to Tank {alloc.tank.code} "
                    f"would cause stock ({projected_fill}L) to exceed physical capacity ({alloc.tank.capacity}L) beyond tolerance."
                )

    receipt.status = TankerReceipt.STATUS_CONFIRMED
    receipt.confirmed_by = user
    receipt.confirmed_at = timezone.now()
    receipt.save()

    # Post immutable stock ledger movements atomically
    post_tanker_receipt_movements(receipt, user)

    return receipt


@transaction.atomic
def void_tanker_receipt(receipt_id, user, void_reason: str) -> TankerReceipt:
    """
    Atomically voids a confirmed tanker receipt and posts reversal movements.
    Protected with select_for_update().
    """
    receipt = TankerReceipt.objects.select_for_update().get(id=receipt_id)
    require_permission(user, receipt.organisation, 'tanker_receipt.void', outlet=receipt.outlet)

    if receipt.status == TankerReceipt.STATUS_VOIDED:
        return receipt

    if receipt.status != TankerReceipt.STATUS_CONFIRMED:
        raise ValidationError("Only confirmed tanker receipts can be voided.")

    if not void_reason or not void_reason.strip():
        raise ValidationError({'void_reason': "A mandatory void reason is required."})

    receipt.status = TankerReceipt.STATUS_VOIDED
    receipt.voided_by = user
    receipt.voided_at = timezone.now()
    receipt.void_reason = void_reason
    receipt.save()

    # Reverse stock ledger movements atomically
    from apps.inventory.services import reverse_tanker_receipt_movements
    reverse_tanker_receipt_movements(receipt, user, void_reason)

    return receipt


@transaction.atomic
def acknowledge_receipt_variance(
    allocation_id,
    user,
    reason: str
) -> TankerReceiptTankAllocation:
    """
    Records acknowledgement of stock variance on a tank allocation.
    Does not modify the calculated variance.
    """
    alloc = TankerReceiptTankAllocation.objects.select_for_update().get(id=allocation_id)
    receipt = alloc.product_line.receipt
    require_permission(user, receipt.organisation, 'fuel_stock.adjust', outlet=receipt.outlet)

    if not reason or not reason.strip():
        raise ValidationError({'reason': "A reason is mandatory when acknowledging a variance."})

    alloc.variance_status = TankerReceiptTankAllocation.STATUS_ACKNOWLEDGED
    alloc.variance_acknowledged_at = timezone.now()
    alloc.variance_acknowledged_by = user
    alloc.variance_acknowledgement_reason = reason
    alloc.save()

    return alloc


@transaction.atomic
def upload_receipt_attachment(
    receipt: TankerReceipt,
    file,
    attachment_type: str,
    user
) -> TankerReceiptAttachment:
    """
    Secure attachment upload for tanker receipts.
    Post-confirmation uploads are permission-guarded and audited.
    """
    if receipt.status == TankerReceipt.STATUS_CONFIRMED:
        require_permission(user, receipt.organisation, 'tanker_receipt.update', outlet=receipt.outlet)
    else:
        require_permission(user, receipt.organisation, 'tanker_receipt.create', outlet=receipt.outlet)

    if file.size > 5 * 1024 * 1024:
        raise ValidationError("Attachment exceeds maximum allowed size of 5MB.")

    import os
    ext = os.path.splitext(file.name)[1].lower()
    if ext not in ['.pdf', '.png', '.jpg', '.jpeg']:
        raise ValidationError(f"Unsupported file extension '{ext}'. Allowed: .pdf, .png, .jpg, .jpeg")

    content_type = getattr(file, 'content_type', 'application/octet-stream')

    att = TankerReceiptAttachment.objects.create(
        receipt=receipt,
        file=file,
        attachment_type=attachment_type,
        file_name=file.name,
        file_size=file.size,
        content_type=content_type,
        uploaded_by=user
    )
    return att
