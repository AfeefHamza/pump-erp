# apps/inventory/models.py
import uuid
from decimal import Decimal
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from apps.organizations.models import Organisation, Outlet
from apps.forecourt.models import Tank, FuelProduct


class TankStockMovement(models.Model):
    TYPE_INITIAL_OPENING_BALANCE = 'initial_opening_balance'
    TYPE_TANKER_RECEIPT = 'tanker_receipt'
    TYPE_NOZZLE_DISPENSING = 'nozzle_dispensing'
    TYPE_TESTING_RETURN = 'testing_return'
    TYPE_STOCK_ADJUSTMENT_INCREASE = 'stock_adjustment_increase'
    TYPE_STOCK_ADJUSTMENT_DECREASE = 'stock_adjustment_decrease'
    TYPE_REVERSAL = 'reversal'

    MOVEMENT_TYPE_CHOICES = [
        (TYPE_INITIAL_OPENING_BALANCE, 'Initial Opening Balance'),
        (TYPE_TANKER_RECEIPT, 'Tanker Receipt'),
        (TYPE_NOZZLE_DISPENSING, 'Nozzle Gross Dispensing'),
        (TYPE_TESTING_RETURN, 'Testing Fuel Returned'),
        (TYPE_STOCK_ADJUSTMENT_INCREASE, 'Stock Adjustment (Increase)'),
        (TYPE_STOCK_ADJUSTMENT_DECREASE, 'Stock Adjustment (Decrease)'),
        (TYPE_REVERSAL, 'Ledger Reversal'),
    ]

    DIR_IN = 'IN'
    DIR_OUT = 'OUT'
    DIRECTION_CHOICES = [
        (DIR_IN, 'Inward (Receipt/Return/Increase)'),
        (DIR_OUT, 'Outward (Dispensing/Decrease)'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='tank_stock_movements'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='tank_stock_movements'
    )
    tank = models.ForeignKey(
        Tank,
        on_delete=models.PROTECT,
        related_name='stock_movements'
    )
    fuel_product = models.ForeignKey(
        FuelProduct,
        on_delete=models.PROTECT,
        related_name='stock_movements'
    )
    product_code_snapshot = models.CharField(max_length=50)
    product_name_snapshot = models.CharField(max_length=255)

    movement_type = models.CharField(max_length=40, choices=MOVEMENT_TYPE_CHOICES)
    direction = models.CharField(max_length=3, choices=DIRECTION_CHOICES)
    quantity = models.DecimalField(max_digits=15, decimal_places=4)
    effective_at = models.DateTimeField(db_index=True)

    source_type = models.CharField(max_length=50)
    source_id = models.UUIDField(db_index=True)
    source_line_id = models.UUIDField(null=True, blank=True)

    reversal_of = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='reversals'
    )
    reason = models.TextField(blank=True, null=True)

    idempotency_key = models.CharField(max_length=255, unique=True, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='created_stock_movements'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['effective_at', 'created_at', 'id']
        indexes = [
            models.Index(fields=['tank', 'effective_at', 'created_at']),
            models.Index(fields=['source_type', 'source_id']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['source_type', 'source_id', 'source_line_id', 'movement_type', 'tank'],
                condition=models.Q(source_line_id__isnull=False),
                name='unique_stock_movement_source_line_tank'
            ),
            models.UniqueConstraint(
                fields=['source_type', 'source_id', 'movement_type', 'tank'],
                condition=models.Q(source_line_id__isnull=True),
                name='unique_stock_movement_source_tank'
            ),
        ]

    def clean(self):
        super().clean()
        if hasattr(self, 'outlet') and hasattr(self, 'organisation'):
            if self.outlet.organisation_id != self.organisation_id:
                raise ValidationError("Outlet must belong to the organisation.")
        if hasattr(self, 'tank') and hasattr(self, 'outlet'):
            if self.tank.outlet_id != self.outlet_id:
                raise ValidationError("Tank must belong to the same outlet.")
            if self.tank.organisation_id != self.organisation_id:
                raise ValidationError("Tank must belong to the same organisation.")
        if hasattr(self, 'fuel_product') and hasattr(self, 'organisation'):
            if self.fuel_product.organisation_id != self.organisation_id:
                raise ValidationError("Fuel product must belong to the organisation.")

        if self.quantity is not None and self.quantity <= Decimal('0.0000'):
            raise ValidationError({'quantity': "Stock movement quantity must be strictly greater than zero."})

    def save(self, *args, **kwargs):
        # Strictly append-only: no updates permitted
        if not self._state.adding and self.pk:
            raise ValidationError("TankStockMovement records are immutable and cannot be updated.")
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("TankStockMovement records are append-only and cannot be deleted. Use reversal instead.")

    def __str__(self):
        return f"{self.movement_type} ({self.direction} {self.quantity}L) on {self.tank.code} @ {self.effective_at}"


class TankStockBalanceProjection(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='tank_projections'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='tank_projections'
    )
    tank = models.OneToOneField(
        Tank,
        on_delete=models.CASCADE,
        related_name='stock_projection'
    )
    current_book_stock = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    last_movement_at = models.DateTimeField(null=True, blank=True)
    has_chronology_conflict = models.BooleanField(default=False)
    has_negative_balance_history = models.BooleanField(default=False)
    first_negative_balance_at = models.DateTimeField(null=True, blank=True)
    recalculated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['tank__code']

    def __str__(self):
        return f"Projection {self.tank.code}: {self.current_book_stock}L (Negative: {self.has_negative_balance_history})"


class StockAdjustment(models.Model):
    TYPE_INCREASE = 'increase'
    TYPE_DECREASE = 'decrease'
    ADJUSTMENT_TYPE_CHOICES = [
        (TYPE_INCREASE, 'Increase (+ IN)'),
        (TYPE_DECREASE, 'Decrease (- OUT)'),
    ]

    REASON_CALIBRATION = 'calibration_adjustment'
    REASON_SPILLAGE = 'spillage_or_leakage'
    REASON_TEMPERATURE = 'temperature_variation'
    REASON_HANDLING_LOSS = 'handling_loss'
    REASON_CORRECTION = 'system_correction'
    REASON_OTHER = 'other'

    REASON_CHOICES = [
        (REASON_CALIBRATION, 'Calibration Adjustment'),
        (REASON_SPILLAGE, 'Spillage or Leakage'),
        (REASON_TEMPERATURE, 'Temperature Variation'),
        (REASON_HANDLING_LOSS, 'Handling / Evaporation Loss'),
        (REASON_CORRECTION, 'System Correction'),
        (REASON_OTHER, 'Other Reason'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='stock_adjustments'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='stock_adjustments'
    )
    tank = models.ForeignKey(
        Tank,
        on_delete=models.PROTECT,
        related_name='stock_adjustments'
    )
    adjustment_type = models.CharField(max_length=10, choices=ADJUSTMENT_TYPE_CHOICES)
    quantity = models.DecimalField(max_digits=15, decimal_places=4)
    effective_at = models.DateTimeField(db_index=True)
    reason_category = models.CharField(max_length=50, choices=REASON_CHOICES)
    explanation = models.TextField()

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='created_stock_adjustments'
    )
    authorised_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='authorised_stock_adjustments'
    )

    is_reversed = models.BooleanField(default=False)
    reversed_at = models.DateTimeField(null=True, blank=True)
    reversed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='reversed_stock_adjustments'
    )
    reversal_reason = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-effective_at', '-created_at']

    def clean(self):
        super().clean()
        if hasattr(self, 'outlet') and hasattr(self, 'organisation'):
            if self.outlet.organisation_id != self.organisation_id:
                raise ValidationError("Outlet must belong to the organisation.")
        if hasattr(self, 'tank') and hasattr(self, 'outlet'):
            if self.tank.outlet_id != self.outlet_id:
                raise ValidationError("Tank must belong to the same outlet.")
            if self.tank.organisation_id != self.organisation_id:
                raise ValidationError("Tank must belong to the same organisation.")

        if self.quantity is not None and self.quantity <= Decimal('0.0000'):
            raise ValidationError({'quantity': "Adjustment quantity must be greater than zero."})

        if not self.explanation or not self.explanation.strip():
            raise ValidationError({'explanation': "A mandatory explanation is required for all stock adjustments."})

        if self.is_reversed and (not self.reversal_reason or not self.reversal_reason.strip()):
            raise ValidationError({'reversal_reason': "A mandatory reversal reason is required when reversing an adjustment."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Stock adjustments cannot be deleted. Use reversal instead.")

    def __str__(self):
        return f"StockAdj {self.adjustment_type.upper()} {self.quantity}L on {self.tank.code} ({self.reason_category})"


class StockAdjustmentAttachment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    adjustment = models.ForeignKey(
        StockAdjustment,
        on_delete=models.CASCADE,
        related_name='attachments'
    )
    file = models.FileField(upload_to='stock_adjustments/%Y/%m/')
    file_name = models.CharField(max_length=255)
    file_size = models.PositiveIntegerField()
    content_type = models.CharField(max_length=100)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='uploaded_stock_adjustment_attachments'
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"{self.file_name} for {self.adjustment}"
