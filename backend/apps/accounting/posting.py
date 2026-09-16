from collections import defaultdict
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.core.timezone_utils import to_outlet_business_date

from .models import ChartOfAccount, JournalEntry
from .services import ensure_standard_chart, post_journal, reverse_journal

MONEY = Decimal('0.01')
ELIGIBLE_ITC = {'eligible_inputs', 'eligible_capital_goods', 'eligible_input_services'}


def _amount(value):
    return Decimal(str(value or '0')).quantize(MONEY)


def _accounts(organisation):
    ensure_standard_chart(organisation)
    return {
        row.system_key: row
        for row in ChartOfAccount.objects.filter(organisation=organisation, system_key__isnull=False)
    }


def _source_journal(organisation, outlet, source_type, source_id):
    return JournalEntry.objects.filter(
        organisation=organisation, outlet=outlet, source_type=source_type, source_id=source_id,
        reversal_of__isnull=True,
    ).first()


@transaction.atomic
def ensure_payment_account_ledger(payment_account, user=None):
    """Create one stable Asset ledger for a Cash/Bank operational account."""
    payment_account = payment_account.__class__.objects.select_for_update().get(pk=payment_account.pk)
    if payment_account.ledger_account_id:
        return payment_account.ledger_account
    accounts = _accounts(payment_account.organisation)
    base_code = f'PA-{payment_account.code}'.strip().upper()[:30]
    code = base_code
    if ChartOfAccount.objects.filter(organisation=payment_account.organisation, code__iexact=code).exists():
        suffix = str(payment_account.id).split('-')[0].upper()
        code = f'{base_code[:21]}-{suffix}'
    ledger = ChartOfAccount.objects.create(
        organisation=payment_account.organisation,
        parent=accounts['cash_bank_group'],
        code=code,
        name=payment_account.name,
        account_type=ChartOfAccount.TYPE_ASSET,
        is_group=False,
        allow_manual_posting=True,
        system_key=f'payment_account:{payment_account.id}',
        description='Automatically mapped from Cash & Banking.',
        created_by=user,
    )
    payment_account.ledger_account = ledger
    payment_account.save(update_fields=['ledger_account', 'updated_at'])
    return ledger


def _post(*, organisation, outlet, source_type, source_id, entry_date, reference, narration, lines, user):
    existing = _source_journal(organisation, outlet, source_type, source_id)
    if existing:
        return existing
    return post_journal(
        organisation=organisation,
        outlet=outlet,
        source_type=source_type,
        source_id=source_id,
        entry_date=entry_date,
        reference=reference,
        narration=narration,
        lines=[line for line in lines if _amount(line.get('debit')) > 0 or _amount(line.get('credit')) > 0],
        user=user,
        enforce_permission=False,
    )


@transaction.atomic
def post_sales_invoice(invoice, user=None):
    if invoice.status != invoice.STATUS_ACTIVE or invoice.grand_total <= 0:
        return None
    accounts = _accounts(invoice.organisation)
    debit_account = (
        ensure_payment_account_ledger(invoice.payment_account, user)
        if invoice.invoice_type == invoice.TYPE_CASH
        else accounts['accounts_receivable']
    )
    revenue = defaultdict(lambda: Decimal('0.00'))
    for line in invoice.lines.all():
        if line.item_type_snapshot == 'fuel':
            key = 'fuel_sales'
        elif line.item_type_snapshot == 'service':
            key = 'service_income'
        else:
            key = 'product_sales'
        revenue[key] += _amount(line.line_total - line.tax_amount)
    tax = _amount(invoice.tax_total)
    expected_revenue = _amount(invoice.grand_total - tax)
    difference = expected_revenue - sum(revenue.values(), Decimal('0.00'))
    if difference:
        revenue[next(iter(revenue), 'product_sales')] += difference
    lines = [{'account_id': debit_account.id, 'debit': invoice.grand_total, 'credit': 0, 'description': invoice.customer_name_snapshot}]
    lines.extend({'account_id': accounts[key].id, 'debit': 0, 'credit': value, 'description': invoice.invoice_number} for key, value in revenue.items())
    if tax:
        lines.append({'account_id': accounts['output_tax'].id, 'debit': 0, 'credit': tax, 'description': 'Output tax'})
    return _post(
        organisation=invoice.organisation, outlet=invoice.outlet, source_type='sales_invoice', source_id=invoice.id,
        entry_date=invoice.invoice_date, reference=invoice.invoice_number,
        narration=f'Sales Invoice {invoice.invoice_number} · {invoice.customer_name_snapshot}', lines=lines, user=user,
    )


@transaction.atomic
def post_purchase_bill(bill, user=None):
    if bill.status != bill.STATUS_ACTIVE or bill.grand_total <= 0:
        return None
    accounts = _accounts(bill.organisation)
    recoverable_tax = Decimal('0.00')
    for line in bill.lines.all():
        if line.itc_classification in ELIGIBLE_ITC:
            recoverable_tax += _amount(line.cgst_amount + line.sgst_amount + line.igst_amount + line.cess_amount)
    recoverable_tax = min(_amount(recoverable_tax), _amount(bill.grand_total))
    purchase_cost = _amount(bill.grand_total - recoverable_tax)
    lines = [
        {'account_id': accounts['purchases'].id, 'debit': purchase_cost, 'credit': 0, 'description': bill.supplier_name_snapshot},
        {'account_id': accounts['accounts_payable'].id, 'debit': 0, 'credit': bill.grand_total, 'description': bill.supplier_name_snapshot},
    ]
    if recoverable_tax:
        lines.insert(1, {'account_id': accounts['input_tax'].id, 'debit': recoverable_tax, 'credit': 0, 'description': 'Eligible input tax'})
    return _post(
        organisation=bill.organisation, outlet=bill.outlet, source_type='purchase_bill', source_id=bill.id,
        entry_date=bill.invoice_date, reference=bill.bill_number,
        narration=f'Purchase Bill {bill.bill_number} · {bill.supplier_name_snapshot}', lines=lines, user=user,
    )


@transaction.atomic
def post_customer_receipt(receipt, user=None):
    if receipt.status != receipt.STATUS_ACTIVE:
        return None
    accounts = _accounts(receipt.organisation)
    bank = ensure_payment_account_ledger(receipt.payment_account, user)
    allocated = _amount(receipt.amount - receipt.unallocated_amount)
    return _post(
        organisation=receipt.organisation, outlet=receipt.outlet, source_type='customer_receipt', source_id=receipt.id,
        entry_date=receipt.receipt_date, reference=receipt.receipt_number,
        narration=f'Customer Receipt {receipt.receipt_number} · {receipt.customer_name_snapshot}', user=user,
        lines=[
            {'account_id': bank.id, 'debit': receipt.amount, 'credit': 0, 'description': receipt.customer_name_snapshot},
            {'account_id': accounts['accounts_receivable'].id, 'debit': 0, 'credit': allocated, 'description': 'Invoice allocation'},
            {'account_id': accounts['customer_advances'].id, 'debit': 0, 'credit': receipt.unallocated_amount, 'description': 'Unallocated customer advance'},
        ],
    )


@transaction.atomic
def post_supplier_payment(payment, user=None):
    if payment.status != payment.STATUS_ACTIVE:
        return None
    accounts = _accounts(payment.organisation)
    bank = ensure_payment_account_ledger(payment.payment_account, user)
    allocated = _amount(payment.amount - payment.unallocated_amount)
    return _post(
        organisation=payment.organisation, outlet=payment.outlet, source_type='supplier_payment', source_id=payment.id,
        entry_date=payment.payment_date, reference=payment.payment_number,
        narration=f'Supplier Payment {payment.payment_number} · {payment.supplier_name_snapshot}', user=user,
        lines=[
            {'account_id': accounts['accounts_payable'].id, 'debit': allocated, 'credit': 0, 'description': 'Bill allocation'},
            {'account_id': accounts['supplier_advances'].id, 'debit': payment.unallocated_amount, 'credit': 0, 'description': 'Unallocated supplier advance'},
            {'account_id': bank.id, 'debit': 0, 'credit': payment.amount, 'description': payment.supplier_name_snapshot},
        ],
    )


@transaction.atomic
def post_supplier_payment_allocation(allocation, user=None):
    payment = allocation.payment
    accounts = _accounts(payment.organisation)
    return _post(
        organisation=payment.organisation, outlet=payment.outlet, source_type='supplier_payment_allocation', source_id=allocation.id,
        entry_date=to_outlet_business_date(
            timezone.now(), outlet=payment.outlet, organisation=payment.organisation,
        ), reference=payment.payment_number,
        narration=f'Allocate supplier advance from {payment.payment_number} to {allocation.purchase_bill.bill_number}', user=user,
        lines=[
            {'account_id': accounts['accounts_payable'].id, 'debit': allocation.amount, 'credit': 0, 'description': allocation.purchase_bill.bill_number},
            {'account_id': accounts['supplier_advances'].id, 'debit': 0, 'credit': allocation.amount, 'description': payment.payment_number},
        ],
    )


@transaction.atomic
def post_expense(expense, user=None):
    if expense.status != expense.STATUS_ACTIVE:
        return None
    bank = ensure_payment_account_ledger(expense.payment_account, user)
    return _post(
        organisation=expense.organisation, outlet=expense.outlet,
        source_type='expense', source_id=expense.id, entry_date=expense.expense_date,
        reference=expense.expense_number,
        narration=f'Expense {expense.expense_number} · {expense.category_name_snapshot}', user=user,
        lines=[
            {'account_id': expense.ledger_account_id, 'debit': expense.amount, 'credit': 0,
             'description': expense.payee or expense.category_name_snapshot},
            {'account_id': bank.id, 'debit': 0, 'credit': expense.amount,
             'description': expense.payment_account.name},
        ],
    )


@transaction.atomic
def post_cash_bank_transfer(transfer, user=None):
    if transfer.status != transfer.STATUS_ACTIVE:
        return None
    source = ensure_payment_account_ledger(transfer.from_account, user)
    destination = ensure_payment_account_ledger(transfer.to_account, user)
    return _post(
        organisation=transfer.organisation, outlet=transfer.outlet,
        source_type='cash_bank_transfer', source_id=transfer.id, entry_date=transfer.transfer_date,
        reference=transfer.transfer_number,
        narration=f'Cash/Bank Transfer {transfer.transfer_number} · {transfer.from_account.name} to {transfer.to_account.name}',
        user=user,
        lines=[
            {'account_id': destination.id, 'debit': transfer.amount, 'credit': 0,
             'description': transfer.to_account.name},
            {'account_id': source.id, 'debit': 0, 'credit': transfer.amount,
             'description': transfer.from_account.name},
        ],
    )


@transaction.atomic
def reverse_source_journal(*, organisation, outlet, source_type, source_id, reason, user=None, reversal_date=None):
    journal = _source_journal(organisation, outlet, source_type, source_id)
    if not journal:
        return None
    return reverse_journal(
        journal, reason, user, reversal_date=reversal_date or timezone.localdate(), enforce_permission=False,
    )


def journal_id_for_source(organisation_id, outlet_id, source_type, source_id):
    return JournalEntry.objects.filter(
        organisation_id=organisation_id, outlet_id=outlet_id, source_type=source_type,
        source_id=source_id, reversal_of__isnull=True,
    ).values_list('id', flat=True).first()
