# apps/shifts/models.py
import uuid
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db.models.functions import Lower
from apps.organizations.models import Organisation, Outlet
from apps.employees.models import Employee, EmployeeDesignation
from apps.forecourt.models import Nozzle

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
    is_primary_cashier = models.BooleanField(default=False)
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
        if self.is_primary_cashier:
            # Enforce single primary cashier per roster
            ShiftStaffAssignment.objects.filter(
                roster=self.roster,
                is_primary_cashier=True
            ).exclude(id=self.id).update(is_primary_cashier=False)
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
