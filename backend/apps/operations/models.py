# apps/operations/models.py
import uuid
from decimal import Decimal
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from apps.organizations.models import Organisation, Outlet
from apps.forecourt.models import Tank, Nozzle

class DipCalibrationChart(models.Model):
    UNIT_MM = 'millimetre'
    UNIT_CM = 'centimetre'
    UNIT_INCH = 'inch'
    UNIT_CHOICES = [
        (UNIT_MM, 'Millimetre (mm)'),
        (UNIT_CM, 'Centimetre (cm)'),
        (UNIT_INCH, 'Inch (in)'),
    ]

    STATUS_DRAFT = 'draft'
    STATUS_ACTIVE = 'active'
    STATUS_ARCHIVED = 'archived'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_ACTIVE, 'Active'),
        (STATUS_ARCHIVED, 'Archived'),
    ]

    LOOKUP_EXACT = 'exact_only'
    LOOKUP_INTERPOLATE = 'linear_interpolation'
    LOOKUP_CHOICES = [
        (LOOKUP_EXACT, 'Exact Match Only'),
        (LOOKUP_INTERPOLATE, 'Linear Interpolation'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='calibration_charts'
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    nominal_capacity = models.DecimalField(max_digits=12, decimal_places=4)
    tank_diameter = models.DecimalField(max_digits=12, decimal_places=4, blank=True, null=True)
    tank_length = models.DecimalField(max_digits=12, decimal_places=4, blank=True, null=True)
    manufacturer_or_source = models.CharField(max_length=255, blank=True, null=True)
    
    source_filename = models.CharField(max_length=255, blank=True, null=True)
    source_file = models.FileField(upload_to='calibration_charts/', blank=True, null=True)
    source_checksum = models.CharField(max_length=64, blank=True, null=True)
    
    original_height_unit = models.CharField(
        max_length=30,
        choices=UNIT_CHOICES,
        default=UNIT_MM
    )
    normalized_height_unit = models.CharField(max_length=30, default='millimetre')
    volume_unit = models.CharField(max_length=30, default='litre')
    
    lookup_mode = models.CharField(
        max_length=30,
        choices=LOOKUP_CHOICES,
        default=LOOKUP_INTERPOLATE
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_DRAFT
    )
    imported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='imported_charts'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def clean(self):
        super().clean()
        if self.name:
            self.name = self.name.strip()
        if self.description == '':
            self.description = None
        if self.manufacturer_or_source == '':
            self.manufacturer_or_source = None
            
        if self.nominal_capacity is not None and self.nominal_capacity <= 0:
            raise ValidationError({'nominal_capacity': "Nominal capacity must be greater than zero."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.nominal_capacity} L) - {self.status}"


class DipCalibrationPoint(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    chart = models.ForeignKey(
        DipCalibrationChart,
        on_delete=models.CASCADE,
        related_name='points'
    )
    height_mm = models.DecimalField(max_digits=12, decimal_places=4)
    volume_litres = models.DecimalField(max_digits=12, decimal_places=4)
    sequence = models.IntegerField()

    class Meta:
        ordering = ['sequence', 'height_mm']
        constraints = [
            models.UniqueConstraint(
                fields=['chart', 'height_mm'],
                name='unique_chart_height_mm'
            )
        ]

    def clean(self):
        super().clean()
        if self.height_mm is not None and self.height_mm < 0:
            raise ValidationError({'height_mm': "Height cannot be negative."})
        if self.volume_litres is not None and self.volume_litres < 0:
            raise ValidationError({'volume_litres': "Volume cannot be negative."})

    def save(self, *args, **kwargs):
        if self.chart.status == DipCalibrationChart.STATUS_ACTIVE:
            raise ValidationError("Cannot modify points of an active calibration chart. Create a new chart/version instead.")
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.chart.name} : {self.height_mm}mm -> {self.volume_litres}L"


class TankCalibrationAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='tank_calibration_assignments'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='tank_calibration_assignments'
    )
    tank = models.ForeignKey(
        Tank,
        on_delete=models.CASCADE,
        related_name='calibration_assignments'
    )
    chart = models.ForeignKey(
        DipCalibrationChart,
        on_delete=models.PROTECT,
        related_name='tank_assignments'
    )
    effective_from = models.DateTimeField()
    effective_to = models.DateTimeField(blank=True, null=True)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_tank_charts'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-effective_from']

    def clean(self):
        super().clean()
        if hasattr(self, 'tank') and self.tank.organisation_id != self.organisation_id:
            raise ValidationError("Tank must belong to the same organisation.")
        if hasattr(self, 'chart') and self.chart.organisation_id != self.organisation_id:
            raise ValidationError("Chart must belong to the same organisation.")
        if hasattr(self, 'outlet') and self.outlet.organisation_id != self.organisation_id:
            raise ValidationError("Outlet must belong to the same organisation.")

        if self.chart.status != DipCalibrationChart.STATUS_ACTIVE:
            raise ValidationError({'chart': "Only active calibration charts can be assigned to a tank."})

        if self.effective_from and self.effective_to and self.effective_to <= self.effective_from:
            raise ValidationError({'effective_to': "Effective to date/time must be after effective from date/time."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.tank.name} <- {self.chart.name} (from {self.effective_from})"


class OpeningBalanceBatch(models.Model):
    STATUS_PREPARING = 'preparing'
    STATUS_CONFIRMED = 'confirmed'
    STATUS_CHOICES = [
        (STATUS_PREPARING, 'Preparing'),
        (STATUS_CONFIRMED, 'Confirmed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='opening_balance_batches'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='opening_balance_batches'
    )
    effective_at = models.DateTimeField()
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PREPARING
    )
    notes = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_opening_batches'
    )
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='confirmed_opening_batches'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ['-created_at']

    def clean(self):
        super().clean()
        if hasattr(self, 'outlet') and self.outlet.organisation_id != self.organisation_id:
            raise ValidationError("Outlet must belong to the same organisation.")
        
        if self.notes == '':
            self.notes = None

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Opening Balance Batch for {self.outlet.name} @ {self.effective_at} ({self.status})"


class NozzleOpeningBalance(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    batch = models.ForeignKey(
        OpeningBalanceBatch,
        on_delete=models.CASCADE,
        related_name='nozzle_balances'
    )
    nozzle = models.ForeignKey(
        Nozzle,
        on_delete=models.PROTECT,
        related_name='opening_balances'
    )
    totalizer_reading = models.DecimalField(max_digits=15, decimal_places=3)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['batch', 'nozzle'],
                name='unique_batch_nozzle_opening_balance'
            )
        ]

    def clean(self):
        super().clean()
        if hasattr(self, 'batch') and hasattr(self, 'nozzle'):
            if self.nozzle.outlet_id != self.batch.outlet_id:
                raise ValidationError("Nozzle must belong to the same outlet as the batch.")
        
        if self.totalizer_reading is not None and self.totalizer_reading < 0:
            raise ValidationError({'totalizer_reading': "Reading cannot be negative."})
        
        if self.notes == '':
            self.notes = None

    def save(self, *args, **kwargs):
        if self.batch.status == OpeningBalanceBatch.STATUS_CONFIRMED:
            raise ValidationError("Cannot modify balances of a confirmed opening balance batch.")
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nozzle.code} : {self.totalizer_reading}"


class TankOpeningBalance(models.Model):
    METHOD_EXACT = 'calibration_exact'
    METHOD_INTERPOLATE = 'calibration_interpolated'
    METHOD_MANUAL = 'manual_quantity'
    METHOD_CHOICES = [
        (METHOD_EXACT, 'Calibration Exact Match'),
        (METHOD_INTERPOLATE, 'Calibration Interpolation'),
        (METHOD_MANUAL, 'Manual Quantity Entry'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    batch = models.ForeignKey(
        OpeningBalanceBatch,
        on_delete=models.CASCADE,
        related_name='tank_balances'
    )
    tank = models.ForeignKey(
        Tank,
        on_delete=models.PROTECT,
        related_name='opening_balances'
    )
    book_quantity = models.DecimalField(max_digits=12, decimal_places=4)
    physical_quantity = models.DecimalField(max_digits=12, decimal_places=4)
    
    raw_dip_value = models.DecimalField(max_digits=12, decimal_places=4, blank=True, null=True)
    raw_dip_unit = models.CharField(
        max_length=30,
        choices=DipCalibrationChart.UNIT_CHOICES,
        blank=True,
        null=True
    )
    calibration_assignment = models.ForeignKey(
        TankCalibrationAssignment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='opening_balances'
    )
    density = models.DecimalField(max_digits=8, decimal_places=4, blank=True, null=True)
    conversion_method = models.CharField(
        max_length=50,
        choices=METHOD_CHOICES,
        default=METHOD_MANUAL
    )
    manual_quantity_reason = models.TextField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['batch', 'tank'],
                name='unique_batch_tank_opening_balance'
            )
        ]

    def clean(self):
        super().clean()
        if hasattr(self, 'batch') and hasattr(self, 'tank'):
            if self.tank.outlet_id != self.batch.outlet_id:
                raise ValidationError("Tank must belong to the same outlet as the batch.")
        
        if self.book_quantity is not None and self.book_quantity < 0:
            raise ValidationError({'book_quantity': "Book quantity cannot be negative."})
        if self.physical_quantity is not None and self.physical_quantity < 0:
            raise ValidationError({'physical_quantity': "Physical quantity cannot be negative."})
        
        # Validation tolerance check: quantities cannot exceed tank capacity beyond a configurable validation tolerance (e.g. 5%)
        if self.tank and self.physical_quantity is not None:
            max_tolerated = self.tank.capacity * Decimal('1.05')
            if self.physical_quantity > max_tolerated:
                raise ValidationError({'physical_quantity': f"Physical quantity exceeds tank capacity ({self.tank.capacity}) beyond 5% tolerance."})
            if self.book_quantity > max_tolerated:
                raise ValidationError({'book_quantity': f"Book quantity exceeds tank capacity ({self.tank.capacity}) beyond 5% tolerance."})

        if self.conversion_method == self.METHOD_MANUAL and not self.manual_quantity_reason:
            raise ValidationError({'manual_quantity_reason': "A reason is required when manually overriding the physical quantity."})

        if self.notes == '':
            self.notes = None
        if self.manual_quantity_reason == '':
            self.manual_quantity_reason = None

    def save(self, *args, **kwargs):
        if self.batch.status == OpeningBalanceBatch.STATUS_CONFIRMED:
            raise ValidationError("Cannot modify balances of a confirmed opening balance batch.")
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.tank.name} : Book: {self.book_quantity} , Physical: {self.physical_quantity}"


class NozzleCommissioning(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='nozzle_commissionings'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='nozzle_commissionings'
    )
    nozzle = models.ForeignKey(
        Nozzle,
        on_delete=models.PROTECT,
        related_name='commissionings'
    )
    effective_at = models.DateTimeField()
    initial_totalizer = models.DecimalField(max_digits=15, decimal_places=3)
    reason = models.TextField()
    notes = models.TextField(blank=True, null=True)
    commissioned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='commissioned_nozzles'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    # Snapshot fields for historical clarity
    dispenser_code_snapshot = models.CharField(max_length=50)
    nozzle_code_snapshot = models.CharField(max_length=50)
    product_id_snapshot = models.UUIDField()
    product_name_snapshot = models.CharField(max_length=255)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['nozzle'],
                name='unique_nozzle_commissioning'
            )
        ]
        ordering = ['-effective_at', '-created_at']

    def clean(self):
        super().clean()
        if hasattr(self, 'outlet') and hasattr(self, 'organisation'):
            if self.outlet.organisation_id != self.organisation_id:
                raise ValidationError("Outlet must belong to the same organisation.")

        if hasattr(self, 'nozzle') and hasattr(self, 'outlet'):
            if self.nozzle.outlet_id != self.outlet_id:
                raise ValidationError("Nozzle must belong to the selected outlet.")
            if self.nozzle.organisation_id != self.organisation_id:
                raise ValidationError("Nozzle must belong to the same organisation.")

        if self.initial_totalizer is not None and self.initial_totalizer < Decimal('0.000'):
            raise ValidationError({'initial_totalizer': "Initial totalizer cannot be negative."})

        if not self.reason or not self.reason.strip():
            raise ValidationError({'reason': "A mandatory reason is required for nozzle commissioning."})

        if self.notes == '':
            self.notes = None

    def save(self, *args, **kwargs):
        if not self._state.adding and self.pk:
            raise ValidationError("Commissioning records are immutable and cannot be updated.")
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Commissioning records are immutable and cannot be deleted.")

    def __str__(self):
        return f"{self.nozzle_code_snapshot} commissioned @ {self.initial_totalizer} ({self.effective_at})"


class NozzleCommissioningAuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='nozzle_commissioning_audit_logs'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='nozzle_commissioning_audit_logs'
    )
    commissioning = models.ForeignKey(
        NozzleCommissioning,
        on_delete=models.PROTECT,
        related_name='audit_logs'
    )
    nozzle = models.ForeignKey(
        Nozzle,
        on_delete=models.PROTECT,
        related_name='commissioning_audit_logs'
    )
    event_type = models.CharField(max_length=50, default='nozzle_commissioned')
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='nozzle_commissioning_audits'
    )
    occurred_at = models.DateTimeField(auto_now_add=True)
    reason = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-occurred_at']

    def save(self, *args, **kwargs):
        if not self._state.adding and self.pk:
            raise ValidationError("Audit logs are append-only and cannot be updated.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Audit logs cannot be deleted.")

    def __str__(self):
        return f"Audit: {self.event_type} on {self.nozzle.code} by {self.actor} at {self.occurred_at}"

