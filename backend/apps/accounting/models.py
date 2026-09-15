import uuid
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.functions import Lower

from apps.organizations.models import Organisation, Outlet


class ChartOfAccount(models.Model):
    TYPE_ASSET = 'asset'
    TYPE_LIABILITY = 'liability'
    TYPE_EQUITY = 'equity'
    TYPE_INCOME = 'income'
    TYPE_EXPENSE = 'expense'
    TYPE_CHOICES = [(TYPE_ASSET, 'Asset'), (TYPE_LIABILITY, 'Liability'), (TYPE_EQUITY, 'Equity'), (TYPE_INCOME, 'Income'), (TYPE_EXPENSE, 'Expense')]
    NORMAL_DEBIT = 'debit'
    NORMAL_CREDIT = 'credit'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE, related_name='chart_of_accounts')
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.PROTECT, related_name='children')
    code = models.CharField(max_length=30)
    name = models.CharField(max_length=150)
    account_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    is_group = models.BooleanField(default=False)
    allow_manual_posting = models.BooleanField(default=True)
    system_key = models.CharField(max_length=80, null=True, blank=True)
    description = models.TextField(blank=True)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='created_ledger_accounts')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['code', 'name']
        constraints = [
            models.UniqueConstraint(Lower('code'), 'organisation', name='unique_org_ledger_code_ci'),
            models.UniqueConstraint(fields=['organisation', 'system_key'], condition=models.Q(system_key__isnull=False), name='unique_org_ledger_system_key'),
        ]

    @property
    def normal_balance(self):
        return self.NORMAL_DEBIT if self.account_type in (self.TYPE_ASSET, self.TYPE_EXPENSE) else self.NORMAL_CREDIT

    def clean(self):
        super().clean()
        self.code = (self.code or '').strip().upper()
        self.name = (self.name or '').strip()
        self.system_key = (self.system_key or '').strip() or None
        if self.parent_id:
            if self.parent.organisation_id != self.organisation_id:
                raise ValidationError({'parent': 'Parent account must belong to the organisation.'})
            if not self.parent.is_group:
                raise ValidationError({'parent': 'Parent account must be a group account.'})
            if self.parent.account_type != self.account_type:
                raise ValidationError({'account_type': 'Account type must match the parent group.'})
            if self.parent_id == self.id:
                raise ValidationError({'parent': 'An account cannot be its own parent.'})
        if self.is_group:
            self.allow_manual_posting = False

    def save(self, *args, **kwargs):
        if self.pk:
            previous = ChartOfAccount.objects.filter(pk=self.pk).first()
            if previous and self.journal_lines.exists():
                for field in ('code', 'account_type', 'is_group', 'parent_id', 'system_key'):
                    if getattr(previous, field) != getattr(self, field):
                        raise ValidationError('Account structure cannot change after ledger postings exist.')
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.journal_lines.exists() or self.children.exists() or self.system_key:
            raise ValidationError('Used, parent, and system accounts cannot be deleted. Deactivate them instead.')
        return super().delete(*args, **kwargs)


class JournalSequence(models.Model):
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE, related_name='journal_sequences')
    year = models.PositiveIntegerField()
    last_sequence = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['outlet', 'year'], name='unique_outlet_journal_sequence')]


class JournalEntry(models.Model):
    SOURCE_MANUAL = 'manual_journal'
    SOURCE_REVERSAL = 'journal_reversal'
    STATUS_POSTED = 'posted'
    STATUS_REVERSED = 'reversed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name='journal_entries')
    outlet = models.ForeignKey(Outlet, on_delete=models.PROTECT, related_name='journal_entries')
    journal_number = models.CharField(max_length=100)
    entry_date = models.DateField(db_index=True)
    source_type = models.CharField(max_length=50, default=SOURCE_MANUAL)
    source_id = models.UUIDField(null=True, blank=True, db_index=True)
    client_request_id = models.UUIDField(null=True, blank=True)
    reference = models.CharField(max_length=100, blank=True)
    narration = models.TextField()
    total_debit = models.DecimalField(max_digits=18, decimal_places=2)
    total_credit = models.DecimalField(max_digits=18, decimal_places=2)
    status = models.CharField(max_length=20, choices=[(STATUS_POSTED, 'Posted'), (STATUS_REVERSED, 'Reversed')], default=STATUS_POSTED)
    reversal_of = models.OneToOneField('self', null=True, blank=True, on_delete=models.PROTECT, related_name='reversal_entry')
    reversal_reason = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='created_journal_entries')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-entry_date', '-created_at']
        constraints = [
            models.UniqueConstraint(fields=['outlet', 'journal_number'], name='unique_outlet_journal_number'),
            models.UniqueConstraint(fields=['organisation', 'outlet', 'client_request_id'], condition=models.Q(client_request_id__isnull=False), name='unique_journal_client_request'),
            models.UniqueConstraint(fields=['organisation', 'outlet', 'source_type', 'source_id'], condition=models.Q(source_id__isnull=False) & ~models.Q(source_type='journal_reversal'), name='unique_journal_source'),
            models.CheckConstraint(condition=models.Q(total_debit__gt=0), name='journal_total_debit_positive'),
            models.CheckConstraint(condition=models.Q(total_credit__gt=0), name='journal_total_credit_positive'),
        ]

    def clean(self):
        super().clean()
        if self.outlet_id and self.outlet.organisation_id != self.organisation_id:
            raise ValidationError('Journal outlet must belong to the organisation.')
        if self.total_debit != self.total_credit:
            raise ValidationError('Journal debit and credit totals must balance exactly.')
        if self.reversal_of_id:
            if self.reversal_of.organisation_id != self.organisation_id or self.reversal_of.outlet_id != self.outlet_id:
                raise ValidationError('Journal reversal must match the original organisation and outlet.')

    def save(self, *args, **kwargs):
        if self.pk:
            previous = JournalEntry.objects.filter(pk=self.pk).first()
            if previous:
                if getattr(self, '_allow_reversed_status', False):
                    allowed = {'status'}
                    changed = {f.attname for f in self._meta.concrete_fields if getattr(previous, f.attname) != getattr(self, f.attname)}
                    if changed - allowed:
                        raise ValidationError('Posted journal entries are immutable.')
                else:
                    raise ValidationError('Posted journal entries are immutable. Reverse the entry instead.')
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('Journal entries cannot be deleted. Reverse the entry instead.')


class JournalLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    journal = models.ForeignKey(JournalEntry, on_delete=models.PROTECT, related_name='lines')
    sequence = models.PositiveIntegerField()
    account = models.ForeignKey(ChartOfAccount, on_delete=models.PROTECT, related_name='journal_lines')
    account_code_snapshot = models.CharField(max_length=30)
    account_name_snapshot = models.CharField(max_length=150)
    description = models.CharField(max_length=255, blank=True)
    debit = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    credit = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    party_type = models.CharField(max_length=30, blank=True)
    party_id = models.UUIDField(null=True, blank=True)
    party_name_snapshot = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['sequence']
        constraints = [models.UniqueConstraint(fields=['journal', 'sequence'], name='unique_journal_line_sequence')]

    def clean(self):
        super().clean()
        if self.account_id and self.account.organisation_id != self.journal.organisation_id:
            raise ValidationError('Journal account must belong to the organisation.')
        if self.account_id and (self.account.is_group or not self.account.is_active):
            raise ValidationError('Post only to an active ledger account, not a group.')
        if (self.debit > 0) == (self.credit > 0):
            raise ValidationError('Each journal line must contain either a debit or a credit amount.')

    def save(self, *args, **kwargs):
        if self.pk and JournalLine.objects.filter(pk=self.pk).exists():
            raise ValidationError('Posted journal lines are immutable.')
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('Posted journal lines cannot be deleted.')


class AccountingPeriodLock(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE, related_name='accounting_period_locks')
    outlet = models.ForeignKey(Outlet, null=True, blank=True, on_delete=models.PROTECT, related_name='accounting_period_locks')
    month = models.DateField(help_text='First day of the locked accounting month.')
    reason = models.TextField()
    locked_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='locked_accounting_periods')
    locked_at = models.DateTimeField(auto_now_add=True)
    unlocked_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='unlocked_accounting_periods')
    unlocked_at = models.DateTimeField(null=True, blank=True)
    unlock_reason = models.TextField(blank=True)

    class Meta:
        ordering = ['-month']
        constraints = [
            models.UniqueConstraint(fields=['organisation', 'outlet', 'month'], condition=models.Q(unlocked_at__isnull=True, outlet__isnull=False), name='unique_active_outlet_period_lock'),
            models.UniqueConstraint(fields=['organisation', 'month'], condition=models.Q(unlocked_at__isnull=True, outlet__isnull=True), name='unique_active_org_period_lock'),
        ]

    @property
    def is_active(self):
        return self.unlocked_at is None

    def delete(self, *args, **kwargs):
        raise ValidationError('Accounting period locks are audit records and cannot be deleted.')
