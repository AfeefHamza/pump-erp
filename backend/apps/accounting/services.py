from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone

from apps.organizations.models import FinancialYear
from apps.organizations.permissions import require_permission

from .models import AccountingPeriodLock, ChartOfAccount, JournalEntry, JournalLine, JournalSequence

MONEY = Decimal('0.01')

STANDARD_ACCOUNTS = [
    ('1000', 'Assets', 'asset', True, 'assets', None),
    ('1100', 'Cash & Bank', 'asset', True, 'cash_bank_group', 'assets'),
    ('1200', 'Accounts Receivable', 'asset', False, 'accounts_receivable', 'assets'),
    ('1300', 'Inventory', 'asset', False, 'inventory', 'assets'),
    ('1400', 'Input Tax', 'asset', False, 'input_tax', 'assets'),
    ('1500', 'Supplier Advances', 'asset', False, 'supplier_advances', 'assets'),
    ('1600', 'TDS Receivable', 'asset', False, 'tds_receivable', 'assets'),
    ('1700', 'Digital Collection Receivable', 'asset', False, 'digital_collection_clearing', 'assets'),
    ('1800', 'Employee Shortage Receivable', 'asset', False, 'employee_shortage_receivable', 'assets'),
    ('2000', 'Liabilities', 'liability', True, 'liabilities', None),
    ('2100', 'Accounts Payable', 'liability', False, 'accounts_payable', 'liabilities'),
    ('2200', 'Output Tax', 'liability', False, 'output_tax', 'liabilities'),
    ('2300', 'Customer Advances', 'liability', False, 'customer_advances', 'liabilities'),
    ('3000', 'Equity', 'equity', True, 'equity', None),
    ('3100', 'Opening Balance Equity', 'equity', False, 'opening_balance_equity', 'equity'),
    ('4000', 'Income', 'income', True, 'income', None),
    ('4100', 'Fuel Sales', 'income', False, 'fuel_sales', 'income'),
    ('4200', 'Product Sales', 'income', False, 'product_sales', 'income'),
    ('4300', 'Service Income', 'income', False, 'service_income', 'income'),
    ('4900', 'Shift Excess Income', 'income', False, 'shift_excess_income', 'income'),
    ('4950', 'Shift Adjustment Income', 'income', False, 'shift_adjustment_income', 'income'),
    ('5000', 'Cost of Sales', 'expense', True, 'cost_of_sales', None),
    ('5100', 'Purchases', 'expense', False, 'purchases', 'cost_of_sales'),
    ('5200', 'Cost of Goods Sold', 'expense', False, 'cost_of_goods_sold', 'cost_of_sales'),
    ('6000', 'Operating Expenses', 'expense', True, 'operating_expenses', None),
    ('6100', 'General Expenses', 'expense', False, 'general_expenses', 'operating_expenses'),
    ('6200', 'Payment Gateway Charges', 'expense', False, 'payment_gateway_charges', 'operating_expenses'),
    ('6300', 'Shift Cash Expenses & Adjustments', 'expense', False, 'shift_adjustment_expense', 'operating_expenses'),
]


def decimal_money(value, field='amount'):
    try:
        return Decimal(str(value or '0')).quantize(MONEY, rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError):
        raise ValidationError({field: 'Enter a valid amount.'})


@transaction.atomic
def ensure_standard_chart(organisation, user=None):
    created = {}
    for code, name, account_type, is_group, system_key, parent_key in STANDARD_ACCOUNTS:
        parent = created.get(parent_key)
        account, _ = ChartOfAccount.objects.get_or_create(
            organisation=organisation, system_key=system_key,
            defaults={'code': code, 'name': name, 'account_type': account_type, 'is_group': is_group, 'parent': parent, 'allow_manual_posting': not is_group, 'created_by': user},
        )
        created[system_key] = account
    return created


def validate_open_period(organisation, outlet, entry_date):
    financial_year = FinancialYear.objects.filter(
        organisation=organisation, start_date__lte=entry_date, end_date__gte=entry_date,
        status=FinancialYear.STATUS_OPEN,
    ).first()
    if not financial_year:
        raise ValidationError({'entry_date': 'Entry date must fall inside an open Financial Year.'})
    month = entry_date.replace(day=1)
    locked = AccountingPeriodLock.objects.filter(
        organisation=organisation, month=month, unlocked_at__isnull=True,
    ).filter(models.Q(outlet__isnull=True) | models.Q(outlet=outlet)).exists()
    if locked:
        raise ValidationError({'entry_date': 'This accounting month is locked.'})
    return financial_year


def next_journal_number(outlet, year):
    sequence, _ = JournalSequence.objects.select_for_update().get_or_create(outlet=outlet, year=year)
    sequence.last_sequence += 1
    sequence.save(update_fields=['last_sequence'])
    return f'JV-{outlet.code.upper()}-{year}-{sequence.last_sequence:05d}'


@transaction.atomic
def create_account(*, organisation, code, name, account_type, user, parent=None,
                   is_group=False, allow_manual_posting=True, description='', display_order=0):
    require_permission(user, organisation, 'chart_of_accounts.create')
    account = ChartOfAccount(
        organisation=organisation, parent=parent, code=code, name=name,
        account_type=account_type, is_group=is_group,
        allow_manual_posting=allow_manual_posting, description=description or '',
        display_order=display_order, created_by=user,
    )
    account.save()
    return account


@transaction.atomic
def update_account(account, user, **changes):
    require_permission(user, account.organisation, 'chart_of_accounts.update')
    for field in ('parent', 'code', 'name', 'account_type', 'is_group', 'allow_manual_posting', 'description', 'display_order', 'is_active'):
        if field in changes:
            setattr(account, field, changes[field])
    account.save()
    return account


@transaction.atomic
def deactivate_account(account, user):
    require_permission(user, account.organisation, 'chart_of_accounts.deactivate')
    if account.system_key or account.children.filter(is_active=True).exists():
        raise ValidationError('System accounts and groups with active children cannot be deactivated.')
    account.is_active = False
    account.save(update_fields=['is_active', 'updated_at'])
    return account


@transaction.atomic
def post_journal(*, organisation, outlet, entry_date, narration, lines, user,
                 reference='', source_type=JournalEntry.SOURCE_MANUAL, source_id=None,
                 client_request_id=None, reversal_of=None, reversal_reason='',
                 enforce_permission=True):
    if enforce_permission:
        permission = 'journal_voucher.create' if source_type == JournalEntry.SOURCE_MANUAL else 'journal_voucher.reverse'
        require_permission(user, organisation, permission, outlet=outlet)
    if client_request_id:
        existing = JournalEntry.objects.filter(organisation=organisation, outlet=outlet, client_request_id=client_request_id).first()
        if existing:
            return existing
    validate_open_period(organisation, outlet, entry_date)
    if len((narration or '').strip()) < 5:
        raise ValidationError({'narration': 'Provide a narration of at least 5 characters.'})
    if len(lines or []) < 2:
        raise ValidationError({'lines': 'A journal requires at least two lines.'})
    prepared = []
    total_debit = Decimal('0.00')
    total_credit = Decimal('0.00')
    for row in lines:
        account = ChartOfAccount.objects.filter(id=row.get('account_id'), organisation=organisation, is_active=True, is_group=False).first()
        if not account:
            raise ValidationError({'lines': 'Select an active ledger account from this organisation.'})
        if source_type == JournalEntry.SOURCE_MANUAL and not account.allow_manual_posting:
            raise ValidationError({'lines': f'Manual posting is disabled for {account.name}.'})
        debit = decimal_money(row.get('debit'), 'debit')
        credit = decimal_money(row.get('credit'), 'credit')
        if (debit > 0) == (credit > 0):
            raise ValidationError({'lines': 'Every line needs either a debit or a credit, never both.'})
        total_debit += debit; total_credit += credit
        prepared.append((account, debit, credit, row))
    if total_debit <= 0 or total_debit != total_credit:
        raise ValidationError({'lines': 'Total debit and total credit must balance exactly.'})
    journal = JournalEntry(
        organisation=organisation, outlet=outlet,
        journal_number=next_journal_number(outlet, entry_date.year), entry_date=entry_date,
        source_type=source_type, source_id=source_id, client_request_id=client_request_id,
        reference=(reference or '').strip(), narration=narration.strip(),
        total_debit=total_debit, total_credit=total_credit,
        reversal_of=reversal_of, reversal_reason=reversal_reason or '', created_by=user,
    )
    journal.save()
    for sequence, (account, debit, credit, row) in enumerate(prepared, 1):
        JournalLine.objects.create(
            journal=journal, sequence=sequence, account=account,
            account_code_snapshot=account.code, account_name_snapshot=account.name,
            description=(row.get('description') or '').strip(), debit=debit, credit=credit,
            party_type=(row.get('party_type') or '').strip(), party_id=row.get('party_id'),
            party_name_snapshot=(row.get('party_name') or '').strip(),
        )
    return journal


@transaction.atomic
def reverse_journal(journal, reason, user, reversal_date=None, enforce_permission=True):
    journal = JournalEntry.objects.select_for_update().prefetch_related('lines').get(pk=journal.pk)
    if enforce_permission:
        require_permission(user, journal.organisation, 'journal_voucher.reverse', outlet=journal.outlet)
        if journal.source_type != JournalEntry.SOURCE_MANUAL:
            raise ValidationError(
                'Automatic journals can only be reversed by voiding their source transaction.'
            )
    if journal.status == JournalEntry.STATUS_REVERSED:
        return journal.reversal_entry
    if journal.reversal_of_id:
        raise ValidationError('A reversal journal cannot itself be reversed.')
    if len((reason or '').strip()) < 5:
        raise ValidationError({'reason': 'Provide a reversal reason of at least 5 characters.'})
    reverse_date = reversal_date or timezone.localdate()
    reversal = post_journal(
        organisation=journal.organisation, outlet=journal.outlet, entry_date=reverse_date,
        narration=f'Reversal of {journal.journal_number}: {reason.strip()}',
        reference=journal.journal_number, source_type=JournalEntry.SOURCE_REVERSAL,
        source_id=journal.id, reversal_of=journal, reversal_reason=reason.strip(), user=user,
        lines=[{'account_id': line.account_id, 'debit': line.credit, 'credit': line.debit, 'description': line.description, 'party_type': line.party_type, 'party_id': line.party_id, 'party_name': line.party_name_snapshot} for line in journal.lines.all()],
        enforce_permission=enforce_permission,
    )
    journal.status = JournalEntry.STATUS_REVERSED
    journal._allow_reversed_status = True
    journal.save(update_fields=['status'])
    return reversal


@transaction.atomic
def lock_period(*, organisation, month, reason, user, outlet=None):
    require_permission(user, organisation, 'accounting_period.lock', outlet=outlet)
    month = month.replace(day=1)
    if len((reason or '').strip()) < 5:
        raise ValidationError({'reason': 'Provide a lock reason of at least 5 characters.'})
    lock = AccountingPeriodLock(organisation=organisation, outlet=outlet, month=month, reason=reason.strip(), locked_by=user)
    lock.full_clean(); lock.save()
    return lock


@transaction.atomic
def unlock_period(lock, reason, user):
    require_permission(user, lock.organisation, 'accounting_period.unlock', outlet=lock.outlet)
    if not lock.is_active:
        return lock
    if len((reason or '').strip()) < 5:
        raise ValidationError({'reason': 'Provide an unlock reason of at least 5 characters.'})
    lock.unlocked_by = user; lock.unlocked_at = timezone.now(); lock.unlock_reason = reason.strip()
    lock.save(update_fields=['unlocked_by', 'unlocked_at', 'unlock_reason'])
    return lock
