# apps/purchases/models.py
import uuid
from decimal import Decimal
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db.models.functions import Lower

from apps.organizations.models import Organisation, Outlet
from apps.forecourt.models import Tank, FuelProduct
from apps.operations.models import DipCalibrationChart


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
