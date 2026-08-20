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
    legal_name = models.CharField(max_length=255, blank=True, null=True)
    code = models.CharField(max_length=50, unique=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_TRIAL
    )
    default_currency = models.CharField(max_length=3, default='INR')
    timezone = models.CharField(max_length=100, default='Asia/Kolkata')
    financial_year_start_month = models.PositiveSmallIntegerField(default=4)
    
    # Optional business-profile fields
    trade_name = models.CharField(max_length=255, blank=True, null=True)
    phone_number = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    gstin = models.CharField(max_length=15, blank=True, null=True)
    pan = models.CharField(max_length=10, blank=True, null=True)
    address_line_1 = models.CharField(max_length=255, blank=True, null=True)
    address_line_2 = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    state = models.CharField(max_length=100, blank=True, null=True)
    postal_code = models.CharField(max_length=20, blank=True, null=True)
    
    onboarding_status = models.CharField(
        max_length=20,
        choices=[
            ('not_started', 'Not Started'),
            ('in_progress', 'In Progress'),
            ('completed', 'Completed'),
        ],
        default='not_started'
    )
    onboarding_completed_at = models.DateTimeField(blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        super().clean()
        # Normalize blank optional values consistently to None
        optional_fields = [
            'legal_name', 'trade_name', 'phone_number', 'email', 'gstin', 'pan',
            'address_line_1', 'address_line_2', 'city', 'district', 'state', 'postal_code'
        ]
        for field in optional_fields:
            val = getattr(self, field, None)
            if val == '':
                setattr(self, field, None)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

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

    # Extended outlet fields
    outlet_type = models.CharField(
        max_length=50,
        choices=[
            ('fuel_station', 'Fuel Station'),
            ('fuel_and_ev', 'Fuel & EV Station'),
            ('ev_station', 'EV Station'),
            ('other', 'Other'),
        ],
        default='fuel_station'
    )
    operating_brand_code = models.CharField(max_length=50, blank=True, null=True)
    operating_brand_name = models.CharField(max_length=255, blank=True, null=True)
    dealer_code = models.CharField(max_length=50, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)

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

    def clean(self):
        super().clean()
        # Normalize blank optional values consistently to None
        optional_fields = [
            'address_line_1', 'address_line_2', 'city', 'district', 'state', 'postal_code',
            'phone_number', 'operating_brand_code', 'operating_brand_name', 'dealer_code', 'email'
        ]
        for field in optional_fields:
            val = getattr(self, field, None)
            if val == '':
                setattr(self, field, None)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

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


class FinancialYear(models.Model):
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
        related_name='financial_years'
    )
    name = models.CharField(max_length=50)
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_OPEN
    )
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-start_date']

    def clean(self):
        super().clean()
        if not self.start_date or not self.end_date:
            return

        if self.end_date <= self.start_date:
            raise ValidationError({"end_date": "End date must be after start date."})

        # Non-overlapping financial years for the same organisation
        overlapping = FinancialYear.objects.filter(
            organisation=self.organisation,
            start_date__lt=self.end_date,
            end_date__gt=self.start_date
        )
        if self.pk:
            overlapping = overlapping.exclude(pk=self.pk)
        
        if overlapping.exists():
            raise ValidationError("Financial years for the same organisation must not overlap.")

        # Only one default financial year per organisation
        if self.is_default:
            defaults = FinancialYear.objects.filter(
                organisation=self.organisation,
                is_default=True
            )
            if self.pk:
                defaults = defaults.exclude(pk=self.pk)
            
            if defaults.exists():
                raise ValidationError("Only one default financial year may exist per organisation.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.start_date} to {self.end_date})"
