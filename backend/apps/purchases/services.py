# apps/purchases/services.py
from decimal import Decimal
from django.db import models, transaction
from django.core.exceptions import ValidationError, PermissionDenied
from django.utils import timezone
from apps.organizations.models import Organisation, Outlet
from apps.forecourt.models import Tank, FuelProduct
from apps.operations.services import convert_dip_to_volume
from apps.organizations.permissions import require_permission, has_permission
from .models import (
    Supplier, TankerReceipt, TankerReceiptProductLine,
    TankerReceiptTankAllocation, TankerReceiptAttachment,
    PurchaseBillSequence, PurchaseBill, PurchaseBillReceiptLink,
    PurchaseBillLine, PurchaseBillAdjustmentComponent,
    PurchaseBillAttachment, PurchaseBillAuditLog,
    PurchaseTaxCode, PurchaseTaxCodeRate, PurchaseTaxCodeComponent,
    PurchaseItem, ProductPurchaseTaxMapping, PurchaseBillOtherCharge
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
    gstin: str | None = None,
    gst_registration_type: str = 'pending_review',
    state: str | None = None,
    state_code: str | None = None,
    tax_treatment: str = 'regular',
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
        gstin=gstin,
        gst_registration_type=gst_registration_type,
        state=state,
        state_code=state_code,
        tax_treatment=tax_treatment,
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


@transaction.atomic
def create_purchase_tax_code(
    organisation: Organisation,
    code: str,
    name: str,
    tax_regime: str = PurchaseTaxCode.REGIME_GST,
    description: str | None = None,
    is_active: bool = True
) -> PurchaseTaxCode:
    tc = PurchaseTaxCode(
        organisation=organisation,
        code=code,
        name=name,
        tax_regime=tax_regime,
        description=description,
        is_active=is_active
    )
    tc.full_clean()
    tc.save()
    return tc


@transaction.atomic
def update_purchase_tax_code(tax_code: PurchaseTaxCode, **kwargs) -> PurchaseTaxCode:
    for attr, val in kwargs.items():
        if hasattr(tax_code, attr):
            setattr(tax_code, attr, val)
    tax_code.full_clean()
    tax_code.save()
    return tax_code


@transaction.atomic
def create_purchase_tax_code_rate(
    tax_code: PurchaseTaxCode,
    effective_from,
    effective_to=None,
    gst_rate: Decimal = Decimal('0.00'),
    cess_rate: Decimal = Decimal('0.00'),
    cess_per_unit: Decimal = Decimal('0.0000'),
    notes: str | None = None,
    components_data: list[dict] | None = None
) -> PurchaseTaxCodeRate:
    rate = PurchaseTaxCodeRate(
        tax_code=tax_code,
        effective_from=effective_from,
        effective_to=effective_to,
        gst_rate=gst_rate,
        cess_rate=cess_rate,
        cess_per_unit=cess_per_unit,
        notes=notes
    )
    rate.full_clean()
    rate.save()

    if components_data:
        for idx, comp in enumerate(components_data, start=1):
            c = PurchaseTaxCodeComponent(
                rate_version=rate,
                name=comp['name'],
                component_type=comp.get('component_type', PurchaseTaxCodeComponent.TYPE_VAT),
                calculation_base=comp.get('calculation_base', PurchaseTaxCodeComponent.BASE_DISCOUNTED_LINE),
                calculation_type=comp.get('calculation_type', PurchaseTaxCodeComponent.CALC_PERCENTAGE),
                rate_value=Decimal(str(comp.get('rate_value', '0'))),
                is_inclusive=comp.get('is_inclusive', False),
                sequence=comp.get('sequence', idx)
            )
            c.full_clean()
            c.save()

    return rate


@transaction.atomic
def update_purchase_tax_code_rate(
    rate_version: PurchaseTaxCodeRate,
    **kwargs
) -> PurchaseTaxCodeRate:
    if rate_version.is_locked():
        allowed_keys = {'effective_to', 'notes'}
        disallowed = set(kwargs.keys()) - allowed_keys
        if disallowed:
            raise ValidationError(
                f"Cannot modify rate fields {disallowed} on a locked tax code rate version that has been used in recorded purchase bills. Create a new effective-dated version instead."
            )
    for k, v in kwargs.items():
        if hasattr(rate_version, k):
            setattr(rate_version, k, v)
    rate_version.full_clean()
    rate_version.save()
    return rate_version


@transaction.atomic
def create_purchase_item(
    organisation: Organisation,
    code: str,
    name: str,
    item_type: str = PurchaseItem.TYPE_GOODS,
    unit: str = 'NOS',
    hsn_sac: str | None = None,
    purchase_tax_treatment: str = PurchaseItem.TREATMENT_GST,
    default_purchase_tax_code: PurchaseTaxCode | None = None,
    default_itc_classification: str = PurchaseItem.ITC_PENDING_REVIEW,
    is_active: bool = True
) -> PurchaseItem:
    item = PurchaseItem(
        organisation=organisation,
        code=code,
        name=name,
        item_type=item_type,
        unit=unit,
        hsn_sac=hsn_sac,
        purchase_tax_treatment=purchase_tax_treatment,
        default_purchase_tax_code=default_purchase_tax_code,
        default_itc_classification=default_itc_classification,
        is_active=is_active
    )
    item.full_clean()
    item.save()
    return item


@transaction.atomic
def update_purchase_item(
    item: PurchaseItem,
    **kwargs
) -> PurchaseItem:
    for k, v in kwargs.items():
        if hasattr(item, k):
            setattr(item, k, v)
    item.full_clean()
    item.save()
    return item


@transaction.atomic
def create_or_update_product_tax_mapping(
    organisation: Organisation,
    fuel_product: FuelProduct | None = None,
    purchase_item: PurchaseItem | None = None,
    purchase_tax_treatment: str = 'non_gst_petroleum',
    hsn_sac: str | None = None,
    purchase_tax_code: PurchaseTaxCode | None = None,
    default_itc_classification: str = 'not_applicable',
    purchase_unit: str = 'Litre'
) -> ProductPurchaseTaxMapping:
    if not fuel_product and not purchase_item:
        raise ValidationError("Either fuel_product or purchase_item must be specified.")
    if fuel_product and purchase_item:
        raise ValidationError("Cannot map both fuel_product and purchase_item.")

    lookup = {'fuel_product': fuel_product} if fuel_product else {'purchase_item': purchase_item}
    mapping, _ = ProductPurchaseTaxMapping.objects.get_or_create(
        organisation=organisation,
        **lookup,
        defaults={
            'purchase_tax_treatment': purchase_tax_treatment,
            'hsn_sac': hsn_sac,
            'purchase_tax_code': purchase_tax_code,
            'default_itc_classification': default_itc_classification,
            'purchase_unit': purchase_unit
        }
    )
    mapping.purchase_tax_treatment = purchase_tax_treatment
    mapping.hsn_sac = hsn_sac
    mapping.purchase_tax_code = purchase_tax_code
    mapping.default_itc_classification = default_itc_classification
    mapping.purchase_unit = purchase_unit
    mapping.full_clean()
    mapping.save()
    return mapping


def resolve_tax_code_rate_version(
    tax_code: PurchaseTaxCode,
    invoice_date,
    organisation: Organisation
) -> PurchaseTaxCodeRate:
    if tax_code.organisation_id != organisation.id:
        raise ValidationError(f"Tax code '{tax_code.code}' does not belong to organisation '{organisation.name}'.")

    matching_rates = list(tax_code.rates.filter(
        effective_from__lte=invoice_date
    ).filter(
        models.Q(effective_to__isnull=True) | models.Q(effective_to__gte=invoice_date)
    ))

    if not matching_rates:
        raise ValidationError(f"No effective tax rate version found for tax code '{tax_code.code}' on invoice date {invoice_date}.")
    if len(matching_rates) > 1:
        raise ValidationError(f"Multiple overlapping effective tax rate versions found for tax code '{tax_code.code}' on invoice date {invoice_date}.")

    return matching_rates[0]


def determine_place_of_supply_and_interstate(
    organisation: Organisation,
    outlet: Outlet,
    supplier: Supplier,
    is_place_of_supply_overridden: bool = False,
    place_of_supply_override_reason: str | None = None,
    place_of_supply_state: str | None = None,
    place_of_supply_state_code: str | None = None,
) -> tuple[str, str, bool]:
    """
    Returns (pos_state, pos_state_code, is_interstate)
    """
    default_pos_state = (outlet.state or organisation.state or '').strip()
    default_pos_code = (
        outlet.state_code or organisation.state_code or
        (outlet.gstin[:2] if outlet.gstin and len(outlet.gstin) >= 2 else (
            organisation.gstin[:2] if organisation.gstin and len(organisation.gstin) >= 2 else ''
        ))
    ).strip()

    if is_place_of_supply_overridden:
        if not place_of_supply_override_reason or len(place_of_supply_override_reason.strip()) < 5:
            raise ValidationError({'place_of_supply_override_reason': "A detailed reason (min 5 chars) is required when overriding Place of Supply."})
        pos_state = (place_of_supply_state or '').strip()
        pos_code = (place_of_supply_state_code or '').strip()
    else:
        pos_state = default_pos_state
        pos_code = default_pos_code

    supplier_state = (supplier.state or '').strip()
    supplier_code = (supplier.state_code or (supplier.gstin[:2] if supplier.gstin and len(supplier.gstin) >= 2 else '')).strip()

    is_interstate = False
    if pos_code and supplier_code:
        is_interstate = (pos_code != supplier_code)
    elif pos_state and supplier_state:
        is_interstate = (pos_state.lower() != supplier_state.lower())

    return pos_state, pos_code, is_interstate


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

    # Guard: check if linked to any active purchase bill
    if receipt.bill_links.filter(released_at__isnull=True).exists():
        active_bill = receipt.bill_links.filter(released_at__isnull=True).first().purchase_bill
        raise ValidationError(
            f"Cannot void Tanker Receipt {receipt.receipt_number} because it is linked to active Purchase Bill {active_bill.bill_number}. "
            f"Please void or update the Purchase Bill first."
        )

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


# ============================================================================
# Milestone 12: Purchase Bills & Supplier Outstanding Services
# ============================================================================

def normalize_invoice_number(num: str) -> str:
    """
    Normalizes a supplier invoice number for comparison:
    - Trims whitespace
    - Uppercase conversion
    - Strips internal repeated whitespace
    """
    if not num:
        return ''
    return ' '.join(num.strip().upper().split())


def generate_next_bill_number(outlet: Outlet, year: int | None = None) -> str:
    """
    Generates a thread-safe, concurrency-locked internal bill number.
    Format: PB-YYYY-XXXX. Protected by select_for_update().
    """
    if year is None:
        year = timezone.now().year

    seq, _ = PurchaseBillSequence.objects.select_for_update().get_or_create(
        outlet=outlet,
        year=year,
        defaults={'last_sequence': 0}
    )
    seq.last_sequence += 1
    seq.save()
    return f"PB-{year}-{seq.last_sequence:04d}"


def calculate_bill_totals(lines_data: list[dict], adjustments_data: list[dict]) -> dict:
    """
    Authoritative server-side calculations using Decimal arithmetic.
    Correction 5 rule:
    All percentage adjustments use (Gross line total - line discounts) as base.
    """
    processed_lines = []
    subtotal = Decimal('0.00')
    line_discounts_total = Decimal('0.00')

    for idx, l in enumerate(lines_data, start=1):
        qty = Decimal(str(l.get('quantity', '0'))).quantize(Decimal('0.0001'))
        rate = Decimal(str(l.get('unit_rate', '0'))).quantize(Decimal('0.0001'))
        gross = (qty * rate).quantize(Decimal('0.01'))
        discount = Decimal(str(l.get('discount_amount', '0'))).quantize(Decimal('0.01'))
        taxable = max(Decimal('0.00'), gross - discount)
        line_total = taxable

        subtotal += gross
        line_discounts_total += discount

        processed_lines.append({
            'line_number': l.get('line_number', idx),
            'tanker_receipt_line_id': l.get('tanker_receipt_line_id'),
            'line_type': l.get('line_type', PurchaseBillLine.LINE_TYPE_FUEL),
            'description': l.get('description'),
            'product_id': l.get('product_id'),
            'quantity': qty,
            'unit': l.get('unit', 'Litre'),
            'unit_rate': rate,
            'gross_amount': gross,
            'discount_amount': discount,
            'taxable_amount': taxable,
            'line_total': line_total,
            'quantity_override_reason': l.get('quantity_override_reason'),
            'notes': l.get('notes')
        })

    # Percentage calculation base (Correction 5)
    percentage_base = max(Decimal('0.00'), subtotal - line_discounts_total)

    processed_adjustments = []
    adj_discount_total = Decimal('0.00')
    tax_total = Decimal('0.00')
    additional_charges_total = Decimal('0.00')
    round_off_amount = Decimal('0.00')

    for idx, adj in enumerate(adjustments_data, start=1):
        comp_type = adj.get('component_type', PurchaseBillAdjustmentComponent.TYPE_CHARGE)
        calc_type = adj.get('calculation_type', PurchaseBillAdjustmentComponent.CALC_FIXED)
        pct_rate = None

        if calc_type == PurchaseBillAdjustmentComponent.CALC_PERCENTAGE:
            pct_rate = Decimal(str(adj.get('percentage_rate', '0'))).quantize(Decimal('0.0001'))
            amount = (percentage_base * pct_rate / Decimal('100')).quantize(Decimal('0.01'))
        else:
            amount = Decimal(str(adj.get('calculated_amount', adj.get('amount', '0')))).quantize(Decimal('0.01'))

        if comp_type == PurchaseBillAdjustmentComponent.TYPE_DISCOUNT:
            adj_discount_total += amount
        elif comp_type == PurchaseBillAdjustmentComponent.TYPE_TAX:
            tax_total += amount
        elif comp_type == PurchaseBillAdjustmentComponent.TYPE_CHARGE:
            additional_charges_total += amount
        elif comp_type == PurchaseBillAdjustmentComponent.TYPE_ROUND_OFF:
            round_off_amount += amount

        processed_adjustments.append({
            'label': adj.get('label', 'Adjustment'),
            'component_type': comp_type,
            'calculation_type': calc_type,
            'percentage_rate': pct_rate,
            'calculated_amount': amount,
            'sequence': adj.get('sequence', idx),
            'notes': adj.get('notes')
        })

    total_discounts = line_discounts_total + adj_discount_total
    grand_total = subtotal - total_discounts + tax_total + additional_charges_total + round_off_amount
    amount_paid = Decimal('0.00')
    outstanding_amount = grand_total - amount_paid

    return {
        'lines': processed_lines,
        'adjustments': processed_adjustments,
        'subtotal': subtotal,
        'discount_total': total_discounts,
        'additional_charges_total': additional_charges_total,
        'tax_total': tax_total,
        'round_off_amount': round_off_amount,
        'grand_total': grand_total,
        'amount_paid': amount_paid,
        'outstanding_amount': outstanding_amount,
    }


def calculate_bill_totals_v2(
    organisation: Organisation,
    outlet: Outlet,
    supplier: Supplier,
    invoice_date,
    lines_data: list[dict],
    other_charges_data: list[dict] | None = None,
    tax_price_mode: str = PurchaseBill.TAX_MODE_EXCLUSIVE,
    discount_mode: str = PurchaseBill.DISCOUNT_MODE_LINE,
    transaction_discount_method: str = PurchaseBill.DISCOUNT_METHOD_NONE,
    transaction_discount_amount: Decimal = Decimal('0.00'),
    transaction_discount_percentage: Decimal | None = None,
    is_place_of_supply_overridden: bool = False,
    place_of_supply_override_reason: str | None = None,
    place_of_supply_state: str | None = None,
    place_of_supply_state_code: str | None = None,
    round_off_amount: Decimal = Decimal('0.00'),
) -> dict:
    """
    Authoritative Item Tax V2 calculation engine.
    Supports GST, Non-GST petroleum with multi-component levies, inclusive/exclusive pricing,
    Place of Supply determination, and transaction discount allocation with residual balancing.
    """
    if supplier.gst_registration_type == 'overseas':
        raise ValidationError("Overseas / Import purchase bills are blocked from normal automatic tax calculation until those workflows exist.")

    pos_state, pos_code, is_interstate = determine_place_of_supply_and_interstate(
        organisation=organisation,
        outlet=outlet,
        supplier=supplier,
        is_place_of_supply_overridden=is_place_of_supply_overridden,
        place_of_supply_override_reason=place_of_supply_override_reason,
        place_of_supply_state=place_of_supply_state,
        place_of_supply_state_code=place_of_supply_state_code
    )

    processed_lines = []
    lines_gross_subtotal = Decimal('0.00')

    for idx, l in enumerate(lines_data, start=1):
        qty = Decimal(str(l.get('quantity', '0'))).quantize(Decimal('0.0001'))
        rate = Decimal(str(l.get('unit_rate', '0'))).quantize(Decimal('0.0001'))
        gross = (qty * rate).quantize(Decimal('0.01'))
        lines_gross_subtotal += gross

        processed_lines.append({
            'raw': l,
            'line_number': l.get('line_number', idx),
            'quantity': qty,
            'unit': l.get('unit', 'Litre'),
            'unit_rate': rate,
            'gross_amount': gross,
        })

    # Discount handling
    total_tx_discount = Decimal('0.00')
    if discount_mode == PurchaseBill.DISCOUNT_MODE_TRANSACTION:
        if transaction_discount_method == PurchaseBill.DISCOUNT_METHOD_NONE:
            if (transaction_discount_amount and transaction_discount_amount > Decimal('0.00')) or (transaction_discount_percentage and transaction_discount_percentage > Decimal('0.00')):
                raise ValidationError("Transaction discount amount and percentage must be 0 when method is none.")
            total_tx_discount = Decimal('0.00')
        elif transaction_discount_method == PurchaseBill.DISCOUNT_METHOD_FIXED:
            if transaction_discount_percentage is not None and transaction_discount_percentage > Decimal('0.00'):
                raise ValidationError("Transaction discount percentage cannot be specified when method is fixed amount.")
            total_tx_discount = Decimal(str(transaction_discount_amount or '0')).quantize(Decimal('0.01'))
        elif transaction_discount_method == PurchaseBill.DISCOUNT_METHOD_PERCENTAGE:
            if transaction_discount_amount and transaction_discount_amount > Decimal('0.00'):
                raise ValidationError("Transaction discount amount cannot be specified when method is percentage.")
            pct = Decimal(str(transaction_discount_percentage or '0'))
            total_tx_discount = (lines_gross_subtotal * pct / Decimal('100')).quantize(Decimal('0.01'))

        allocated_so_far = Decimal('0.00')
        num_lines = len(processed_lines)
        for idx, pline in enumerate(processed_lines):
            if idx == num_lines - 1:
                alloc = max(Decimal('0.00'), total_tx_discount - allocated_so_far)
            else:
                if lines_gross_subtotal > Decimal('0.00'):
                    alloc = (total_tx_discount * pline['gross_amount'] / lines_gross_subtotal).quantize(Decimal('0.01'))
                else:
                    alloc = Decimal('0.00')
                allocated_so_far += alloc
            pline['allocated_transaction_discount'] = alloc
            pline['discount_amount'] = alloc
            pline['discount_method'] = PurchaseBillLine.DISCOUNT_METHOD_NONE
            pline['discount_percentage'] = None
    else:
        for pline in processed_lines:
            l = pline['raw']
            d_method = l.get('discount_method')
            d_amt = Decimal(str(l.get('discount_amount', '0'))).quantize(Decimal('0.01')) if l.get('discount_amount') is not None else Decimal('0.00')
            d_pct = Decimal(str(l.get('discount_percentage', '0'))) if l.get('discount_percentage') is not None else None

            if not d_method:
                d_method = PurchaseBillLine.DISCOUNT_METHOD_FIXED if d_amt > Decimal('0.00') else (
                    PurchaseBillLine.DISCOUNT_METHOD_PERCENTAGE if d_pct is not None else PurchaseBillLine.DISCOUNT_METHOD_NONE
                )

            if d_method == PurchaseBillLine.DISCOUNT_METHOD_NONE:
                if d_amt > Decimal('0.00') or (d_pct is not None and d_pct > Decimal('0.00')):
                    raise ValidationError("Discount amount and percentage must be 0 when discount method is none.")
                effective_discount = Decimal('0.00')
                d_pct = None
            elif d_method == PurchaseBillLine.DISCOUNT_METHOD_FIXED:
                if d_pct is not None and d_pct > Decimal('0.00'):
                    raise ValidationError("Discount percentage cannot be specified when discount method is fixed amount.")
                effective_discount = d_amt
                d_pct = None
            elif d_method == PurchaseBillLine.DISCOUNT_METHOD_PERCENTAGE:
                if d_amt > Decimal('0.00'):
                    raise ValidationError("Discount amount cannot be specified when discount method is percentage.")
                if d_pct is None:
                    d_pct = Decimal('0.00')
                effective_discount = (pline['gross_amount'] * d_pct / Decimal('100')).quantize(Decimal('0.01'))
            else:
                effective_discount = d_amt

            pline['allocated_transaction_discount'] = Decimal('0.00')
            pline['discount_amount'] = effective_discount
            pline['discount_method'] = d_method
            pline['discount_percentage'] = d_pct

    taxable_lines_sum = Decimal('0.00')
    cgst_lines_sum = Decimal('0.00')
    sgst_lines_sum = Decimal('0.00')
    igst_lines_sum = Decimal('0.00')
    cess_lines_sum = Decimal('0.00')
    petroleum_tax_lines_sum = Decimal('0.00')
    final_lines = []

    for pline in processed_lines:
        l = pline['raw']
        gross = pline['gross_amount']
        discount = pline['discount_amount']
        net_after_discount = max(Decimal('0.00'), gross - discount)
        qty = pline['quantity']

        tax_treatment = l.get('tax_treatment', 'gst')
        itc_classification = l.get('itc_classification', PurchaseItem.ITC_PENDING_REVIEW)

        tax_code = None
        rate_version = None
        tax_code_id = l.get('tax_code_id') or (l.get('tax_code').id if hasattr(l.get('tax_code'), 'id') else None)
        if tax_code_id:
            tax_code = PurchaseTaxCode.objects.get(id=tax_code_id, organisation=organisation)
            rate_version = resolve_tax_code_rate_version(tax_code, invoice_date, organisation)

        if tax_treatment == 'gst' and supplier.gst_registration_type in ('unregistered', 'composition'):
            if (rate_version and rate_version.gst_rate > Decimal('0.00')) or Decimal(str(l.get('gst_rate', '0'))) > Decimal('0.00'):
                raise ValidationError(f"Supplier '{supplier.name}' ({supplier.get_gst_registration_type_display()}) cannot charge GST.")

        cgst_rate = Decimal('0.00')
        cgst_amount = Decimal('0.00')
        sgst_rate = Decimal('0.00')
        sgst_amount = Decimal('0.00')
        igst_rate = Decimal('0.00')
        igst_amount = Decimal('0.00')
        cess_rate = Decimal('0.00')
        cess_amount = Decimal('0.00')
        petroleum_tax_amount = Decimal('0.00')
        tax_components_snapshot = []
        gst_rate = Decimal('0.00')

        if tax_treatment == 'gst':
            gst_rate = rate_version.gst_rate if rate_version else Decimal(str(l.get('gst_rate', '0.00'))).quantize(Decimal('0.01'))
            c_rate = rate_version.cess_rate if rate_version else Decimal(str(l.get('cess_rate', '0.00'))).quantize(Decimal('0.01'))
            c_per_unit = rate_version.cess_per_unit if rate_version else Decimal(str(l.get('cess_per_unit', '0.0000'))).quantize(Decimal('0.0001'))

            cess_rate = c_rate

            if is_interstate:
                igst_rate = gst_rate
                cgst_rate = Decimal('0.00')
                sgst_rate = Decimal('0.00')
            else:
                half_rate = (gst_rate / Decimal('2')).quantize(Decimal('0.01'))
                cgst_rate = half_rate
                sgst_rate = half_rate
                igst_rate = Decimal('0.00')

            if tax_price_mode == PurchaseBill.TAX_MODE_INCLUSIVE:
                per_unit_cess = (qty * c_per_unit).quantize(Decimal('0.01'))
                inclusive_net = max(Decimal('0.00'), net_after_discount - per_unit_cess)
                total_pct = gst_rate + cess_rate
                taxable_amount = (inclusive_net / (Decimal('1') + total_pct / Decimal('100'))).quantize(Decimal('0.01'))

                if is_interstate:
                    igst_amount = (taxable_amount * igst_rate / Decimal('100')).quantize(Decimal('0.01'))
                else:
                    cgst_amount = (taxable_amount * cgst_rate / Decimal('100')).quantize(Decimal('0.01'))
                    sgst_amount = (taxable_amount * sgst_rate / Decimal('100')).quantize(Decimal('0.01'))

                pct_cess = (taxable_amount * cess_rate / Decimal('100')).quantize(Decimal('0.01'))
                cess_amount = pct_cess + per_unit_cess
                line_total = net_after_discount
            else:
                taxable_amount = net_after_discount
                if is_interstate:
                    igst_amount = (taxable_amount * igst_rate / Decimal('100')).quantize(Decimal('0.01'))
                else:
                    cgst_amount = (taxable_amount * cgst_rate / Decimal('100')).quantize(Decimal('0.01'))
                    sgst_amount = (taxable_amount * sgst_rate / Decimal('100')).quantize(Decimal('0.01'))

                pct_cess = (taxable_amount * cess_rate / Decimal('100')).quantize(Decimal('0.01'))
                per_unit_cess = (qty * c_per_unit).quantize(Decimal('0.01'))
                cess_amount = pct_cess + per_unit_cess
                line_total = taxable_amount + cgst_amount + sgst_amount + igst_amount + cess_amount

        elif tax_treatment == 'non_gst_petroleum':
            taxable_amount = net_after_discount
            is_manual = l.get('is_petroleum_manual_override', False)
            manual_reason = l.get('petroleum_manual_override_reason')

            if is_manual:
                if not manual_reason or len(manual_reason.strip()) < 5:
                    raise ValidationError({'petroleum_manual_override_reason': "A detailed reason (min 5 chars) is required when overriding petroleum taxes."})
                petroleum_tax_amount = Decimal(str(l.get('petroleum_tax_amount', '0.00'))).quantize(Decimal('0.01'))
            else:
                petro_tax_calc = Decimal('0.00')
                running_val = taxable_amount
                if rate_version:
                    for comp in rate_version.components.all():
                        c_val = Decimal('0.00')
                        if comp.calculation_base in (PurchaseTaxCodeComponent.BASE_DISCOUNTED_LINE, PurchaseTaxCodeComponent.BASE_TAXABLE_VALUE):
                            base = taxable_amount
                        elif comp.calculation_base == PurchaseTaxCodeComponent.BASE_VALUE_PLUS_PREV:
                            base = running_val
                        elif comp.calculation_base == PurchaseTaxCodeComponent.BASE_QUANTITY:
                            base = qty
                        else:
                            base = taxable_amount

                        if comp.calculation_type == PurchaseTaxCodeComponent.CALC_PERCENTAGE:
                            c_val = (base * comp.rate_value / Decimal('100')).quantize(Decimal('0.01'))
                        elif comp.calculation_type == PurchaseTaxCodeComponent.CALC_PER_UNIT:
                            c_val = (qty * comp.rate_value).quantize(Decimal('0.01'))
                        elif comp.calculation_type == PurchaseTaxCodeComponent.CALC_FIXED:
                            c_val = comp.rate_value.quantize(Decimal('0.01'))

                        petro_tax_calc += c_val
                        running_val += c_val
                        tax_components_snapshot.append({
                            'name': comp.name,
                            'type': comp.component_type,
                            'base': comp.calculation_base,
                            'rate_value': str(comp.rate_value),
                            'amount': str(c_val)
                        })
                petroleum_tax_amount = petro_tax_calc

            line_total = taxable_amount + petroleum_tax_amount
            itc_classification = PurchaseItem.ITC_NOT_APPLICABLE
        elif tax_treatment in ['exempt', 'nil_rated', 'out_of_scope']:
            taxable_amount = Decimal('0.00')
            line_total = net_after_discount
            itc_classification = PurchaseItem.ITC_NOT_APPLICABLE
        else:
            taxable_amount = net_after_discount
            line_total = taxable_amount
            itc_classification = PurchaseItem.ITC_NOT_APPLICABLE

        if tax_treatment == 'gst':
            taxable_lines_sum += taxable_amount
        cgst_lines_sum += cgst_amount
        sgst_lines_sum += sgst_amount
        igst_lines_sum += igst_amount
        cess_lines_sum += cess_amount
        petroleum_tax_lines_sum += petroleum_tax_amount

        final_lines.append({
            'line_number': pline['line_number'],
            'tanker_receipt_line_id': l.get('tanker_receipt_line_id'),
            'line_type': l.get('line_type', PurchaseBillLine.LINE_TYPE_FUEL),
            'description': l.get('description'),
            'product_id': l.get('product_id'),
            'purchase_item_id': l.get('purchase_item_id'),
            'tax_treatment': tax_treatment,
            'tax_code': tax_code,
            'tax_code_rate_version': rate_version,
            'tax_code_snapshot': tax_code.code if tax_code else None,
            'hsn_sac': l.get('hsn_sac') or (tax_code.code if tax_code else None),
            'itc_classification': itc_classification,
            'discount_method': pline['discount_method'],
            'discount_percentage': pline['discount_percentage'],
            'allocated_transaction_discount': pline['allocated_transaction_discount'],
            'tax_components_snapshot': tax_components_snapshot,
            'quantity': qty,
            'unit': pline['unit'],
            'unit_rate': pline['unit_rate'],
            'gross_amount': gross,
            'discount_amount': discount,
            'taxable_amount': taxable_amount,
            'gst_rate': gst_rate if tax_treatment == 'gst' else Decimal('0.00'),
            'cgst_rate': cgst_rate,
            'cgst_amount': cgst_amount,
            'sgst_rate': sgst_rate,
            'sgst_amount': sgst_amount,
            'igst_rate': igst_rate,
            'igst_amount': igst_amount,
            'cess_rate': cess_rate,
            'cess_amount': cess_amount,
            'petroleum_tax_amount': petroleum_tax_amount,
            'is_petroleum_manual_override': l.get('is_petroleum_manual_override', False),
            'petroleum_manual_override_reason': l.get('petroleum_manual_override_reason'),
            'line_total': line_total,
            'quantity_override_reason': l.get('quantity_override_reason'),
            'notes': l.get('notes')
        })

    # Other charges
    processed_charges = []
    other_charges_subtotal = Decimal('0.00')
    other_charges_taxable_total = Decimal('0.00')
    cgst_charges_sum = Decimal('0.00')
    sgst_charges_sum = Decimal('0.00')
    igst_charges_sum = Decimal('0.00')

    charges_data = other_charges_data or []
    lines_net_base = max(Decimal('0.00'), lines_gross_subtotal - (total_tx_discount if discount_mode == PurchaseBill.DISCOUNT_MODE_TRANSACTION else sum(pl['discount_amount'] for pl in processed_lines)))

    for idx, c in enumerate(charges_data, start=1):
        c_calc_type = c.get('calculation_type', PurchaseBillOtherCharge.CALC_FIXED)
        c_pct_rate = None
        if c_calc_type == PurchaseBillOtherCharge.CALC_PERCENTAGE:
            c_pct_rate = Decimal(str(c.get('percentage_rate', '0'))).quantize(Decimal('0.01'))
            amount = (lines_net_base * c_pct_rate / Decimal('100')).quantize(Decimal('0.01'))
        else:
            amount = Decimal(str(c.get('amount', '0'))).quantize(Decimal('0.01'))

        c_treatment = c.get('tax_treatment', PurchaseBillOtherCharge.TREATMENT_TAXABLE)
        c_tax_code = None
        c_rate_version = None
        c_tax_code_id = c.get('tax_code_id') or (c.get('tax_code').id if hasattr(c.get('tax_code'), 'id') else None)
        if c_tax_code_id:
            c_tax_code = PurchaseTaxCode.objects.get(id=c_tax_code_id, organisation=organisation)
            c_rate_version = resolve_tax_code_rate_version(c_tax_code, invoice_date, organisation)

        c_gst_rate = c_rate_version.gst_rate if c_rate_version else Decimal(str(c.get('gst_rate', '0.00'))).quantize(Decimal('0.01'))
        c_cgst = Decimal('0.00')
        c_sgst = Decimal('0.00')
        c_igst = Decimal('0.00')

        if c_treatment == PurchaseBillOtherCharge.TREATMENT_TAXABLE:
            other_charges_taxable_total += amount
            if is_interstate:
                c_igst = (amount * c_gst_rate / Decimal('100')).quantize(Decimal('0.01'))
            else:
                half = (c_gst_rate / Decimal('2')).quantize(Decimal('0.01'))
                c_cgst = (amount * half / Decimal('100')).quantize(Decimal('0.01'))
                c_sgst = (amount * half / Decimal('100')).quantize(Decimal('0.01'))

        total_charge_amt = amount + c_cgst + c_sgst + c_igst

        other_charges_subtotal += amount
        cgst_charges_sum += c_cgst
        sgst_charges_sum += c_sgst
        igst_charges_sum += c_igst

        processed_charges.append({
            'sequence': c.get('sequence', idx),
            'charge_type': c.get('charge_type', PurchaseBillOtherCharge.CHARGE_FREIGHT),
            'description': c.get('description', 'Other Charge'),
            'calculation_type': c_calc_type,
            'percentage_rate': c_pct_rate,
            'amount': amount,
            'tax_treatment': c_treatment,
            'hsn_sac': c.get('hsn_sac'),
            'tax_code': c_tax_code,
            'tax_code_rate_version': c_rate_version,
            'gst_rate': c_gst_rate,
            'cgst_amount': c_cgst,
            'sgst_amount': c_sgst,
            'igst_amount': c_igst,
            'total_amount': total_charge_amt
        })

    taxable_value_total = taxable_lines_sum + other_charges_taxable_total
    cgst_total = cgst_lines_sum + cgst_charges_sum
    sgst_total = sgst_lines_sum + sgst_charges_sum
    igst_total = igst_lines_sum + igst_charges_sum
    gst_cess_total = cess_lines_sum
    petroleum_tax_total = petroleum_tax_lines_sum

    other_charges_tax_total = cgst_charges_sum + sgst_charges_sum + igst_charges_sum
    subtotal = lines_gross_subtotal
    total_discounts = sum(pl['discount_amount'] for pl in final_lines)
    tax_total = cgst_total + sgst_total + igst_total + gst_cess_total + petroleum_tax_total
    additional_charges_total = other_charges_subtotal

    if tax_price_mode == PurchaseBill.TAX_MODE_INCLUSIVE:
        grand_total = (subtotal - total_discounts) + additional_charges_total + other_charges_tax_total + round_off_amount
    else:
        grand_total = subtotal - total_discounts + tax_total + additional_charges_total + round_off_amount
    amount_paid = Decimal('0.00')
    outstanding_amount = grand_total - amount_paid

    return {
        'lines': final_lines,
        'other_charges': processed_charges,
        'adjustments': [],
        'subtotal': subtotal,
        'discount_total': total_discounts,
        'taxable_value_total': taxable_value_total,
        'cgst_total': cgst_total,
        'sgst_total': sgst_total,
        'igst_total': igst_total,
        'gst_cess_total': gst_cess_total,
        'petroleum_tax_total': petroleum_tax_total,
        'other_charges_subtotal': other_charges_subtotal,
        'other_charges_tax_total': other_charges_tax_total,
        'additional_charges_total': additional_charges_total,
        'tax_total': tax_total,
        'round_off_amount': round_off_amount,
        'grand_total': grand_total,
        'amount_paid': amount_paid,
        'outstanding_amount': outstanding_amount,
        'is_interstate': is_interstate,
        'place_of_supply_state': pos_state,
        'place_of_supply_state_code': pos_code,
    }


@transaction.atomic
def create_purchase_bill(
    organisation: Organisation,
    outlet: Outlet,
    supplier: Supplier,
    supplier_invoice_number: str,
    invoice_date,
    due_date,
    lines_data: list[dict],
    user,
    adjustments_data: list[dict] | None = None,
    other_charges_data: list[dict] | None = None,
    received_date=None,
    bill_number: str | None = None,
    currency: str = 'INR',
    notes: str | None = None,
    calculation_version: str = PurchaseBill.CALC_ITEM_TAX_V2,
    purchase_type: str = PurchaseBill.PURCHASE_TYPE_FUEL,
    tax_price_mode: str = PurchaseBill.TAX_MODE_EXCLUSIVE,
    discount_mode: str = PurchaseBill.DISCOUNT_MODE_LINE,
    transaction_discount_method: str = PurchaseBill.DISCOUNT_METHOD_NONE,
    transaction_discount_amount: Decimal = Decimal('0.00'),
    transaction_discount_percentage: Decimal | None = None,
    is_place_of_supply_overridden: bool = False,
    place_of_supply_override_reason: str | None = None,
    place_of_supply_state: str | None = None,
    place_of_supply_state_code: str | None = None,
    round_off_amount: Decimal = Decimal('0.00'),
    is_duplicate_override: bool = False,
    conflicting_bill_id=None,
    duplicate_override_reason: str | None = None,
) -> PurchaseBill:
    """
    Creates an active Purchase Bill and associated receipt linkages atomically.
    Supports both legacy_v1 and unified item_tax_v2 calculations.
    """
    if outlet.organisation_id != organisation.id:
        raise ValidationError("Outlet must belong to the organisation.")
    if supplier.organisation_id != organisation.id:
        raise ValidationError("Supplier must belong to the organisation.")

    require_permission(user, organisation, 'purchase_bill.create', outlet=outlet)
    if not lines_data:
        raise ValidationError("Purchase bill must contain at least one line item.")

    normalized_inv = normalize_invoice_number(supplier_invoice_number)
    if not normalized_inv:
        raise ValidationError({'supplier_invoice_number': "Supplier invoice number cannot be blank."})

    # Duplicate invoice protection
    existing_conflict = PurchaseBill.objects.select_for_update().filter(
        organisation=organisation,
        supplier=supplier,
        normalized_supplier_invoice_number=normalized_inv,
        status=PurchaseBill.STATUS_ACTIVE
    ).first()

    conflicting_bill = None
    if existing_conflict:
        if not is_duplicate_override:
            raise ValidationError({
                'supplier_invoice_number': (
                    f"An active purchase bill ({existing_conflict.bill_number}) already exists with "
                    f"invoice number '{supplier_invoice_number}' for {supplier.name}."
                )
            })
        else:
            if not has_permission(user, organisation, 'purchase_bill.override_receipt_quantity', outlet=outlet) and not has_permission(user, organisation, 'purchase_bill.update', outlet=outlet):
                raise PermissionDenied("You do not have permission to override duplicate invoice protection.")
            if not conflicting_bill_id or str(conflicting_bill_id) != str(existing_conflict.id):
                raise ValidationError({
                    'conflicting_bill_id': (
                        f"You must explicitly identify the existing conflicting active bill "
                        f"({existing_conflict.bill_number}, ID: {existing_conflict.id}) to override."
                    )
                })
            if not duplicate_override_reason or len(duplicate_override_reason.strip()) < 5:
                raise ValidationError({
                    'duplicate_override_reason': "A mandatory reason (at least 5 characters) is required when overriding duplicate invoice protection."
                })
            conflicting_bill = existing_conflict

    # Document Numbering
    if not bill_number or not bill_number.strip():
        bill_year = invoice_date.year if hasattr(invoice_date, 'year') else timezone.now().year
        bill_number = generate_next_bill_number(outlet, bill_year)
    else:
        bill_number = bill_number.strip()
        if PurchaseBill.objects.filter(outlet=outlet, bill_number__iexact=bill_number).exclude(status=PurchaseBill.STATUS_VOIDED).exists():
            raise ValidationError({'bill_number': f"A purchase bill with number '{bill_number}' already exists for this outlet."})

    # Auto-detect legacy_v1 vs item_tax_v2
    has_v2_line_tax = any(bool(l.get('tax_code_id') or l.get('tax_treatment')) for l in lines_data)
    if calculation_version is None:
        if adjustments_data and not other_charges_data and not has_v2_line_tax:
            calculation_version = PurchaseBill.CALC_LEGACY_V1
        else:
            calculation_version = PurchaseBill.CALC_ITEM_TAX_V2
    elif calculation_version == PurchaseBill.CALC_ITEM_TAX_V2 and adjustments_data and not other_charges_data and not has_v2_line_tax:
        calculation_version = PurchaseBill.CALC_LEGACY_V1

    # Auto-adjust discount method if amount provided but method is none
    if transaction_discount_amount and transaction_discount_amount > Decimal('0.00') and transaction_discount_method == PurchaseBill.DISCOUNT_METHOD_NONE:
        transaction_discount_method = PurchaseBill.DISCOUNT_METHOD_FIXED

    if calculation_version == PurchaseBill.CALC_LEGACY_V1:
        calc = calculate_bill_totals(lines_data, adjustments_data or [])
        bill = PurchaseBill(
            organisation=organisation,
            outlet=outlet,
            supplier=supplier,
            supplier_name_snapshot=supplier.name,
            supplier_code_snapshot=supplier.code,
            bill_number=bill_number,
            supplier_invoice_number=supplier_invoice_number.strip(),
            normalized_supplier_invoice_number=normalized_inv,
            is_duplicate_override=is_duplicate_override,
            duplicate_override_reason=duplicate_override_reason.strip() if duplicate_override_reason else None,
            conflicting_bill=conflicting_bill,
            invoice_date=invoice_date,
            received_date=received_date,
            due_date=due_date,
            currency=currency,
            calculation_version=PurchaseBill.CALC_LEGACY_V1,
            subtotal=calc['subtotal'],
            discount_total=calc['discount_total'],
            additional_charges_total=calc['additional_charges_total'],
            tax_total=calc['tax_total'],
            round_off_amount=calc['round_off_amount'],
            grand_total=calc['grand_total'],
            amount_paid=calc['amount_paid'],
            outstanding_amount=calc['outstanding_amount'],
            status=PurchaseBill.STATUS_ACTIVE,
            notes=notes,
            created_by=user
        )
    else:
        calc = calculate_bill_totals_v2(
            organisation=organisation,
            outlet=outlet,
            supplier=supplier,
            invoice_date=invoice_date,
            lines_data=lines_data,
            other_charges_data=other_charges_data,
            tax_price_mode=tax_price_mode,
            discount_mode=discount_mode,
            transaction_discount_method=transaction_discount_method,
            transaction_discount_amount=transaction_discount_amount,
            transaction_discount_percentage=transaction_discount_percentage,
            is_place_of_supply_overridden=is_place_of_supply_overridden,
            place_of_supply_override_reason=place_of_supply_override_reason,
            place_of_supply_state=place_of_supply_state,
            place_of_supply_state_code=place_of_supply_state_code,
            round_off_amount=round_off_amount
        )
        bill = PurchaseBill(
            organisation=organisation,
            outlet=outlet,
            supplier=supplier,
            supplier_name_snapshot=supplier.name,
            supplier_code_snapshot=supplier.code,
            bill_number=bill_number,
            supplier_invoice_number=supplier_invoice_number.strip(),
            normalized_supplier_invoice_number=normalized_inv,
            is_duplicate_override=is_duplicate_override,
            duplicate_override_reason=duplicate_override_reason.strip() if duplicate_override_reason else None,
            conflicting_bill=conflicting_bill,
            invoice_date=invoice_date,
            received_date=received_date,
            due_date=due_date,
            currency=currency,
            calculation_version=PurchaseBill.CALC_ITEM_TAX_V2,
            purchase_type=purchase_type,
            tax_price_mode=tax_price_mode,
            discount_mode=discount_mode,
            transaction_discount_method=transaction_discount_method,
            transaction_discount_amount=transaction_discount_amount,
            transaction_discount_percentage=transaction_discount_percentage,
            supplier_gstin_snapshot=supplier.gstin,
            supplier_state_snapshot=supplier.state,
            supplier_state_code_snapshot=supplier.state_code,
            outlet_gstin_snapshot=outlet.gstin,
            outlet_state_snapshot=outlet.state,
            outlet_state_code_snapshot=outlet.state_code,
            place_of_supply_state=calc['place_of_supply_state'],
            place_of_supply_state_code=calc['place_of_supply_state_code'],
            is_place_of_supply_overridden=is_place_of_supply_overridden,
            place_of_supply_override_reason=place_of_supply_override_reason.strip() if place_of_supply_override_reason else None,
            is_interstate=calc['is_interstate'],
            taxable_value_total=calc['taxable_value_total'],
            cgst_total=calc['cgst_total'],
            sgst_total=calc['sgst_total'],
            igst_total=calc['igst_total'],
            gst_cess_total=calc['gst_cess_total'],
            petroleum_tax_total=calc['petroleum_tax_total'],
            other_charges_subtotal=calc['other_charges_subtotal'],
            other_charges_tax_total=calc['other_charges_tax_total'],
            subtotal=calc['subtotal'],
            discount_total=calc['discount_total'],
            additional_charges_total=calc['additional_charges_total'],
            tax_total=calc['tax_total'],
            round_off_amount=calc['round_off_amount'],
            grand_total=calc['grand_total'],
            amount_paid=calc['amount_paid'],
            outstanding_amount=calc['outstanding_amount'],
            status=PurchaseBill.STATUS_ACTIVE,
            notes=notes,
            created_by=user
        )

    bill.full_clean()
    bill.save()

    # Create lines & receipt linkages
    quantity_overridden = False
    has_tax_override = False

    for line_info in calc['lines']:
        receipt_link = None
        tr_line_id = line_info.get('tanker_receipt_line_id')

        if tr_line_id:
            try:
                tr_line = TankerReceiptProductLine.objects.select_for_update().get(id=tr_line_id)
            except TankerReceiptProductLine.DoesNotExist:
                raise ValidationError({'tanker_receipt_line_id': f"Tanker receipt product line {tr_line_id} not found."})

            receipt = tr_line.receipt
            if receipt.organisation_id != organisation.id:
                raise ValidationError("Linked tanker receipt must belong to the same organisation.")
            if receipt.outlet_id != outlet.id:
                raise ValidationError("Linked tanker receipt must belong to the same outlet.")
            if receipt.supplier_id != supplier.id:
                raise ValidationError(f"Linked tanker receipt supplier ({receipt.supplier.name}) does not match bill supplier ({supplier.name}).")
            if receipt.status != TankerReceipt.STATUS_CONFIRMED:
                raise ValidationError(f"Tanker receipt {receipt.receipt_number} is in '{receipt.status}' status. Only confirmed receipts can be billed.")

            if PurchaseBillReceiptLink.objects.filter(receipt_product_line=tr_line, released_at__isnull=True).exists():
                raise ValidationError(f"Receipt line for '{tr_line.product.name}' in {receipt.receipt_number} is already billed by an active bill.")

            if line_info['quantity'] != tr_line.invoice_quantity:
                if not has_permission(user, organisation, 'purchase_bill.override_receipt_quantity', outlet=outlet):
                    raise PermissionDenied(f"You do not have permission to override receipt quantity for '{tr_line.product.name}'.")
                if not line_info.get('quantity_override_reason') or not line_info['quantity_override_reason'].strip():
                    raise ValidationError({
                        'quantity_override_reason': (
                            f"A mandatory reason is required when bill quantity ({line_info['quantity']}) "
                            f"differs from receipt invoice quantity ({tr_line.invoice_quantity}) for '{tr_line.product.name}'."
                        )
                    })
                quantity_overridden = True

            receipt_link = PurchaseBillReceiptLink.objects.create(
                purchase_bill=bill,
                tanker_receipt=receipt,
                receipt_product_line=tr_line,
                linked_quantity=line_info['quantity'],
                linked_invoice_value=line_info['line_total'],
                released_at=None,
                created_by=user
            )

        product = None
        prod_id = line_info.get('product_id')
        if prod_id:
            product = FuelProduct.objects.get(id=prod_id, organisation=organisation)

        purchase_item = None
        item_id = line_info.get('purchase_item_id')
        if item_id:
            purchase_item = PurchaseItem.objects.get(id=item_id, organisation=organisation)

        p_code = product.code if product else (purchase_item.code if purchase_item else None)
        p_name = product.name if product else (purchase_item.name if purchase_item else None)

        if line_info.get('is_petroleum_manual_override'):
            has_tax_override = True

        disc_method = line_info.get('discount_method', PurchaseBillLine.DISCOUNT_METHOD_NONE)
        disc_amt = line_info.get('discount_amount', Decimal('0.00'))
        if disc_amt > Decimal('0.00') and disc_method == PurchaseBillLine.DISCOUNT_METHOD_NONE:
            disc_method = PurchaseBillLine.DISCOUNT_METHOD_FIXED

        PurchaseBillLine.objects.create(
            purchase_bill=bill,
            line_number=line_info['line_number'],
            receipt_link=receipt_link,
            line_type=line_info['line_type'],
            description=line_info.get('description'),
            product=product,
            purchase_item=purchase_item,
            product_code_snapshot=p_code,
            product_name_snapshot=p_name,
            tax_treatment=line_info.get('tax_treatment', 'legacy' if calculation_version == PurchaseBill.CALC_LEGACY_V1 else 'gst'),
            tax_code=line_info.get('tax_code'),
            tax_code_rate_version=line_info.get('tax_code_rate_version'),
            tax_code_snapshot=line_info.get('tax_code_snapshot'),
            hsn_sac=line_info.get('hsn_sac'),
            gst_rate=line_info.get('gst_rate', Decimal('0.00')),
            cgst_rate=line_info.get('cgst_rate', Decimal('0.00')),
            cgst_amount=line_info.get('cgst_amount', Decimal('0.00')),
            sgst_rate=line_info.get('sgst_rate', Decimal('0.00')),
            sgst_amount=line_info.get('sgst_amount', Decimal('0.00')),
            igst_rate=line_info.get('igst_rate', Decimal('0.00')),
            igst_amount=line_info.get('igst_amount', Decimal('0.00')),
            cess_rate=line_info.get('cess_rate', Decimal('0.00')),
            cess_amount=line_info.get('cess_amount', Decimal('0.00')),
            petroleum_tax_amount=line_info.get('petroleum_tax_amount', Decimal('0.00')),
            is_petroleum_manual_override=line_info.get('is_petroleum_manual_override', False),
            petroleum_manual_override_reason=line_info.get('petroleum_manual_override_reason'),
            itc_classification=line_info.get('itc_classification', 'not_applicable' if calculation_version == PurchaseBill.CALC_LEGACY_V1 else 'pending_review'),
            discount_method=disc_method,
            discount_percentage=line_info.get('discount_percentage'),
            allocated_transaction_discount=line_info.get('allocated_transaction_discount', Decimal('0.00')),
            tax_components_snapshot=line_info.get('tax_components_snapshot', []),
            quantity=line_info['quantity'],
            unit=line_info['unit'],
            unit_rate=line_info['unit_rate'],
            gross_amount=line_info['gross_amount'],
            discount_amount=disc_amt,
            taxable_amount=line_info['taxable_amount'],
            line_total=line_info['line_total'],
            quantity_override_reason=line_info.get('quantity_override_reason'),
            notes=line_info.get('notes')
        )

    # Legacy adjustments
    if calculation_version == PurchaseBill.CALC_LEGACY_V1 and calc.get('adjustments'):
        for adj_info in calc['adjustments']:
            PurchaseBillAdjustmentComponent.objects.create(
                purchase_bill=bill,
                label=adj_info['label'],
                component_type=adj_info['component_type'],
                calculation_type=adj_info['calculation_type'],
                percentage_rate=adj_info['percentage_rate'],
                calculated_amount=adj_info['calculated_amount'],
                sequence=adj_info['sequence'],
                notes=adj_info.get('notes')
            )

    # Other charges for V2
    if calculation_version == PurchaseBill.CALC_ITEM_TAX_V2 and calc.get('other_charges'):
        for chg in calc['other_charges']:
            PurchaseBillOtherCharge.objects.create(
                purchase_bill=bill,
                sequence=chg['sequence'],
                charge_type=chg['charge_type'],
                description=chg['description'],
                calculation_type=chg['calculation_type'],
                percentage_rate=chg.get('percentage_rate'),
                amount=chg['amount'],
                tax_treatment=chg['tax_treatment'],
                hsn_sac=chg.get('hsn_sac'),
                tax_code=chg.get('tax_code'),
                tax_code_rate_version=chg.get('tax_code_rate_version'),
                gst_rate=chg.get('gst_rate', Decimal('0.00')),
                cgst_amount=chg.get('cgst_amount', Decimal('0.00')),
                sgst_amount=chg.get('sgst_amount', Decimal('0.00')),
                igst_amount=chg.get('igst_amount', Decimal('0.00')),
                total_amount=chg['total_amount']
            )

    # Audit Creation
    PurchaseBillAuditLog.objects.create(
        purchase_bill=bill,
        event_type='created',
        actor=user,
        new_totals={
            'subtotal': str(bill.subtotal),
            'discount_total': str(bill.discount_total),
            'tax_total': str(bill.tax_total),
            'additional_charges_total': str(bill.additional_charges_total),
            'round_off_amount': str(bill.round_off_amount),
            'grand_total': str(bill.grand_total),
            'outstanding_amount': str(bill.outstanding_amount)
        },
        metadata={'is_duplicate_override': is_duplicate_override, 'quantity_overridden': quantity_overridden}
    )

    if conflicting_bill:
        PurchaseBillAuditLog.objects.create(
            purchase_bill=bill,
            event_type='duplicate_invoice_overridden',
            actor=user,
            reason=duplicate_override_reason,
            metadata={
                'conflicting_bill_id': str(conflicting_bill.id),
                'conflicting_bill_number': conflicting_bill.bill_number
            }
        )

    if is_place_of_supply_overridden:
        PurchaseBillAuditLog.objects.create(
            purchase_bill=bill,
            event_type='place_of_supply_override',
            actor=user,
            reason=place_of_supply_override_reason,
            metadata={
                'place_of_supply_state': bill.place_of_supply_state,
                'place_of_supply_state_code': bill.place_of_supply_state_code,
                'is_interstate': bill.is_interstate
            }
        )

    if has_tax_override:
        PurchaseBillAuditLog.objects.create(
            purchase_bill=bill,
            event_type='tax_override',
            actor=user,
            reason="Petroleum tax manual override applied to bill line(s).",
            metadata={'petroleum_tax_total': str(bill.petroleum_tax_total)}
        )

    return bill


@transaction.atomic
def update_purchase_bill(
    bill_id,
    user,
    data: dict
) -> PurchaseBill:
    """
    Updates an active unpaid Purchase Bill. Protected by select_for_update().
    Recalculates totals and records material changes in audit log.
    """
    bill = PurchaseBill.objects.select_for_update().get(id=bill_id)
    require_permission(user, bill.organisation, 'purchase_bill.update', outlet=bill.outlet)

    if bill.status == PurchaseBill.STATUS_VOIDED:
        raise ValidationError("Voided purchase bills cannot be modified.")

    if bill.amount_paid > Decimal('0.00'):
        raise ValidationError("Purchase bills with allocated payments cannot be modified.")

    prev_totals = {
        'subtotal': str(bill.subtotal),
        'discount_total': str(bill.discount_total),
        'tax_total': str(bill.tax_total),
        'additional_charges_total': str(bill.additional_charges_total),
        'round_off_amount': str(bill.round_off_amount),
        'grand_total': str(bill.grand_total),
        'outstanding_amount': str(bill.outstanding_amount)
    }

    changed_fields = []

    # Check invoice number change
    if 'supplier_invoice_number' in data:
        new_inv = data['supplier_invoice_number'].strip()
        if new_inv != bill.supplier_invoice_number:
            new_norm = normalize_invoice_number(new_inv)
            conflict = PurchaseBill.objects.select_for_update().filter(
                organisation=bill.organisation,
                supplier=bill.supplier,
                normalized_supplier_invoice_number=new_norm,
                status=PurchaseBill.STATUS_ACTIVE
            ).exclude(id=bill.id).first()

            if conflict:
                if not data.get('is_duplicate_override'):
                    raise ValidationError({
                        'supplier_invoice_number': (
                            f"An active purchase bill ({conflict.bill_number}) already exists with "
                            f"invoice number '{new_inv}' for this supplier."
                        )
                    })
                else:
                    if not has_permission(user, bill.organisation, 'purchase_bill.override_receipt_quantity', outlet=bill.outlet):
                        raise PermissionDenied("You do not have permission to override duplicate invoice protection.")
                    reason = data.get('duplicate_override_reason', '')
                    if not reason or len(reason.strip()) < 5:
                        raise ValidationError({'duplicate_override_reason': "A mandatory reason is required to override duplicate invoice protection."})
                    bill.is_duplicate_override = True
                    bill.duplicate_override_reason = reason.strip()
                    bill.conflicting_bill = conflict
            else:
                bill.is_duplicate_override = False
                bill.duplicate_override_reason = None
                bill.conflicting_bill = None

            bill.supplier_invoice_number = new_inv
            bill.normalized_supplier_invoice_number = new_norm
            changed_fields.append('supplier_invoice_number')

    if 'invoice_date' in data and data['invoice_date'] != bill.invoice_date:
        bill.invoice_date = data['invoice_date']
        changed_fields.append('invoice_date')

    if 'received_date' in data and data['received_date'] != bill.received_date:
        bill.received_date = data['received_date']
        changed_fields.append('received_date')

    if 'due_date' in data and data['due_date'] != bill.due_date:
        bill.due_date = data['due_date']
        changed_fields.append('due_date')

    if 'notes' in data and data['notes'] != bill.notes:
        bill.notes = data['notes']
        changed_fields.append('notes')

    if 'purchase_type' in data and data['purchase_type'] != bill.purchase_type:
        bill.purchase_type = data['purchase_type']
        changed_fields.append('purchase_type')

    if 'tax_price_mode' in data and data['tax_price_mode'] != bill.tax_price_mode:
        bill.tax_price_mode = data['tax_price_mode']
        changed_fields.append('tax_price_mode')

    if 'discount_mode' in data and data['discount_mode'] != bill.discount_mode:
        bill.discount_mode = data['discount_mode']
        changed_fields.append('discount_mode')

    if 'transaction_discount_method' in data:
        bill.transaction_discount_method = data['transaction_discount_method']
    if 'transaction_discount_amount' in data:
        bill.transaction_discount_amount = Decimal(str(data['transaction_discount_amount']))
    if 'transaction_discount_percentage' in data:
        bill.transaction_discount_percentage = Decimal(str(data['transaction_discount_percentage'])) if data['transaction_discount_percentage'] is not None else None

    if 'is_place_of_supply_overridden' in data:
        bill.is_place_of_supply_overridden = data['is_place_of_supply_overridden']
        bill.place_of_supply_override_reason = data.get('place_of_supply_override_reason')
        bill.place_of_supply_state = data.get('place_of_supply_state')
        bill.place_of_supply_state_code = data.get('place_of_supply_state_code')

    # If lines or adjustments or other_charges are provided, rebuild lines and recalculate
    if 'lines' in data or 'adjustments' in data or 'other_charges' in data:
        lines_data = data.get('lines', [])
        adjustments_data = data.get('adjustments', [])
        other_charges_data = data.get('other_charges', [])

        # Release existing links
        bill.receipt_links.filter(released_at__isnull=True).update(released_at=timezone.now())

        # Delete existing lines, adjustments, other_charges
        bill.lines.all().delete()
        bill.adjustments.all().delete()
        bill.other_charges.all().delete()

        has_tax_override = False

        if bill.calculation_version == PurchaseBill.CALC_LEGACY_V1:
            calc = calculate_bill_totals(lines_data, adjustments_data)
            bill.subtotal = calc['subtotal']
            bill.discount_total = calc['discount_total']
            bill.additional_charges_total = calc['additional_charges_total']
            bill.tax_total = calc['tax_total']
            bill.round_off_amount = calc['round_off_amount']
            bill.grand_total = calc['grand_total']
            bill.outstanding_amount = calc['outstanding_amount']
        else:
            calc = calculate_bill_totals_v2(
                organisation=bill.organisation,
                outlet=bill.outlet,
                supplier=bill.supplier,
                invoice_date=bill.invoice_date,
                lines_data=lines_data,
                other_charges_data=other_charges_data,
                tax_price_mode=bill.tax_price_mode,
                discount_mode=bill.discount_mode,
                transaction_discount_method=bill.transaction_discount_method,
                transaction_discount_amount=bill.transaction_discount_amount,
                transaction_discount_percentage=bill.transaction_discount_percentage,
                is_place_of_supply_overridden=bill.is_place_of_supply_overridden,
                place_of_supply_override_reason=bill.place_of_supply_override_reason,
                place_of_supply_state=bill.place_of_supply_state,
                place_of_supply_state_code=bill.place_of_supply_state_code,
                round_off_amount=Decimal(str(data.get('round_off_amount', bill.round_off_amount or '0.00')))
            )
            bill.place_of_supply_state = calc['place_of_supply_state']
            bill.place_of_supply_state_code = calc['place_of_supply_state_code']
            bill.is_interstate = calc['is_interstate']
            bill.taxable_value_total = calc['taxable_value_total']
            bill.cgst_total = calc['cgst_total']
            bill.sgst_total = calc['sgst_total']
            bill.igst_total = calc['igst_total']
            bill.gst_cess_total = calc['gst_cess_total']
            bill.petroleum_tax_total = calc['petroleum_tax_total']
            bill.other_charges_subtotal = calc['other_charges_subtotal']
            bill.other_charges_tax_total = calc['other_charges_tax_total']
            bill.subtotal = calc['subtotal']
            bill.discount_total = calc['discount_total']
            bill.additional_charges_total = calc['additional_charges_total']
            bill.tax_total = calc['tax_total']
            bill.round_off_amount = calc['round_off_amount']
            bill.grand_total = calc['grand_total']
            bill.outstanding_amount = calc['outstanding_amount']

        # Recreate receipt links and lines
        for line_info in calc['lines']:
            receipt_link = None
            tr_line_id = line_info.get('tanker_receipt_line_id')

            if tr_line_id:
                tr_line = TankerReceiptProductLine.objects.select_for_update().get(id=tr_line_id)
                receipt = tr_line.receipt

                if receipt.organisation_id != bill.organisation_id:
                    raise ValidationError("Linked tanker receipt must belong to the same organisation.")
                if receipt.outlet_id != bill.outlet_id:
                    raise ValidationError("Linked tanker receipt must belong to the same outlet.")
                if receipt.supplier_id != bill.supplier_id:
                    raise ValidationError(f"Linked tanker receipt supplier does not match bill supplier.")
                if receipt.status != TankerReceipt.STATUS_CONFIRMED:
                    raise ValidationError(f"Tanker receipt {receipt.receipt_number} is in '{receipt.status}' status. Only confirmed receipts can be billed.")

                if PurchaseBillReceiptLink.objects.filter(receipt_product_line=tr_line, released_at__isnull=True).exclude(purchase_bill=bill).exists():
                    raise ValidationError(f"Receipt line for '{tr_line.product.name}' in {receipt.receipt_number} is already billed by an active bill.")

                if line_info['quantity'] != tr_line.invoice_quantity:
                    if not has_permission(user, bill.organisation, 'purchase_bill.override_receipt_quantity', outlet=bill.outlet):
                        raise PermissionDenied(f"You do not have permission to override receipt quantity for '{tr_line.product.name}'.")
                    if not line_info.get('quantity_override_reason') or not line_info['quantity_override_reason'].strip():
                        raise ValidationError({
                            'quantity_override_reason': f"A mandatory reason is required when bill quantity differs from receipt invoice quantity for '{tr_line.product.name}'."
                        })

                receipt_link = PurchaseBillReceiptLink.objects.create(
                    purchase_bill=bill,
                    tanker_receipt=receipt,
                    receipt_product_line=tr_line,
                    linked_quantity=line_info['quantity'],
                    linked_invoice_value=line_info['line_total'],
                    released_at=None,
                    created_by=user
                )

            product = None
            prod_id = line_info.get('product_id')
            if prod_id:
                product = FuelProduct.objects.get(id=prod_id, organisation=bill.organisation)

            purchase_item = None
            item_id = line_info.get('purchase_item_id')
            if item_id:
                purchase_item = PurchaseItem.objects.get(id=item_id, organisation=bill.organisation)

            p_code = product.code if product else (purchase_item.code if purchase_item else None)
            p_name = product.name if product else (purchase_item.name if purchase_item else None)

            if line_info.get('is_petroleum_manual_override'):
                has_tax_override = True

            disc_method = line_info.get('discount_method', PurchaseBillLine.DISCOUNT_METHOD_NONE)
            disc_amt = line_info.get('discount_amount', Decimal('0.00'))
            if disc_amt > Decimal('0.00') and disc_method == PurchaseBillLine.DISCOUNT_METHOD_NONE:
                disc_method = PurchaseBillLine.DISCOUNT_METHOD_FIXED

            PurchaseBillLine.objects.create(
                purchase_bill=bill,
                line_number=line_info['line_number'],
                receipt_link=receipt_link,
                line_type=line_info['line_type'],
                description=line_info.get('description'),
                product=product,
                purchase_item=purchase_item,
                product_code_snapshot=p_code,
                product_name_snapshot=p_name,
                tax_treatment=line_info.get('tax_treatment', 'legacy' if bill.calculation_version == PurchaseBill.CALC_LEGACY_V1 else 'gst'),
                tax_code=line_info.get('tax_code'),
                tax_code_rate_version=line_info.get('tax_code_rate_version'),
                tax_code_snapshot=line_info.get('tax_code_snapshot'),
                hsn_sac=line_info.get('hsn_sac'),
                gst_rate=line_info.get('gst_rate', Decimal('0.00')),
                cgst_rate=line_info.get('cgst_rate', Decimal('0.00')),
                cgst_amount=line_info.get('cgst_amount', Decimal('0.00')),
                sgst_rate=line_info.get('sgst_rate', Decimal('0.00')),
                sgst_amount=line_info.get('sgst_amount', Decimal('0.00')),
                igst_rate=line_info.get('igst_rate', Decimal('0.00')),
                igst_amount=line_info.get('igst_amount', Decimal('0.00')),
                cess_rate=line_info.get('cess_rate', Decimal('0.00')),
                cess_amount=line_info.get('cess_amount', Decimal('0.00')),
                petroleum_tax_amount=line_info.get('petroleum_tax_amount', Decimal('0.00')),
                is_petroleum_manual_override=line_info.get('is_petroleum_manual_override', False),
                petroleum_manual_override_reason=line_info.get('petroleum_manual_override_reason'),
                itc_classification=line_info.get('itc_classification', 'not_applicable' if bill.calculation_version == PurchaseBill.CALC_LEGACY_V1 else 'pending_review'),
                discount_method=disc_method,
                discount_percentage=line_info.get('discount_percentage'),
                allocated_transaction_discount=line_info.get('allocated_transaction_discount', Decimal('0.00')),
                tax_components_snapshot=line_info.get('tax_components_snapshot', []),
                quantity=line_info['quantity'],
                unit=line_info['unit'],
                unit_rate=line_info['unit_rate'],
                gross_amount=line_info['gross_amount'],
                discount_amount=disc_amt,
                taxable_amount=line_info['taxable_amount'],
                line_total=line_info['line_total'],
                quantity_override_reason=line_info.get('quantity_override_reason'),
                notes=line_info.get('notes')
            )

        # Legacy adjustments
        if bill.calculation_version == PurchaseBill.CALC_LEGACY_V1 and calc.get('adjustments'):
            for adj_info in calc['adjustments']:
                PurchaseBillAdjustmentComponent.objects.create(
                    purchase_bill=bill,
                    label=adj_info['label'],
                    component_type=adj_info['component_type'],
                    calculation_type=adj_info['calculation_type'],
                    percentage_rate=adj_info['percentage_rate'],
                    calculated_amount=adj_info['calculated_amount'],
                    sequence=adj_info['sequence'],
                    notes=adj_info.get('notes')
                )

        # Other charges for V2
        if bill.calculation_version == PurchaseBill.CALC_ITEM_TAX_V2 and calc.get('other_charges'):
            for chg in calc['other_charges']:
                PurchaseBillOtherCharge.objects.create(
                    purchase_bill=bill,
                    sequence=chg['sequence'],
                    charge_type=chg['charge_type'],
                    description=chg['description'],
                    calculation_type=chg['calculation_type'],
                    percentage_rate=chg.get('percentage_rate'),
                    amount=chg['amount'],
                    tax_treatment=chg['tax_treatment'],
                    hsn_sac=chg.get('hsn_sac'),
                    tax_code=chg.get('tax_code'),
                    tax_code_rate_version=chg.get('tax_code_rate_version'),
                    gst_rate=chg.get('gst_rate', Decimal('0.00')),
                    cgst_amount=chg.get('cgst_amount', Decimal('0.00')),
                    sgst_amount=chg.get('sgst_amount', Decimal('0.00')),
                    igst_amount=chg.get('igst_amount', Decimal('0.00')),
                    total_amount=chg['total_amount']
                )

        changed_fields.append('lines_and_adjustments')

    bill.updated_by = user
    bill.full_clean()
    bill.save()

    new_totals = {
        'subtotal': str(bill.subtotal),
        'discount_total': str(bill.discount_total),
        'tax_total': str(bill.tax_total),
        'additional_charges_total': str(bill.additional_charges_total),
        'round_off_amount': str(bill.round_off_amount),
        'grand_total': str(bill.grand_total),
        'outstanding_amount': str(bill.outstanding_amount)
    }

    PurchaseBillAuditLog.objects.create(
        purchase_bill=bill,
        event_type='updated',
        actor=user,
        changed_fields=changed_fields,
        previous_totals=prev_totals,
        new_totals=new_totals
    )

    return bill


@transaction.atomic
def void_purchase_bill(
    bill_id,
    user,
    void_reason: str
) -> PurchaseBill:
    """
    Atomically voids an active purchase bill.
    Releases all linked receipt lines for rebilling.
    Does NOT modify fuel stock or delete any records.
    """
    bill = PurchaseBill.objects.select_for_update().get(id=bill_id)
    require_permission(user, bill.organisation, 'purchase_bill.void', outlet=bill.outlet)

    if bill.status == PurchaseBill.STATUS_VOIDED:
        return bill

    if not void_reason or not void_reason.strip():
        raise ValidationError({'void_reason': "A mandatory void reason is required when voiding a purchase bill."})

    if bill.amount_paid > Decimal('0.00'):
        raise ValidationError("Cannot void a purchase bill with allocated supplier payments.")

    prev_outstanding = str(bill.outstanding_amount)
    prev_grand_total = str(bill.grand_total)

    bill.status = PurchaseBill.STATUS_VOIDED
    bill.voided_by = user
    bill.voided_at = timezone.now()
    bill.void_reason = void_reason.strip()
    bill.outstanding_amount = Decimal('0.00')
    bill.save()

    # Atomically release all active receipt line linkages (Correction 2)
    bill.receipt_links.filter(released_at__isnull=True).update(released_at=timezone.now())

    PurchaseBillAuditLog.objects.create(
        purchase_bill=bill,
        event_type='voided',
        actor=user,
        reason=void_reason.strip(),
        previous_totals={'outstanding_amount': prev_outstanding, 'grand_total': prev_grand_total},
        new_totals={'outstanding_amount': '0.00'}
    )

    return bill


@transaction.atomic
def upload_bill_attachment(
    bill: PurchaseBill,
    file,
    attachment_type: str,
    user
) -> PurchaseBillAttachment:
    """
    Secure attachment upload for Purchase Bills. Max size 5MB.
    Allowed extensions: .pdf, .png, .jpg, .jpeg.
    """
    require_permission(user, bill.organisation, 'purchase_bill.update' if bill.status == PurchaseBill.STATUS_ACTIVE else 'purchase_bill.view', outlet=bill.outlet)

    if file.size > 5 * 1024 * 1024:
        raise ValidationError("Attachment exceeds maximum allowed size of 5MB.")

    import os
    ext = os.path.splitext(file.name)[1].lower()
    if ext not in ['.pdf', '.png', '.jpg', '.jpeg']:
        raise ValidationError(f"Unsupported file extension '{ext}'. Allowed: .pdf, .png, .jpg, .jpeg")

    content_type = getattr(file, 'content_type', 'application/octet-stream')

    att = PurchaseBillAttachment.objects.create(
        purchase_bill=bill,
        file=file,
        attachment_type=attachment_type,
        file_name=file.name,
        file_size=file.size,
        content_type=content_type,
        uploaded_by=user
    )

    PurchaseBillAuditLog.objects.create(
        purchase_bill=bill,
        event_type='attachment_uploaded',
        actor=user,
        metadata={'attachment_id': str(att.id), 'file_name': att.file_name, 'attachment_type': attachment_type}
    )

    return att

