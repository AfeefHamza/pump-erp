import uuid
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.functions import Lower

from apps.organizations.models import Organisation, Outlet
from apps.purchases.models import PurchaseBill, Supplier


class PaymentAccount(models.Model):
    TYPE_CASH = 'cash'
    TYPE_BANK = 'bank'
    TYPE_CHOICES = [(TYPE_CASH, 'Cash'), (TYPE_BANK, 'Bank')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE, related_name='payment_accounts')
    outlet = models.ForeignKey(Outlet, on_delete=models.PROTECT, null=True, blank=True, related_name='payment_accounts')
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=150)
    account_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    bank_name = models.CharField(max_length=150, blank=True, null=True)
    account_number_last4 = models.CharField(max_length=4, blank=True, null=True)
    ifsc = models.CharField(max_length=11, blank=True, null=True)
    opening_balance = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    opening_balance_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, null=True)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    ledger_account = models.OneToOneField(
        'accounting.ChartOfAccount', on_delete=models.PROTECT, null=True, blank=True,
        related_name='payment_account',
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='created_payment_accounts')
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='updated_payment_accounts')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['display_order', 'name']
        constraints = [
            models.UniqueConstraint(Lower('code'), 'organisation', name='unique_org_payment_account_code_ci'),
        ]

    def clean(self):
        super().clean()
        self.code = (self.code or '').strip()
        self.name = (self.name or '').strip()
        if self.outlet_id and self.outlet.organisation_id != self.organisation_id:
            raise ValidationError({'outlet': 'Outlet must belong to the organisation.'})
        if self.ledger_account_id:
            if self.ledger_account.organisation_id != self.organisation_id:
                raise ValidationError({'ledger_account': 'Ledger account must belong to the organisation.'})
            if not self.ledger_account.is_active or self.ledger_account.is_group or self.ledger_account.account_type != 'asset':
                raise ValidationError({'ledger_account': 'Payment accounts require a posting-enabled Asset ledger.'})
        if self.account_type == self.TYPE_CASH and any([self.bank_name, self.account_number_last4, self.ifsc]):
            raise ValidationError('Bank details are only valid for bank accounts.')
        if self.account_number_last4 and (len(self.account_number_last4) != 4 or not self.account_number_last4.isdigit()):
            raise ValidationError({'account_number_last4': 'Enter exactly the last four account digits.'})
        if self.ifsc:
            self.ifsc = self.ifsc.strip().upper()

    def save(self, *args, **kwargs):
        if self.pk:
            previous = PaymentAccount.objects.filter(pk=self.pk).first()
            if previous and self.movements.exists():
                if previous.opening_balance != self.opening_balance:
                    raise ValidationError({'opening_balance': 'Opening balance cannot change after movements exist.'})
                if previous.account_type != self.account_type:
                    raise ValidationError({'account_type': 'Account type cannot change after movements exist.'})
                if previous.outlet_id != self.outlet_id:
                    raise ValidationError({'outlet': 'Account scope cannot change after movements exist.'})
                if previous.ledger_account_id and previous.ledger_account_id != self.ledger_account_id:
                    raise ValidationError({'ledger_account': 'Ledger mapping cannot change after movements exist.'})
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.movements.exists() or self.supplier_payments.exists():
            raise ValidationError('Referenced payment accounts cannot be deleted. Deactivate the account instead.')
        return super().delete(*args, **kwargs)

    @property
    def current_balance(self):
        movement_total = self.movements.aggregate(total=models.Sum('signed_amount'))['total'] or Decimal('0.00')
        return (self.opening_balance + movement_total).quantize(Decimal('0.01'))


class SupplierPaymentSequence(models.Model):
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE, related_name='supplier_payment_sequences')
    year = models.PositiveIntegerField()
    last_sequence = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['outlet', 'year'], name='unique_outlet_payment_seq_year')]


class SupplierPayment(models.Model):
    STATUS_ACTIVE = 'active'
    STATUS_VOIDED = 'voided'
    STATUS_CHOICES = [(STATUS_ACTIVE, 'Active'), (STATUS_VOIDED, 'Voided')]
    METHOD_CASH = 'cash'
    METHOD_BANK_TRANSFER = 'bank_transfer'
    METHOD_CHEQUE = 'cheque'
    METHOD_UPI = 'upi'
    METHOD_OTHER = 'other'
    METHOD_CHOICES = [
        (METHOD_CASH, 'Cash'),
        (METHOD_BANK_TRANSFER, 'Bank Transfer'),
        (METHOD_CHEQUE, 'Cheque'),
        (METHOD_UPI, 'UPI'),
        (METHOD_OTHER, 'Other'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE, related_name='supplier_payments')
    outlet = models.ForeignKey(Outlet, on_delete=models.PROTECT, related_name='supplier_payments')
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name='payments')
    supplier_name_snapshot = models.CharField(max_length=255)
    supplier_code_snapshot = models.CharField(max_length=50)
    payment_number = models.CharField(max_length=100)
    client_request_id = models.UUIDField(null=True, blank=True)
    payment_date = models.DateField(db_index=True)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    payment_account = models.ForeignKey(PaymentAccount, on_delete=models.PROTECT, related_name='supplier_payments')
    payment_method = models.CharField(max_length=30, choices=METHOD_CHOICES)
    reference_number = models.CharField(max_length=100, blank=True, null=True)
    cheque_number = models.CharField(max_length=50, blank=True, null=True)
    cheque_date = models.DateField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    unallocated_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE, db_index=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='created_supplier_payments')
    created_at = models.DateTimeField(auto_now_add=True)
    voided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='voided_supplier_payments')
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['-payment_date', '-created_at']
        constraints = [
            models.UniqueConstraint(fields=['outlet', 'payment_number'], name='unique_outlet_supplier_payment_number'),
            models.UniqueConstraint(fields=['organisation', 'outlet', 'client_request_id'], condition=models.Q(client_request_id__isnull=False), name='unique_supplier_payment_client_request'),
            models.CheckConstraint(condition=models.Q(amount__gt=0), name='supplier_payment_amount_positive'),
            models.CheckConstraint(condition=models.Q(unallocated_amount__gte=0), name='supplier_payment_unallocated_nonnegative'),
        ]

    def clean(self):
        super().clean()
        if self.outlet_id and self.outlet.organisation_id != self.organisation_id:
            raise ValidationError({'outlet': 'Outlet must belong to the organisation.'})
        if self.supplier_id and self.supplier.organisation_id != self.organisation_id:
            raise ValidationError({'supplier': 'Supplier must belong to the organisation.'})
        if self.payment_account_id:
            if self.payment_account.organisation_id != self.organisation_id:
                raise ValidationError({'payment_account': 'Payment account must belong to the organisation.'})
            if self.payment_account.outlet_id and self.payment_account.outlet_id != self.outlet_id:
                raise ValidationError({'payment_account': 'Outlet-specific payment account belongs to another outlet.'})
            if self.payment_method == self.METHOD_CASH and self.payment_account.account_type != PaymentAccount.TYPE_CASH:
                raise ValidationError({'payment_account': 'Cash payments require a cash account.'})
            if self.payment_method in (self.METHOD_BANK_TRANSFER, self.METHOD_CHEQUE, self.METHOD_UPI) and self.payment_account.account_type != PaymentAccount.TYPE_BANK:
                raise ValidationError({'payment_account': 'This payment method requires a bank account.'})
        if self.payment_method in (self.METHOD_BANK_TRANSFER, self.METHOD_UPI) and not (self.reference_number or '').strip():
            raise ValidationError({'reference_number': 'Reference number is required for bank transfer and UPI payments.'})
        if self.payment_method == self.METHOD_CHEQUE and (not (self.cheque_number or '').strip() or not self.cheque_date):
            raise ValidationError({'cheque_number': 'Cheque number and cheque date are required.'})
        if self.status == self.STATUS_VOIDED and len((self.void_reason or '').strip()) < 5:
            raise ValidationError({'void_reason': 'A void reason of at least 5 characters is required.'})

    def save(self, *args, **kwargs):
        if self.pk:
            previous = SupplierPayment.objects.filter(pk=self.pk).first()
            if previous:
                immutable_fields = (
                    'organisation_id', 'outlet_id', 'supplier_id', 'supplier_name_snapshot',
                    'supplier_code_snapshot', 'payment_number', 'client_request_id', 'payment_date',
                    'amount', 'payment_account_id', 'payment_method', 'reference_number',
                    'cheque_number', 'cheque_date', 'notes', 'created_by_id',
                )
                changed = [field for field in immutable_fields if getattr(previous, field) != getattr(self, field)]
                if changed:
                    raise ValidationError('Recorded supplier payment details are immutable. Void and re-enter the payment.')
                if previous.unallocated_amount != self.unallocated_amount and not getattr(self, '_allow_allocation_update', False):
                    raise ValidationError('The unallocated amount can change only through the allocation service.')
                void_fields_changed = any(
                    getattr(previous, field) != getattr(self, field)
                    for field in ('status', 'void_reason', 'voided_by_id', 'voided_at')
                )
                if void_fields_changed and not getattr(self, '_allow_void_transition', False):
                    raise ValidationError('Supplier payments can be voided only through the void service.')
        if self.supplier_id and not self.supplier_name_snapshot:
            self.supplier_name_snapshot = self.supplier.name
            self.supplier_code_snapshot = self.supplier.code
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('Supplier payments cannot be deleted. Void the payment instead.')


class SupplierPaymentAllocation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment = models.ForeignKey(SupplierPayment, on_delete=models.PROTECT, related_name='allocations')
    purchase_bill = models.ForeignKey(PurchaseBill, on_delete=models.PROTECT, related_name='payment_allocations')
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    is_advance_application = models.BooleanField(
        default=False,
        help_text='True when an existing supplier advance was allocated after the original payment was posted.',
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='created_supplier_payment_allocations')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        constraints = [
            models.UniqueConstraint(fields=['payment', 'purchase_bill'], name='unique_payment_purchase_bill_allocation'),
            models.CheckConstraint(condition=models.Q(amount__gt=0), name='supplier_payment_allocation_positive'),
        ]

    def clean(self):
        super().clean()
        if self.payment_id and self.purchase_bill_id:
            payment = self.payment
            bill = self.purchase_bill
            if (
                bill.organisation_id != payment.organisation_id
                or bill.outlet_id != payment.outlet_id
                or bill.supplier_id != payment.supplier_id
            ):
                raise ValidationError('The allocated bill must match the payment organisation, outlet and supplier.')

    def save(self, *args, **kwargs):
        if self.pk and SupplierPaymentAllocation.objects.filter(pk=self.pk).exists():
            raise ValidationError('Payment allocations are immutable. Void the payment instead.')
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('Payment allocations are immutable. Void the payment instead.')


class ExpenseCategory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE, related_name='expense_categories')
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=150)
    ledger_account = models.ForeignKey('accounting.ChartOfAccount', on_delete=models.PROTECT, related_name='expense_categories')
    description = models.TextField(blank=True, null=True)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='created_expense_categories')
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='updated_expense_categories')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['display_order', 'name']
        constraints = [
            models.UniqueConstraint(Lower('code'), 'organisation', name='unique_org_expense_category_code_ci'),
        ]

    def clean(self):
        super().clean()
        self.code = (self.code or '').strip().upper()
        self.name = (self.name or '').strip()
        if self.ledger_account_id:
            ledger = self.ledger_account
            if ledger.organisation_id != self.organisation_id:
                raise ValidationError({'ledger_account': 'Ledger account must belong to the organisation.'})
            if not ledger.is_active or ledger.is_group or ledger.account_type != 'expense':
                raise ValidationError({'ledger_account': 'Select an active posting-enabled Expense ledger.'})

    def save(self, *args, **kwargs):
        if self.pk:
            previous = ExpenseCategory.objects.filter(pk=self.pk).first()
            if previous and previous.ledger_account_id != self.ledger_account_id and self.expenses.exists():
                raise ValidationError({'ledger_account': 'Ledger mapping cannot change after the category is used.'})
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.expenses.exists():
            raise ValidationError('Used expense categories cannot be deleted. Deactivate the category instead.')
        return super().delete(*args, **kwargs)


class ExpenseSequence(models.Model):
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE, related_name='expense_sequences')
    year = models.PositiveIntegerField()
    last_sequence = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['outlet', 'year'], name='unique_outlet_expense_seq_year')]


class Expense(models.Model):
    STATUS_ACTIVE = 'active'
    STATUS_VOIDED = 'voided'
    STATUS_CHOICES = [(STATUS_ACTIVE, 'Active'), (STATUS_VOIDED, 'Voided')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE, related_name='expenses')
    outlet = models.ForeignKey(Outlet, on_delete=models.PROTECT, related_name='expenses')
    expense_number = models.CharField(max_length=100)
    client_request_id = models.UUIDField(null=True, blank=True)
    expense_date = models.DateField(db_index=True)
    category = models.ForeignKey(ExpenseCategory, on_delete=models.PROTECT, related_name='expenses')
    category_code_snapshot = models.CharField(max_length=50)
    category_name_snapshot = models.CharField(max_length=150)
    ledger_account = models.ForeignKey('accounting.ChartOfAccount', on_delete=models.PROTECT, related_name='recorded_expenses')
    ledger_code_snapshot = models.CharField(max_length=50)
    ledger_name_snapshot = models.CharField(max_length=150)
    payment_account = models.ForeignKey(PaymentAccount, on_delete=models.PROTECT, related_name='expenses')
    payee = models.CharField(max_length=200, blank=True, null=True)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    reference_number = models.CharField(max_length=100, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    attachment = models.FileField(upload_to='expenses/%Y/%m/', blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE, db_index=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='created_expenses')
    created_at = models.DateTimeField(auto_now_add=True)
    voided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='voided_expenses')
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['-expense_date', '-created_at']
        constraints = [
            models.UniqueConstraint(fields=['outlet', 'expense_number'], name='unique_outlet_expense_number'),
            models.UniqueConstraint(fields=['organisation', 'outlet', 'client_request_id'], condition=models.Q(client_request_id__isnull=False), name='unique_expense_client_request'),
            models.CheckConstraint(condition=models.Q(amount__gt=0), name='expense_amount_positive'),
        ]

    def clean(self):
        super().clean()
        if self.outlet_id and self.outlet.organisation_id != self.organisation_id:
            raise ValidationError({'outlet': 'Outlet must belong to the organisation.'})
        if self.category_id and self.category.organisation_id != self.organisation_id:
            raise ValidationError({'category': 'Expense category must belong to the organisation.'})
        if self.payment_account_id:
            account = self.payment_account
            if account.organisation_id != self.organisation_id or (account.outlet_id and account.outlet_id != self.outlet_id):
                raise ValidationError({'payment_account': 'Payment account is not available for this outlet.'})
        if self.status == self.STATUS_VOIDED and len((self.void_reason or '').strip()) < 5:
            raise ValidationError({'void_reason': 'A void reason of at least 5 characters is required.'})

    def save(self, *args, **kwargs):
        if self.pk:
            previous = Expense.objects.filter(pk=self.pk).first()
            if previous:
                mutable_on_void = {'status', 'void_reason', 'voided_by_id', 'voided_at'}
                fields = [f.attname for f in self._meta.concrete_fields if f.name not in ('id', 'status', 'void_reason', 'voided_by', 'voided_at')]
                if any(getattr(previous, field) != getattr(self, field) for field in fields):
                    raise ValidationError('Recorded expense details are immutable. Void and re-enter the expense.')
                if any(getattr(previous, field) != getattr(self, field) for field in mutable_on_void) and not getattr(self, '_allow_void_transition', False):
                    raise ValidationError('Expenses can be voided only through the void service.')
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('Expenses cannot be deleted. Void the expense instead.')


class CashBankTransferSequence(models.Model):
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE, related_name='cash_bank_transfer_sequences')
    year = models.PositiveIntegerField()
    last_sequence = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['outlet', 'year'], name='unique_outlet_transfer_seq_year')]


class CashBankTransfer(models.Model):
    STATUS_ACTIVE = 'active'
    STATUS_VOIDED = 'voided'
    STATUS_CHOICES = [(STATUS_ACTIVE, 'Active'), (STATUS_VOIDED, 'Voided')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE, related_name='cash_bank_transfers')
    outlet = models.ForeignKey(Outlet, on_delete=models.PROTECT, related_name='cash_bank_transfers')
    transfer_number = models.CharField(max_length=100)
    client_request_id = models.UUIDField(null=True, blank=True)
    transfer_date = models.DateField(db_index=True)
    from_account = models.ForeignKey(PaymentAccount, on_delete=models.PROTECT, related_name='outgoing_transfers')
    to_account = models.ForeignKey(PaymentAccount, on_delete=models.PROTECT, related_name='incoming_transfers')
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    reference_number = models.CharField(max_length=100, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE, db_index=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='created_cash_bank_transfers')
    created_at = models.DateTimeField(auto_now_add=True)
    voided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='voided_cash_bank_transfers')
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['-transfer_date', '-created_at']
        constraints = [
            models.UniqueConstraint(fields=['outlet', 'transfer_number'], name='unique_outlet_cash_bank_transfer_number'),
            models.UniqueConstraint(fields=['organisation', 'outlet', 'client_request_id'], condition=models.Q(client_request_id__isnull=False), name='unique_transfer_client_request'),
            models.CheckConstraint(condition=models.Q(amount__gt=0), name='cash_bank_transfer_amount_positive'),
            models.CheckConstraint(condition=~models.Q(from_account=models.F('to_account')), name='cash_bank_transfer_different_accounts'),
        ]

    @property
    def transfer_type(self):
        if self.from_account.account_type == PaymentAccount.TYPE_CASH and self.to_account.account_type == PaymentAccount.TYPE_BANK:
            return 'cash_deposit'
        if self.from_account.account_type == PaymentAccount.TYPE_BANK and self.to_account.account_type == PaymentAccount.TYPE_CASH:
            return 'bank_withdrawal'
        return 'account_transfer'

    def clean(self):
        super().clean()
        if self.outlet_id and self.outlet.organisation_id != self.organisation_id:
            raise ValidationError({'outlet': 'Outlet must belong to the organisation.'})
        if self.from_account_id == self.to_account_id:
            raise ValidationError({'to_account': 'Source and destination accounts must be different.'})
        for field in ('from_account', 'to_account'):
            account = getattr(self, field, None)
            if account and (account.organisation_id != self.organisation_id or (account.outlet_id and account.outlet_id != self.outlet_id)):
                raise ValidationError({field: 'Account is not available for this outlet.'})
        if self.status == self.STATUS_VOIDED and len((self.void_reason or '').strip()) < 5:
            raise ValidationError({'void_reason': 'A void reason of at least 5 characters is required.'})

    def save(self, *args, **kwargs):
        if self.pk:
            previous = CashBankTransfer.objects.filter(pk=self.pk).first()
            if previous:
                void_fields = {'status', 'void_reason', 'voided_by_id', 'voided_at'}
                fields = [f.attname for f in self._meta.concrete_fields if f.name not in ('id', 'status', 'void_reason', 'voided_by', 'voided_at')]
                if any(getattr(previous, field) != getattr(self, field) for field in fields):
                    raise ValidationError('Recorded transfer details are immutable. Void and re-enter the transfer.')
                if any(getattr(previous, field) != getattr(self, field) for field in void_fields) and not getattr(self, '_allow_void_transition', False):
                    raise ValidationError('Transfers can be voided only through the void service.')
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('Cash/bank transfers cannot be deleted. Void the transfer instead.')


class PaymentAccountMovement(models.Model):
    TYPE_SUPPLIER_PAYMENT = 'supplier_payment'
    TYPE_SUPPLIER_PAYMENT_REVERSAL = 'supplier_payment_reversal'
    TYPE_SALES_RECEIPT = 'sales_invoice_receipt'
    TYPE_SALES_RECEIPT_REVERSAL = 'sales_invoice_receipt_reversal'
    TYPE_CUSTOMER_RECEIPT = 'customer_receipt'
    TYPE_CUSTOMER_RECEIPT_REVERSAL = 'customer_receipt_reversal'
    TYPE_EXPENSE = 'expense'
    TYPE_EXPENSE_REVERSAL = 'expense_reversal'
    TYPE_TRANSFER_OUT = 'transfer_out'
    TYPE_TRANSFER_IN = 'transfer_in'
    TYPE_TRANSFER_OUT_REVERSAL = 'transfer_out_reversal'
    TYPE_TRANSFER_IN_REVERSAL = 'transfer_in_reversal'
    TYPE_CHOICES = [
        (TYPE_SUPPLIER_PAYMENT, 'Supplier Payment'),
        (TYPE_SUPPLIER_PAYMENT_REVERSAL, 'Supplier Payment Reversal'),
        (TYPE_SALES_RECEIPT, 'Sales Invoice Receipt'),
        (TYPE_SALES_RECEIPT_REVERSAL, 'Sales Invoice Receipt Reversal'),
        (TYPE_CUSTOMER_RECEIPT, 'Customer Receipt'),
        (TYPE_CUSTOMER_RECEIPT_REVERSAL, 'Customer Receipt Reversal'),
        (TYPE_EXPENSE, 'Expense'),
        (TYPE_EXPENSE_REVERSAL, 'Expense Reversal'),
        (TYPE_TRANSFER_OUT, 'Transfer Out'),
        (TYPE_TRANSFER_IN, 'Transfer In'),
        (TYPE_TRANSFER_OUT_REVERSAL, 'Transfer Out Reversal'),
        (TYPE_TRANSFER_IN_REVERSAL, 'Transfer In Reversal'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name='payment_account_movements')
    outlet = models.ForeignKey(Outlet, on_delete=models.PROTECT, related_name='payment_account_movements')
    account = models.ForeignKey(PaymentAccount, on_delete=models.PROTECT, related_name='movements')
    effective_date = models.DateField(db_index=True)
    signed_amount = models.DecimalField(max_digits=15, decimal_places=2)
    movement_type = models.CharField(max_length=40, choices=TYPE_CHOICES)
    payment = models.ForeignKey(SupplierPayment, on_delete=models.PROTECT, null=True, blank=True, related_name='account_movements')
    source_type = models.CharField(max_length=50, default='supplier_payment')
    source_id = models.UUIDField(null=True, blank=True, db_index=True)
    reversal_of = models.OneToOneField('self', on_delete=models.PROTECT, null=True, blank=True, related_name='reversal')
    idempotency_key = models.CharField(max_length=150, unique=True)
    description = models.CharField(max_length=255)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='created_payment_account_movements')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['effective_date', 'created_at']

    def clean(self):
        super().clean()
        if self.account_id and self.organisation_id:
            if self.account.organisation_id != self.organisation_id:
                raise ValidationError('Payment account movement organisation does not match its account.')
            if self.account.outlet_id and self.account.outlet_id != self.outlet_id:
                raise ValidationError('Payment account movement outlet does not match its account scope.')
        if self.payment_id:
            if (
                self.payment.organisation_id != self.organisation_id
                or self.payment.outlet_id != self.outlet_id
                or self.payment.payment_account_id != self.account_id
            ):
                raise ValidationError('Payment account movement does not match its supplier payment.')
        if self.movement_type in (self.TYPE_SUPPLIER_PAYMENT, self.TYPE_SUPPLIER_PAYMENT_REVERSAL) and not self.payment_id:
            raise ValidationError('Supplier payment movements must reference a supplier payment.')
        if self.movement_type == self.TYPE_SUPPLIER_PAYMENT:
            if self.reversal_of_id:
                raise ValidationError('An original supplier payment movement cannot reverse another movement.')
            if self.payment_id and self.signed_amount != -self.payment.amount:
                raise ValidationError('Supplier payment movement must equal the payment outflow.')
        elif self.movement_type == self.TYPE_SUPPLIER_PAYMENT_REVERSAL:
            if not self.reversal_of_id:
                raise ValidationError('A reversal movement must reference the original movement.')
            if self.reversal_of_id:
                original = self.reversal_of
                if original.payment_id != self.payment_id or self.signed_amount != -original.signed_amount:
                    raise ValidationError('A reversal must exactly offset the original payment movement.')
        elif self.movement_type == self.TYPE_SALES_RECEIPT:
            if self.signed_amount <= 0 or self.reversal_of_id:
                raise ValidationError('A sales receipt must be a positive original account movement.')
            if self.source_type != 'sales_invoice' or not self.source_id:
                raise ValidationError('A sales receipt must reference its sales invoice source.')
        elif self.movement_type == self.TYPE_SALES_RECEIPT_REVERSAL:
            if not self.reversal_of_id or self.signed_amount != -self.reversal_of.signed_amount:
                raise ValidationError('A sales receipt reversal must exactly offset the original receipt.')
            if self.source_id != self.reversal_of.source_id:
                raise ValidationError('A sales receipt reversal must retain the original source.')
        elif self.movement_type == self.TYPE_CUSTOMER_RECEIPT:
            if self.signed_amount <= 0 or self.reversal_of_id or self.source_type != 'customer_receipt' or not self.source_id:
                raise ValidationError('A customer receipt must be a positive original movement with a receipt source.')
        elif self.movement_type == self.TYPE_CUSTOMER_RECEIPT_REVERSAL:
            if not self.reversal_of_id or self.signed_amount != -self.reversal_of.signed_amount:
                raise ValidationError('A customer receipt reversal must exactly offset the original receipt.')
        elif self.movement_type == self.TYPE_EXPENSE:
            if self.signed_amount >= 0 or self.reversal_of_id or self.source_type != 'expense' or not self.source_id:
                raise ValidationError('An expense must be a negative original movement with an expense source.')
        elif self.movement_type == self.TYPE_EXPENSE_REVERSAL:
            if not self.reversal_of_id or self.signed_amount != -self.reversal_of.signed_amount:
                raise ValidationError('An expense reversal must exactly offset the original expense movement.')
        elif self.movement_type in (self.TYPE_TRANSFER_OUT, self.TYPE_TRANSFER_IN):
            expected_positive = self.movement_type == self.TYPE_TRANSFER_IN
            if self.reversal_of_id or self.source_type != 'cash_bank_transfer' or not self.source_id:
                raise ValidationError('A transfer movement must reference its transfer source.')
            if expected_positive != (self.signed_amount > 0):
                raise ValidationError('Transfer in must be positive and transfer out must be negative.')
        elif self.movement_type in (self.TYPE_TRANSFER_OUT_REVERSAL, self.TYPE_TRANSFER_IN_REVERSAL):
            if not self.reversal_of_id or self.signed_amount != -self.reversal_of.signed_amount:
                raise ValidationError('A transfer reversal must exactly offset its original movement.')

    def save(self, *args, **kwargs):
        if self.pk and PaymentAccountMovement.objects.filter(pk=self.pk).exists():
            raise ValidationError('Payment account movements are immutable.')
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('Payment account movements cannot be deleted.')


class SupplierPaymentAuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment = models.ForeignKey(SupplierPayment, on_delete=models.PROTECT, related_name='audit_logs')
    event_type = models.CharField(max_length=40)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='supplier_payment_audit_events')
    reason = models.TextField(blank=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def save(self, *args, **kwargs):
        if self.pk and SupplierPaymentAuditLog.objects.filter(pk=self.pk).exists():
            raise ValidationError('Supplier payment audit logs are immutable.')
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('Supplier payment audit logs cannot be deleted.')
