# apps/shifts/models.py
import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.db.models.functions import Lower
from decimal import Decimal
from apps.organizations.models import Organisation, Outlet
from apps.employees.models import Employee, EmployeeDesignation
from apps.forecourt.models import Nozzle, FuelProduct, Tank, Dispenser

class ShiftDefinition(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='shift_definitions'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='shift_definitions'
    )
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=255)
    starts_at = models.TimeField()
    ends_at = models.TimeField()
    crosses_midnight = models.BooleanField(default=False)
    display_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower('code'),
                'outlet',
                name='unique_outlet_shift_code_case_insensitive'
            ),
            models.UniqueConstraint(
                Lower('name'),
                'outlet',
                name='unique_outlet_shift_name_case_insensitive'
            )
        ]
        ordering = ['display_order', 'starts_at']

    def clean(self):
        super().clean()
        if self.code:
            self.code = self.code.strip()
        if self.name:
            self.name = self.name.strip()
        if self.notes == '':
            self.notes = None

        if hasattr(self, 'outlet') and self.outlet.organisation_id != self.organisation_id:
            raise ValidationError("The outlet must belong to the same organisation.")

        if self.starts_at and self.ends_at:
            if self.starts_at == self.ends_at:
                raise ValidationError("Start and end times cannot be equal (zero-duration shift).")
            
            # Automatically derive crosses_midnight
            if self.ends_at < self.starts_at:
                self.crosses_midnight = True
            else:
                self.crosses_midnight = False

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Shift definitions must be deactivated rather than deleted after use.")

    def __str__(self):
        return f"{self.name} ({self.code}) @ {self.outlet.name}"


class ShiftRoster(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='shift_rosters'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='shift_rosters'
    )
    shift_definition = models.ForeignKey(
        ShiftDefinition,
        on_delete=models.PROTECT,
        related_name='rosters'
    )
    business_date = models.DateField()
    is_locked = models.BooleanField(default=False)
    notes = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_rosters'
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_rosters'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['outlet', 'shift_definition', 'business_date'],
                name='unique_outlet_shift_business_date_roster'
            )
        ]
        ordering = ['-business_date', 'shift_definition__display_order']

    def clean(self):
        super().clean()
        if hasattr(self, 'outlet') and self.outlet.organisation_id != self.organisation_id:
            raise ValidationError("The outlet must belong to the same organisation.")
        if hasattr(self, 'shift_definition') and self.shift_definition.outlet_id != self.outlet_id:
            raise ValidationError("The shift definition must belong to the same outlet.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.outlet.name} - {self.shift_definition.name} - {self.business_date}"


class ShiftStaffAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    roster = models.ForeignKey(
        ShiftRoster,
        on_delete=models.CASCADE,
        related_name='staff_assignments'
    )
    employee = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name='roster_assignments'
    )
    duty_designation = models.ForeignKey(
        EmployeeDesignation,
        on_delete=models.PROTECT,
        related_name='roster_assignments'
    )
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['roster', 'employee'],
                name='unique_roster_employee_assignment'
            )
        ]

    def clean(self):
        super().clean()
        if hasattr(self, 'roster') and hasattr(self, 'employee'):
            if self.employee.organisation_id != self.roster.organisation_id:
                raise ValidationError("Employee and roster must belong to the same organisation.")
            
            # Employee must be active
            if self.employee.status != Employee.STATUS_ACTIVE:
                raise ValidationError({'employee': "Inactive employees cannot receive new shift assignments."})
            
            # Employee must be assigned to the roster's outlet
            if not self.employee.outlet_assignments.filter(outlet=self.roster.outlet).exists():
                raise ValidationError({'employee': "Employee must be assigned to the roster's outlet."})

        if hasattr(self, 'roster') and hasattr(self, 'duty_designation'):
            if self.duty_designation.organisation_id != self.roster.organisation_id:
                raise ValidationError("Duty designation must belong to the same organisation.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee.display_name} as {self.duty_designation.name} on {self.roster}"


class ShiftNozzleAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    staff_assignment = models.ForeignKey(
        ShiftStaffAssignment,
        on_delete=models.CASCADE,
        related_name='nozzle_assignments'
    )
    nozzle = models.ForeignKey(
        Nozzle,
        on_delete=models.PROTECT,
        related_name='roster_assignments'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Enforce that a nozzle is only assigned once in a roster
        # To do this, we can't easily do a Simple DB constraint on `roster` through `staff_assignment` directly,
        # but we can enforce it in clean() validation and store a helper unique key or do a custom validation.
        # Wait, we can define a clean method.
        pass

    def clean(self):
        super().clean()
        if hasattr(self, 'staff_assignment') and hasattr(self, 'nozzle'):
            roster = self.staff_assignment.roster
            # Nozzle must belong to the roster's outlet
            if self.nozzle.outlet_id != roster.outlet_id:
                raise ValidationError("Nozzle must belong to the same outlet as the roster.")
            
            # Nozzle must belong to the same organisation
            if self.nozzle.organisation_id != roster.organisation_id:
                raise ValidationError("Nozzle must belong to the same organisation.")

            # Nozzle must be active
            if self.nozzle.status != Nozzle.STATUS_ACTIVE:
                raise ValidationError("Assigned nozzle must be active.")

            # Verify that this nozzle is not already assigned to another staff in the same roster
            other_assignments = ShiftNozzleAssignment.objects.filter(
                staff_assignment__roster=roster,
                nozzle=self.nozzle
            )
            if self.id:
                other_assignments = other_assignments.exclude(id=self.id)
            if other_assignments.exists():
                raise ValidationError("This nozzle is already assigned to an employee in this roster.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nozzle.code} -> {self.staff_assignment.employee.display_name}"


class OperationalShift(models.Model):
    STATUS_OPEN = 'open'
    STATUS_CLOSED = 'closed'
    STATUS_CHOICES = [
        (STATUS_OPEN, 'Open'),
        (STATUS_CLOSED, 'Closed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='operational_shifts'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='operational_shifts'
    )
    shift_definition = models.ForeignKey(
        ShiftDefinition,
        on_delete=models.PROTECT,
        related_name='operational_shifts'
    )
    source_roster = models.ForeignKey(
        ShiftRoster,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='operational_shifts'
    )
    business_date = models.DateField()
    scheduled_starts_at = models.DateTimeField()
    scheduled_ends_at = models.DateTimeField()
    opened_at = models.DateTimeField()
    closed_at = models.DateTimeField(blank=True, null=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_OPEN
    )
    notes = models.TextField(blank=True, null=True)
    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='opened_shifts'
    )
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='closed_shifts'
    )
    reopened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reopened_shifts'
    )
    reopened_at = models.DateTimeField(blank=True, null=True)
    reopen_reason = models.TextField(blank=True, null=True)
    version = models.IntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['outlet', 'shift_definition', 'business_date'],
                name='unique_outlet_shift_definition_business_date'
            )
        ]
        ordering = ['-business_date', '-opened_at']

    def clean(self):
        super().clean()
        if hasattr(self, 'outlet') and self.outlet.organisation_id != self.organisation_id:
            raise ValidationError("Outlet must belong to the same organisation.")
        if hasattr(self, 'shift_definition') and self.shift_definition.outlet_id != self.outlet_id:
            raise ValidationError("Shift definition must belong to the same outlet.")
        if self.source_roster and self.source_roster.outlet_id != self.outlet_id:
            raise ValidationError("Source roster must belong to the same outlet.")
        if self.notes == '':
            self.notes = None
        if self.reopen_reason == '':
            self.reopen_reason = None

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Shift {self.shift_definition.name} ({self.business_date}) @ {self.outlet.name} [{self.status}]"


class OperationalShiftStaff(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shift = models.ForeignKey(
        OperationalShift,
        on_delete=models.CASCADE,
        related_name='staff_members'
    )
    source_employee = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name='operational_shift_assignments'
    )
    duty_designation = models.ForeignKey(
        EmployeeDesignation,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='operational_shift_assignments'
    )
    employee_code_snapshot = models.CharField(max_length=50)
    employee_name_snapshot = models.CharField(max_length=255)
    designation_snapshot = models.CharField(max_length=255)
    notes = models.TextField(blank=True, null=True)
    effective_from = models.DateTimeField(default=timezone.now)
    effective_to = models.DateTimeField(null=True, blank=True)
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='added_shift_staff'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['shift', 'source_employee'],
                name='unique_shift_employee_snapshot'
            )
        ]

    def clean(self):
        super().clean()
        if self.notes == '':
            self.notes = None
        if self.effective_to and self.effective_to < self.effective_from:
            raise ValidationError({'effective_to': "Effective to cannot precede effective from."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee_name_snapshot} ({self.designation_snapshot}) - {self.shift}"


class OperationalShiftNozzleAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shift = models.ForeignKey(
        OperationalShift,
        on_delete=models.CASCADE,
        related_name='nozzle_assignments'
    )
    shift_staff = models.ForeignKey(
        OperationalShiftStaff,
        on_delete=models.CASCADE,
        related_name='nozzle_assignments'
    )
    nozzle = models.ForeignKey(
        Nozzle,
        on_delete=models.PROTECT,
        related_name='operational_shift_assignments'
    )
    dispenser_name_snapshot = models.CharField(max_length=255)
    nozzle_name_snapshot = models.CharField(max_length=255)
    product = models.ForeignKey(
        FuelProduct,
        on_delete=models.PROTECT,
        related_name='shift_nozzle_assignments'
    )
    product_name_snapshot = models.CharField(max_length=255)
    effective_from = models.DateTimeField(default=timezone.now)
    effective_to = models.DateTimeField(null=True, blank=True)
    opening_reading = models.DecimalField(max_digits=15, decimal_places=3, null=True, blank=True)
    closing_reading = models.DecimalField(max_digits=15, decimal_places=3, null=True, blank=True)
    assignment_type = models.CharField(
        max_length=50,
        default='shift_start',
        choices=[
            ('shift_start', 'Shift Start'),
            ('handover', 'Handover Transfer'),
            ('midshift_activation', 'Mid-shift Activation'),
            ('correction', 'Assignment Correction')
        ]
    )
    reason = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_shift_nozzle_assignments'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['shift', 'nozzle'],
                condition=models.Q(effective_to__isnull=True),
                name='unique_active_shift_nozzle_assignment'
            )
        ]
        ordering = ['effective_from']

    def clean(self):
        super().clean()
        if hasattr(self, 'shift') and hasattr(self, 'shift_staff'):
            if self.shift_staff.shift_id != self.shift.id:
                raise ValidationError("Assigned staff must belong to this operational shift.")
        if hasattr(self, 'shift') and hasattr(self, 'nozzle'):
            if self.nozzle.outlet_id != self.shift.outlet_id:
                raise ValidationError("Assigned nozzle must belong to the shift's outlet.")
        if self.effective_to and self.effective_to < self.effective_from:
            raise ValidationError({'effective_to': "Effective to cannot precede effective from."})
        if self.closing_reading is not None and self.opening_reading is not None:
            if self.closing_reading < self.opening_reading:
                raise ValidationError({'closing_reading': "Closing reading cannot be lower than opening reading."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nozzle_name_snapshot} -> {self.shift_staff.employee_name_snapshot} ({self.effective_from} -> {self.effective_to or 'Active'})"



class ShiftNozzleMeter(models.Model):
    SOURCE_PREVIOUS_SHIFT = 'previous_shift'
    SOURCE_COMMISSIONING = 'commissioning'
    SOURCE_OPENING_BALANCE = 'opening_balance'
    SOURCE_MANUAL_EXCEPTION = 'manual_exception'
    SOURCE_CHOICES = [
        (SOURCE_PREVIOUS_SHIFT, 'Previous Shift'),
        (SOURCE_COMMISSIONING, 'Nozzle Commissioning'),
        (SOURCE_OPENING_BALANCE, 'Opening Balance'),
        (SOURCE_MANUAL_EXCEPTION, 'Manual Exception'),
    ]

    EXCEPTION_FIRST_TIME = 'first_time_setup_exception'
    EXCEPTION_REPLACED = 'new_or_replaced_meter'
    EXCEPTION_RESET = 'meter_reset'
    EXCEPTION_ROLLOVER = 'totalizer_rollover'
    EXCEPTION_CORRECTION = 'approved_correction'
    EXCEPTION_MIDSHIFT = 'midshift_activation'
    EXCEPTION_CHOICES = [
        (EXCEPTION_FIRST_TIME, 'First-time setup exception'),
        (EXCEPTION_REPLACED, 'New or replaced meter'),
        (EXCEPTION_RESET, 'Meter reset'),
        (EXCEPTION_ROLLOVER, 'Totalizer rollover'),
        (EXCEPTION_CORRECTION, 'Approved correction'),
        (EXCEPTION_MIDSHIFT, 'Mid-shift nozzle activation'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shift = models.ForeignKey(
        OperationalShift,
        on_delete=models.CASCADE,
        related_name='meters'
    )
    nozzle = models.ForeignKey(
        Nozzle,
        on_delete=models.PROTECT,
        related_name='shift_meters'
    )
    staff_assignment = models.ForeignKey(
        OperationalShiftStaff,
        on_delete=models.PROTECT,
        related_name='assigned_meters'
    )
    opening_reading = models.DecimalField(max_digits=15, decimal_places=3)
    closing_reading = models.DecimalField(max_digits=15, decimal_places=3, blank=True, null=True)
    opening_source = models.CharField(
        max_length=30,
        choices=SOURCE_CHOICES,
        default=SOURCE_PREVIOUS_SHIFT
    )
    opening_source_reference = models.CharField(max_length=255, blank=True, null=True)
    manual_exception_type = models.CharField(
        max_length=50,
        choices=EXCEPTION_CHOICES,
        blank=True,
        null=True
    )
    manual_exception_reason = models.TextField(blank=True, null=True)

    # Cached operational calculated totals
    gross_quantity = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal('0.000'))
    testing_quantity = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal('0.000'))
    sale_quantity = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal('0.000'))
    stock_depletion_quantity = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal('0.000'))

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['shift', 'nozzle'],
                name='unique_shift_nozzle_meter'
            )
        ]

    def clean(self):
        super().clean()
        if hasattr(self, 'shift') and hasattr(self, 'nozzle'):
            if self.nozzle.outlet_id != self.shift.outlet_id:
                raise ValidationError("Nozzle must belong to the shift's outlet.")
        if self.opening_reading is not None and self.opening_reading < 0:
            raise ValidationError({'opening_reading': "Opening reading cannot be negative."})
        if self.closing_reading is not None and self.closing_reading < 0:
            raise ValidationError({'closing_reading': "Closing reading cannot be negative."})
        if self.opening_source == self.SOURCE_MANUAL_EXCEPTION and not self.manual_exception_type:
            raise ValidationError({'manual_exception_type': "Manual exception type is required for manual opening readings."})
        if self.opening_source == self.SOURCE_MANUAL_EXCEPTION and not self.manual_exception_reason:
            raise ValidationError({'manual_exception_reason': "Reason is required for manual opening readings."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nozzle.code} Meter on {self.shift}"


class ShiftNozzlePriceSegment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shift_nozzle_meter = models.ForeignKey(
        ShiftNozzleMeter,
        on_delete=models.CASCADE,
        related_name='price_segments'
    )
    product = models.ForeignKey(
        FuelProduct,
        on_delete=models.PROTECT,
        related_name='shift_price_segments'
    )
    sequence = models.IntegerField(default=1)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField(blank=True, null=True)
    opening_reading = models.DecimalField(max_digits=15, decimal_places=3)
    closing_reading = models.DecimalField(max_digits=15, decimal_places=3, blank=True, null=True)
    unit_price = models.DecimalField(max_digits=12, decimal_places=4)

    # Segment calculations
    gross_quantity = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal('0.000'))
    testing_quantity = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal('0.000'))
    sale_quantity = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal('0.000'))
    sale_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))

    price_history_reference = models.ForeignKey(
        'forecourt.ProductPrice',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='shift_segments'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['shift_nozzle_meter', 'sequence'],
                name='unique_shift_meter_segment_sequence'
            )
        ]
        ordering = ['sequence']

    def clean(self):
        super().clean()
        if self.opening_reading is not None and self.opening_reading < 0:
            raise ValidationError({'opening_reading': "Opening reading cannot be negative."})
        if self.closing_reading is not None and self.closing_reading < 0:
            raise ValidationError({'closing_reading': "Closing reading cannot be negative."})
        if self.closing_reading is not None and self.opening_reading is not None:
            if self.closing_reading < self.opening_reading:
                raise ValidationError({'closing_reading': "Closing reading cannot be lower than opening reading for a price segment."})
        if self.unit_price is not None and self.unit_price <= 0:
            raise ValidationError({'unit_price': "Unit price must be greater than zero."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.shift_nozzle_meter.nozzle.code} Seg #{self.sequence} @ {self.unit_price}"


class ShiftMeterEvent(models.Model):
    EVENT_RESET = 'meter_reset'
    EVENT_REPLACEMENT = 'meter_replacement'
    EVENT_ROLLOVER = 'totalizer_rollover'
    EVENT_CORRECTION = 'approved_correction'
    EVENT_CHOICES = [
        (EVENT_RESET, 'Meter Reset'),
        (EVENT_REPLACEMENT, 'Meter Replacement'),
        (EVENT_ROLLOVER, 'Totalizer Rollover'),
        (EVENT_CORRECTION, 'Approved Correction'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shift_nozzle_meter = models.ForeignKey(
        ShiftNozzleMeter,
        on_delete=models.CASCADE,
        related_name='meter_events'
    )
    event_type = models.CharField(max_length=50, choices=EVENT_CHOICES)
    reading_before = models.DecimalField(max_digits=15, decimal_places=3)
    reading_after = models.DecimalField(max_digits=15, decimal_places=3)
    occurred_at = models.DateTimeField()
    reason = models.TextField()
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='recorded_meter_events'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def clean(self):
        super().clean()
        if not self.reason or not self.reason.strip():
            raise ValidationError({'reason': "Reason is mandatory for recording a meter event."})
        if self.reading_before is not None and self.reading_before < 0:
            raise ValidationError({'reading_before': "Reading before cannot be negative."})
        if self.reading_after is not None and self.reading_after < 0:
            raise ValidationError({'reading_after': "Reading after cannot be negative."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.event_type} on {self.shift_nozzle_meter.nozzle.code}: {self.reading_before} -> {self.reading_after}"


class ShiftTestingRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='shift_testing_records'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='shift_testing_records'
    )
    shift = models.ForeignKey(
        OperationalShift,
        on_delete=models.CASCADE,
        related_name='testing_records'
    )
    shift_nozzle_meter = models.ForeignKey(
        ShiftNozzleMeter,
        on_delete=models.CASCADE,
        related_name='testing_records'
    )
    price_segment = models.ForeignKey(
        ShiftNozzlePriceSegment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='testing_records'
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=3)
    returned_to_tank = models.BooleanField(default=True)
    destination_tank = models.ForeignKey(
        'forecourt.Tank',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='shift_testing_records'
    )
    occurred_at = models.DateTimeField()
    notes = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_shift_testing_records'
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='updated_shift_testing_records'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        super().clean()
        if hasattr(self, 'shift') and hasattr(self, 'outlet'):
            if self.shift.outlet_id != self.outlet_id:
                raise ValidationError("Shift must belong to the outlet.")
        if self.quantity is not None and self.quantity <= 0:
            raise ValidationError({'quantity': "Testing quantity must be greater than zero."})
        if self.returned_to_tank:
            if not self.destination_tank:
                raise ValidationError({'destination_tank': "Destination tank is required when testing is returned to tank."})
            if self.destination_tank.outlet_id != self.outlet_id:
                raise ValidationError({'destination_tank': "Destination tank must belong to the same outlet."})
            # Destination tank must store the same product as nozzle
            if hasattr(self, 'shift_nozzle_meter') and self.shift_nozzle_meter.nozzle:
                if self.destination_tank.product_id != self.shift_nozzle_meter.nozzle.tank.product_id:
                    raise ValidationError({'destination_tank': "Destination tank must store the same fuel product as the nozzle."})

        if self.notes == '':
            self.notes = None

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Testing {self.quantity}L on {self.shift_nozzle_meter.nozzle.code} ({'Returned' if self.returned_to_tank else 'Not returned'})"


class ShiftTankDipObservation(models.Model):
    OBS_OPENING = 'opening'
    OBS_CLOSING = 'closing'
    OBS_CHOICES = [
        (OBS_OPENING, 'Opening'),
        (OBS_CLOSING, 'Closing'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='shift_dip_observations'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='shift_dip_observations'
    )
    shift = models.ForeignKey(
        OperationalShift,
        on_delete=models.CASCADE,
        related_name='dip_observations'
    )
    tank = models.ForeignKey(
        'forecourt.Tank',
        on_delete=models.PROTECT,
        related_name='shift_dip_observations'
    )
    observation_type = models.CharField(max_length=20, choices=OBS_CHOICES)
    measured_at = models.DateTimeField()
    raw_dip_value = models.DecimalField(max_digits=12, decimal_places=4)
    raw_dip_unit = models.CharField(
        max_length=30,
        choices=[
            ('millimetre', 'Millimetre (mm)'),
            ('centimetre', 'Centimetre (cm)'),
            ('inch', 'Inch (in)'),
        ],
        default='millimetre'
    )
    converted_quantity = models.DecimalField(max_digits=12, decimal_places=4)
    calibration_assignment = models.ForeignKey(
        'operations.TankCalibrationAssignment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='shift_dip_observations'
    )
    calibration_chart = models.ForeignKey(
        'operations.DipCalibrationChart',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='shift_dip_observations'
    )
    conversion_method = models.CharField(max_length=50, default='linear_interpolation')
    density = models.DecimalField(max_digits=8, decimal_places=4, blank=True, null=True)
    manual_quantity_reason = models.TextField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='recorded_shift_dip_observations'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['shift', 'tank', 'observation_type'],
                name='unique_shift_tank_dip_observation'
            )
        ]

    def clean(self):
        super().clean()
        if hasattr(self, 'shift') and hasattr(self, 'tank'):
            if self.tank.outlet_id != self.shift.outlet_id:
                raise ValidationError("Tank must belong to the shift's outlet.")
        if self.raw_dip_value is not None and self.raw_dip_value < 0:
            raise ValidationError({'raw_dip_value': "Raw dip value cannot be negative."})
        if self.converted_quantity is not None and self.converted_quantity < 0:
            raise ValidationError({'converted_quantity': "Converted quantity cannot be negative."})
        if self.conversion_method == 'manual_quantity' and not self.manual_quantity_reason:
            raise ValidationError({'manual_quantity_reason': "Reason is mandatory when manual quantity is entered."})
        if self.notes == '':
            self.notes = None
        if self.manual_quantity_reason == '':
            self.manual_quantity_reason = None

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.observation_type.capitalize()} Dip {self.tank.name} on {self.shift}: {self.converted_quantity}L"


class ShiftActivityLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='shift_activity_logs'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='shift_activity_logs'
    )
    shift = models.ForeignKey(
        OperationalShift,
        on_delete=models.CASCADE,
        related_name='activity_logs'
    )
    event_type = models.CharField(max_length=100)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='shift_activity_logs'
    )
    occurred_at = models.DateTimeField(auto_now_add=True)
    reason = models.TextField(blank=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['occurred_at']

    def __str__(self):
        return f"{self.event_type} on {self.shift} at {self.occurred_at}"
