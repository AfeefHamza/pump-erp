# apps/purchases/models.py
import re
import uuid
from decimal import Decimal
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db.models.functions import Lower

from apps.organizations.models import Organisation, Outlet
from apps.forecourt.models import Tank, FuelProduct
from apps.operations.models import DipCalibrationChart

GSTIN_REGEX = re.compile(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$')


class Supplier(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='suppliers'
    )
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=255)
    contact_person = models.CharField(max_length=255, blank=True, null=True)
    phone = models.CharField(max_length=50, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    tax_number = models.CharField(max_length=100, blank=True, null=True)
    gstin = models.CharField(max_length=15, blank=True, null=True)
    gst_registration_type = models.CharField(
        max_length=30,
        choices=[
            ('registered', 'Registered'),
            ('unregistered', 'Unregistered'),
            ('composition', 'Composition'),
            ('overseas', 'Overseas / Import'),
            ('pending_review', 'Pending Review'),
        ],
        default='pending_review'
    )
    state = models.CharField(max_length=100, blank=True, null=True)
    state_code = models.CharField(max_length=2, blank=True, null=True)
    tax_treatment = models.CharField(max_length=50, default='regular')
    address = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower('code'),
                'organisation',
                name='unique_org_supplier_code_ci'
            ),
            models.UniqueConstraint(
                Lower('name'),
                'organisation',
                name='unique_org_supplier_name_ci'
            )
        ]
        ordering = ['name']

    def clean(self):
        super().clean()
        if self.code:
            self.code = self.code.strip()
        if self.name:
            self.name = self.name.strip()
        if self.gstin:
            self.gstin = self.gstin.strip().upper()
        elif self.tax_number and len(self.tax_number.strip()) == 15:
            self.gstin = self.tax_number.strip().upper()

        if self.state_code:
            self.state_code = self.state_code.strip()
        elif self.gstin and len(self.gstin) >= 2 and self.gstin[:2].isdigit():
            self.state_code = self.gstin[:2]

        if self.gstin:
            if not GSTIN_REGEX.match(self.gstin):
                raise ValidationError({'gstin': f"Invalid GSTIN format '{self.gstin}'. Expected 15-character format (e.g. 29ABCDE1234F1Z5)."})
            if self.state_code and self.gstin[:2] != self.state_code:
                raise ValidationError({'gstin': f"GSTIN state prefix '{self.gstin[:2]}' does not match supplier state code '{self.state_code}'."})

        if self.gst_registration_type == 'registered' and not self.gstin:
            raise ValidationError({'gstin': "GSTIN is required for registered suppliers."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.code})"


class TankerReceipt(models.Model):
    STATUS_RECORDED = 'recorded'
    STATUS_CONFIRMED = 'confirmed'
    STATUS_VOIDED = 'voided'
    STATUS_CHOICES = [
        (STATUS_RECORDED, 'Recorded'),
        (STATUS_CONFIRMED, 'Confirmed'),
        (STATUS_VOIDED, 'Voided'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='tanker_receipts'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='tanker_receipts'
    )
    receipt_number = models.CharField(max_length=100)
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name='tanker_receipts'
    )
    supplier_name_snapshot = models.CharField(max_length=255)
    supplier_code_snapshot = models.CharField(max_length=50)

    invoice_number = models.CharField(max_length=100)
    invoice_date = models.DateField()
    delivery_challan_number = models.CharField(max_length=100, blank=True, null=True)
    vehicle_registration = models.CharField(max_length=100)
    driver_name = models.CharField(max_length=255, blank=True, null=True)
    driver_phone = models.CharField(max_length=50, blank=True, null=True)
    seal_details = models.TextField(blank=True, null=True)

    unloading_start_time = models.DateTimeField(blank=True, null=True)
    unloading_end_time = models.DateTimeField(db_index=True)  # effective_at
    business_date = models.DateField(db_index=True, null=True, blank=True)

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_RECORDED
    )
    notes = models.TextField(blank=True, null=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_tanker_receipts'
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_tanker_receipts'
    )
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='confirmed_tanker_receipts'
    )
    confirmed_at = models.DateTimeField(null=True, blank=True)

    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='voided_tanker_receipts'
    )
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-unloading_end_time', '-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['outlet', 'receipt_number'],
                condition=~models.Q(status='voided'),
                name='unique_active_outlet_receipt_number'
            )
        ]

    def clean(self):
        super().clean()
        if hasattr(self, 'outlet') and hasattr(self, 'organisation'):
            if self.outlet.organisation_id != self.organisation_id:
                raise ValidationError("Outlet must belong to the organisation.")
        if hasattr(self, 'supplier') and hasattr(self, 'organisation'):
            if self.supplier.organisation_id != self.organisation_id:
                raise ValidationError("Supplier must belong to the organisation.")

        if self.receipt_number:
            self.receipt_number = self.receipt_number.strip()
        if self.invoice_number:
            self.invoice_number = self.invoice_number.strip()
        if self.vehicle_registration:
            self.vehicle_registration = self.vehicle_registration.strip()

        if self.status == self.STATUS_VOIDED and not self.void_reason:
            raise ValidationError({'void_reason': "A void reason is required when voiding a receipt."})

    def save(self, *args, **kwargs):
        if not self.business_date and self.unloading_end_time:
            from apps.core.timezone_utils import to_outlet_business_date
            self.business_date = to_outlet_business_date(self.unloading_end_time, outlet=getattr(self, 'outlet', None))
        if self.supplier and (not self.supplier_name_snapshot or not self.supplier_code_snapshot):
            self.supplier_name_snapshot = self.supplier.name
            self.supplier_code_snapshot = self.supplier.code
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.status == self.STATUS_CONFIRMED:
            raise ValidationError("Confirmed tanker receipts cannot be deleted. Use void instead.")
        super().delete(*args, **kwargs)

    @property
    def effective_at(self):
        return self.unloading_end_time

    def __str__(self):
        return f"TankerReceipt {self.receipt_number} ({self.supplier_name_snapshot}) [{self.status}]"


class TankerReceiptProductLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    receipt = models.ForeignKey(
        TankerReceipt,
        on_delete=models.CASCADE,
        related_name='product_lines'
    )
    product = models.ForeignKey(
        FuelProduct,
        on_delete=models.PROTECT,
        related_name='receipt_lines'
    )
    item = models.ForeignKey(
        'inventory.Item',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='tanker_receipt_lines'
    )
    invoice_quantity = models.DecimalField(max_digits=15, decimal_places=4)
    accepted_book_quantity = models.DecimalField(max_digits=15, decimal_places=4)
    unit_rate = models.DecimalField(max_digits=15, decimal_places=4, null=True, blank=True)
    total_value = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)

    invoice_density = models.DecimalField(max_digits=8, decimal_places=4, null=True, blank=True)
    observed_density = models.DecimalField(max_digits=8, decimal_places=4, null=True, blank=True)
    observed_temperature = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    quantity_override_reason = models.TextField(blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['receipt', 'product'],
                name='unique_receipt_product_line'
            )
        ]

    def clean(self):
        super().clean()
        if hasattr(self, 'receipt') and hasattr(self, 'product'):
            if self.product.organisation_id != self.receipt.organisation_id:
                raise ValidationError("Product must belong to the same organisation as receipt.")
        if hasattr(self, 'item') and self.item:
            if self.item.item_type != 'fuel':
                raise ValidationError({'item': "Only fuel items can be received in tanker receipts."})
            if hasattr(self, 'receipt') and self.receipt and self.item.organisation_id != self.receipt.organisation_id:
                raise ValidationError({'item': "Item must belong to the same organisation as receipt."})

        if self.invoice_quantity is not None and self.invoice_quantity < Decimal('0.0000'):
            raise ValidationError({'invoice_quantity': "Invoice quantity cannot be negative."})
        if self.accepted_book_quantity is not None and self.accepted_book_quantity < Decimal('0.0000'):
            raise ValidationError({'accepted_book_quantity': "Accepted book quantity cannot be negative."})

        # Override reason check
        if self.invoice_quantity is not None and self.accepted_book_quantity is not None:
            if self.invoice_quantity != self.accepted_book_quantity and not self.quantity_override_reason:
                raise ValidationError({'quantity_override_reason': "A reason is required when accepted quantity differs from invoice quantity."})

    def save(self, *args, **kwargs):
        # Server-calculate total value
        if self.accepted_book_quantity is not None and self.unit_rate is not None:
            self.total_value = (self.accepted_book_quantity * self.unit_rate).quantize(Decimal('0.01'))
        elif self.invoice_quantity is not None and self.unit_rate is not None:
            self.total_value = (self.invoice_quantity * self.unit_rate).quantize(Decimal('0.01'))
        else:
            self.total_value = None

        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.receipt.receipt_number} -> {self.product.name} ({self.accepted_book_quantity}L)"


class TankerReceiptTankAllocation(models.Model):
    STATUS_NORMAL = 'normal'
    STATUS_SHORTAGE = 'shortage'
    STATUS_EXCESS = 'excess'
    STATUS_ACKNOWLEDGED = 'acknowledged'
    VARIANCE_STATUS_CHOICES = [
        (STATUS_NORMAL, 'Normal'),
        (STATUS_SHORTAGE, 'Shortage'),
        (STATUS_EXCESS, 'Excess'),
        (STATUS_ACKNOWLEDGED, 'Acknowledged'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product_line = models.ForeignKey(
        TankerReceiptProductLine,
        on_delete=models.CASCADE,
        related_name='allocations'
    )
    tank = models.ForeignKey(
        Tank,
        on_delete=models.PROTECT,
        related_name='receipt_allocations'
    )
    allocated_book_quantity = models.DecimalField(max_digits=15, decimal_places=4)

    pre_unloading_dip_height = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    pre_unloading_dip_unit = models.CharField(
        max_length=20,
        default='millimetre',
        choices=DipCalibrationChart.UNIT_CHOICES
    )
    pre_unloading_volume = models.DecimalField(max_digits=15, decimal_places=4, null=True, blank=True)

    post_unloading_dip_height = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    post_unloading_dip_unit = models.CharField(
        max_length=20,
        default='millimetre',
        choices=DipCalibrationChart.UNIT_CHOICES
    )
    post_unloading_volume = models.DecimalField(max_digits=15, decimal_places=4, null=True, blank=True)

    physical_dip_gain = models.DecimalField(max_digits=15, decimal_places=4, null=True, blank=True)
    variance = models.DecimalField(max_digits=15, decimal_places=4, null=True, blank=True)

    calibration_chart = models.ForeignKey(
        DipCalibrationChart,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='receipt_allocations'
    )
    conversion_method = models.CharField(max_length=50, blank=True, null=True)

    variance_status = models.CharField(
        max_length=30,
        choices=VARIANCE_STATUS_CHOICES,
        default=STATUS_NORMAL
    )
    variance_acknowledged_at = models.DateTimeField(null=True, blank=True)
    variance_acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='acknowledged_receipt_variances'
    )
    variance_acknowledgement_reason = models.TextField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['product_line', 'tank'],
                name='unique_receipt_line_tank_allocation'
            )
        ]

    def clean(self):
        super().clean()
        if hasattr(self, 'product_line') and hasattr(self, 'tank'):
            receipt = self.product_line.receipt
            if self.tank.outlet_id != receipt.outlet_id:
                raise ValidationError("Destination tank must belong to the receipt outlet.")
            if self.tank.product_id != self.product_line.product_id:
                raise ValidationError("Destination tank fuel product must match the receipt product line.")

        if self.allocated_book_quantity is not None and self.allocated_book_quantity <= Decimal('0.0000'):
            raise ValidationError({'allocated_book_quantity': "Allocated quantity must be greater than zero."})

    def save(self, *args, **kwargs):
        # Calculate physical dip gain and variance
        if self.post_unloading_volume is not None and self.pre_unloading_volume is not None:
            self.physical_dip_gain = self.post_unloading_volume - self.pre_unloading_volume
            self.variance = self.physical_dip_gain - self.allocated_book_quantity
            if self.variance_status != self.STATUS_ACKNOWLEDGED:
                if self.variance < Decimal('-0.0010'):
                    self.variance_status = self.STATUS_SHORTAGE
                elif self.variance > Decimal('0.0010'):
                    self.variance_status = self.STATUS_EXCESS
                else:
                    self.variance_status = self.STATUS_NORMAL
        else:
            self.physical_dip_gain = None
            self.variance = None

        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.product_line} -> Tank {self.tank.code}: {self.allocated_book_quantity}L"


class TankerReceiptAttachment(models.Model):
    TYPE_INVOICE = 'invoice'
    TYPE_CHALLAN = 'challan'
    TYPE_DIP_SHEET = 'dip_sheet'
    TYPE_RECEIPT_IMAGE = 'receipt_image'
    TYPE_OTHER = 'other'

    TYPE_CHOICES = [
        (TYPE_INVOICE, 'Invoice Document'),
        (TYPE_CHALLAN, 'Delivery Challan'),
        (TYPE_DIP_SHEET, 'Dip / Calibration Sheet'),
        (TYPE_RECEIPT_IMAGE, 'Tanker / Meter Photo'),
        (TYPE_OTHER, 'Other Attachment'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    receipt = models.ForeignKey(
        TankerReceipt,
        on_delete=models.CASCADE,
        related_name='attachments'
    )
    file = models.FileField(upload_to='tanker_receipts/%Y/%m/')
    attachment_type = models.CharField(max_length=30, choices=TYPE_CHOICES, default=TYPE_INVOICE)
    file_name = models.CharField(max_length=255)
    file_size = models.PositiveIntegerField()
    content_type = models.CharField(max_length=100)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='uploaded_receipt_attachments'
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"{self.file_name} ({self.attachment_type}) for {self.receipt.receipt_number}"


class PurchaseTaxCode(models.Model):
    REGIME_GST = 'gst'
    REGIME_NON_GST_PETROLEUM = 'non_gst_petroleum'
    REGIME_NON_GST = 'non_gst'
    REGIME_EXEMPT = 'exempt'
    REGIME_NIL_RATED = 'nil_rated'
    REGIME_OUT_OF_SCOPE = 'out_of_scope'
    REGIME_CHOICES = [
        (REGIME_GST, 'GST'),
        (REGIME_NON_GST_PETROLEUM, 'Non-GST Petroleum'),
        (REGIME_NON_GST, 'Non-GST'),
        (REGIME_EXEMPT, 'Exempt'),
        (REGIME_NIL_RATED, 'Nil Rated'),
        (REGIME_OUT_OF_SCOPE, 'Out of Scope'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='purchase_tax_codes'
    )
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=100)
    tax_regime = models.CharField(max_length=30, choices=REGIME_CHOICES, default=REGIME_GST)
    description = models.TextField(blank=True, null=True)
    is_purchase_applicable = models.BooleanField(default=True)
    is_sales_applicable = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower('code'),
                'organisation',
                name='unique_org_purchase_tax_code_ci'
            )
        ]
        ordering = ['code']

    def clean(self):
        super().clean()
        if self.code:
            self.code = self.code.strip().upper()
        if self.name:
            self.name = self.name.strip()

    def __str__(self):
        return f"{self.code} - {self.name} ({self.tax_regime})"


class PurchaseTaxCodeRate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tax_code = models.ForeignKey(
        PurchaseTaxCode,
        on_delete=models.PROTECT,
        related_name='rates'
    )
    effective_from = models.DateField(db_index=True)
    effective_to = models.DateField(null=True, blank=True, db_index=True)
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'))
    cess_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'))
    cess_per_unit = models.DecimalField(max_digits=10, decimal_places=4, default=Decimal('0.0000'))
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-effective_from']

    def clean(self):
        super().clean()
        if self.effective_to and self.effective_to < self.effective_from:
            raise ValidationError({'effective_to': "Effective to date cannot precede effective from date."})
        if self.pk and self.is_locked():
            old = PurchaseTaxCodeRate.objects.filter(pk=self.pk).first()
            if old:
                if (old.gst_rate != self.gst_rate or 
                    old.cess_rate != self.cess_rate or 
                    old.cess_per_unit != self.cess_per_unit or 
                    old.effective_from != self.effective_from):
                    raise ValidationError("Cannot modify rate values or start date on a tax code rate version that has been used in recorded purchase bills. Create a new effective-dated version instead.")

    def delete(self, *args, **kwargs):
        if self.is_locked():
            raise ValidationError("Cannot delete a tax code rate version that has been used in recorded purchase bills.")
        super().delete(*args, **kwargs)

    def is_locked(self):
        sales_used = hasattr(self, 'sales_invoice_lines') and self.sales_invoice_lines.exists()
        return self.bill_lines.exists() or self.other_charges.exists() or sales_used

    def __str__(self):
        to_str = self.effective_to.isoformat() if self.effective_to else 'present'
        return f"{self.tax_code.code} ({self.effective_from} to {to_str}): GST {self.gst_rate}%"


class PurchaseTaxCodeComponent(models.Model):
    TYPE_VAT = 'vat'
    TYPE_ADDITIONAL_TAX = 'additional_tax'
    TYPE_CESS = 'cess'
    TYPE_EXCISE = 'excise'
    TYPE_OTHER = 'other_levy'
    TYPE_CHOICES = [
        (TYPE_VAT, 'State VAT / Local Sales Tax'),
        (TYPE_ADDITIONAL_TAX, 'Additional Tax'),
        (TYPE_CESS, 'Cess / Surcharge'),
        (TYPE_EXCISE, 'Excise Component'),
        (TYPE_OTHER, 'Other Petroleum Levy'),
    ]

    BASE_DISCOUNTED_LINE = 'discounted_line_value'
    BASE_TAXABLE_VALUE = 'taxable_value'
    BASE_VALUE_PLUS_PREV = 'value_plus_previous_components'
    BASE_QUANTITY = 'quantity'
    BASE_MANUAL = 'manual_invoice_amount'
    BASE_CHOICES = [
        (BASE_DISCOUNTED_LINE, 'Discounted Line Value'),
        (BASE_TAXABLE_VALUE, 'Taxable Value'),
        (BASE_VALUE_PLUS_PREV, 'Value Plus Previous Components'),
        (BASE_QUANTITY, 'Quantity (Per Unit)'),
        (BASE_MANUAL, 'Manual Invoice Amount'),
    ]

    CALC_PERCENTAGE = 'percentage'
    CALC_PER_UNIT = 'per_unit'
    CALC_FIXED = 'fixed_amount'
    CALC_CHOICES = [
        (CALC_PERCENTAGE, 'Percentage'),
        (CALC_PER_UNIT, 'Per Unit Rate'),
        (CALC_FIXED, 'Fixed Amount'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rate_version = models.ForeignKey(
        PurchaseTaxCodeRate,
        on_delete=models.CASCADE,
        related_name='components'
    )
    name = models.CharField(max_length=100)
    component_type = models.CharField(max_length=30, choices=TYPE_CHOICES, default=TYPE_VAT)
    calculation_base = models.CharField(max_length=40, choices=BASE_CHOICES, default=BASE_DISCOUNTED_LINE)
    calculation_type = models.CharField(max_length=20, choices=CALC_CHOICES, default=CALC_PERCENTAGE)
    rate_value = models.DecimalField(max_digits=10, decimal_places=4, default=Decimal('0.0000'))
    is_inclusive = models.BooleanField(default=False)
    sequence = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ['sequence', 'id']

    def clean(self):
        super().clean()
        if self.rate_version_id and self.rate_version.is_locked():
            raise ValidationError("Cannot modify components on a tax code rate version that has been used in recorded purchase bills.")

    def delete(self, *args, **kwargs):
        if self.rate_version_id and self.rate_version.is_locked():
            raise ValidationError("Cannot delete components on a tax code rate version that has been used in recorded purchase bills.")
        super().delete(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.component_type}) [{self.rate_value}]"


class ItemPurchaseTaxTreatment(models.Model):
    ITC_NOT_APPLICABLE = 'not_applicable'
    ITC_PENDING_REVIEW = 'pending_review'
    ITC_ELIGIBLE_INPUTS = 'eligible_inputs'
    ITC_ELIGIBLE_CAPITAL = 'eligible_capital_goods'
    ITC_ELIGIBLE_SERVICES = 'eligible_input_services'
    ITC_INELIGIBLE_BLOCKED = 'ineligible_blocked'
    ITC_INELIGIBLE_OTHER = 'ineligible_other'
    ITC_CHOICES = [
        (ITC_NOT_APPLICABLE, 'Not Applicable'),
        (ITC_PENDING_REVIEW, 'Pending Review'),
        (ITC_ELIGIBLE_INPUTS, 'Eligible - Inputs'),
        (ITC_ELIGIBLE_CAPITAL, 'Eligible - Capital Goods'),
        (ITC_ELIGIBLE_SERVICES, 'Eligible - Input Services'),
        (ITC_INELIGIBLE_BLOCKED, 'Ineligible - Blocked Credit'),
        (ITC_INELIGIBLE_OTHER, 'Ineligible - Others'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='item_tax_treatments'
    )
    item = models.ForeignKey(
        'inventory.Item',
        on_delete=models.CASCADE,
        related_name='purchase_tax_treatments'
    )
    tax_treatment = models.ForeignKey(
        PurchaseTaxCode,
        on_delete=models.PROTECT,
        related_name='mapped_items'
    )
    default_itc_classification = models.CharField(
        max_length=30,
        choices=ITC_CHOICES,
        default=ITC_PENDING_REVIEW
    )
    effective_from = models.DateField(db_index=True)
    effective_to = models.DateField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-effective_from']

    def clean(self):
        super().clean()
        if hasattr(self, 'item') and self.item and hasattr(self, 'organisation'):
            if self.item.organisation_id != self.organisation_id:
                raise ValidationError({'item': "Item must belong to the same organisation."})
        if hasattr(self, 'tax_treatment') and self.tax_treatment and hasattr(self, 'organisation'):
            if self.tax_treatment.organisation_id != self.organisation_id:
                raise ValidationError({'tax_treatment': "Tax treatment must belong to the same organisation."})
        if self.effective_to and self.effective_to < self.effective_from:
            raise ValidationError({'effective_to': "Effective to date cannot precede effective from date."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        to_str = self.effective_to.isoformat() if self.effective_to else 'present'
        return f"{self.item.name} -> {self.tax_treatment.name} ({self.effective_from} to {to_str})"


class PurchaseItem(models.Model):
    TYPE_GOODS = 'goods'
    TYPE_SERVICE = 'service'
    TYPE_CHOICES = [
        (TYPE_GOODS, 'Goods'),
        (TYPE_SERVICE, 'Service'),
    ]

    TREATMENT_GST = 'gst'
    TREATMENT_EXEMPT = 'exempt'
    TREATMENT_NIL_RATED = 'nil_rated'
    TREATMENT_OUT_OF_SCOPE = 'out_of_scope'
    TREATMENT_NON_GST_PETRO = 'non_gst_petroleum'
    TREATMENT_CHOICES = [
        (TREATMENT_GST, 'GST Taxable'),
        (TREATMENT_EXEMPT, 'Exempt'),
        (TREATMENT_NIL_RATED, 'Nil Rated'),
        (TREATMENT_OUT_OF_SCOPE, 'Out of Scope'),
        (TREATMENT_NON_GST_PETRO, 'Non-GST Petroleum'),
    ]

    ITC_NOT_APPLICABLE = 'not_applicable'
    ITC_PENDING_REVIEW = 'pending_review'
    ITC_ELIGIBLE_INPUTS = 'eligible_inputs'
    ITC_ELIGIBLE_CAPITAL = 'eligible_capital_goods'
    ITC_ELIGIBLE_SERVICES = 'eligible_input_services'
    ITC_INELIGIBLE_BLOCKED = 'ineligible_blocked'
    ITC_INELIGIBLE_OTHER = 'ineligible_other'
    ITC_CHOICES = [
        (ITC_NOT_APPLICABLE, 'Not Applicable'),
        (ITC_PENDING_REVIEW, 'Pending Review'),
        (ITC_ELIGIBLE_INPUTS, 'Eligible - Inputs'),
        (ITC_ELIGIBLE_CAPITAL, 'Eligible - Capital Goods'),
        (ITC_ELIGIBLE_SERVICES, 'Eligible - Input Services'),
        (ITC_INELIGIBLE_BLOCKED, 'Ineligible - Blocked Credit'),
        (ITC_INELIGIBLE_OTHER, 'Ineligible - Others'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='purchase_items'
    )
    canonical_item = models.OneToOneField(
        'inventory.Item',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='legacy_purchase_item'
    )
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=255)
    item_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_GOODS)
    unit = models.CharField(max_length=20, default='NOS')
    hsn_sac = models.CharField(max_length=20, blank=True, null=True)
    purchase_tax_treatment = models.CharField(max_length=30, choices=TREATMENT_CHOICES, default=TREATMENT_GST)
    default_purchase_tax_code = models.ForeignKey(
        PurchaseTaxCode,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='defaulted_purchase_items'
    )
    default_itc_classification = models.CharField(max_length=30, choices=ITC_CHOICES, default=ITC_PENDING_REVIEW)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower('code'),
                'organisation',
                name='unique_org_purchase_item_code_ci'
            )
        ]
        ordering = ['name']

    def clean(self):
        super().clean()
        if self.code:
            self.code = self.code.strip()
        if self.name:
            self.name = self.name.strip()

    def __str__(self):
        return f"{self.name} ({self.code})"


class ProductPurchaseTaxMapping(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='purchase_tax_mappings'
    )
    fuel_product = models.OneToOneField(
        FuelProduct,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='purchase_tax_mapping'
    )
    purchase_item = models.OneToOneField(
        PurchaseItem,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='purchase_tax_mapping'
    )
    item = models.ForeignKey(
        'inventory.Item',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='purchase_tax_mapping'
    )
    purchase_tax_treatment = models.CharField(max_length=30, default='non_gst_petroleum')
    hsn_sac = models.CharField(max_length=20, blank=True, null=True)
    purchase_tax_code = models.ForeignKey(
        PurchaseTaxCode,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tax_mappings'
    )
    default_itc_classification = models.CharField(max_length=30, default='not_applicable')
    purchase_unit = models.CharField(max_length=20, default='Litre')
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        super().clean()
        if not self.fuel_product and not self.purchase_item:
            raise ValidationError("Either fuel_product or purchase_item must be specified.")
        if self.fuel_product and self.purchase_item:
            raise ValidationError("Cannot map both fuel_product and purchase_item in the same mapping.")
        if self.fuel_product and self.fuel_product.organisation_id != self.organisation_id:
            raise ValidationError("Fuel product must belong to the organisation.")
        if self.purchase_item and self.purchase_item.organisation_id != self.organisation_id:
            raise ValidationError("Purchase item must belong to the organisation.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        target = self.fuel_product.name if self.fuel_product else (self.purchase_item.name if self.purchase_item else 'None')
        return f"TaxMapping for {target}: {self.purchase_tax_treatment}"


class PurchaseBillSequence(models.Model):
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='purchase_bill_sequences'
    )
    year = models.PositiveIntegerField()
    last_sequence = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['outlet', 'year'],
                name='unique_outlet_bill_seq_year'
            )
        ]

    def __str__(self):
        return f"{self.outlet.code} - {self.year}: {self.last_sequence}"


class PurchaseBill(models.Model):
    STATUS_ACTIVE = 'active'
    STATUS_VOIDED = 'voided'
    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_VOIDED, 'Voided'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='purchase_bills'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='purchase_bills'
    )
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name='purchase_bills'
    )
    supplier_name_snapshot = models.CharField(max_length=255)
    supplier_code_snapshot = models.CharField(max_length=50)

    bill_number = models.CharField(max_length=100)
    supplier_invoice_number = models.CharField(max_length=100)
    normalized_supplier_invoice_number = models.CharField(max_length=100, db_index=True)

    is_duplicate_override = models.BooleanField(default=False)
    duplicate_override_reason = models.TextField(blank=True, null=True)
    conflicting_bill = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='overriding_bills'
    )

    invoice_date = models.DateField(db_index=True)
    received_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(db_index=True)
    currency = models.CharField(max_length=10, default='INR')

    CALC_LEGACY_V1 = 'legacy_v1'
    CALC_ITEM_TAX_V2 = 'item_tax_v2'
    CALC_CHOICES = [
        (CALC_LEGACY_V1, 'Legacy V1'),
        (CALC_ITEM_TAX_V2, 'Item Tax V2'),
    ]

    PURCHASE_TYPE_FUEL = 'fuel'
    PURCHASE_TYPE_GOODS_SERVICES = 'goods_services'
    PURCHASE_TYPE_MIXED = 'mixed'
    PURCHASE_TYPE_CHOICES = [
        (PURCHASE_TYPE_FUEL, 'Fuel'),
        (PURCHASE_TYPE_GOODS_SERVICES, 'Goods & Services'),
        (PURCHASE_TYPE_MIXED, 'Mixed (Fuel & Goods/Services)'),
    ]

    TAX_MODE_EXCLUSIVE = 'exclusive'
    TAX_MODE_INCLUSIVE = 'inclusive'
    TAX_MODE_CHOICES = [
        (TAX_MODE_EXCLUSIVE, 'Tax Exclusive'),
        (TAX_MODE_INCLUSIVE, 'Tax Inclusive'),
        ('tax_exclusive', 'Tax Exclusive'),
        ('tax_inclusive', 'Tax Inclusive'),
    ]

    DISCOUNT_MODE_LINE = 'line'
    DISCOUNT_MODE_TRANSACTION = 'transaction'
    DISCOUNT_MODE_CHOICES = [
        (DISCOUNT_MODE_LINE, 'Line Level Discounts'),
        (DISCOUNT_MODE_TRANSACTION, 'Transaction Level Discount'),
        ('line_level', 'Line Level Discounts'),
        ('transaction_level', 'Transaction Level Discount'),
    ]

    DISCOUNT_METHOD_NONE = 'none'
    DISCOUNT_METHOD_FIXED = 'fixed_amount'
    DISCOUNT_METHOD_PERCENTAGE = 'percentage'
    DISCOUNT_METHOD_CHOICES = [
        (DISCOUNT_METHOD_NONE, 'None'),
        (DISCOUNT_METHOD_FIXED, 'Fixed Amount'),
        (DISCOUNT_METHOD_PERCENTAGE, 'Percentage'),
    ]

    calculation_version = models.CharField(max_length=20, choices=CALC_CHOICES, default=CALC_ITEM_TAX_V2, db_index=True)
    purchase_type = models.CharField(max_length=30, choices=PURCHASE_TYPE_CHOICES, default=PURCHASE_TYPE_FUEL)
    tax_price_mode = models.CharField(max_length=20, choices=TAX_MODE_CHOICES, default=TAX_MODE_EXCLUSIVE)
    discount_mode = models.CharField(max_length=30, choices=DISCOUNT_MODE_CHOICES, default=DISCOUNT_MODE_LINE)

    transaction_discount_method = models.CharField(max_length=20, choices=DISCOUNT_METHOD_CHOICES, default=DISCOUNT_METHOD_NONE)
    transaction_discount_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    transaction_discount_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    supplier_gstin_snapshot = models.CharField(max_length=15, blank=True, null=True)
    supplier_state_snapshot = models.CharField(max_length=100, blank=True, null=True)
    supplier_state_code_snapshot = models.CharField(max_length=2, blank=True, null=True)

    outlet_gstin_snapshot = models.CharField(max_length=15, blank=True, null=True)
    outlet_state_snapshot = models.CharField(max_length=100, blank=True, null=True)
    outlet_state_code_snapshot = models.CharField(max_length=2, blank=True, null=True)

    place_of_supply_state = models.CharField(max_length=100, blank=True, null=True)
    place_of_supply_state_code = models.CharField(max_length=2, blank=True, null=True)
    is_place_of_supply_overridden = models.BooleanField(default=False)
    place_of_supply_override_reason = models.TextField(blank=True, null=True)

    is_interstate = models.BooleanField(default=False)
    is_reverse_charge = models.BooleanField(default=False)
    is_overseas_import = models.BooleanField(default=False)

    taxable_value_total = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    cgst_total = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    sgst_total = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    igst_total = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    gst_cess_total = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    petroleum_tax_total = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    other_charges_subtotal = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    other_charges_tax_total = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))

    subtotal = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    discount_total = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    additional_charges_total = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    tax_total = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    round_off_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    grand_total = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    amount_paid = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    outstanding_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_ACTIVE,
        db_index=True
    )
    notes = models.TextField(blank=True, null=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_purchase_bills'
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_purchase_bills'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='voided_purchase_bills'
    )
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['-invoice_date', '-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['organisation', 'supplier', 'normalized_supplier_invoice_number'],
                condition=models.Q(status='active', is_duplicate_override=False),
                name='unique_active_supplier_invoice'
            ),
            models.UniqueConstraint(
                fields=['outlet', 'bill_number'],
                condition=~models.Q(status='voided'),
                name='unique_active_outlet_bill_number'
            )
        ]

    def clean(self):
        if self.tax_price_mode == 'tax_exclusive':
            self.tax_price_mode = 'exclusive'
        elif self.tax_price_mode == 'tax_inclusive':
            self.tax_price_mode = 'inclusive'

        if self.discount_mode == 'line_level':
            self.discount_mode = 'line'
        elif self.discount_mode == 'transaction_level':
            self.discount_mode = 'transaction'

        if self.transaction_discount_method in (self.DISCOUNT_METHOD_NONE, self.DISCOUNT_METHOD_FIXED):
            if self.transaction_discount_percentage == Decimal('0.00'):
                self.transaction_discount_percentage = None

        super().clean()
        if hasattr(self, 'outlet') and hasattr(self, 'organisation'):
            if self.outlet.organisation_id != self.organisation_id:
                raise ValidationError("Outlet must belong to the organisation.")
        if hasattr(self, 'supplier') and hasattr(self, 'organisation'):
            if self.supplier.organisation_id != self.organisation_id:
                raise ValidationError("Supplier must belong to the organisation.")

        if self.bill_number:
            self.bill_number = self.bill_number.strip()
        if self.supplier_invoice_number:
            self.supplier_invoice_number = self.supplier_invoice_number.strip()

        if self.transaction_discount_amount and self.transaction_discount_amount > Decimal('0.00') and self.transaction_discount_method == self.DISCOUNT_METHOD_NONE:
            self.transaction_discount_method = self.DISCOUNT_METHOD_FIXED

        if self.transaction_discount_method == self.DISCOUNT_METHOD_NONE:
            if self.transaction_discount_amount and self.transaction_discount_amount > Decimal('0.00'):
                raise ValidationError({'transaction_discount_amount': "Discount amount must be 0 when discount method is none."})
            if self.transaction_discount_percentage is not None and self.transaction_discount_percentage > Decimal('0.00'):
                raise ValidationError({'transaction_discount_percentage': "Discount percentage must be null when discount method is none."})
            elif self.transaction_discount_percentage == Decimal('0.00'):
                self.transaction_discount_percentage = None
        elif self.transaction_discount_method == self.DISCOUNT_METHOD_FIXED:
            if self.transaction_discount_percentage is not None and self.transaction_discount_percentage > Decimal('0.00'):
                raise ValidationError({'transaction_discount_percentage': "Discount percentage must be null when using fixed amount discount."})
            elif self.transaction_discount_percentage == Decimal('0.00'):
                self.transaction_discount_percentage = None
        elif self.transaction_discount_method == self.DISCOUNT_METHOD_PERCENTAGE:
            if self.transaction_discount_percentage is None:
                raise ValidationError({'transaction_discount_percentage': "Discount percentage is required when using percentage discount."})
            if self.transaction_discount_percentage < Decimal('0.00') or self.transaction_discount_percentage > Decimal('100.00'):
                raise ValidationError({'transaction_discount_percentage': "Discount percentage must be between 0 and 100."})

        if self.is_place_of_supply_overridden:
            if not self.place_of_supply_override_reason or len(self.place_of_supply_override_reason.strip()) < 5:
                raise ValidationError({'place_of_supply_override_reason': "A detailed reason (min 5 chars) is required when overriding Place of Supply."})

        if self.is_reverse_charge:
            raise ValidationError({'is_reverse_charge': "Reverse Charge Mechanism (RCM) bills are blocked from normal automatic tax calculation until those workflows exist."})
        if self.is_overseas_import:
            raise ValidationError({'is_overseas_import': "Overseas / Import bills are blocked from normal automatic tax calculation until those workflows exist."})

        if self.status == self.STATUS_VOIDED and not self.void_reason:
            raise ValidationError({'void_reason': "A void reason is required when voiding a purchase bill."})

        if self.is_duplicate_override and not self.duplicate_override_reason:
            raise ValidationError({'duplicate_override_reason': "A mandatory reason is required when overriding duplicate invoice protection."})

    def delete(self, *args, **kwargs):
        raise ValidationError("Purchase bills cannot be deleted. Use void instead to invalidate a bill.")

    def save(self, *args, **kwargs):
        if self.pk:
            previous = PurchaseBill.objects.filter(pk=self.pk).first()
            if previous:
                from apps.accounting.models import JournalEntry
                is_posted = JournalEntry.objects.filter(
                    organisation_id=self.organisation_id,
                    outlet_id=self.outlet_id,
                    source_type='purchase_bill',
                    source_id=self.pk,
                    reversal_of__isnull=True,
                ).exists()
                if is_posted:
                    transition_fields = {
                        'amount_paid', 'outstanding_amount', 'status', 'voided_by_id',
                        'voided_at', 'void_reason', 'updated_by_id', 'updated_at',
                    }
                    changed = {
                        field.attname
                        for field in self._meta.concrete_fields
                        if field.attname != 'updated_at'
                        and getattr(previous, field.attname) != getattr(self, field.attname)
                    }
                    if changed - transition_fields:
                        raise ValidationError(
                            'Posted Purchase Bills are immutable. Void and re-enter the bill to correct it.'
                        )
                    settlement_changed = bool(changed & {'amount_paid', 'outstanding_amount'})
                    void_changed = bool(changed & {'status', 'voided_by_id', 'voided_at', 'void_reason'})
                    if settlement_changed and not (
                        getattr(self, '_allow_settlement_transition', False)
                        or getattr(self, '_allow_void_transition', False)
                    ):
                        raise ValidationError('Purchase Bill settlement can change only through payment allocation.')
                    if void_changed and not getattr(self, '_allow_void_transition', False):
                        raise ValidationError('Posted Purchase Bills can be voided only through the void service.')
        if self.supplier and (not self.supplier_name_snapshot or not self.supplier_code_snapshot):
            self.supplier_name_snapshot = self.supplier.name
            self.supplier_code_snapshot = self.supplier.code
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"PurchaseBill {self.bill_number} - {self.supplier_name_snapshot} ({self.supplier_invoice_number}) [{self.status}]"


class PurchaseBillReceiptLink(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    purchase_bill = models.ForeignKey(
        PurchaseBill,
        on_delete=models.PROTECT,
        related_name='receipt_links'
    )
    tanker_receipt = models.ForeignKey(
        TankerReceipt,
        on_delete=models.PROTECT,
        related_name='bill_links'
    )
    receipt_product_line = models.ForeignKey(
        TankerReceiptProductLine,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='bill_links'
    )
    linked_quantity = models.DecimalField(max_digits=15, decimal_places=4)
    linked_invoice_value = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_bill_receipt_links'
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['receipt_product_line'],
                condition=models.Q(released_at__isnull=True) & models.Q(receipt_product_line__isnull=False),
                name='unique_active_receipt_product_line_link'
            )
        ]

    def clean(self):
        super().clean()
        if hasattr(self, 'purchase_bill') and hasattr(self, 'tanker_receipt'):
            if self.purchase_bill.organisation_id != self.tanker_receipt.organisation_id:
                raise ValidationError("Tanker receipt must belong to the same organisation as the purchase bill.")
            if self.purchase_bill.outlet_id != self.tanker_receipt.outlet_id:
                raise ValidationError("Tanker receipt must belong to the same outlet as the purchase bill.")
            if self.purchase_bill.supplier_id != self.tanker_receipt.supplier_id:
                raise ValidationError("Tanker receipt supplier must match the purchase bill supplier.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        status_str = "released" if self.released_at else "active"
        return f"Link Bill {self.purchase_bill.bill_number} -> Receipt {self.tanker_receipt.receipt_number} ({status_str})"


class PurchaseBillLine(models.Model):
    LINE_TYPE_FUEL = 'fuel'
    LINE_TYPE_OTHER = 'other'
    LINE_TYPE_CHOICES = [
        (LINE_TYPE_FUEL, 'Fuel'),
        (LINE_TYPE_OTHER, 'Other Item'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    purchase_bill = models.ForeignKey(
        PurchaseBill,
        on_delete=models.PROTECT,
        related_name='lines'
    )
    line_number = models.PositiveIntegerField(default=1)
    receipt_link = models.ForeignKey(
        PurchaseBillReceiptLink,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bill_lines'
    )
    line_type = models.CharField(max_length=20, choices=LINE_TYPE_CHOICES, default=LINE_TYPE_FUEL)
    description = models.CharField(max_length=255, blank=True, null=True)
    product = models.ForeignKey(
        FuelProduct,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='purchase_bill_lines'
    )
    purchase_item = models.ForeignKey(
        PurchaseItem,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='purchase_bill_lines'
    )
    item = models.ForeignKey(
        'inventory.Item',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='purchase_bill_lines'
    )
    product_code_snapshot = models.CharField(max_length=50, blank=True, null=True)
    product_name_snapshot = models.CharField(max_length=255, blank=True, null=True)

    tax_treatment = models.CharField(max_length=30, default='legacy')
    tax_treatment_id = models.UUIDField(null=True, blank=True)
    tax_treatment_name = models.CharField(max_length=255, blank=True, null=True)
    tax_regime = models.CharField(max_length=30, blank=True, null=True)
    effective_rate_version_id = models.UUIDField(null=True, blank=True)

    tax_code = models.ForeignKey(
        PurchaseTaxCode,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='bill_lines'
    )
    tax_code_rate_version = models.ForeignKey(
        PurchaseTaxCodeRate,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='bill_lines'
    )
    tax_code_snapshot = models.CharField(max_length=100, blank=True, null=True)
    hsn_sac = models.CharField(max_length=20, blank=True, null=True)

    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'))
    cgst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'))
    cgst_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    sgst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'))
    sgst_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    igst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'))
    igst_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    cess_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'))
    cess_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    petroleum_tax_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))

    is_petroleum_manual_override = models.BooleanField(default=False)
    petroleum_manual_override_reason = models.TextField(blank=True, null=True)

    DISCOUNT_METHOD_NONE = 'none'
    DISCOUNT_METHOD_FIXED = 'fixed_amount'
    DISCOUNT_METHOD_PERCENTAGE = 'percentage'
    DISCOUNT_METHOD_CHOICES = [
        (DISCOUNT_METHOD_NONE, 'None'),
        (DISCOUNT_METHOD_FIXED, 'Fixed Amount'),
        (DISCOUNT_METHOD_PERCENTAGE, 'Percentage'),
    ]

    itc_classification = models.CharField(max_length=30, default='not_applicable')
    discount_method = models.CharField(max_length=20, choices=DISCOUNT_METHOD_CHOICES, default=DISCOUNT_METHOD_NONE)
    discount_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    allocated_transaction_discount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    tax_components_snapshot = models.JSONField(default=list, blank=True)

    quantity = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    unit = models.CharField(max_length=20, default='Litre')
    unit_rate = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    gross_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    discount_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    taxable_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    line_total = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    quantity_override_reason = models.TextField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['line_number']

    def clean(self):
        if self.discount_percentage == Decimal('0.00') and self.discount_method in (self.DISCOUNT_METHOD_NONE, self.DISCOUNT_METHOD_FIXED):
            self.discount_percentage = None
        super().clean()
        if hasattr(self, 'purchase_bill'):
            if hasattr(self, 'product') and self.product:
                if self.product.organisation_id != self.purchase_bill.organisation_id:
                    raise ValidationError("Fuel product must belong to the same organisation as the purchase bill.")
            if hasattr(self, 'purchase_item') and self.purchase_item:
                if self.purchase_item.organisation_id != self.purchase_bill.organisation_id:
                    raise ValidationError("Purchase item must belong to the same organisation as the purchase bill.")
            if hasattr(self, 'item') and self.item:
                if self.item.organisation_id != self.purchase_bill.organisation_id:
                    raise ValidationError("Item must belong to the same organisation as the purchase bill.")

        if self.discount_amount and self.discount_amount > Decimal('0.00') and self.discount_method == self.DISCOUNT_METHOD_NONE:
            self.discount_method = self.DISCOUNT_METHOD_FIXED

        if self.discount_method == self.DISCOUNT_METHOD_NONE:
            if self.discount_amount and self.discount_amount > Decimal('0.00'):
                raise ValidationError({'discount_amount': "Line discount amount must be 0 when discount method is none."})
            if self.discount_percentage is not None:
                raise ValidationError({'discount_percentage': "Line discount percentage must be null when discount method is none."})
        elif self.discount_method == self.DISCOUNT_METHOD_FIXED:
            if self.discount_percentage is not None:
                raise ValidationError({'discount_percentage': "Line discount percentage must be null when discount method is fixed amount."})
        elif self.discount_method == self.DISCOUNT_METHOD_PERCENTAGE:
            if self.discount_percentage is None:
                raise ValidationError({'discount_percentage': "Line discount percentage is required when discount method is percentage."})
            if self.discount_percentage < Decimal('0.00') or self.discount_percentage > Decimal('100.00'):
                raise ValidationError({'discount_percentage': "Line discount percentage must be between 0 and 100."})

        if self.is_petroleum_manual_override:
            if not self.petroleum_manual_override_reason or len(self.petroleum_manual_override_reason.strip()) < 5:
                raise ValidationError({'petroleum_manual_override_reason': "A detailed reason (min 5 chars) is required when overriding petroleum taxes."})

        if self.quantity is not None and self.quantity < Decimal('0.0000'):
            raise ValidationError({'quantity': "Quantity cannot be negative."})
        if self.unit_rate is not None and self.unit_rate < Decimal('0.0000'):
            raise ValidationError({'unit_rate': "Unit rate cannot be negative."})

    def save(self, *args, **kwargs):
        if self.item and (not self.product_code_snapshot or not self.product_name_snapshot):
            self.product_code_snapshot = self.item.code
            self.product_name_snapshot = self.item.name
        elif self.product and (not self.product_code_snapshot or not self.product_name_snapshot):
            self.product_code_snapshot = self.product.code
            self.product_name_snapshot = self.product.name
        elif self.purchase_item and (not self.product_code_snapshot or not self.product_name_snapshot):
            self.product_code_snapshot = self.purchase_item.code
            self.product_name_snapshot = self.purchase_item.name

        if hasattr(self, 'purchase_bill') and self.purchase_bill.calculation_version == PurchaseBill.CALC_LEGACY_V1:
            self.gross_amount = (self.quantity * self.unit_rate).quantize(Decimal('0.01'))
            discount = self.discount_amount or Decimal('0.00')
            self.taxable_amount = max(Decimal('0.00'), self.gross_amount - discount)
            self.line_total = self.taxable_amount

        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Line {self.line_number}: {self.product_name_snapshot or self.description} ({self.quantity} {self.unit})"


class PurchaseBillAdjustmentComponent(models.Model):
    TYPE_CHARGE = 'charge'
    TYPE_DISCOUNT = 'discount'
    TYPE_TAX = 'tax'
    TYPE_ROUND_OFF = 'round_off'
    TYPE_CHOICES = [
        (TYPE_CHARGE, 'Charge'),
        (TYPE_DISCOUNT, 'Discount'),
        (TYPE_TAX, 'Tax'),
        (TYPE_ROUND_OFF, 'Round Off'),
    ]

    CALC_FIXED = 'fixed_amount'
    CALC_PERCENTAGE = 'percentage'
    CALC_CHOICES = [
        (CALC_FIXED, 'Fixed Amount'),
        (CALC_PERCENTAGE, 'Percentage'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    purchase_bill = models.ForeignKey(
        PurchaseBill,
        on_delete=models.PROTECT,
        related_name='adjustments'
    )
    label = models.CharField(max_length=100)
    component_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    calculation_type = models.CharField(max_length=20, choices=CALC_CHOICES, default=CALC_FIXED)
    percentage_rate = models.DecimalField(max_digits=7, decimal_places=4, null=True, blank=True)
    calculated_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    sequence = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['sequence', 'id']

    def __str__(self):
        return f"{self.label} ({self.component_type}): {self.calculated_amount}"


class PurchaseBillOtherCharge(models.Model):
    CHARGE_FREIGHT = 'freight'
    CHARGE_INSURANCE = 'insurance'
    CHARGE_PACKING = 'packing_handling'
    CHARGE_OTHER = 'other'
    CHARGE_CHOICES = [
        (CHARGE_FREIGHT, 'Freight / Transportation'),
        (CHARGE_INSURANCE, 'Insurance'),
        (CHARGE_PACKING, 'Packing & Handling'),
        (CHARGE_OTHER, 'Other Charges'),
    ]

    CALC_FIXED = 'fixed_amount'
    CALC_PERCENTAGE = 'percentage'
    CALC_CHOICES = [
        (CALC_FIXED, 'Fixed Amount'),
        (CALC_PERCENTAGE, 'Percentage'),
    ]

    TREATMENT_TAXABLE = 'taxable'
    TREATMENT_EXEMPT = 'exempt'
    TREATMENT_NIL_RATED = 'nil_rated'
    TREATMENT_NON_GST = 'non_gst'
    TREATMENT_CHOICES = [
        (TREATMENT_TAXABLE, 'Taxable'),
        (TREATMENT_EXEMPT, 'Exempt'),
        (TREATMENT_NIL_RATED, 'Nil Rated'),
        (TREATMENT_NON_GST, 'Non-GST'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    purchase_bill = models.ForeignKey(
        PurchaseBill,
        on_delete=models.PROTECT,
        related_name='other_charges'
    )
    charge_type = models.CharField(max_length=30, choices=CHARGE_CHOICES, default=CHARGE_FREIGHT)
    description = models.CharField(max_length=255)
    calculation_type = models.CharField(max_length=20, choices=CALC_CHOICES, default=CALC_FIXED)
    percentage_rate = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))

    tax_treatment = models.CharField(max_length=20, choices=TREATMENT_CHOICES, default=TREATMENT_TAXABLE)
    hsn_sac = models.CharField(max_length=20, blank=True, null=True)
    tax_code = models.ForeignKey(
        PurchaseTaxCode,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='other_charges'
    )
    tax_code_rate_version = models.ForeignKey(
        PurchaseTaxCodeRate,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='other_charges'
    )
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'))
    cgst_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    sgst_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    igst_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    total_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    sequence = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ['sequence', 'id']

    def clean(self):
        super().clean()
        if self.calculation_type == self.CALC_FIXED and self.percentage_rate is not None:
            raise ValidationError({'percentage_rate': "Percentage rate must be null when calculation type is fixed amount."})
        if self.calculation_type == self.CALC_PERCENTAGE and self.percentage_rate is None:
            raise ValidationError({'percentage_rate': "Percentage rate is required when calculation type is percentage."})

    def __str__(self):
        return f"{self.description} ({self.charge_type}): {self.amount} + Tax = {self.total_amount}"


class PurchaseBillAttachment(models.Model):
    TYPE_SUPPLIER_INVOICE = 'supplier_invoice'
    TYPE_DELIVERY_CHALLAN = 'delivery_challan'
    TYPE_TAX_DOCUMENT = 'tax_document'
    TYPE_NOTE_REFERENCE = 'note_reference'
    TYPE_OTHER = 'other'

    TYPE_CHOICES = [
        (TYPE_SUPPLIER_INVOICE, 'Supplier Invoice'),
        (TYPE_DELIVERY_CHALLAN, 'Delivery Challan'),
        (TYPE_TAX_DOCUMENT, 'Tax Document'),
        (TYPE_NOTE_REFERENCE, 'Debit/Credit Note Reference'),
        (TYPE_OTHER, 'Other Supporting Document'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    purchase_bill = models.ForeignKey(
        PurchaseBill,
        on_delete=models.PROTECT,
        related_name='attachments'
    )
    file = models.FileField(upload_to='purchase_bills/%Y/%m/')
    attachment_type = models.CharField(max_length=40, choices=TYPE_CHOICES, default=TYPE_SUPPLIER_INVOICE)
    file_name = models.CharField(max_length=255)
    file_size = models.PositiveIntegerField()
    content_type = models.CharField(max_length=100)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='uploaded_bill_attachments'
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"{self.file_name} ({self.attachment_type}) for Bill {self.purchase_bill.bill_number}"


class PurchaseBillAuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    purchase_bill = models.ForeignKey(
        PurchaseBill,
        on_delete=models.PROTECT,
        related_name='audit_logs'
    )
    event_type = models.CharField(max_length=50)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='purchase_bill_audits'
    )
    occurred_at = models.DateTimeField(auto_now_add=True)
    changed_fields = models.JSONField(default=list, blank=True)
    previous_totals = models.JSONField(default=dict, blank=True)
    new_totals = models.JSONField(default=dict, blank=True)
    reason = models.TextField(blank=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-occurred_at']

    def __str__(self):
        return f"Audit {self.event_type} on Bill {self.purchase_bill.bill_number} at {self.occurred_at}"
