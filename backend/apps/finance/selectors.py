from decimal import Decimal

from django.db.models import Q, Sum

from apps.purchases.models import PurchaseBill

from .models import PaymentAccount, SupplierPayment


def list_payment_accounts(organisation, outlet=None, active_only=False, account_type=None, search=None):
    qs = PaymentAccount.objects.filter(organisation=organisation).select_related('outlet')
    if outlet:
        qs = qs.filter(Q(outlet__isnull=True) | Q(outlet=outlet))
    if active_only:
        qs = qs.filter(is_active=True)
    if account_type:
        qs = qs.filter(account_type=account_type)
    if search:
        qs = qs.filter(Q(code__icontains=search) | Q(name__icontains=search) | Q(bank_name__icontains=search))
    return qs


def list_supplier_payments(organisation, outlet, filters=None):
    filters = filters or {}
    qs = SupplierPayment.objects.filter(organisation=organisation, outlet=outlet).select_related(
        'supplier', 'payment_account', 'created_by'
    ).prefetch_related('allocations')
    if filters.get('supplier'):
        qs = qs.filter(supplier_id=filters['supplier'])
    if filters.get('status'):
        qs = qs.filter(status=filters['status'])
    if filters.get('payment_method'):
        qs = qs.filter(payment_method=filters['payment_method'])
    if filters.get('payment_account'):
        qs = qs.filter(payment_account_id=filters['payment_account'])
    if filters.get('from_date'):
        qs = qs.filter(payment_date__gte=filters['from_date'])
    if filters.get('to_date'):
        qs = qs.filter(payment_date__lte=filters['to_date'])
    if filters.get('search'):
        term = filters['search']
        qs = qs.filter(Q(payment_number__icontains=term) | Q(reference_number__icontains=term) | Q(supplier_name_snapshot__icontains=term))
    return qs


def open_purchase_bills(organisation, outlet, supplier):
    return PurchaseBill.objects.filter(
        organisation=organisation,
        outlet=outlet,
        supplier=supplier,
        status=PurchaseBill.STATUS_ACTIVE,
        outstanding_amount__gt=0,
    ).order_by('due_date', 'invoice_date', 'created_at')


def payment_totals(organisation, outlet):
    active = SupplierPayment.objects.filter(organisation=organisation, outlet=outlet, status=SupplierPayment.STATUS_ACTIVE)
    total = active.aggregate(value=Sum('amount'))['value'] or Decimal('0.00')
    advance = active.aggregate(value=Sum('unallocated_amount'))['value'] or Decimal('0.00')
    return {'total_active_payments': total, 'total_allocated': total - advance, 'total_unallocated': advance}
