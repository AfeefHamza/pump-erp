from datetime import timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction, models
from django.utils import timezone

from apps.finance.models import PaymentAccountMovement
from apps.inventory.models import Item, ItemStockMovement
from apps.inventory.services import post_item_stock_movement
from apps.organizations.permissions import require_permission
from apps.purchases.models import ItemPurchaseTaxTreatment, PurchaseTaxCode
from apps.purchases.services import resolve_tax_code_rate_version
from apps.shifts.models import Customer, FuelCreditSlip

from .models import (
    CustomerReceipt, CustomerReceiptAllocation, CustomerReceiptSequence,
    SalesInvoice, SalesInvoiceAuditLog, SalesInvoiceCreditSlipLink,
    SalesInvoiceLine, SalesInvoiceSequence,
)

MONEY = Decimal('0.01')
QTY = Decimal('0.0001')


def money(value, field='amount'):
    try:
        return Decimal(str(value)).quantize(MONEY, rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError):
        raise ValidationError({field: 'Enter a valid amount.'})


def quantity(value):
    try:
        result = Decimal(str(value)).quantize(QTY)
    except (InvalidOperation, TypeError, ValueError):
        raise ValidationError({'quantity': 'Enter a valid quantity.'})
    if result <= 0:
        raise ValidationError({'quantity': 'Quantity must be greater than zero.'})
    return result


def generate_invoice_number(outlet, year):
    sequence, _ = SalesInvoiceSequence.objects.select_for_update().get_or_create(outlet=outlet, year=year)
    sequence.last_sequence += 1
    sequence.save(update_fields=['last_sequence'])
    return f'SI-{outlet.code.upper()}-{year}-{sequence.last_sequence:05d}'


def generate_receipt_number(outlet, year):
    sequence, _ = CustomerReceiptSequence.objects.select_for_update().get_or_create(outlet=outlet, year=year)
    sequence.last_sequence += 1
    sequence.save(update_fields=['last_sequence'])
    return f'CR-{outlet.code.upper()}-{year}-{sequence.last_sequence:05d}'


def _default_tax_treatment(item, invoice_date):
    mapping = ItemPurchaseTaxTreatment.objects.filter(
        organisation=item.organisation, item=item, effective_from__lte=invoice_date,
    ).filter(
        models.Q(effective_to__isnull=True) | models.Q(effective_to__gte=invoice_date)
    ).select_related('tax_treatment').first()
    if mapping and mapping.tax_treatment.is_sales_applicable:
        return mapping.tax_treatment
    return None


def _calculate_item_line(*, organisation, outlet, customer, invoice_date, item, row):
    if item.item_type == Item.ITEM_TYPE_FUEL:
        raise ValidationError({'lines': 'Fuel must be invoiced from an existing Credit Slip so tank stock is not reduced twice.'})
    if not item.is_active or not item.is_sellable:
        raise ValidationError({'lines': f'{item.name} is not available for sale.'})
    qty = quantity(row.get('quantity'))
    price = Decimal(str(row.get('unit_price', '0'))).quantize(Decimal('0.0001'))
    if price < 0:
        raise ValidationError({'unit_price': 'Unit price cannot be negative.'})
    gross = money(qty * price)
    discount = money(row.get('discount_amount', 0), 'discount_amount')
    if discount < 0 or discount > gross:
        raise ValidationError({'discount_amount': 'Discount must be between zero and the gross amount.'})
    entered_net = gross - discount
    tax_treatment = None
    treatment_id = row.get('tax_treatment_id')
    if treatment_id:
        tax_treatment = PurchaseTaxCode.objects.filter(id=treatment_id, organisation=organisation, is_active=True, is_sales_applicable=True).first()
    else:
        tax_treatment = _default_tax_treatment(item, invoice_date)
    if not tax_treatment:
        raise ValidationError({'tax_treatment': f'Select a sales Tax Treatment for {item.name}.'})
    rate_version = resolve_tax_code_rate_version(tax_treatment, invoice_date, organisation)
    total_rate = (rate_version.gst_rate + rate_version.cess_rate).quantize(Decimal('0.0001'))
    tax_inclusive = bool(row.get('tax_inclusive', False))
    taxable = entered_net
    tax_amount = Decimal('0.00')
    components = []
    if tax_treatment.tax_regime == PurchaseTaxCode.REGIME_GST and total_rate > 0:
        if tax_inclusive:
            taxable = money(entered_net / (Decimal('1') + total_rate / Decimal('100')))
            tax_amount = money(entered_net - taxable)
        else:
            tax_amount = money(taxable * total_rate / Decimal('100'))
        outlet_state = outlet.state_code or organisation.state_code or (outlet.gstin or organisation.gstin or '')[:2]
        customer_state = (customer.GSTIN[:2] if customer and customer.GSTIN else outlet_state)
        interstate = bool(outlet_state and customer_state and outlet_state != customer_state)
        if interstate:
            components.append({'name': 'IGST', 'rate': str(rate_version.gst_rate), 'amount': str(money(taxable * rate_version.gst_rate / 100))})
        else:
            half_rate = (rate_version.gst_rate / 2).quantize(Decimal('0.0001'))
            half_amount = money(taxable * rate_version.gst_rate / 200)
            components.extend([{'name': 'CGST', 'rate': str(half_rate), 'amount': str(half_amount)}, {'name': 'SGST', 'rate': str(half_rate), 'amount': str(money(taxable * rate_version.gst_rate / 100) - half_amount)}])
        if rate_version.cess_rate:
            components.append({'name': 'Cess', 'rate': str(rate_version.cess_rate), 'amount': str(money(taxable * rate_version.cess_rate / 100))})
    line_total = entered_net if tax_inclusive else entered_net + tax_amount
    return {
        'item': item, 'source_type': SalesInvoiceLine.SOURCE_ITEM, 'credit_slip': None,
        'quantity': qty, 'unit_price': price, 'gross_amount': gross, 'discount_amount': discount,
        'tax_inclusive': tax_inclusive, 'tax_treatment': tax_treatment, 'effective_rate_version': rate_version,
        'tax_treatment_name_snapshot': tax_treatment.name, 'tax_regime_snapshot': tax_treatment.tax_regime,
        'tax_rate_snapshot': total_rate, 'taxable_amount': taxable, 'tax_amount': tax_amount,
        'tax_components_snapshot': components, 'line_total': money(line_total),
    }


def _calculate_credit_slip_line(*, organisation, outlet, customer, slip_id):
    try:
        slip = FuelCreditSlip.objects.select_for_update().select_related('product__canonical_item', 'customer').get(id=slip_id)
    except FuelCreditSlip.DoesNotExist:
        raise ValidationError({'lines': 'Credit Slip was not found.'})
    if slip.organisation_id != organisation.id or slip.outlet_id != outlet.id or slip.customer_id != customer.id:
        raise ValidationError({'lines': 'Credit Slip must belong to this outlet and customer.'})
    if slip.status != FuelCreditSlip.STATUS_ACTIVE:
        raise ValidationError({'lines': f'Credit Slip {slip.slip_number} is void and cannot be invoiced.'})
    if SalesInvoiceCreditSlipLink.objects.filter(credit_slip=slip, released_at__isnull=True).exists():
        raise ValidationError({'lines': f'Credit Slip {slip.slip_number} has already been invoiced.'})
    item = slip.product.canonical_item
    if not item:
        raise ValidationError({'lines': f'Fuel product on Credit Slip {slip.slip_number} is not linked to the Item Master.'})
    return {
        'item': item, 'source_type': SalesInvoiceLine.SOURCE_CREDIT_SLIP, 'credit_slip': slip,
        'quantity': slip.quantity.quantize(QTY), 'unit_price': slip.unit_price,
        'gross_amount': slip.amount, 'discount_amount': Decimal('0.00'), 'tax_inclusive': True,
        'tax_treatment': None, 'effective_rate_version': None,
        'tax_treatment_name_snapshot': 'Non-GST Petroleum', 'tax_regime_snapshot': PurchaseTaxCode.REGIME_NON_GST_PETROLEUM,
        'tax_rate_snapshot': Decimal('0.0000'), 'taxable_amount': slip.amount,
        'tax_amount': Decimal('0.00'), 'tax_components_snapshot': [], 'line_total': slip.amount,
    }


@transaction.atomic
def create_sales_invoice(*, organisation, outlet, invoice_date, invoice_type, lines, user,
                         customer=None, due_date=None, payment_account=None, payment_method='',
                         payment_reference='', notes='', client_request_id=None):
    require_permission(user, organisation, 'sales_invoice.create', outlet=outlet)
    if client_request_id:
        existing = SalesInvoice.objects.filter(organisation=organisation, outlet=outlet, client_request_id=client_request_id).first()
        if existing:
            return existing
    if outlet.organisation_id != organisation.id:
        raise ValidationError('Outlet must belong to the organisation.')
    if customer and (customer.organisation_id != organisation.id or customer.status != Customer.STATUS_ACTIVE):
        raise ValidationError('Select an active customer from this organisation.')
    if not lines:
        raise ValidationError({'lines': 'Add at least one invoice line.'})
    calculated = []
    for row in lines:
        if row.get('credit_slip_id'):
            if not customer:
                raise ValidationError({'customer': 'Credit Slip invoices require a customer.'})
            calculated.append(_calculate_credit_slip_line(organisation=organisation, outlet=outlet, customer=customer, slip_id=row['credit_slip_id']))
        else:
            item = Item.objects.select_related('base_unit').filter(id=row.get('item_id'), organisation=organisation).first()
            if not item:
                raise ValidationError({'lines': 'Select a valid Item Master item.'})
            calculated.append(_calculate_item_line(organisation=organisation, outlet=outlet, customer=customer, invoice_date=invoice_date, item=item, row=row))
    if any(row['source_type'] == SalesInvoiceLine.SOURCE_CREDIT_SLIP for row in calculated) and invoice_type != SalesInvoice.TYPE_CREDIT:
        raise ValidationError({'invoice_type': 'Credit Slip billing must create a credit invoice.'})
    subtotal = sum((r['gross_amount'] for r in calculated), Decimal('0.00'))
    discounts = sum((r['discount_amount'] for r in calculated), Decimal('0.00'))
    taxable = sum((r['taxable_amount'] for r in calculated), Decimal('0.00'))
    tax = sum((r['tax_amount'] for r in calculated), Decimal('0.00'))
    total = sum((r['line_total'] for r in calculated), Decimal('0.00')).quantize(MONEY)
    if invoice_type == SalesInvoice.TYPE_CASH and not payment_account:
        raise ValidationError({'payment_account': 'Cash invoices require a payment account.'})
    invoice = SalesInvoice(
        organisation=organisation, outlet=outlet, customer=customer,
        customer_name_snapshot=customer.display_name if customer else 'Cash Customer',
        customer_code_snapshot=customer.customer_code if customer else '',
        customer_gstin_snapshot=customer.GSTIN if customer and customer.GSTIN else '',
        billing_address_snapshot=customer.billing_address if customer and customer.billing_address else '',
        invoice_number=generate_invoice_number(outlet, invoice_date.year), client_request_id=client_request_id,
        invoice_date=invoice_date, due_date=due_date or invoice_date + timedelta(days=(customer.credit_days or 0) if customer else 0),
        invoice_type=invoice_type, place_of_supply_state_code=(customer.GSTIN[:2] if customer and customer.GSTIN else (outlet.state_code or organisation.state_code or '')),
        is_interstate=bool(customer and customer.GSTIN and (outlet.state_code or organisation.state_code) and customer.GSTIN[:2] != (outlet.state_code or organisation.state_code)),
        payment_account=payment_account, payment_method=payment_method if invoice_type == SalesInvoice.TYPE_CASH else '',
        payment_reference=payment_reference if invoice_type == SalesInvoice.TYPE_CASH else '',
        subtotal=money(subtotal), discount_total=money(discounts), taxable_total=money(taxable),
        tax_total=money(tax), grand_total=total,
        amount_paid=total if invoice_type == SalesInvoice.TYPE_CASH else Decimal('0.00'),
        outstanding_amount=Decimal('0.00') if invoice_type == SalesInvoice.TYPE_CASH else total,
        notes=notes or '', created_by=user,
    )
    invoice.save()
    for index, row in enumerate(calculated, 1):
        item = row.pop('item')
        slip = row.pop('credit_slip')
        line = SalesInvoiceLine.objects.create(
            invoice=invoice, sequence=index, item=item, credit_slip=slip,
            item_code_snapshot=item.code, item_name_snapshot=item.name,
            item_type_snapshot=item.item_type, hsn_sac_snapshot=item.hsn_sac or '',
            unit_snapshot=item.base_unit.code, **row,
        )
        if slip:
            try:
                SalesInvoiceCreditSlipLink.objects.create(invoice=invoice, credit_slip=slip)
            except IntegrityError:
                raise ValidationError({'lines': f'Credit Slip {slip.slip_number} was invoiced concurrently.'})
        if item.item_type == Item.ITEM_TYPE_STOCK and item.inventory_tracking_mode == Item.TRACKING_QUANTITY:
            post_item_stock_movement(
                organisation=organisation, outlet=outlet, item=item,
                movement_type=ItemStockMovement.TYPE_SALE, direction=ItemStockMovement.DIR_OUT,
                quantity=line.quantity, effective_date=invoice_date, source_type='sales_invoice',
                source_id=invoice.id, source_line_id=line.id, idempotency_key=f'sales-invoice:{invoice.id}:{line.id}',
                reason=f'Sales Invoice {invoice.invoice_number}', created_by=user,
            )
    if invoice_type == SalesInvoice.TYPE_CASH:
        PaymentAccountMovement.objects.create(
            organisation=organisation, outlet=outlet, account=payment_account,
            effective_date=invoice_date, signed_amount=total,
            movement_type=PaymentAccountMovement.TYPE_SALES_RECEIPT,
            source_type='sales_invoice', source_id=invoice.id, payment=None,
            idempotency_key=f'sales-invoice-receipt:{invoice.id}',
            description=f'{invoice.invoice_number} · {invoice.customer_name_snapshot}', created_by=user,
        )
    SalesInvoiceAuditLog.objects.create(invoice=invoice, event_type='created', actor=user, metadata={'grand_total': str(total), 'line_count': len(calculated)})
    from apps.accounting.posting import post_sales_invoice
    post_sales_invoice(invoice, user)
    return invoice


@transaction.atomic
def void_sales_invoice(invoice, reason, user):
    invoice = SalesInvoice.objects.select_for_update().select_related('organisation', 'outlet', 'payment_account').get(pk=invoice.pk)
    require_permission(user, invoice.organisation, 'sales_invoice.void', outlet=invoice.outlet)
    if invoice.status == SalesInvoice.STATUS_VOIDED:
        return invoice
    if invoice.receipt_allocations.filter(receipt__status=CustomerReceipt.STATUS_ACTIVE).exists():
        raise ValidationError({'detail': 'Void allocated customer receipts before voiding this Sales Invoice.'})
    reason = (reason or '').strip()
    if len(reason) < 5:
        raise ValidationError({'void_reason': 'Provide a void reason of at least 5 characters.'})
    for movement in ItemStockMovement.objects.select_for_update().filter(source_type='sales_invoice', source_id=invoice.id, movement_type=ItemStockMovement.TYPE_SALE):
        if movement.reversals.exists():
            continue
        post_item_stock_movement(
            organisation=invoice.organisation, outlet=invoice.outlet, item=movement.item,
            movement_type=ItemStockMovement.TYPE_REVERSAL, direction=ItemStockMovement.DIR_IN,
            quantity=movement.quantity, effective_date=timezone.localdate(), source_type='sales_invoice_reversal',
            source_id=invoice.id, source_line_id=movement.source_line_id, reversal_of=movement,
            idempotency_key=f'sales-invoice-reversal:{movement.id}', reason=reason, created_by=user,
        )
    original_receipt = PaymentAccountMovement.objects.filter(source_type='sales_invoice', source_id=invoice.id, movement_type=PaymentAccountMovement.TYPE_SALES_RECEIPT).first()
    if original_receipt and not hasattr(original_receipt, 'reversal'):
        PaymentAccountMovement.objects.create(
            organisation=invoice.organisation, outlet=invoice.outlet, account=original_receipt.account,
            effective_date=timezone.localdate(), signed_amount=-original_receipt.signed_amount,
            movement_type=PaymentAccountMovement.TYPE_SALES_RECEIPT_REVERSAL,
            source_type='sales_invoice', source_id=invoice.id, payment=None, reversal_of=original_receipt,
            idempotency_key=f'sales-invoice-receipt-reversal:{invoice.id}',
            description=f'Reversal of {invoice.invoice_number}', created_by=user,
        )
    invoice.credit_slip_links.filter(released_at__isnull=True).update(released_at=timezone.now())
    from apps.accounting.posting import reverse_source_journal
    reverse_source_journal(
        organisation=invoice.organisation, outlet=invoice.outlet,
        source_type='sales_invoice', source_id=invoice.id, reason=reason, user=user,
    )
    invoice.status = SalesInvoice.STATUS_VOIDED
    invoice.void_reason = reason
    invoice.voided_by = user
    invoice.voided_at = timezone.now()
    invoice._allow_void_transition = True
    invoice.save(update_fields=['status', 'void_reason', 'voided_by', 'voided_at'])
    SalesInvoiceAuditLog.objects.create(invoice=invoice, event_type='voided', actor=user, reason=reason)
    return invoice


@transaction.atomic
def create_customer_receipt(*, organisation, outlet, customer, receipt_date, amount,
                            payment_account, payment_method, allocations, user,
                            reference_number='', notes='', client_request_id=None):
    require_permission(user, organisation, 'customer_receipt.create', outlet=outlet)
    if client_request_id:
        existing = CustomerReceipt.objects.filter(organisation=organisation, outlet=outlet, client_request_id=client_request_id).first()
        if existing:
            return existing
    amount = money(amount)
    if amount <= 0:
        raise ValidationError({'amount': 'Receipt amount must be greater than zero.'})
    if customer.organisation_id != organisation.id or customer.status != Customer.STATUS_ACTIVE:
        raise ValidationError({'customer': 'Select an active customer from this organisation.'})
    if payment_account.organisation_id != organisation.id or (payment_account.outlet_id and payment_account.outlet_id != outlet.id):
        raise ValidationError({'payment_account': 'Select a payment account for this organisation and outlet.'})
    if payment_method == SalesInvoice.METHOD_CASH and payment_account.account_type != 'cash':
        raise ValidationError({'payment_account': 'Cash receipts require a cash account.'})
    if payment_method != SalesInvoice.METHOD_CASH and payment_account.account_type != 'bank':
        raise ValidationError({'payment_account': 'Digital receipts require a bank account.'})
    locked = []
    allocated_total = Decimal('0.00')
    seen = set()
    for row in allocations or []:
        invoice_id = row.get('sales_invoice_id')
        if invoice_id in seen:
            raise ValidationError({'allocations': 'An invoice can be allocated only once per receipt.'})
        seen.add(invoice_id)
        invoice = SalesInvoice.objects.select_for_update().filter(
            id=invoice_id, organisation=organisation, outlet=outlet, customer=customer,
            status=SalesInvoice.STATUS_ACTIVE,
        ).first()
        if not invoice:
            raise ValidationError({'allocations': 'Select an active invoice for this customer and outlet.'})
        allocation_amount = money(row.get('amount'))
        if allocation_amount <= 0 or allocation_amount > invoice.outstanding_amount:
            raise ValidationError({'allocations': f'Allocation for {invoice.invoice_number} exceeds its outstanding balance.'})
        allocated_total += allocation_amount
        locked.append((invoice, allocation_amount))
    if allocated_total > amount:
        raise ValidationError({'allocations': 'Allocated amount cannot exceed the receipt amount.'})
    receipt = CustomerReceipt.objects.create(
        organisation=organisation, outlet=outlet, customer=customer,
        customer_name_snapshot=customer.display_name, customer_code_snapshot=customer.customer_code,
        receipt_number=generate_receipt_number(outlet, receipt_date.year), client_request_id=client_request_id,
        receipt_date=receipt_date, amount=amount, payment_account=payment_account,
        payment_method=payment_method, reference_number=reference_number or '', notes=notes or '',
        unallocated_amount=amount - allocated_total, created_by=user,
    )
    for invoice, allocation_amount in locked:
        CustomerReceiptAllocation.objects.create(receipt=receipt, sales_invoice=invoice, amount=allocation_amount)
        invoice.amount_paid += allocation_amount
        invoice.outstanding_amount -= allocation_amount
        invoice._allow_settlement_transition = True
        invoice.save(update_fields=['amount_paid', 'outstanding_amount'])
        SalesInvoiceAuditLog.objects.create(invoice=invoice, event_type='receipt_allocated', actor=user, metadata={'receipt_id': str(receipt.id), 'amount': str(allocation_amount)})
    PaymentAccountMovement.objects.create(
        organisation=organisation, outlet=outlet, account=payment_account,
        effective_date=receipt_date, signed_amount=amount,
        movement_type=PaymentAccountMovement.TYPE_CUSTOMER_RECEIPT,
        source_type='customer_receipt', source_id=receipt.id, payment=None,
        idempotency_key=f'customer-receipt:{receipt.id}',
        description=f'{receipt.receipt_number} · {receipt.customer_name_snapshot}', created_by=user,
    )
    from apps.accounting.posting import post_customer_receipt
    post_customer_receipt(receipt, user)
    return receipt


@transaction.atomic
def void_customer_receipt(receipt, reason, user):
    receipt = CustomerReceipt.objects.select_for_update().select_related('organisation', 'outlet').get(pk=receipt.pk)
    require_permission(user, receipt.organisation, 'customer_receipt.void', outlet=receipt.outlet)
    if receipt.status == CustomerReceipt.STATUS_VOIDED:
        return receipt
    if len((reason or '').strip()) < 5:
        raise ValidationError({'void_reason': 'Provide a void reason of at least 5 characters.'})
    for allocation in receipt.allocations.select_related('sales_invoice').all():
        invoice = SalesInvoice.objects.select_for_update().get(pk=allocation.sales_invoice_id)
        invoice.amount_paid -= allocation.amount
        invoice.outstanding_amount += allocation.amount
        invoice._allow_settlement_transition = True
        invoice.save(update_fields=['amount_paid', 'outstanding_amount'])
        SalesInvoiceAuditLog.objects.create(invoice=invoice, event_type='receipt_voided', actor=user, reason=reason, metadata={'receipt_id': str(receipt.id), 'amount': str(allocation.amount)})
    original = PaymentAccountMovement.objects.get(source_type='customer_receipt', source_id=receipt.id, movement_type=PaymentAccountMovement.TYPE_CUSTOMER_RECEIPT)
    if not hasattr(original, 'reversal'):
        PaymentAccountMovement.objects.create(
            organisation=receipt.organisation, outlet=receipt.outlet, account=original.account,
            effective_date=timezone.localdate(), signed_amount=-original.signed_amount,
            movement_type=PaymentAccountMovement.TYPE_CUSTOMER_RECEIPT_REVERSAL,
            source_type='customer_receipt', source_id=receipt.id, payment=None, reversal_of=original,
            idempotency_key=f'customer-receipt-reversal:{receipt.id}',
            description=f'Reversal of {receipt.receipt_number}', created_by=user,
        )
    from apps.accounting.posting import reverse_source_journal
    reverse_source_journal(
        organisation=receipt.organisation, outlet=receipt.outlet,
        source_type='customer_receipt', source_id=receipt.id,
        reason=reason, user=user,
    )
    receipt.status = CustomerReceipt.STATUS_VOIDED
    receipt.voided_at = timezone.now(); receipt.voided_by = user; receipt.void_reason = reason.strip()
    receipt._allow_void_transition = True
    receipt.save(update_fields=['status', 'voided_at', 'voided_by', 'void_reason'])
    return receipt
