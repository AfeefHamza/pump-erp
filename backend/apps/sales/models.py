import uuid
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.finance.models import PaymentAccount
from apps.inventory.models import Item
from apps.organizations.models import Organisation, Outlet
from apps.purchases.models import PurchaseTaxCode, PurchaseTaxCodeRate
from apps.shifts.models import Customer, FuelCreditSlip


class SalesInvoiceSequence(models.Model):
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE, related_name='sales_invoice_sequences')
    year = models.PositiveIntegerField()
    last_sequence = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['outlet', 'year'], name='unique_outlet_sales_invoice_seq_year')]


class SalesInvoice(models.Model):
    TYPE_CREDIT = 'credit'
    TYPE_CASH = 'cash'
    TYPE_CHOICES = [(TYPE_CREDIT, 'Credit Invoice'), (TYPE_CASH, 'Cash Invoice')]
    STATUS_ACTIVE = 'active'
    STATUS_VOIDED = 'voided'
    STATUS_CHOICES = [(STATUS_ACTIVE, 'Active'), (STATUS_VOIDED, 'Voided')]
    METHOD_CASH = 'cash'
    METHOD_BANK_TRANSFER = 'bank_transfer'
    METHOD_UPI = 'upi'
    METHOD_CARD = 'card'
    METHOD_CHOICES = [
        (METHOD_CASH, 'Cash'), (METHOD_BANK_TRANSFER, 'Bank Transfer'),
        (METHOD_UPI, 'UPI'), (METHOD_CARD, 'Card'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name='sales_invoices')
    outlet = models.ForeignKey(Outlet, on_delete=models.PROTECT, related_name='sales_invoices')
    customer = models.ForeignKey(Customer, null=True, blank=True, on_delete=models.PROTECT, related_name='sales_invoices')
    customer_name_snapshot = models.CharField(max_length=255)
    customer_code_snapshot = models.CharField(max_length=50, blank=True)
    customer_gstin_snapshot = models.CharField(max_length=15, blank=True)
    billing_address_snapshot = models.TextField(blank=True)
    invoice_number = models.CharField(max_length=100)
    client_request_id = models.UUIDField(null=True, blank=True)
    invoice_date = models.DateField(db_index=True)
    due_date = models.DateField(db_index=True)
    invoice_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    place_of_supply_state_code = models.CharField(max_length=2, blank=True)
    is_interstate = models.BooleanField(default=False)
    payment_account = models.ForeignKey(PaymentAccount, null=True, blank=True, on_delete=models.PROTECT, related_name='cash_sales_invoices')
    payment_method = models.CharField(max_length=30, choices=METHOD_CHOICES, blank=True)
    payment_reference = models.CharField(max_length=100, blank=True)
    subtotal = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    discount_total = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    taxable_total = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    tax_total = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    grand_total = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    amount_paid = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    outstanding_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE, db_index=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='created_sales_invoices')
    created_at = models.DateTimeField(auto_now_add=True)
    voided_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='voided_sales_invoices')
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.TextField(blank=True)

    class Meta:
        ordering = ['-invoice_date', '-created_at']
        constraints = [
            models.UniqueConstraint(fields=['outlet', 'invoice_number'], name='unique_outlet_sales_invoice_number'),
            models.UniqueConstraint(fields=['organisation', 'outlet', 'client_request_id'], condition=models.Q(client_request_id__isnull=False), name='unique_sales_invoice_client_request'),
            models.CheckConstraint(condition=models.Q(grand_total__gte=0), name='sales_invoice_total_nonnegative'),
        ]

    def clean(self):
        super().clean()
        if self.outlet_id and self.outlet.organisation_id != self.organisation_id:
            raise ValidationError('Invoice outlet must belong to the organisation.')
        if self.customer_id and self.customer.organisation_id != self.organisation_id:
            raise ValidationError('Invoice customer must belong to the organisation.')
        if self.invoice_type == self.TYPE_CREDIT and not self.customer_id:
            raise ValidationError({'customer': 'Credit invoices require a customer.'})
        if self.invoice_type == self.TYPE_CASH:
            if not self.payment_account_id or not self.payment_method:
                raise ValidationError('Cash invoices require a payment account and payment method.')
            if self.payment_account.organisation_id != self.organisation_id or not self.payment_account.is_active:
                raise ValidationError('Select an active payment account from this organisation.')
            if self.payment_account.outlet_id and self.payment_account.outlet_id != self.outlet_id:
                raise ValidationError('The payment account belongs to another outlet.')
            if self.payment_method == self.METHOD_CASH and self.payment_account.account_type != PaymentAccount.TYPE_CASH:
                raise ValidationError('Cash sales require a cash account.')
            if self.payment_method != self.METHOD_CASH and self.payment_account.account_type != PaymentAccount.TYPE_BANK:
                raise ValidationError('Digital and bank receipts require a bank account.')
        if self.status == self.STATUS_VOIDED and len((self.void_reason or '').strip()) < 5:
            raise ValidationError({'void_reason': 'Provide a void reason of at least 5 characters.'})

    def save(self, *args, **kwargs):
        if self.pk:
            previous = SalesInvoice.objects.filter(pk=self.pk).first()
            if previous:
                mutable = {'status', 'void_reason', 'voided_by_id', 'voided_at', 'amount_paid', 'outstanding_amount'}
                for field in [f.attname for f in self._meta.concrete_fields if f.attname not in ('id', *mutable)]:
                    if getattr(previous, field) != getattr(self, field):
                        raise ValidationError('Recorded sales invoices are immutable. Void and re-enter the invoice.')
                if any(getattr(previous, f) != getattr(self, f) for f in mutable) and not (getattr(self, '_allow_void_transition', False) or getattr(self, '_allow_settlement_transition', False)):
                    raise ValidationError('Sales invoices can be changed only through a controlled void or settlement service.')
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('Sales invoices cannot be deleted. Void the invoice instead.')


class SalesInvoiceLine(models.Model):
    SOURCE_ITEM = 'item'
    SOURCE_CREDIT_SLIP = 'credit_slip'
    SOURCE_CHOICES = [(SOURCE_ITEM, 'Item'), (SOURCE_CREDIT_SLIP, 'Fuel Credit Slip')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(SalesInvoice, on_delete=models.PROTECT, related_name='lines')
    sequence = models.PositiveIntegerField()
    source_type = models.CharField(max_length=20, choices=SOURCE_CHOICES)
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name='sales_invoice_lines')
    credit_slip = models.ForeignKey(FuelCreditSlip, null=True, blank=True, on_delete=models.PROTECT, related_name='sales_invoice_lines')
    item_code_snapshot = models.CharField(max_length=50)
    item_name_snapshot = models.CharField(max_length=255)
    item_type_snapshot = models.CharField(max_length=30)
    hsn_sac_snapshot = models.CharField(max_length=20, blank=True)
    unit_snapshot = models.CharField(max_length=20)
    quantity = models.DecimalField(max_digits=15, decimal_places=4)
    unit_price = models.DecimalField(max_digits=15, decimal_places=4)
    gross_amount = models.DecimalField(max_digits=15, decimal_places=2)
    discount_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    tax_inclusive = models.BooleanField(default=False)
    tax_treatment = models.ForeignKey(PurchaseTaxCode, null=True, blank=True, on_delete=models.PROTECT, related_name='sales_invoice_lines')
    effective_rate_version = models.ForeignKey(PurchaseTaxCodeRate, null=True, blank=True, on_delete=models.PROTECT, related_name='sales_invoice_lines')
    tax_treatment_name_snapshot = models.CharField(max_length=100, blank=True)
    tax_regime_snapshot = models.CharField(max_length=30, blank=True)
    tax_rate_snapshot = models.DecimalField(max_digits=7, decimal_places=4, default=Decimal('0.0000'))
    taxable_amount = models.DecimalField(max_digits=15, decimal_places=2)
    tax_amount = models.DecimalField(max_digits=15, decimal_places=2)
    tax_components_snapshot = models.JSONField(default=list, blank=True)
    line_total = models.DecimalField(max_digits=15, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sequence']
        constraints = [
            models.UniqueConstraint(fields=['invoice', 'sequence'], name='unique_sales_invoice_line_sequence'),
            models.CheckConstraint(condition=models.Q(quantity__gt=0), name='sales_invoice_line_qty_positive'),
        ]

    def save(self, *args, **kwargs):
        if self.pk and SalesInvoiceLine.objects.filter(pk=self.pk).exists():
            raise ValidationError('Recorded sales invoice lines are immutable.')
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('Recorded sales invoice lines cannot be deleted.')


class SalesInvoiceCreditSlipLink(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(SalesInvoice, on_delete=models.PROTECT, related_name='credit_slip_links')
    credit_slip = models.ForeignKey(FuelCreditSlip, on_delete=models.PROTECT, related_name='invoice_links')
    released_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['credit_slip'], condition=models.Q(released_at__isnull=True), name='unique_active_invoice_credit_slip')]

    def delete(self, *args, **kwargs):
        raise ValidationError('Credit Slip billing links cannot be deleted.')


class SalesInvoiceAuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(SalesInvoice, on_delete=models.PROTECT, related_name='audit_logs')
    event_type = models.CharField(max_length=40)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='sales_invoice_audit_events')
    reason = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def save(self, *args, **kwargs):
        if self.pk and SalesInvoiceAuditLog.objects.filter(pk=self.pk).exists():
            raise ValidationError('Sales invoice audit logs are immutable.')
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('Sales invoice audit logs cannot be deleted.')


class CustomerReceiptSequence(models.Model):
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE, related_name='customer_receipt_sequences')
    year = models.PositiveIntegerField()
    last_sequence = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['outlet', 'year'], name='unique_outlet_customer_receipt_seq')]


class CustomerReceipt(models.Model):
    STATUS_ACTIVE = 'active'
    STATUS_VOIDED = 'voided'
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name='customer_receipts')
    outlet = models.ForeignKey(Outlet, on_delete=models.PROTECT, related_name='customer_receipts')
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name='receipts')
    customer_name_snapshot = models.CharField(max_length=255)
    customer_code_snapshot = models.CharField(max_length=50)
    receipt_number = models.CharField(max_length=100)
    client_request_id = models.UUIDField(null=True, blank=True)
    receipt_date = models.DateField(db_index=True)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    payment_account = models.ForeignKey(PaymentAccount, on_delete=models.PROTECT, related_name='customer_receipts')
    payment_method = models.CharField(max_length=30, choices=SalesInvoice.METHOD_CHOICES)
    reference_number = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    unallocated_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    status = models.CharField(max_length=20, choices=[(STATUS_ACTIVE, 'Active'), (STATUS_VOIDED, 'Voided')], default=STATUS_ACTIVE)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='created_customer_receipts')
    created_at = models.DateTimeField(auto_now_add=True)
    voided_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='voided_customer_receipts')
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.TextField(blank=True)

    class Meta:
        ordering = ['-receipt_date', '-created_at']
        constraints = [
            models.UniqueConstraint(fields=['outlet', 'receipt_number'], name='unique_outlet_customer_receipt_number'),
            models.UniqueConstraint(fields=['organisation', 'outlet', 'client_request_id'], condition=models.Q(client_request_id__isnull=False), name='unique_customer_receipt_request'),
            models.CheckConstraint(condition=models.Q(amount__gt=0), name='customer_receipt_amount_positive'),
        ]

    def save(self, *args, **kwargs):
        if self.pk and CustomerReceipt.objects.filter(pk=self.pk).exists() and not getattr(self, '_allow_void_transition', False):
            raise ValidationError('Customer receipts are immutable. Void and re-enter the receipt.')
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('Customer receipts cannot be deleted.')


class CustomerReceiptAllocation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    receipt = models.ForeignKey(CustomerReceipt, on_delete=models.PROTECT, related_name='allocations')
    sales_invoice = models.ForeignKey(SalesInvoice, on_delete=models.PROTECT, related_name='receipt_allocations')
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['receipt', 'sales_invoice'], name='unique_customer_receipt_invoice_allocation')]

    def save(self, *args, **kwargs):
        if self.pk and CustomerReceiptAllocation.objects.filter(pk=self.pk).exists():
            raise ValidationError('Receipt allocations are immutable.')
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('Receipt allocations cannot be deleted.')
