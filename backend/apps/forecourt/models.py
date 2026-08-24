# apps/forecourt/models.py
import uuid
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db.models.functions import Lower
from apps.organizations.models import Organisation, Outlet

class FuelProduct(models.Model):
    CATEGORY_PETROL = 'petrol'
    CATEGORY_DIESEL = 'diesel'
    CATEGORY_PREMIUM_PETROL = 'premium_petrol'
    CATEGORY_PREMIUM_DIESEL = 'premium_diesel'
    CATEGORY_CNG = 'cng'
    CATEGORY_ADBLUE = 'adblue'
    CATEGORY_OTHER = 'other'

    CATEGORY_CHOICES = [
        (CATEGORY_PETROL, 'Petrol'),
        (CATEGORY_DIESEL, 'Diesel'),
        (CATEGORY_PREMIUM_PETROL, 'Premium Petrol'),
        (CATEGORY_PREMIUM_DIESEL, 'Premium Diesel'),
        (CATEGORY_CNG, 'CNG'),
        (CATEGORY_ADBLUE, 'AdBlue'),
        (CATEGORY_OTHER, 'Other'),
    ]

    UNIT_LITRE = 'litre'
    UNIT_KILOGRAM = 'kilogram'

    UNIT_CHOICES = [
        (UNIT_LITRE, 'Litre'),
        (UNIT_KILOGRAM, 'Kilogram'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='fuel_products'
    )
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=255)
    short_name = models.CharField(max_length=100, blank=True, null=True)
    category = models.CharField(
        max_length=50,
        choices=CATEGORY_CHOICES,
        default=CATEGORY_PETROL
    )
    custom_category_name = models.CharField(max_length=255, blank=True, null=True)
    unit = models.CharField(
        max_length=20,
        choices=UNIT_CHOICES,
        default=UNIT_LITRE
    )
    display_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower('code'),
                'organisation',
                name='unique_organisation_fuel_product_code_case_insensitive'
            ),
            models.UniqueConstraint(
                Lower('name'),
                'organisation',
                name='unique_organisation_fuel_product_name_case_insensitive'
            )
        ]
        ordering = ['display_order', 'name']

    def clean(self):
        super().clean()
        if self.code:
            self.code = self.code.strip()
        if self.name:
            self.name = self.name.strip()
        if self.short_name == '':
            self.short_name = None
        if self.custom_category_name == '':
            self.custom_category_name = None
            
        if self.category == self.CATEGORY_OTHER and not self.custom_category_name:
            raise ValidationError({'custom_category_name': "Custom category name is required when category is 'other'."})
        if self.category != self.CATEGORY_OTHER and self.custom_category_name:
            self.custom_category_name = None

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.code})"


class ProductPrice(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='product_prices'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='product_prices'
    )
    product = models.ForeignKey(
        FuelProduct,
        on_delete=models.CASCADE,
        related_name='prices'
    )
    selling_price = models.DecimalField(max_digits=12, decimal_places=4)
    effective_from = models.DateTimeField()
    effective_to = models.DateTimeField(blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_prices'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-effective_from']

    def clean(self):
        super().clean()
        # Tenant consistency checks
        if hasattr(self, 'outlet') and self.outlet.organisation_id != self.organisation_id:
            raise ValidationError("The outlet must belong to the same organisation.")
        if hasattr(self, 'product') and self.product.organisation_id != self.organisation_id:
            raise ValidationError("The product must belong to the same organisation.")

        if self.selling_price is not None and self.selling_price <= 0:
            raise ValidationError({'selling_price': "Price must be greater than zero."})

        if self.effective_from and self.effective_to:
            if self.effective_to <= self.effective_from:
                raise ValidationError({'effective_to': "Effective to date must be after effective from date."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.product.name} @ {self.selling_price} (from {self.effective_from})"


class Tank(models.Model):
    STATUS_ACTIVE = 'active'
    STATUS_INACTIVE = 'inactive'
    STATUS_MAINTENANCE = 'maintenance'

    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_INACTIVE, 'Inactive'),
        (STATUS_MAINTENANCE, 'Maintenance'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='tanks'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='tanks'
    )
    product = models.ForeignKey(
        FuelProduct,
        on_delete=models.PROTECT,
        related_name='tanks'
    )
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=255)
    capacity = models.DecimalField(max_digits=12, decimal_places=4)
    safe_fill_capacity = models.DecimalField(max_digits=12, decimal_places=4, blank=True, null=True)
    dead_stock_level = models.DecimalField(max_digits=12, decimal_places=4, blank=True, null=True)
    low_stock_threshold = models.DecimalField(max_digits=12, decimal_places=4, blank=True, null=True)
    manufacturer = models.CharField(max_length=255, blank=True, null=True)
    serial_number = models.CharField(max_length=255, blank=True, null=True)
    commissioned_on = models.DateField(blank=True, null=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_ACTIVE
    )
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower('code'),
                'outlet',
                name='unique_outlet_tank_code_case_insensitive'
            )
        ]
        ordering = ['code']

    def clean(self):
        super().clean()
        # Tenant consistency checks
        if hasattr(self, 'outlet') and self.outlet.organisation_id != self.organisation_id:
            raise ValidationError("The outlet must belong to the same organisation.")
        if hasattr(self, 'product') and self.product.organisation_id != self.organisation_id:
            raise ValidationError("The product must belong to the same organisation.")

        if self.code:
            self.code = self.code.strip()
        if self.name:
            self.name = self.name.strip()
        if self.manufacturer == '':
            self.manufacturer = None
        if self.serial_number == '':
            self.serial_number = None
        if self.notes == '':
            self.notes = None

        if self.capacity is not None and self.capacity <= 0:
            raise ValidationError({'capacity': "Capacity must be greater than zero."})

        if self.safe_fill_capacity is not None and self.safe_fill_capacity > self.capacity:
            raise ValidationError({'safe_fill_capacity': "Safe-fill capacity cannot exceed physical capacity."})

        if self.dead_stock_level is not None and self.dead_stock_level > self.capacity:
            raise ValidationError({'dead_stock_level': "Dead-stock level cannot exceed capacity."})

        if self.low_stock_threshold is not None and self.low_stock_threshold > self.capacity:
            raise ValidationError({'low_stock_threshold': "Low-stock threshold cannot exceed capacity."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.nozzles.exists():
            raise ValidationError("Cannot delete a tank that has operational nozzle references.")
        super().delete(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.code}) - {self.product.name}"


class Dispenser(models.Model):
    STATUS_ACTIVE = 'active'
    STATUS_INACTIVE = 'inactive'
    STATUS_MAINTENANCE = 'maintenance'

    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_INACTIVE, 'Inactive'),
        (STATUS_MAINTENANCE, 'Maintenance'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='dispensers'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='dispensers'
    )
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=255)
    manufacturer = models.CharField(max_length=255, blank=True, null=True)
    model_number = models.CharField(max_length=255, blank=True, null=True)
    serial_number = models.CharField(max_length=255, blank=True, null=True)
    commissioned_on = models.DateField(blank=True, null=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_ACTIVE
    )
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower('code'),
                'outlet',
                name='unique_outlet_dispenser_code_case_insensitive'
            )
        ]
        ordering = ['code']

    def clean(self):
        super().clean()
        # Tenant consistency checks
        if hasattr(self, 'outlet') and self.outlet.organisation_id != self.organisation_id:
            raise ValidationError("The outlet must belong to the same organisation.")

        if self.code:
            self.code = self.code.strip()
        if self.name:
            self.name = self.name.strip()
        if self.manufacturer == '':
            self.manufacturer = None
        if self.model_number == '':
            self.model_number = None
        if self.serial_number == '':
            self.serial_number = None
        if self.notes == '':
            self.notes = None

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.nozzles.exists():
            raise ValidationError("Cannot delete a dispenser that has operational nozzle references.")
        super().delete(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.code})"


class Nozzle(models.Model):
    STATUS_ACTIVE = 'active'
    STATUS_INACTIVE = 'inactive'
    STATUS_MAINTENANCE = 'maintenance'

    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_INACTIVE, 'Inactive'),
        (STATUS_MAINTENANCE, 'Maintenance'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='nozzles'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='nozzles'
    )
    dispenser = models.ForeignKey(
        Dispenser,
        on_delete=models.CASCADE,
        related_name='nozzles'
    )
    tank = models.ForeignKey(
        Tank,
        on_delete=models.PROTECT,
        related_name='nozzles'
    )
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=255)
    nozzle_number = models.IntegerField(blank=True, null=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_ACTIVE
    )
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower('code'),
                'outlet',
                name='unique_outlet_nozzle_code_case_insensitive'
            )
        ]
        ordering = ['dispenser', 'code']

    def clean(self):
        super().clean()
        # Tenant/outlet consistency checks
        if hasattr(self, 'outlet') and self.outlet.organisation_id != self.organisation_id:
            raise ValidationError("The outlet must belong to the same organisation.")
        if hasattr(self, 'dispenser') and self.dispenser.outlet_id != self.outlet_id:
            raise ValidationError("The dispenser must belong to the same outlet.")
        if hasattr(self, 'tank') and self.tank.outlet_id != self.outlet_id:
            raise ValidationError("The tank must belong to the same outlet.")

        if self.code:
            self.code = self.code.strip()
        if self.name:
            self.name = self.name.strip()
        if self.notes == '':
            self.notes = None

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    @property
    def product(self) -> FuelProduct:
        return self.tank.product

    def __str__(self):
        return f"{self.name} ({self.code}) -> Tank: {self.tank.code} ({self.product.name})"
