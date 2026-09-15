# apps/inventory/models.py
import uuid
from decimal import Decimal
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db.models.functions import Lower
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
    item = models.ForeignKey(
        'Item',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='stock_movements'
    )
    product_code_snapshot = models.CharField(max_length=50)
    product_name_snapshot = models.CharField(max_length=255)

    movement_type = models.CharField(max_length=40, choices=MOVEMENT_TYPE_CHOICES)
    direction = models.CharField(max_length=3, choices=DIRECTION_CHOICES)
    quantity = models.DecimalField(max_digits=15, decimal_places=4)
    effective_at = models.DateTimeField(db_index=True)
    business_date = models.DateField(db_index=True, null=True, blank=True)

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
        if not self.business_date and self.effective_at:
            from apps.core.timezone_utils import to_outlet_business_date
            self.business_date = to_outlet_business_date(self.effective_at, outlet=getattr(self, 'outlet', None))
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
    business_date = models.DateField(db_index=True, null=True, blank=True)
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
        if not self.business_date and self.effective_at:
            from apps.core.timezone_utils import to_outlet_business_date
            self.business_date = to_outlet_business_date(self.effective_at, outlet=getattr(self, 'outlet', None))
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


class UnitMaster(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='units'
    )
    code = models.CharField(max_length=20)
    name = models.CharField(max_length=50)
    symbol = models.CharField(max_length=10, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower('code'),
                'organisation',
                name='unique_org_unit_code_ci'
            ),
            models.UniqueConstraint(
                Lower('name'),
                'organisation',
                name='unique_org_unit_name_ci'
            )
        ]
        ordering = ['name']

    def clean(self):
        super().clean()
        if self.code:
            self.code = self.code.strip().upper()
        if self.name:
            self.name = self.name.strip()
        if self.symbol:
            self.symbol = self.symbol.strip()

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.code})"


class UnitConversion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='unit_conversions'
    )
    item = models.ForeignKey(
        'Item',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='unit_conversions'
    )
    from_unit = models.ForeignKey(
        UnitMaster,
        on_delete=models.PROTECT,
        related_name='conversions_from'
    )
    to_unit = models.ForeignKey(
        UnitMaster,
        on_delete=models.PROTECT,
        related_name='conversions_to'
    )
    multiplier = models.DecimalField(max_digits=15, decimal_places=6)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['organisation', 'item', 'from_unit', 'to_unit'],
                name='unique_org_item_unit_conversion'
            )
        ]
        ordering = ['from_unit__name', 'to_unit__name']

    def clean(self):
        super().clean()
        if self.multiplier is not None and self.multiplier <= Decimal('0.000000'):
            raise ValidationError({'multiplier': "Conversion multiplier must be strictly greater than zero."})
        if self.from_unit_id and self.to_unit_id and self.from_unit_id == self.to_unit_id:
            raise ValidationError({'to_unit': "From Unit and To Unit cannot be the same unit."})
        if hasattr(self, 'from_unit') and hasattr(self, 'organisation') and self.from_unit.organisation_id != self.organisation_id:
            raise ValidationError({'from_unit': "From Unit must belong to the same organisation."})
        if hasattr(self, 'to_unit') and hasattr(self, 'organisation') and self.to_unit.organisation_id != self.organisation_id:
            raise ValidationError({'to_unit': "To Unit must belong to the same organisation."})
        if hasattr(self, 'item') and self.item and self.item.organisation_id != self.organisation_id:
            raise ValidationError({'item': "Item must belong to the same organisation."})

        # Check for contradictory reverse conversion
        reverse_conv = UnitConversion.objects.filter(
            organisation=self.organisation,
            item=self.item,
            from_unit=self.to_unit,
            to_unit=self.from_unit,
            is_active=True
        ).exclude(pk=self.pk).first()
        if reverse_conv and self.multiplier:
            expected_reverse = Decimal('1') / self.multiplier
            if abs(reverse_conv.multiplier - expected_reverse) > Decimal('0.0001'):
                raise ValidationError(f"A reverse conversion already exists with multiplier {reverse_conv.multiplier}. Conflicting multiplier is not permitted.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        item_prefix = f"[{self.item.code}] " if self.item else ""
        return f"{item_prefix}1 {self.from_unit.code} = {self.multiplier} {self.to_unit.code}"


class Item(models.Model):
    ITEM_TYPE_FUEL = 'fuel'
    ITEM_TYPE_STOCK = 'stock_item'
    ITEM_TYPE_NON_STOCK = 'non_stock_item'
    ITEM_TYPE_SERVICE = 'service'
    ITEM_TYPE_CHOICES = [
        (ITEM_TYPE_FUEL, 'Fuel'),
        (ITEM_TYPE_STOCK, 'Stock Item'),
        (ITEM_TYPE_NON_STOCK, 'Non-stock Item'),
        (ITEM_TYPE_SERVICE, 'Service'),
    ]

    TRACKING_TANK = 'tank'
    TRACKING_QUANTITY = 'quantity'
    TRACKING_NONE = 'none'
    TRACKING_CHOICES = [
        (TRACKING_TANK, 'Tank Ledger'),
        (TRACKING_QUANTITY, 'Quantity Ledger'),
        (TRACKING_NONE, 'No Inventory Tracking'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='items'
    )
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=255)
    short_name = models.CharField(max_length=100, blank=True, null=True)
    item_type = models.CharField(max_length=30, choices=ITEM_TYPE_CHOICES, default=ITEM_TYPE_STOCK)
    category = models.CharField(max_length=100, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    base_unit = models.ForeignKey(
        UnitMaster,
        on_delete=models.PROTECT,
        related_name='items'
    )
    hsn_sac = models.CharField(max_length=20, blank=True, null=True)
    barcode = models.CharField(max_length=100, blank=True, null=True)
    is_purchasable = models.BooleanField(default=True)
    is_sellable = models.BooleanField(default=True)
    inventory_tracking_mode = models.CharField(
        max_length=20,
        choices=TRACKING_CHOICES,
        default=TRACKING_QUANTITY
    )
    is_active = models.BooleanField(default=True)
    display_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='created_items'
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='updated_items'
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower('code'),
                'organisation',
                name='unique_org_item_code_ci'
            ),
            models.UniqueConstraint(
                fields=['organisation', 'barcode'],
                condition=models.Q(barcode__isnull=False) & ~models.Q(barcode=''),
                name='unique_org_item_barcode'
            )
        ]
        ordering = ['display_order', 'name']

    def clean(self):
        super().clean()
        if self.code:
            self.code = self.code.strip()
        if self.name:
            self.name = self.name.strip()
        if self.short_name:
            self.short_name = self.short_name.strip()
        elif self.short_name == '':
            self.short_name = None

        if self.barcode:
            self.barcode = self.barcode.strip()
        elif self.barcode == '':
            self.barcode = None

        if self.hsn_sac:
            self.hsn_sac = self.hsn_sac.strip()
        elif self.hsn_sac == '':
            self.hsn_sac = None

        if self.category:
            self.category = self.category.strip()
        elif self.category == '':
            self.category = None

        # Tracking mode derivation & enforcement
        if self.item_type == self.ITEM_TYPE_FUEL:
            self.inventory_tracking_mode = self.TRACKING_TANK
        elif self.item_type == self.ITEM_TYPE_STOCK:
            if self.inventory_tracking_mode not in (self.TRACKING_QUANTITY, self.TRACKING_NONE):
                self.inventory_tracking_mode = self.TRACKING_QUANTITY
        elif self.item_type in (self.ITEM_TYPE_NON_STOCK, self.ITEM_TYPE_SERVICE):
            self.inventory_tracking_mode = self.TRACKING_NONE

        if self.item_type == self.ITEM_TYPE_SERVICE and self.inventory_tracking_mode != self.TRACKING_NONE:
            raise ValidationError({'inventory_tracking_mode': "Service items cannot track inventory."})

        if hasattr(self, 'base_unit') and self.base_unit and hasattr(self, 'organisation'):
            if self.base_unit.organisation_id != self.organisation_id:
                raise ValidationError({'base_unit': "Base unit must belong to the same organisation."})

    def save(self, *args, **kwargs):
        if self.item_type == self.ITEM_TYPE_FUEL:
            self.inventory_tracking_mode = self.TRACKING_TANK
        elif self.item_type in (self.ITEM_TYPE_NON_STOCK, self.ITEM_TYPE_SERVICE):
            self.inventory_tracking_mode = self.TRACKING_NONE
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if hasattr(self, 'tanks') and self.tanks.exists():
            raise ValidationError("Cannot delete an item assigned to tanks. Deactivate it instead.")
        if hasattr(self, 'purchase_bill_lines') and self.purchase_bill_lines.exists():
            raise ValidationError("Cannot delete an item referenced in purchase bills. Deactivate it instead.")
        if hasattr(self, 'tanker_receipt_lines') and self.tanker_receipt_lines.exists():
            raise ValidationError("Cannot delete an item referenced in tanker receipts. Deactivate it instead.")
        if hasattr(self, 'stock_movements') and self.stock_movements.exists():
            raise ValidationError("Cannot delete an item with inventory ledger history. Deactivate it instead.")
        if hasattr(self, 'quantity_movements') and self.quantity_movements.exists():
            raise ValidationError("Cannot delete an item with quantity-ledger history. Deactivate it instead.")
        if hasattr(self, 'sales_invoice_lines') and self.sales_invoice_lines.exists():
            raise ValidationError("Cannot delete an item referenced by sales invoices. Deactivate it instead.")
        super().delete(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.code}) [{self.item_type}]"


class FuelItemProfile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    item = models.OneToOneField(
        Item,
        on_delete=models.CASCADE,
        related_name='fuel_profile'
    )
    fuel_category = models.CharField(
        max_length=50,
        choices=FuelProduct.CATEGORY_CHOICES,
        default=FuelProduct.CATEGORY_PETROL
    )
    custom_category_name = models.CharField(max_length=255, blank=True, null=True)
    short_code = models.CharField(max_length=50, blank=True, null=True)
    stock_unit = models.ForeignKey(
        UnitMaster,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='fuel_profiles'
    )
    density_std = models.DecimalField(max_digits=8, decimal_places=4, blank=True, null=True)
    density_min = models.DecimalField(max_digits=8, decimal_places=4, blank=True, null=True)
    density_max = models.DecimalField(max_digits=8, decimal_places=4, blank=True, null=True)
    price_configuration_eligible = models.BooleanField(default=True)
    forecourt_display_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        super().clean()
        if hasattr(self, 'item') and self.item.item_type != Item.ITEM_TYPE_FUEL:
            raise ValidationError("FuelItemProfile can only be attached to an Item of type 'fuel'.")
        if self.fuel_category == FuelProduct.CATEGORY_OTHER and not self.custom_category_name:
            raise ValidationError({'custom_category_name': "Custom category name is required when category is 'other'."})
        if self.fuel_category != FuelProduct.CATEGORY_OTHER and self.custom_category_name:
            self.custom_category_name = None

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"FuelProfile for {self.item.name} ({self.short_code or self.fuel_category})"


class StockItemProfile(models.Model):
    VALUATION_FIFO = 'fifo'
    VALUATION_WEIGHTED_AVG = 'weighted_average'
    VALUATION_CHOICES = [
        (VALUATION_FIFO, 'FIFO (First In First Out)'),
        (VALUATION_WEIGHTED_AVG, 'Weighted Average'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    item = models.OneToOneField(
        Item,
        on_delete=models.CASCADE,
        related_name='stock_profile'
    )
    brand = models.CharField(max_length=100, blank=True, null=True)
    reorder_level = models.DecimalField(max_digits=12, decimal_places=4, default=Decimal('0.0000'))
    preferred_purchase_unit = models.ForeignKey(
        UnitMaster,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='preferred_purchase_stock_profiles'
    )
    sales_unit = models.ForeignKey(
        UnitMaster,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='sales_stock_profiles'
    )
    valuation_method = models.CharField(max_length=30, choices=VALUATION_CHOICES, default=VALUATION_FIFO)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        super().clean()
        if hasattr(self, 'item') and self.item.item_type != Item.ITEM_TYPE_STOCK:
            raise ValidationError("StockItemProfile can only be attached to an Item of type 'stock_item'.")
        if self.reorder_level is not None and self.reorder_level < Decimal('0.0000'):
            raise ValidationError({'reorder_level': "Reorder level cannot be negative."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"StockProfile for {self.item.name} (Brand: {self.brand or 'N/A'})"


class ItemCodeAlias(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='item_code_aliases'
    )
    item = models.ForeignKey(
        Item,
        on_delete=models.CASCADE,
        related_name='aliases'
    )
    alias_code = models.CharField(max_length=100)
    source = models.CharField(max_length=50)  # 'legacy_fuel_product', 'legacy_purchase_item', 'manual'
    is_conflict = models.BooleanField(default=False)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower('alias_code'),
                'organisation',
                name='unique_org_item_alias_code_ci'
            )
        ]
        ordering = ['alias_code']

    def clean(self):
        super().clean()
        if self.alias_code:
            self.alias_code = self.alias_code.strip()

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Alias {self.alias_code} -> {self.item.code} ({'CONFLICT' if self.is_conflict else 'OK'})"


class ItemStockMovement(models.Model):
    """Append-only quantity ledger for ordinary stock items (never fuel tanks)."""
    TYPE_OPENING = 'opening_balance'
    TYPE_ADJUSTMENT_IN = 'adjustment_in'
    TYPE_ADJUSTMENT_OUT = 'adjustment_out'
    TYPE_SALE = 'sales_invoice'
    TYPE_REVERSAL = 'reversal'
    TYPE_CHOICES = [
        (TYPE_OPENING, 'Opening Balance'),
        (TYPE_ADJUSTMENT_IN, 'Stock Adjustment In'),
        (TYPE_ADJUSTMENT_OUT, 'Stock Adjustment Out'),
        (TYPE_SALE, 'Sales Invoice'),
        (TYPE_REVERSAL, 'Reversal'),
    ]
    DIR_IN = 'IN'
    DIR_OUT = 'OUT'
    DIRECTION_CHOICES = [(DIR_IN, 'Inward'), (DIR_OUT, 'Outward')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name='item_stock_movements')
    outlet = models.ForeignKey(Outlet, on_delete=models.PROTECT, related_name='item_stock_movements')
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name='quantity_movements')
    item_code_snapshot = models.CharField(max_length=50)
    item_name_snapshot = models.CharField(max_length=255)
    unit_code_snapshot = models.CharField(max_length=20)
    movement_type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    direction = models.CharField(max_length=3, choices=DIRECTION_CHOICES)
    quantity = models.DecimalField(max_digits=15, decimal_places=4)
    effective_date = models.DateField(db_index=True)
    source_type = models.CharField(max_length=50)
    source_id = models.UUIDField(db_index=True)
    source_line_id = models.UUIDField(null=True, blank=True)
    reversal_of = models.ForeignKey('self', null=True, blank=True, on_delete=models.PROTECT, related_name='reversals')
    reason = models.TextField(blank=True, null=True)
    idempotency_key = models.CharField(max_length=200, unique=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='created_item_stock_movements')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['effective_date', 'created_at', 'id']
        indexes = [models.Index(fields=['outlet', 'item', 'effective_date'])]
        constraints = [models.CheckConstraint(condition=models.Q(quantity__gt=0), name='item_stock_movement_qty_positive')]

    def clean(self):
        super().clean()
        if self.outlet_id and self.outlet.organisation_id != self.organisation_id:
            raise ValidationError('Stock movement outlet must belong to the organisation.')
        if self.item_id:
            if self.item.organisation_id != self.organisation_id:
                raise ValidationError('Stock movement item must belong to the organisation.')
            if self.item.item_type != Item.ITEM_TYPE_STOCK or self.item.inventory_tracking_mode != Item.TRACKING_QUANTITY:
                raise ValidationError('Only quantity-tracked stock items use the ordinary item ledger.')
        if self.reversal_of_id:
            original = self.reversal_of
            if original.outlet_id != self.outlet_id or original.item_id != self.item_id:
                raise ValidationError('A stock reversal must match the original outlet and item.')
            if self.quantity != original.quantity or self.direction == original.direction:
                raise ValidationError('A stock reversal must exactly offset the original movement.')

    def save(self, *args, **kwargs):
        if self.pk and ItemStockMovement.objects.filter(pk=self.pk).exists():
            raise ValidationError('Item stock movements are immutable.')
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('Item stock movements cannot be deleted.')


class ItemStockBalanceProjection(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE, related_name='item_stock_projections')
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE, related_name='item_stock_projections')
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name='stock_projections')
    current_quantity = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    last_movement_date = models.DateField(null=True, blank=True)
    has_negative_balance_history = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['outlet', 'item'], name='unique_outlet_item_stock_projection')]
        ordering = ['item__name']

    def clean(self):
        super().clean()
        if self.outlet_id and self.outlet.organisation_id != self.organisation_id:
            raise ValidationError('Stock projection outlet must belong to the organisation.')
        if self.item_id and self.item.organisation_id != self.organisation_id:
            raise ValidationError('Stock projection item must belong to the organisation.')


class ItemStockAdjustment(models.Model):
    STATUS_ACTIVE = 'active'
    STATUS_REVERSED = 'reversed'
    STATUS_CHOICES = [(STATUS_ACTIVE, 'Active'), (STATUS_REVERSED, 'Reversed')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name='item_stock_adjustments')
    outlet = models.ForeignKey(Outlet, on_delete=models.PROTECT, related_name='item_stock_adjustments')
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name='stock_adjustments')
    adjustment_date = models.DateField(db_index=True)
    direction = models.CharField(max_length=3, choices=ItemStockMovement.DIRECTION_CHOICES)
    quantity = models.DecimalField(max_digits=15, decimal_places=4)
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='created_item_stock_adjustments')
    created_at = models.DateTimeField(auto_now_add=True)
    reversed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='reversed_item_stock_adjustments')
    reversed_at = models.DateTimeField(null=True, blank=True)
    reversal_reason = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['-adjustment_date', '-created_at']
        constraints = [models.CheckConstraint(condition=models.Q(quantity__gt=0), name='item_stock_adjustment_qty_positive')]

    def clean(self):
        super().clean()
        if self.outlet_id and self.outlet.organisation_id != self.organisation_id:
            raise ValidationError('Stock adjustment outlet must belong to the organisation.')
        if self.item_id:
            if self.item.organisation_id != self.organisation_id:
                raise ValidationError('Stock adjustment item must belong to the organisation.')
            if self.item.item_type != Item.ITEM_TYPE_STOCK or self.item.inventory_tracking_mode != Item.TRACKING_QUANTITY:
                raise ValidationError('Only quantity-tracked stock items can be adjusted here.')

    def save(self, *args, **kwargs):
        if self.pk:
            previous = ItemStockAdjustment.objects.filter(pk=self.pk).first()
            if previous and not getattr(self, '_allow_reversal_transition', False):
                raise ValidationError('Stock adjustments are immutable. Reverse the adjustment instead.')
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('Stock adjustments cannot be deleted. Reverse the adjustment instead.')
