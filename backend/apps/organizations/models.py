# apps/organizations/models.py
import uuid
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError

class Organisation(models.Model):
    STATUS_TRIAL = 'trial'
    STATUS_ACTIVE = 'active'
    STATUS_SUSPENDED = 'suspended'
    STATUS_INACTIVE = 'inactive'
    
    STATUS_CHOICES = [
        (STATUS_TRIAL, 'Trial'),
        (STATUS_ACTIVE, 'Active'),
        (STATUS_SUSPENDED, 'Suspended'),
        (STATUS_INACTIVE, 'Inactive'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    legal_name = models.CharField(max_length=255, blank=True)
    code = models.CharField(max_length=50, unique=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_TRIAL
    )
    default_currency = models.CharField(max_length=3, default='INR')
    timezone = models.CharField(max_length=100, default='Asia/Kolkata')
    financial_year_start_month = models.PositiveSmallIntegerField(default=4)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.code})"


class Outlet(models.Model):
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
        related_name='outlets'
    )
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_ACTIVE
    )
    
    # Address and contact fields (all optional)
    address_line_1 = models.CharField(max_length=255, blank=True, null=True)
    address_line_2 = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    state = models.CharField(max_length=100, blank=True, null=True)
    postal_code = models.CharField(max_length=20, blank=True, null=True)
    phone_number = models.CharField(max_length=20, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['organisation', 'code'],
                name='unique_organisation_outlet_code'
            )
        ]
        indexes = [
            models.Index(fields=['organisation', 'code']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f"{self.name} - {self.organisation.name} ({self.code})"


class OrganisationMembership(models.Model):
    TYPE_OWNER = 'owner'
    TYPE_ADMINISTRATOR = 'administrator'
    TYPE_MEMBER = 'member'

    TYPE_CHOICES = [
        (TYPE_OWNER, 'Owner'),
        (TYPE_ADMINISTRATOR, 'Administrator'),
        (TYPE_MEMBER, 'Member'),
    ]

    STATUS_INVITED = 'invited'
    STATUS_ACTIVE = 'active'
    STATUS_SUSPENDED = 'suspended'

    STATUS_CHOICES = [
        (STATUS_INVITED, 'Invited'),
        (STATUS_ACTIVE, 'Active'),
        (STATUS_SUSPENDED, 'Suspended'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='memberships'
    )
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='memberships'
    )
    membership_type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_INVITED
    )
    joined_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'organisation'],
                name='unique_user_organisation_membership'
            )
        ]
        indexes = [
            models.Index(fields=['user', 'organisation']),
            models.Index(fields=['status']),
            models.Index(fields=['membership_type']),
        ]

    def __str__(self):
        return f"{self.user.email} in {self.organisation.name} ({self.membership_type})"


class OutletAccess(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    membership = models.ForeignKey(
        OrganisationMembership,
        on_delete=models.CASCADE,
        related_name='outlet_accesses'
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name='outlet_accesses'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['membership', 'outlet'],
                name='unique_membership_outlet_access'
            )
        ]
        indexes = [
            models.Index(fields=['membership', 'outlet']),
        ]

    def clean(self):
        super().clean()
        if hasattr(self, 'membership') and hasattr(self, 'outlet'):
            if self.membership.organisation_id != self.outlet.organisation_id:
                raise ValidationError("The outlet must belong to the same organisation as the membership.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.membership.user.email} -> {self.outlet.name}"
