# apps/employees/models.py
import uuid
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db.models.functions import Lower
from apps.organizations.models import Organisation, Outlet

class EmployeeDesignation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='employee_designations'
    )
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    requires_nozzle_assignment = models.BooleanField(default=False)
    is_system = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    display_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower('code'),
                'organisation',
                name='unique_organisation_designation_code_case_insensitive'
            ),
            models.UniqueConstraint(
                Lower('name'),
                'organisation',
                name='unique_organisation_designation_name_case_insensitive'
            )
        ]
        ordering = ['display_order', 'name']

    def clean(self):
        super().clean()
        if self.code:
            self.code = self.code.strip()
        if self.name:
            self.name = self.name.strip()
        if self.description == '':
            self.description = None

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.is_system:
            raise ValidationError("System designations cannot be deleted.")
        super().delete(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.code})"


class Employee(models.Model):
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
        related_name='employees'
    )
    employee_code = models.CharField(max_length=50)
    display_name = models.CharField(max_length=255)
    phone_number = models.CharField(max_length=30, blank=True, null=True)
    alternate_phone_number = models.CharField(max_length=30, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    date_of_birth = models.DateField(blank=True, null=True)
    joined_on = models.DateField(blank=True, null=True)
    left_on = models.DateField(blank=True, null=True)
    designation = models.ForeignKey(
        EmployeeDesignation,
        on_delete=models.PROTECT,
        related_name='employees'
    )
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
        related_name='created_employees'
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_employees'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower('employee_code'),
                'organisation',
                name='unique_organisation_employee_code_case_insensitive'
            )
        ]
        ordering = ['display_name']

    def clean(self):
        super().clean()
        if self.employee_code:
            self.employee_code = self.employee_code.strip()
        if self.display_name:
            self.display_name = self.display_name.strip()
        if self.phone_number == '':
            self.phone_number = None
        if self.alternate_phone_number == '':
            self.alternate_phone_number = None
        if self.address == '':
            self.address = None
        if self.notes == '':
            self.notes = None

        if hasattr(self, 'designation') and self.designation.organisation_id != self.organisation_id:
            raise ValidationError({'designation': "The designation must belong to the same organisation."})

        if self.joined_on and self.left_on and self.left_on < self.joined_on:
            raise ValidationError({'left_on': "Leaving date cannot be before joining date."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Employees must be deactivated rather than permanently deleted after use.")

    def __str__(self):
        return f"{self.display_name} ({self.employee_code}) - {self.designation.name}"


class EmployeeOutletAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name='outlet_assignments'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='employee_assignments'
    )
    is_primary = models.BooleanField(default=False)
    effective_from = models.DateField(blank=True, null=True)
    effective_to = models.DateField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def clean(self):
        super().clean()
        if hasattr(self, 'employee') and hasattr(self, 'outlet'):
            if self.employee.organisation_id != self.outlet.organisation_id:
                raise ValidationError("Employee and outlet must belong to the same organisation.")
        
        if self.effective_from and self.effective_to and self.effective_to < self.effective_from:
            raise ValidationError({'effective_to': "Effective to date cannot be before effective from date."})

    def save(self, *args, **kwargs):
        self.full_clean()
        # Enforce single primary assignment if is_primary is True
        if self.is_primary:
            # Mark all other current primary assignments for this employee as false
            EmployeeOutletAssignment.objects.filter(
                employee=self.employee,
                is_primary=True
            ).exclude(id=self.id).update(is_primary=False)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee.display_name} @ {self.outlet.name} (Primary: {self.is_primary})"
