from decimal import Decimal

from django.db.models import Q, Sum

from apps.purchases.models import PurchaseBill

from .models import CashBankTransfer, Expense, ExpenseCategory, PaymentAccount, PaymentAccountMovement, SupplierPayment


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


def list_expense_categories(organisation, active_only=False, search=None):
    qs = ExpenseCategory.objects.filter(organisation=organisation).select_related('ledger_account')
    if active_only:
        qs = qs.filter(is_active=True)
    if search:
        qs = qs.filter(Q(code__icontains=search) | Q(name__icontains=search))
    return qs


def list_expenses(organisation, outlet, filters=None):
    filters = filters or {}
    qs = Expense.objects.filter(organisation=organisation, outlet=outlet).select_related(
        'category', 'ledger_account', 'payment_account', 'created_by',
    )
    if filters.get('status'):
        qs = qs.filter(status=filters['status'])
    if filters.get('category'):
        qs = qs.filter(category_id=filters['category'])
    if filters.get('payment_account'):
        qs = qs.filter(payment_account_id=filters['payment_account'])
    if filters.get('from_date'):
        qs = qs.filter(expense_date__gte=filters['from_date'])
    if filters.get('to_date'):
        qs = qs.filter(expense_date__lte=filters['to_date'])
    if filters.get('search'):
        term = filters['search']
        qs = qs.filter(Q(expense_number__icontains=term) | Q(payee__icontains=term) |
                       Q(reference_number__icontains=term) | Q(category_name_snapshot__icontains=term))
    return qs


def list_cash_bank_transfers(organisation, outlet, filters=None):
    filters = filters or {}
    qs = CashBankTransfer.objects.filter(organisation=organisation, outlet=outlet).select_related(
        'from_account', 'to_account', 'created_by',
    )
    if filters.get('status'):
        qs = qs.filter(status=filters['status'])
    if filters.get('account'):
        qs = qs.filter(Q(from_account_id=filters['account']) | Q(to_account_id=filters['account']))
    if filters.get('from_date'):
        qs = qs.filter(transfer_date__gte=filters['from_date'])
    if filters.get('to_date'):
        qs = qs.filter(transfer_date__lte=filters['to_date'])
    if filters.get('search'):
        term = filters['search']
        qs = qs.filter(Q(transfer_number__icontains=term) | Q(reference_number__icontains=term) |
                       Q(from_account__name__icontains=term) | Q(to_account__name__icontains=term))
    return qs


def payment_account_book(account, outlet, filters=None):
    filters = filters or {}
    movements = PaymentAccountMovement.objects.filter(
        account=account, organisation=account.organisation,
    )
    if account.outlet_id:
        movements = movements.filter(outlet=outlet)
    movements = movements.order_by('effective_date', 'created_at', 'id')
    opening = account.opening_balance
    if filters.get('from_date'):
        opening += movements.filter(effective_date__lt=filters['from_date']).aggregate(total=Sum('signed_amount'))['total'] or Decimal('0.00')
        movements = movements.filter(effective_date__gte=filters['from_date'])
    if filters.get('to_date'):
        movements = movements.filter(effective_date__lte=filters['to_date'])
    if filters.get('search'):
        movements = movements.filter(description__icontains=filters['search'])
    running = opening
    rows = []
    for movement in movements:
        running += movement.signed_amount
        rows.append({
            'id': movement.id, 'effective_date': movement.effective_date,
            'movement_type': movement.movement_type, 'description': movement.description,
            'source_type': movement.source_type, 'source_id': movement.source_id,
            'debit': movement.signed_amount if movement.signed_amount > 0 else Decimal('0.00'),
            'credit': -movement.signed_amount if movement.signed_amount < 0 else Decimal('0.00'),
            'running_balance': running,
        })
    return opening.quantize(Decimal('0.01')), rows, running.quantize(Decimal('0.01'))
