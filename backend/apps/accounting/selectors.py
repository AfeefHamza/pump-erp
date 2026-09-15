from decimal import Decimal

from django.db import models

from .models import ChartOfAccount, JournalEntry, JournalLine


def list_accounts(organisation, params=None):
    params = params or {}
    rows = ChartOfAccount.objects.filter(organisation=organisation).select_related('parent')
    if params.get('active') == 'true':
        rows = rows.filter(is_active=True)
    if params.get('account_type'):
        rows = rows.filter(account_type=params['account_type'])
    if params.get('search'):
        rows = rows.filter(models.Q(code__icontains=params['search']) | models.Q(name__icontains=params['search']))
    return rows


def list_journals(organisation, outlet, params=None):
    params = params or {}
    rows = JournalEntry.objects.filter(organisation=organisation, outlet=outlet).select_related('created_by', 'reversal_of')
    if params.get('status') and params['status'] != 'all':
        rows = rows.filter(status=params['status'])
    if params.get('search'):
        rows = rows.filter(models.Q(journal_number__icontains=params['search']) | models.Q(reference__icontains=params['search']) | models.Q(narration__icontains=params['search']))
    return rows.prefetch_related('lines__account')[:250]


def trial_balance(organisation, outlet, from_date=None, to_date=None):
    accounts = ChartOfAccount.objects.filter(organisation=organisation, is_group=False, is_active=True)
    rows = []
    total_debit = Decimal('0.00'); total_credit = Decimal('0.00')
    for account in accounts:
        lines = JournalLine.objects.filter(account=account, journal__outlet=outlet)
        if from_date: lines = lines.filter(journal__entry_date__gte=from_date)
        if to_date: lines = lines.filter(journal__entry_date__lte=to_date)
        totals = lines.aggregate(debit=models.Sum('debit'), credit=models.Sum('credit'))
        debit = totals['debit'] or Decimal('0.00'); credit = totals['credit'] or Decimal('0.00')
        net = debit - credit
        closing_debit = max(net, Decimal('0.00')); closing_credit = max(-net, Decimal('0.00'))
        if debit or credit:
            rows.append({'account_id': str(account.id), 'code': account.code, 'name': account.name, 'account_type': account.account_type, 'debit': str(debit), 'credit': str(credit), 'closing_debit': str(closing_debit), 'closing_credit': str(closing_credit)})
            total_debit += debit; total_credit += credit
    return {'rows': rows, 'total_debit': str(total_debit), 'total_credit': str(total_credit)}


def account_ledger(organisation, outlet, account, from_date=None, to_date=None):
    lines = JournalLine.objects.filter(account=account, journal__organisation=organisation, journal__outlet=outlet).select_related('journal').order_by('journal__entry_date', 'journal__created_at', 'sequence')
    if from_date: lines = lines.filter(journal__entry_date__gte=from_date)
    if to_date: lines = lines.filter(journal__entry_date__lte=to_date)
    running = Decimal('0.00'); rows = []
    for line in lines:
        running += line.debit - line.credit
        rows.append({'journal_id': str(line.journal_id), 'journal_number': line.journal.journal_number, 'entry_date': line.journal.entry_date.isoformat(), 'reference': line.journal.reference, 'description': line.description or line.journal.narration, 'debit': str(line.debit), 'credit': str(line.credit), 'running_balance': str(running)})
    return {'account': {'id': str(account.id), 'code': account.code, 'name': account.name}, 'rows': rows, 'closing_balance': str(running)}
