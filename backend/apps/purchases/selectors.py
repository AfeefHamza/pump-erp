# apps/purchases/selectors.py
from decimal import Decimal
from django.db.models import Sum, Q
from django.utils import timezone
from apps.core.timezone_utils import to_outlet_business_date
from apps.organizations.models import Organisation, Outlet
from .models import (
    Supplier, TankerReceipt, TankerReceiptProductLine, TankerReceiptTankAllocation,
    PurchaseBill, PurchaseBillLine, PurchaseBillReceiptLink, PurchaseBillAdjustmentComponent,
    PurchaseTaxCode, PurchaseTaxCodeRate, PurchaseTaxCodeComponent,
    PurchaseItem, ProductPurchaseTaxMapping, PurchaseBillOtherCharge
)


def list_suppliers(organisation: Organisation, active_only: bool = False):
    qs = Supplier.objects.filter(organisation=organisation)
    if active_only:
        qs = qs.filter(is_active=True)
    return qs.order_by('name')


def list_tanker_receipts(
    organisation: Organisation,
    outlet: Outlet,
    status=None,
    supplier_id=None,
    from_date=None,
    to_date=None,
    vehicle_registration=None,
    search=None
):
    qs = TankerReceipt.objects.filter(
        organisation=organisation,
        outlet=outlet
    ).select_related('supplier', 'created_by', 'confirmed_by', 'voided_by').prefetch_related(
        'product_lines',
        'product_lines__product',
        'product_lines__allocations'
    ).order_by('-unloading_end_time', '-created_at')

    if status:
        qs = qs.filter(status=status)
    if supplier_id:
        qs = qs.filter(supplier_id=supplier_id)
    if from_date:
        qs = qs.filter(invoice_date__gte=from_date)
    if to_date:
        qs = qs.filter(invoice_date__lte=to_date)
    if vehicle_registration:
        qs = qs.filter(vehicle_registration__icontains=vehicle_registration)
    if search:
        qs = qs.filter(
            Q(receipt_number__icontains=search) |
            Q(invoice_number__icontains=search) |
            Q(supplier_name_snapshot__icontains=search) |
            Q(vehicle_registration__icontains=search)
        )

    return qs


def get_tanker_receipt_detail(receipt_id, organisation: Organisation, outlet: Outlet):
    try:
        return TankerReceipt.objects.select_related(
            'supplier', 'created_by', 'updated_by', 'confirmed_by', 'voided_by'
        ).prefetch_related(
            'product_lines',
            'product_lines__product',
            'product_lines__allocations',
            'product_lines__allocations__tank',
            'product_lines__allocations__calibration_chart',
            'attachments',
            'attachments__uploaded_by'
        ).get(
            id=receipt_id,
            organisation=organisation,
            outlet=outlet
        )
    except TankerReceipt.DoesNotExist:
        return None


# ============================================================================
# Milestone 12: Purchase Bills & Supplier Outstanding Selectors
# ============================================================================

def list_purchase_bills(
    organisation: Organisation,
    outlet: Outlet,
    status: str | None = None,
    supplier_id=None,
    from_date=None,
    to_date=None,
    from_due_date=None,
    to_due_date=None,
    overdue_only: bool = False,
    outstanding_only: bool = False,
    supplier_invoice_number: str | None = None,
    bill_number: str | None = None,
    tanker_receipt_id=None,
    product_id=None,
    search: str | None = None
):
    """
    Returns filtered QuerySet of purchase bills for an outlet.
    """
    qs = PurchaseBill.objects.filter(
        organisation=organisation,
        outlet=outlet
    ).select_related(
        'supplier', 'created_by', 'updated_by', 'voided_by'
    ).prefetch_related(
        'lines',
        'lines__product',
        'receipt_links',
        'receipt_links__tanker_receipt'
    ).order_by('-invoice_date', '-created_at')

    if status and status != 'all':
        qs = qs.filter(status=status)

    if supplier_id:
        qs = qs.filter(supplier_id=supplier_id)

    if from_date:
        qs = qs.filter(invoice_date__gte=from_date)
    if to_date:
        qs = qs.filter(invoice_date__lte=to_date)

    if from_due_date:
        qs = qs.filter(due_date__gte=from_due_date)
    if to_due_date:
        qs = qs.filter(due_date__lte=to_due_date)

    today = to_outlet_business_date(timezone.now(), outlet=outlet, organisation=organisation)

    if overdue_only:
        qs = qs.filter(status=PurchaseBill.STATUS_ACTIVE, due_date__lt=today, outstanding_amount__gt=Decimal('0.00'))

    if outstanding_only:
        qs = qs.filter(status=PurchaseBill.STATUS_ACTIVE, outstanding_amount__gt=Decimal('0.00'))

    if supplier_invoice_number:
        qs = qs.filter(supplier_invoice_number__icontains=supplier_invoice_number.strip())

    if bill_number:
        qs = qs.filter(bill_number__icontains=bill_number.strip())

    if tanker_receipt_id:
        qs = qs.filter(receipt_links__tanker_receipt_id=tanker_receipt_id).distinct()

    if product_id:
        qs = qs.filter(lines__product_id=product_id).distinct()

    if search:
        search_term = search.strip()
        qs = qs.filter(
            Q(bill_number__icontains=search_term) |
            Q(supplier_invoice_number__icontains=search_term) |
            Q(supplier_name_snapshot__icontains=search_term)
        ).distinct()

    return qs


def get_purchase_bill_detail(bill_id, organisation: Organisation, outlet: Outlet):
    """
    Retrieves full detail of a Purchase Bill with lines, adjustments, links, attachments, and audits.
    """
    try:
        return PurchaseBill.objects.select_related(
            'supplier', 'created_by', 'updated_by', 'voided_by', 'conflicting_bill'
        ).prefetch_related(
            'lines',
            'lines__product',
            'lines__purchase_item',
            'lines__tax_code',
            'lines__tax_code_rate_version',
            'lines__receipt_link',
            'lines__receipt_link__tanker_receipt',
            'receipt_links',
            'receipt_links__tanker_receipt',
            'receipt_links__receipt_product_line',
            'receipt_links__receipt_product_line__product',
            'other_charges',
            'other_charges__tax_code',
            'other_charges__tax_code_rate_version',
            'adjustments',
            'attachments',
            'attachments__uploaded_by',
            'audit_logs',
            'audit_logs__actor'
        ).get(
            id=bill_id,
            organisation=organisation,
            outlet=outlet
        )
    except PurchaseBill.DoesNotExist:
        return None


def get_available_tanker_receipts_for_billing(organisation: Organisation, outlet: Outlet, supplier_id=None):
    """
    Finds confirmed, non-voided tanker receipts that contain at least one
    unbilled product line for the given organisation, outlet, and optional supplier.
    """
    receipts_qs = TankerReceipt.objects.filter(
        organisation=organisation,
        outlet=outlet,
        status=TankerReceipt.STATUS_CONFIRMED
    ).select_related('supplier').prefetch_related(
        'product_lines',
        'product_lines__product',
        'product_lines__bill_links'
    ).order_by('-unloading_end_time')

    if supplier_id:
        receipts_qs = receipts_qs.filter(supplier_id=supplier_id)

    available_receipts = []
    for r in receipts_qs:
        unbilled_lines = []
        for line in r.product_lines.all():
            # Check if line is already linked to an active (unreleased) link
            is_active_billed = line.bill_links.filter(released_at__isnull=True).exists()
            if not is_active_billed:
                unbilled_lines.append({
                    'id': str(line.id),
                    'product_id': str(line.product_id),
                    'product_code': line.product.code,
                    'product_name': line.product.name,
                    'invoice_quantity': str(line.invoice_quantity),
                    'accepted_book_quantity': str(line.accepted_book_quantity),
                    'unit_rate': str(line.unit_rate) if line.unit_rate is not None else None,
                    'total_value': str(line.total_value) if line.total_value is not None else None,
                    'unit': getattr(line.product, 'unit', 'litre') or 'litre'
                })

        if unbilled_lines:
            available_receipts.append({
                'id': str(r.id),
                'receipt_number': r.receipt_number,
                'supplier_id': str(r.supplier_id),
                'supplier_name': r.supplier_name_snapshot,
                'supplier_code': r.supplier_code_snapshot,
                'invoice_number': r.invoice_number,
                'invoice_date': r.invoice_date.isoformat(),
                'vehicle_registration': r.vehicle_registration,
                'unloading_end_time': r.unloading_end_time.isoformat(),
                'available_lines': unbilled_lines
            })

    return available_receipts


def get_supplier_outstanding_summary(organisation: Organisation, outlet: Outlet):
    """
    Computes overall and supplier-wise outstanding metrics and 5 due ageing buckets.
    Uses outlet-local current date for accurate calendar-day ageing.
    """
    today = to_outlet_business_date(timezone.now(), outlet=outlet, organisation=organisation)

    active_bills = PurchaseBill.objects.filter(
        organisation=organisation,
        outlet=outlet,
        status=PurchaseBill.STATUS_ACTIVE
    ).select_related('supplier').order_by('invoice_date')

    total_billed = Decimal('0.00')
    total_paid = Decimal('0.00')
    total_outstanding = Decimal('0.00')
    not_due_total = Decimal('0.00')
    overdue_total = Decimal('0.00')

    bucket_1_30 = Decimal('0.00')
    bucket_31_60 = Decimal('0.00')
    bucket_61_90 = Decimal('0.00')
    bucket_over_90 = Decimal('0.00')

    supplier_map = {}
    from apps.finance.models import SupplierPayment
    active_payments = SupplierPayment.objects.filter(
        organisation=organisation, outlet=outlet, status=SupplierPayment.STATUS_ACTIVE
    ).select_related('supplier')
    total_unallocated_advances = sum(
        (payment.unallocated_amount for payment in active_payments), Decimal('0.00')
    )

    for bill in active_bills:
        total_billed += bill.grand_total
        total_paid += bill.amount_paid
        outstanding = bill.outstanding_amount
        total_outstanding += outstanding

        days_overdue = (today - bill.due_date).days if bill.due_date else 0

        sup_id = str(bill.supplier_id)
        if sup_id not in supplier_map:
            supplier_map[sup_id] = {
                'supplier_id': sup_id,
                'supplier_name': bill.supplier_name_snapshot,
                'supplier_code': bill.supplier_code_snapshot,
                'total_billed': Decimal('0.00'),
                'total_paid': Decimal('0.00'),
                'total_outstanding': Decimal('0.00'),
                'not_due': Decimal('0.00'),
                'overdue_total': Decimal('0.00'),
                'bucket_1_30': Decimal('0.00'),
                'bucket_31_60': Decimal('0.00'),
                'bucket_61_90': Decimal('0.00'),
                'bucket_over_90': Decimal('0.00'),
                'oldest_unpaid_invoice_date': bill.invoice_date.isoformat() if outstanding > 0 else None,
                'unpaid_bills_count': 0,
                'unallocated_advance': Decimal('0.00'),
            }

        s_entry = supplier_map[sup_id]
        s_entry['total_billed'] += bill.grand_total
        s_entry['total_paid'] += bill.amount_paid
        s_entry['total_outstanding'] += outstanding
        if outstanding > 0:
            s_entry['unpaid_bills_count'] += 1

        if days_overdue <= 0:
            not_due_total += outstanding
            s_entry['not_due'] += outstanding
        else:
            overdue_total += outstanding
            s_entry['overdue_total'] += outstanding
            if 1 <= days_overdue <= 30:
                bucket_1_30 += outstanding
                s_entry['bucket_1_30'] += outstanding
            elif 31 <= days_overdue <= 60:
                bucket_31_60 += outstanding
                s_entry['bucket_31_60'] += outstanding
            elif 61 <= days_overdue <= 90:
                bucket_61_90 += outstanding
                s_entry['bucket_61_90'] += outstanding
            else:
                bucket_over_90 += outstanding
                s_entry['bucket_over_90'] += outstanding

    for payment in active_payments:
        sup_id = str(payment.supplier_id)
        if sup_id not in supplier_map:
            supplier_map[sup_id] = {
                'supplier_id': sup_id,
                'supplier_name': payment.supplier_name_snapshot,
                'supplier_code': payment.supplier_code_snapshot,
                'total_billed': Decimal('0.00'), 'total_paid': Decimal('0.00'),
                'total_outstanding': Decimal('0.00'), 'not_due': Decimal('0.00'),
                'overdue_total': Decimal('0.00'), 'bucket_1_30': Decimal('0.00'),
                'bucket_31_60': Decimal('0.00'), 'bucket_61_90': Decimal('0.00'),
                'bucket_over_90': Decimal('0.00'), 'oldest_unpaid_invoice_date': None,
                'unpaid_bills_count': 0, 'unallocated_advance': Decimal('0.00'),
            }
        supplier_map[sup_id]['unallocated_advance'] += payment.unallocated_amount

    # Convert supplier map values to string representations
    suppliers_list = []
    for sup in supplier_map.values():
        suppliers_list.append({
            'supplier_id': sup['supplier_id'],
            'supplier_name': sup['supplier_name'],
            'supplier_code': sup['supplier_code'],
            'total_billed': str(sup['total_billed'].quantize(Decimal('0.01'))),
            'total_paid': str(sup['total_paid'].quantize(Decimal('0.01'))),
            'total_outstanding': str(sup['total_outstanding'].quantize(Decimal('0.01'))),
            'not_due': str(sup['not_due'].quantize(Decimal('0.01'))),
            'overdue_total': str(sup['overdue_total'].quantize(Decimal('0.01'))),
            'bucket_1_30': str(sup['bucket_1_30'].quantize(Decimal('0.01'))),
            'bucket_31_60': str(sup['bucket_31_60'].quantize(Decimal('0.01'))),
            'bucket_61_90': str(sup['bucket_61_90'].quantize(Decimal('0.01'))),
            'bucket_over_90': str(sup['bucket_over_90'].quantize(Decimal('0.01'))),
            'oldest_unpaid_invoice_date': sup['oldest_unpaid_invoice_date'],
            'unpaid_bills_count': sup['unpaid_bills_count'],
            'unallocated_advance': str(sup['unallocated_advance'].quantize(Decimal('0.01'))),
        })

    return {
        'as_of_date': today.isoformat(),
        'total_billed': str(total_billed.quantize(Decimal('0.01'))),
        'total_paid': str(total_paid.quantize(Decimal('0.01'))),
        'total_outstanding': str(total_outstanding.quantize(Decimal('0.01'))),
        'total_unallocated_advances': str(total_unallocated_advances.quantize(Decimal('0.01'))),
        'not_due': str(not_due_total.quantize(Decimal('0.01'))),
        'overdue_total': str(overdue_total.quantize(Decimal('0.01'))),
        'ageing_buckets': {
            'not_due': str(not_due_total.quantize(Decimal('0.01'))),
            'bucket_1_30': str(bucket_1_30.quantize(Decimal('0.01'))),
            'bucket_31_60': str(bucket_31_60.quantize(Decimal('0.01'))),
            'bucket_61_90': str(bucket_61_90.quantize(Decimal('0.01'))),
            'bucket_over_90': str(bucket_over_90.quantize(Decimal('0.01'))),
        },
        'suppliers': sorted(suppliers_list, key=lambda x: Decimal(x['total_outstanding']), reverse=True)
    }


def get_supplier_statement(organisation: Organisation, outlet: Outlet, supplier: Supplier):
    """
    Returns chronological ledger statement of bills and calculated running balances for a supplier.
    """
    today = to_outlet_business_date(timezone.now(), outlet=outlet, organisation=organisation)

    bills = list(PurchaseBill.objects.filter(
        organisation=organisation,
        outlet=outlet,
        supplier=supplier
    ).prefetch_related(
        'receipt_links__tanker_receipt'
    ).order_by('invoice_date', 'created_at'))

    from apps.finance.models import SupplierPayment
    payments = list(SupplierPayment.objects.filter(
        organisation=organisation, outlet=outlet, supplier=supplier
    ).prefetch_related('allocations__purchase_bill').order_by('payment_date', 'created_at'))

    running_balance = Decimal('0.00')
    statement_lines = []

    total_billed = Decimal('0.00')
    total_paid = Decimal('0.00')
    total_outstanding = Decimal('0.00')
    bucket_not_due = Decimal('0.00')
    bucket_1_30 = Decimal('0.00')
    bucket_31_60 = Decimal('0.00')
    bucket_61_90 = Decimal('0.00')
    bucket_over_90 = Decimal('0.00')

    events = [(bill.invoice_date, bill.created_at, 'purchase_bill', bill) for bill in bills]
    events += [(payment.payment_date, payment.created_at, 'supplier_payment', payment) for payment in payments]
    events.sort(key=lambda row: (row[0], row[1]))

    total_unallocated_advances = Decimal('0.00')
    for _, _, event_type, document in events:
        if event_type == 'supplier_payment':
            payment = document
            credit = payment.amount if payment.status == SupplierPayment.STATUS_ACTIVE else Decimal('0.00')
            if payment.status == SupplierPayment.STATUS_ACTIVE:
                running_balance -= credit
                total_unallocated_advances += payment.unallocated_amount
            statement_lines.append({
                'line_type': 'supplier_payment',
                'document_id': str(payment.id),
                'document_number': payment.payment_number,
                'date': payment.payment_date.isoformat(),
                'reference': payment.reference_number or payment.cheque_number or '',
                'status': payment.status,
                'debit_amount': '0.00',
                'credit_amount': str(credit.quantize(Decimal('0.01'))),
                'outstanding_amount': '0.00',
                'unallocated_amount': str(payment.unallocated_amount.quantize(Decimal('0.01'))),
                'running_balance': str(running_balance.quantize(Decimal('0.01'))),
                'allocations': [
                    {'bill_id': str(a.purchase_bill_id), 'bill_number': a.purchase_bill.bill_number, 'amount': str(a.amount)}
                    for a in payment.allocations.all()
                ],
            })
            continue

        bill = document
        debit = bill.grand_total if bill.status == PurchaseBill.STATUS_ACTIVE else Decimal('0.00')

        if bill.status == PurchaseBill.STATUS_ACTIVE:
            running_balance += debit
            total_billed += debit
            total_paid += bill.amount_paid
            total_outstanding += bill.outstanding_amount

            days_overdue = (today - bill.due_date).days if bill.due_date else 0
            if days_overdue <= 0:
                bucket_not_due += bill.outstanding_amount
            elif 1 <= days_overdue <= 30:
                bucket_1_30 += bill.outstanding_amount
            elif 31 <= days_overdue <= 60:
                bucket_31_60 += bill.outstanding_amount
            elif 61 <= days_overdue <= 90:
                bucket_61_90 += bill.outstanding_amount
            else:
                bucket_over_90 += bill.outstanding_amount

        linked_receipt_numbers = list(set([
            link.tanker_receipt.receipt_number
            for link in bill.receipt_links.all()
        ]))

        statement_lines.append({
            'line_type': 'purchase_bill',
            'document_id': str(bill.id),
            'document_number': bill.bill_number,
            'date': bill.invoice_date.isoformat(),
            'reference': bill.supplier_invoice_number,
            'bill_id': str(bill.id),
            'bill_number': bill.bill_number,
            'supplier_invoice_number': bill.supplier_invoice_number,
            'invoice_date': bill.invoice_date.isoformat(),
            'due_date': bill.due_date.isoformat(),
            'status': bill.status,
            'debit_amount': str(debit.quantize(Decimal('0.01'))),
            'credit_amount': '0.00',
            'outstanding_amount': str(bill.outstanding_amount.quantize(Decimal('0.01'))),
            'running_balance': str(running_balance.quantize(Decimal('0.01'))),
            'linked_receipt_numbers': linked_receipt_numbers
        })

    return {
        'supplier_id': str(supplier.id),
        'supplier_name': supplier.name,
        'supplier_code': supplier.code,
        'as_of_date': today.isoformat(),
        'total_billed': str(total_billed.quantize(Decimal('0.01'))),
        'total_paid': str(total_paid.quantize(Decimal('0.01'))),
        'total_outstanding': str(total_outstanding.quantize(Decimal('0.01'))),
        'total_unallocated_advances': str(total_unallocated_advances.quantize(Decimal('0.01'))),
        'ageing_buckets': {
            'not_due': str(bucket_not_due.quantize(Decimal('0.01'))),
            'bucket_1_30': str(bucket_1_30.quantize(Decimal('0.01'))),
            'bucket_31_60': str(bucket_31_60.quantize(Decimal('0.01'))),
            'bucket_61_90': str(bucket_61_90.quantize(Decimal('0.01'))),
            'bucket_over_90': str(bucket_over_90.quantize(Decimal('0.01'))),
        },
        'lines': statement_lines
    }


def list_purchase_tax_codes(organisation: Organisation, active_only: bool = False, tax_regime: str = None):
    qs = PurchaseTaxCode.objects.filter(organisation=organisation).prefetch_related('rates', 'rates__components')
    if active_only:
        qs = qs.filter(is_active=True)
    if tax_regime:
        qs = qs.filter(tax_regime=tax_regime)
    return qs.order_by('code')


def get_purchase_tax_code_detail(code_id, organisation: Organisation):
    try:
        return PurchaseTaxCode.objects.prefetch_related(
            'rates',
            'rates__components'
        ).get(
            id=code_id,
            organisation=organisation
        )
    except PurchaseTaxCode.DoesNotExist:
        return None


def list_purchase_items(organisation: Organisation, active_only: bool = False, item_type: str = None):
    qs = PurchaseItem.objects.filter(organisation=organisation).select_related('default_purchase_tax_code')
    if active_only:
        qs = qs.filter(is_active=True)
    if item_type:
        qs = qs.filter(item_type=item_type)
    return qs.order_by('name')


def get_purchase_item_detail(item_id, organisation: Organisation):
    try:
        return PurchaseItem.objects.select_related('default_purchase_tax_code').get(
            id=item_id,
            organisation=organisation
        )
    except PurchaseItem.DoesNotExist:
        return None


def list_product_tax_mappings(organisation: Organisation):
    return ProductPurchaseTaxMapping.objects.filter(
        organisation=organisation
    ).select_related('fuel_product', 'purchase_item', 'purchase_tax_code').order_by('fuel_product__name', 'purchase_item__name')
