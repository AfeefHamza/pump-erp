# apps/shifts/models.py
import uuid
from datetime import date
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
    effective_from = models.DateField(default=date(2020, 1, 1))
    effective_to = models.DateField(blank=True, null=True)
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
    is_locked = models.BooleanField(default=False)
    locked_at = models.DateTimeField(blank=True, null=True)
    locked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='locked_shifts'
    )
    lock_source = models.CharField(max_length=50, blank=True, null=True)
    actual_starts_at = models.DateTimeField(blank=True, null=True)
    actual_ends_at = models.DateTimeField(blank=True, null=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_shifts'
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
        if self.lock_source == '':
            self.lock_source = None

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    @property
    def shift_reconciliation_complete(self) -> bool:
        if hasattr(self, 'reconciliation'):
            return self.reconciliation.status == ShiftReconciliation.STATUS_RECONCILED
        return False

    def __str__(self):
        return f"Shift {self.shift_definition.name} ({self.business_date}) @ {self.outlet.name} [{self.status}]"


class EmployeeShiftCard(models.Model):
    STATUS_ACTIVE = 'active'
    STATUS_VOID = 'void'
    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_VOID, 'Void'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='shift_cards'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='shift_cards'
    )
    parent_shift = models.ForeignKey(
        OperationalShift,
        on_delete=models.CASCADE,
        related_name='employee_cards'
    )
    employee = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name='shift_cards'
    )
    sequence = models.PositiveIntegerField(default=1)
    actual_starts_at = models.DateTimeField(blank=True, null=True)
    actual_ends_at = models.DateTimeField(blank=True, null=True)
    mpd_slip_number = models.CharField(max_length=100, blank=True, null=True)
    mpd_slip_attachment = models.FileField(upload_to='mpd_slips/%Y/%m/', blank=True, null=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_ACTIVE
    )
    is_shortage_excess_acknowledged = models.BooleanField(default=False)
    shortage_excess_acknowledgement_note = models.TextField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_shift_cards'
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_shift_cards'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='voided_shift_cards'
    )
    voided_at = models.DateTimeField(blank=True, null=True)
    void_reason = models.TextField(blank=True, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['parent_shift', 'employee'],
                condition=models.Q(status='active'),
                name='unique_active_parent_shift_employee_card'
            )
        ]
        ordering = ['sequence', 'created_at']

    def clean(self):
        super().clean()
        if hasattr(self, 'outlet') and hasattr(self, 'organisation'):
            if self.outlet.organisation_id != self.organisation_id:
                raise ValidationError("Outlet must belong to the organisation.")
        if hasattr(self, 'parent_shift') and hasattr(self, 'outlet'):
            if self.parent_shift.outlet_id != self.outlet_id:
                raise ValidationError("Parent shift must belong to the same outlet.")
        if hasattr(self, 'employee') and hasattr(self, 'organisation'):
            if self.employee.organisation_id != self.organisation_id:
                raise ValidationError("Employee must belong to the organisation.")
        if self.notes == '':
            self.notes = None
        if self.shortage_excess_acknowledgement_note == '':
            self.shortage_excess_acknowledgement_note = None
        if self.void_reason == '':
            self.void_reason = None
        if self.status == self.STATUS_VOID and not self.void_reason:
            raise ValidationError({'void_reason': "A void reason is mandatory when voiding a Shift Card."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    @property
    def difference_amount(self):
        if hasattr(self, 'settlement') and self.settlement:
            return self.settlement.difference_amount
        return Decimal('0.00')

    @property
    def total_sale_amount(self):
        if hasattr(self, 'settlement') and self.settlement:
            return self.settlement.expected_sale_amount
        return Decimal('0.00')

    @property
    def total_collected_amount(self):
        if hasattr(self, 'settlement') and self.settlement:
            return self.settlement.total_accounted_amount
        return Decimal('0.00')

    @property
    def total_litres_sold(self):
        return sum((m.sale_quantity for m in self.meters.all()), Decimal('0.000'))

    def delete(self, *args, **kwargs):
        raise ValidationError("Shift Cards cannot be hard-deleted. Use void instead.")

    @property
    def completeness_status(self) -> str:
        # Complete if all assigned meters have closing readings, no unacknowledged conflict, and shortage/excess acknowledged if any
        meters = self.meters.all()
        if not meters.exists():
            return 'incomplete'
        for m in meters:
            if m.closing_reading is None:
                return 'incomplete'
            if m.continuity_status == 'conflict' and not m.is_conflict_acknowledged:
                return 'incomplete'
        # Check settlement difference
        if hasattr(self, 'settlement'):
            diff = self.settlement.difference_amount
            if diff != Decimal('0.00') and not self.is_shortage_excess_acknowledged:
                return 'incomplete'
        return 'complete'

    @property
    def balance_result(self) -> str:
        if hasattr(self, 'settlement'):
            return self.settlement.result
        return 'balanced'

    def __str__(self):
        return f"{self.employee.display_name} Shift Card ({self.parent_shift.shift_definition.name} - {self.parent_shift.business_date}) [{self.status}]"


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
    SOURCE_PREVIOUS_SHIFT_CARD = 'previous_shift_card'
    SOURCE_PREVIOUS_SHIFT = 'previous_shift_card'
    SOURCE_COMMISSIONING = 'commissioning'
    SOURCE_INITIAL_OPENING_BALANCE = 'initial_opening_balance'
    SOURCE_OPENING_BALANCE = 'initial_opening_balance'
    SOURCE_PHYSICAL_SLIP_MISSING_PREDECESSOR = 'physical_slip_missing_predecessor'
    SOURCE_APPROVED_CORRECTION = 'approved_correction'
    SOURCE_METER_RESET_OR_REPLACEMENT = 'meter_reset_or_replacement'
    SOURCE_MANUAL_EXCEPTION = 'manual_exception'
    SOURCE_CHOICES = [
        (SOURCE_PREVIOUS_SHIFT_CARD, 'Previous Shift Card'),
        ('previous_shift', 'Previous Shift'),
        (SOURCE_COMMISSIONING, 'Nozzle Commissioning'),
        (SOURCE_INITIAL_OPENING_BALANCE, 'Initial Opening Balance'),
        ('opening_balance', 'Opening Balance'),
        (SOURCE_PHYSICAL_SLIP_MISSING_PREDECESSOR, 'Physical Slip (Missing Predecessor)'),
        (SOURCE_APPROVED_CORRECTION, 'Approved Correction'),
        (SOURCE_METER_RESET_OR_REPLACEMENT, 'Meter Reset/Replacement'),
        (SOURCE_MANUAL_EXCEPTION, 'Manual Exception'),
    ]

    CONTINUITY_VALID = 'valid'
    CONTINUITY_AWAITING_PREDECESSOR = 'awaiting_predecessor'
    CONTINUITY_CONFLICT = 'conflict'
    CONTINUITY_EXCEPTION = 'exception'
    CONTINUITY_CHOICES = [
        (CONTINUITY_VALID, 'Valid'),
        (CONTINUITY_AWAITING_PREDECESSOR, 'Awaiting Predecessor'),
        (CONTINUITY_CONFLICT, 'Continuity Conflict'),
        (CONTINUITY_EXCEPTION, 'Manual Exception'),
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
    shift_card = models.ForeignKey(
        EmployeeShiftCard,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='meters'
    )
    nozzle = models.ForeignKey(
        Nozzle,
        on_delete=models.PROTECT,
        related_name='shift_meters'
    )
    tank = models.ForeignKey(
        'forecourt.Tank',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='shift_nozzle_meters'
    )
    product = models.ForeignKey(
        'forecourt.FuelProduct',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='shift_nozzle_meters'
    )
    staff_assignment = models.ForeignKey(
        OperationalShiftStaff,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='assigned_meters'
    )
    opening_reading = models.DecimalField(max_digits=15, decimal_places=3)
    expected_opening_reading = models.DecimalField(max_digits=15, decimal_places=3, null=True, blank=True)
    closing_reading = models.DecimalField(max_digits=15, decimal_places=3, blank=True, null=True)
    opening_source = models.CharField(
        max_length=50,
        choices=SOURCE_CHOICES,
        default=SOURCE_PREVIOUS_SHIFT
    )
    opening_source_reference = models.CharField(max_length=255, blank=True, null=True)
    continuity_status = models.CharField(
        max_length=30,
        choices=CONTINUITY_CHOICES,
        default=CONTINUITY_VALID
    )
    continuity_difference = models.DecimalField(max_digits=15, decimal_places=3, default=Decimal('0.000'))
    continuity_reason = models.TextField(blank=True, null=True)
    is_conflict_acknowledged = models.BooleanField(default=False)
    conflict_acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='acknowledged_meter_conflicts'
    )
    conflict_acknowledged_at = models.DateTimeField(null=True, blank=True)
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
        if not self.tank_id and self.nozzle_id:
            self.tank = self.nozzle.tank
        if not self.product_id and self.tank_id:
            self.product = self.tank.product
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
    business_date = models.DateField(db_index=True, null=True, blank=True)
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
        if not self.business_date and self.shift_id:
            self.business_date = self.shift.business_date
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


# =============================================================================
# Milestone 10: Customer Master, Credit Slips, Collections & Reconciliation
# =============================================================================

class Customer(models.Model):
    TYPE_INDIVIDUAL = 'individual'
    TYPE_BUSINESS = 'business'
    TYPE_GOVERNMENT = 'government'
    TYPE_OTHER = 'other'
    CUSTOMER_TYPE_CHOICES = [
        (TYPE_INDIVIDUAL, 'Individual'),
        (TYPE_BUSINESS, 'Business'),
        (TYPE_GOVERNMENT, 'Government'),
        (TYPE_OTHER, 'Other'),
    ]

    STATUS_ACTIVE = 'active'
    STATUS_INACTIVE = 'inactive'
    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_INACTIVE, 'Inactive'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='customers'
    )
    customer_code = models.CharField(max_length=50)
    display_name = models.CharField(max_length=255)
    customer_type = models.CharField(
        max_length=20,
        choices=CUSTOMER_TYPE_CHOICES,
        default=TYPE_BUSINESS
    )
    phone_number = models.CharField(max_length=50, blank=True, null=True)
    alternate_phone_number = models.CharField(max_length=50, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    billing_address = models.TextField(blank=True, null=True)
    GSTIN = models.CharField(max_length=15, blank=True, null=True)
    credit_limit = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'), blank=True, null=True)
    credit_days = models.PositiveIntegerField(default=0, blank=True, null=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_ACTIVE
    )
    notes = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_customers'
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_customers'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower('customer_code'),
                'organisation',
                name='unique_org_customer_code_case_insensitive'
            )
        ]
        ordering = ['display_name', 'customer_code']

    def clean(self):
        super().clean()
        if self.customer_code:
            self.customer_code = self.customer_code.strip()
        if self.display_name:
            self.display_name = self.display_name.strip()
        if self.phone_number == '':
            self.phone_number = None
        if self.alternate_phone_number == '':
            self.alternate_phone_number = None
        if self.email == '':
            self.email = None
        if self.billing_address == '':
            self.billing_address = None
        if self.notes == '':
            self.notes = None
        if self.GSTIN:
            self.GSTIN = self.GSTIN.strip().upper()
            if len(self.GSTIN) != 15:
                raise ValidationError({'GSTIN': "GSTIN must be exactly 15 characters."})
        else:
            self.GSTIN = None

        if self.credit_limit is not None and self.credit_limit < Decimal('0.00'):
            raise ValidationError({'credit_limit': "Credit limit cannot be negative."})
        if self.credit_days is not None and self.credit_days < 0:
            raise ValidationError({'credit_days': "Credit days cannot be negative."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.credit_slips.exists():
            raise ValidationError("Used customers cannot be deleted. Deactivate them instead.")
        super().delete(*args, **kwargs)

    def __str__(self):
        return f"{self.display_name} ({self.customer_code}) [{self.status}]"


class CustomerOutletAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name='outlet_assignments'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='customer_assignments'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['customer', 'outlet'],
                name='unique_customer_outlet_assignment'
            )
        ]

    def clean(self):
        super().clean()
        if hasattr(self, 'customer') and hasattr(self, 'outlet'):
            if self.customer.organisation_id != self.outlet.organisation_id:
                raise ValidationError("Customer and outlet must belong to the same organisation.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.customer.display_name} -> {self.outlet.name}"


class FuelCreditSlip(models.Model):
    STATUS_ACTIVE = 'active'
    STATUS_VOID = 'void'
    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_VOID, 'Void'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='credit_slips'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='credit_slips'
    )
    operational_shift = models.ForeignKey(
        OperationalShift,
        on_delete=models.CASCADE,
        related_name='credit_slips'
    )
    employee = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name='credit_slips'
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name='credit_slips'
    )
    slip_number = models.CharField(max_length=50)
    occurred_at = models.DateTimeField()
    nozzle = models.ForeignKey(
        Nozzle,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='credit_slips'
    )
    product = models.ForeignKey(
        FuelProduct,
        on_delete=models.PROTECT,
        related_name='credit_slips'
    )
    shift_card = models.ForeignKey(
        EmployeeShiftCard,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='credit_slips'
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=3)
    unit_price = models.DecimalField(max_digits=12, decimal_places=4)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    vehicle_number = models.CharField(max_length=50, blank=True, null=True)
    driver_name = models.CharField(max_length=255, blank=True, null=True)
    customer_reference = models.CharField(max_length=100, blank=True, null=True)
    physical_slip_number = models.CharField(max_length=100, blank=True, null=True)
    is_credit_limit_overridden = models.BooleanField(default=False)
    override_reason = models.CharField(max_length=255, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_ACTIVE
    )
    void_reason = models.TextField(blank=True, null=True)
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='voided_credit_slips'
    )
    voided_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_credit_slips'
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_credit_slips'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower('slip_number'),
                'outlet',
                name='unique_outlet_slip_number_case_insensitive'
            )
        ]
        ordering = ['-occurred_at', '-created_at']

    def clean(self):
        super().clean()
        if self.slip_number:
            self.slip_number = self.slip_number.strip()
        if self.vehicle_number == '':
            self.vehicle_number = None
        if self.driver_name == '':
            self.driver_name = None
        if self.customer_reference == '':
            self.customer_reference = None
        if self.physical_slip_number == '':
            self.physical_slip_number = None
        if self.notes == '':
            self.notes = None
        if self.void_reason == '':
            self.void_reason = None

        if hasattr(self, 'outlet') and hasattr(self, 'organisation'):
            if self.outlet.organisation_id != self.organisation_id:
                raise ValidationError("Outlet must belong to the organisation.")
        if hasattr(self, 'operational_shift') and hasattr(self, 'outlet'):
            if self.operational_shift.outlet_id != self.outlet_id:
                raise ValidationError("Shift must belong to the outlet.")
        if hasattr(self, 'customer') and hasattr(self, 'organisation'):
            if self.customer.organisation_id != self.organisation_id:
                raise ValidationError("Customer must belong to the organisation.")
        if hasattr(self, 'employee') and hasattr(self, 'organisation'):
            if self.employee.organisation_id != self.organisation_id:
                raise ValidationError("Employee must belong to the organisation.")
        if hasattr(self, 'product') and hasattr(self, 'organisation'):
            if self.product.organisation_id != self.organisation_id:
                raise ValidationError("Product must belong to the organisation.")

        if self.quantity is not None and self.quantity <= Decimal('0.000'):
            raise ValidationError({'quantity': "Quantity must be positive."})
        if self.unit_price is not None and self.unit_price <= Decimal('0.0000'):
            raise ValidationError({'unit_price': "Unit price must be positive."})
        if self.amount is not None and self.amount <= Decimal('0.00'):
            raise ValidationError({'amount': "Amount must be positive."})

        # Nozzle checks
        if self.nozzle:
            if self.nozzle.outlet_id != self.outlet_id:
                raise ValidationError({'nozzle': "Nozzle must belong to the same outlet."})
            if self.nozzle.tank.product_id != self.product_id:
                raise ValidationError({'nozzle': "Product must match nozzle product."})

        # Customer active check when creating
        if not self.pk and self.customer and self.customer.status != Customer.STATUS_ACTIVE:
            raise ValidationError({'customer': "Inactive customers cannot receive new credit slips."})

        # Void reason required if void
        if self.status == self.STATUS_VOID and not self.void_reason:
            raise ValidationError({'void_reason': "A void reason is mandatory when voiding a credit slip."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Credit slips cannot be hard-deleted. Use void instead.")

    def __str__(self):
        return f"Slip {self.slip_number} - {self.customer.display_name} - ₹{self.amount} ({self.status})"


class EmployeeShiftCollection(models.Model):
    METHOD_CASH = 'cash'
    METHOD_CARD = 'card'
    METHOD_UPI = 'upi'
    METHOD_FLEET_CARD = 'fleet_card'
    METHOD_CHOICES = [
        (METHOD_CASH, 'Cash'),
        (METHOD_CARD, 'Card'),
        (METHOD_UPI, 'UPI'),
        (METHOD_FLEET_CARD, 'Fleet Card'),
    ]

    STATUS_ACTIVE = 'active'
    STATUS_VOID = 'void'
    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_VOID, 'Void'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='shift_collections'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='shift_collections'
    )
    operational_shift = models.ForeignKey(
        OperationalShift,
        on_delete=models.CASCADE,
        related_name='collections'
    )
    shift_card = models.ForeignKey(
        EmployeeShiftCard,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='collections'
    )
    employee = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name='collections'
    )
    collection_method = models.CharField(max_length=20, choices=METHOD_CHOICES)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    occurred_at = models.DateTimeField()
    reference_number = models.CharField(max_length=100, blank=True, null=True)
    provider_name = models.CharField(max_length=100, blank=True, null=True)
    terminal_or_account_reference = models.CharField(max_length=100, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_ACTIVE
    )
    void_reason = models.TextField(blank=True, null=True)
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='voided_shift_collections'
    )
    voided_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_shift_collections'
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_shift_collections'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-occurred_at', '-created_at']

    def clean(self):
        super().clean()
        if self.reference_number:
            self.reference_number = self.reference_number.strip()
        if self.reference_number == '':
            self.reference_number = None
        if self.provider_name == '':
            self.provider_name = None
        if self.terminal_or_account_reference == '':
            self.terminal_or_account_reference = None
        if self.notes == '':
            self.notes = None
        if self.void_reason == '':
            self.void_reason = None

        if hasattr(self, 'outlet') and hasattr(self, 'organisation'):
            if self.outlet.organisation_id != self.organisation_id:
                raise ValidationError("Outlet must belong to the organisation.")
        if hasattr(self, 'operational_shift') and hasattr(self, 'outlet'):
            if self.operational_shift.outlet_id != self.outlet_id:
                raise ValidationError("Shift must belong to the outlet.")
        if hasattr(self, 'employee') and hasattr(self, 'organisation'):
            if self.employee.organisation_id != self.organisation_id:
                raise ValidationError("Employee must belong to the organisation.")

        if self.amount is not None and self.amount <= Decimal('0.00'):
            raise ValidationError({'amount': "Collection amount must be positive."})

        if self.status == self.STATUS_VOID and not self.void_reason:
            raise ValidationError({'void_reason': "A void reason is mandatory when voiding a collection."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Collection records cannot be hard-deleted. Use void instead.")

    def __str__(self):
        return f"{self.employee.display_name} - {self.collection_method.upper()} ₹{self.amount} ({self.status})"


class EmployeeCashDenomination(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    collection = models.ForeignKey(
        EmployeeShiftCollection,
        on_delete=models.CASCADE,
        related_name='denominations'
    )
    denomination_value = models.IntegerField()
    quantity = models.PositiveIntegerField()
    calculated_amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['collection', 'denomination_value'],
                name='unique_collection_denomination'
            )
        ]
        ordering = ['-denomination_value']

    def clean(self):
        super().clean()
        if self.denomination_value not in [500, 200, 100, 50, 20, 10, 5, 2, 1]:
            raise ValidationError({'denomination_value': f"Unsupported currency denomination: {self.denomination_value}."})
        if self.quantity is not None and self.quantity < 0:
            raise ValidationError({'quantity': "Denomination quantity cannot be negative."})
        self.calculated_amount = Decimal(self.denomination_value) * Decimal(self.quantity or 0)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"₹{self.denomination_value} x {self.quantity} = ₹{self.calculated_amount}"


class EmployeeShiftDeduction(models.Model):
    TYPE_CASH_EXPENSE = 'cash_expense'
    TYPE_APPROVED_DEDUCTION = 'approved_deduction'
    TYPE_OTHER_ADJUSTMENT = 'other_adjustment'
    TYPE_CHOICES = [
        (TYPE_CASH_EXPENSE, 'Cash Expense'),
        (TYPE_APPROVED_DEDUCTION, 'Approved Deduction'),
        (TYPE_OTHER_ADJUSTMENT, 'Other Adjustment'),
    ]

    DIRECTION_INCREASES = 'increases_accounted'
    DIRECTION_DECREASES = 'decreases_accounted'
    DIRECTION_CHOICES = [
        (DIRECTION_INCREASES, 'Increases Accounted Amount'),
        (DIRECTION_DECREASES, 'Decreases Accounted Amount'),
    ]

    APPROVAL_PENDING = 'pending'
    APPROVAL_APPROVED = 'approved'
    APPROVAL_REJECTED = 'rejected'
    APPROVAL_STATUS_CHOICES = [
        (APPROVAL_PENDING, 'Pending'),
        (APPROVAL_APPROVED, 'Approved'),
        (APPROVAL_REJECTED, 'Rejected'),
    ]

    STATUS_ACTIVE = 'active'
    STATUS_VOID = 'void'
    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_VOID, 'Void'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='shift_deductions'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='shift_deductions'
    )
    operational_shift = models.ForeignKey(
        OperationalShift,
        on_delete=models.CASCADE,
        related_name='deductions'
    )
    shift_card = models.ForeignKey(
        EmployeeShiftCard,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='deductions'
    )
    employee = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name='shift_deductions'
    )
    deduction_type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    direction = models.CharField(max_length=30, choices=DIRECTION_CHOICES)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    occurred_at = models.DateTimeField()
    description = models.TextField()
    payee = models.CharField(max_length=255, blank=True, null=True)
    reference_number = models.CharField(max_length=100, blank=True, null=True)
    approval_status = models.CharField(
        max_length=20,
        choices=APPROVAL_STATUS_CHOICES,
        default=APPROVAL_PENDING
    )
    approval_reason = models.TextField(blank=True, null=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_deductions'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, null=True)
    rejected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='rejected_deductions'
    )
    rejected_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_ACTIVE
    )
    void_reason = models.TextField(blank=True, null=True)
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='voided_deductions'
    )
    voided_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_deductions'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-occurred_at', '-created_at']

    def clean(self):
        super().clean()
        if self.payee == '':
            self.payee = None
        if self.reference_number == '':
            self.reference_number = None
        if self.approval_reason == '':
            self.approval_reason = None
        if self.rejection_reason == '':
            self.rejection_reason = None
        if self.void_reason == '':
            self.void_reason = None

        if hasattr(self, 'outlet') and hasattr(self, 'organisation'):
            if self.outlet.organisation_id != self.organisation_id:
                raise ValidationError("Outlet must belong to the organisation.")
        if hasattr(self, 'operational_shift') and hasattr(self, 'outlet'):
            if self.operational_shift.outlet_id != self.outlet_id:
                raise ValidationError("Shift must belong to the outlet.")
        if hasattr(self, 'employee') and hasattr(self, 'organisation'):
            if self.employee.organisation_id != self.organisation_id:
                raise ValidationError("Employee must belong to the organisation.")

        if self.amount is not None and self.amount <= Decimal('0.00'):
            raise ValidationError({'amount': "Amount must be positive."})

        if not self.description or not self.description.strip():
            raise ValidationError({'description': "Description is mandatory."})

        if self.approval_status == self.APPROVAL_APPROVED:
            if not self.approved_by:
                raise ValidationError({'approved_by': "Approved by is required when status is approved."})
            if not self.approval_reason or not self.approval_reason.strip():
                raise ValidationError({'approval_reason': "Approval reason is mandatory when approving."})

        if self.approval_status == self.APPROVAL_REJECTED:
            if not self.rejection_reason or not self.rejection_reason.strip():
                raise ValidationError({'rejection_reason': "Rejection reason is mandatory when rejecting."})

        if self.status == self.STATUS_VOID and not self.void_reason:
            raise ValidationError({'void_reason': "A void reason is mandatory when voiding an adjustment/deduction."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Deductions cannot be hard-deleted. Use void instead.")

    def __str__(self):
        return f"{self.deduction_type} - {self.direction} ₹{self.amount} ({self.employee.display_name})"


class EmployeeShiftSettlement(models.Model):
    RESULT_BALANCED = 'balanced'
    RESULT_SHORTAGE = 'shortage'
    RESULT_EXCESS = 'excess'
    RESULT_CHOICES = [
        (RESULT_BALANCED, 'Balanced'),
        (RESULT_SHORTAGE, 'Shortage'),
        (RESULT_EXCESS, 'Excess'),
    ]

    STATUS_PREPARING = 'preparing'
    STATUS_RECONCILED = 'reconciled'
    STATUS_CHOICES = [
        (STATUS_PREPARING, 'Preparing'),
        (STATUS_RECONCILED, 'Reconciled'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='employee_settlements'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='employee_settlements'
    )
    operational_shift = models.ForeignKey(
        OperationalShift,
        on_delete=models.CASCADE,
        related_name='settlements'
    )
    shift_card = models.OneToOneField(
        EmployeeShiftCard,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='settlement'
    )
    employee = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name='shift_settlements'
    )
    expected_sale_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    cash_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    card_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    upi_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    fleet_card_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    credit_slip_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    approved_increase_adjustments = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    approved_decrease_adjustments = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    total_accounted_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    difference_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    result = models.CharField(max_length=20, choices=RESULT_CHOICES, default=RESULT_BALANCED)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PREPARING)
    shortage_acknowledged = models.BooleanField(default=False)
    shortage_acknowledged_notes = models.TextField(blank=True, null=True)
    reconciled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reconciled_settlements'
    )
    reconciled_at = models.DateTimeField(null=True, blank=True)
    reconciliation_notes = models.TextField(blank=True, null=True)
    reopened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reopened_settlements'
    )
    reopened_at = models.DateTimeField(null=True, blank=True)
    reopen_reason = models.TextField(blank=True, null=True)
    version = models.IntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['operational_shift', 'employee'],
                name='unique_shift_employee_settlement'
            )
        ]
        ordering = ['employee__display_name']

    @property
    def shortage_amount(self) -> Decimal:
        if self.difference_amount < Decimal('0.00'):
            return abs(self.difference_amount)
        return Decimal('0.00')

    @property
    def excess_amount(self) -> Decimal:
        if self.difference_amount > Decimal('0.00'):
            return self.difference_amount
        return Decimal('0.00')

    def clean(self):
        super().clean()
        if self.reconciliation_notes == '':
            self.reconciliation_notes = None
        if self.reopen_reason == '':
            self.reopen_reason = None

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee.display_name} Settlement on {self.operational_shift} [{self.status}: {self.result}]"


class ShiftReconciliation(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_PARTIAL = 'partial'
    STATUS_RECONCILED = 'reconciled'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_PARTIAL, 'Partially Reconciled'),
        (STATUS_RECONCILED, 'Reconciled'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='shift_reconciliations'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='shift_reconciliations'
    )
    operational_shift = models.OneToOneField(
        OperationalShift,
        on_delete=models.CASCADE,
        related_name='reconciliation'
    )
    expected_sale_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    total_accounted_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    shortage_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    excess_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    net_difference_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    required_employee_count = models.IntegerField(default=0)
    reconciled_employee_count = models.IntegerField(default=0)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING
    )
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='completed_reconciliations'
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Shift Reconciliation for {self.operational_shift} [{self.status}]"


class CollectionAuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='collection_audit_logs'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='collection_audit_logs'
    )
    shift = models.ForeignKey(
        OperationalShift,
        on_delete=models.CASCADE,
        related_name='collection_audit_logs'
    )
    employee = models.ForeignKey(
        Employee,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='collection_audit_logs'
    )
    shift_card = models.ForeignKey(
        EmployeeShiftCard,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='collection_audit_logs'
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='collection_audit_logs'
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='collection_audits'
    )

    EVENT_COLLECTION_CREATED = 'collection_created'
    EVENT_COLLECTION_UPDATED = 'collection_updated'
    EVENT_COLLECTION_VOIDED = 'collection_voided'
    EVENT_CREDIT_SLIP_CREATED = 'credit_slip_created'
    EVENT_CREDIT_SLIP_UPDATED = 'credit_slip_updated'
    EVENT_CREDIT_SLIP_VOIDED = 'credit_slip_voided'
    EVENT_DEDUCTION_CREATED = 'deduction_created'
    EVENT_DEDUCTION_APPROVED = 'deduction_approved'
    EVENT_DEDUCTION_REJECTED = 'deduction_rejected'
    EVENT_DEDUCTION_VOIDED = 'deduction_voided'
    EVENT_CARD_CREATED = 'shift_card_created'
    EVENT_CARD_UPDATED = 'shift_card_updated'
    EVENT_CARD_VOIDED = 'shift_card_voided'
    EVENT_SHIFT_LOCKED = 'shift_locked'
    EVENT_SHIFT_UNLOCKED = 'shift_unlocked'
    EVENT_SETTLEMENT_RECONCILED = 'settlement_reconciled'
    EVENT_SETTLEMENT_REOPENED = 'settlement_reopened'
    EVENT_SHIFT_RECONCILIATION_COMPLETED = 'shift_reconciliation_completed'
    EVENT_SHIFT_RECONCILIATION_RETURNED = 'shift_reconciliation_returned'

    event_type = models.CharField(max_length=100)
    occurred_at = models.DateTimeField(auto_now_add=True)
    reason = models.TextField(blank=True, null=True)
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
        return f"CollectionAudit: {self.event_type} on {self.shift} at {self.occurred_at}"

