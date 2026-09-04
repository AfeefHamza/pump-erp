# apps/organizations/services.py
import hashlib
import secrets
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from .models import (
    Organisation, Outlet, OrganisationMembership, OutletAccess, FinancialYear,
    PermissionDefinition, Role, RolePermission, MembershipRole,
    OrganisationUserActivation, ActivationRole, ActivationOutletAccess
)



@transaction.atomic
def create_organisation_with_owner(name: str, code: str, owner_user, **kwargs) -> Organisation:
    """
    Atomically creates an Organisation and registers the owner_user as its Owner.
    """
    # Create the organisation
    organisation = Organisation.objects.create(
        name=name,
        code=code,
        status=kwargs.get('status', Organisation.STATUS_TRIAL),
        legal_name=kwargs.get('legal_name', ''),
        default_currency=kwargs.get('default_currency', 'INR'),
        timezone=kwargs.get('timezone', 'Asia/Kolkata'),
        financial_year_start_month=kwargs.get('financial_year_start_month', 4)
    )
    
    # Create the owner membership
    OrganisationMembership.objects.create(
        user=owner_user,
        organisation=organisation,
        membership_type=OrganisationMembership.TYPE_OWNER,
        status=OrganisationMembership.STATUS_ACTIVE,
        joined_at=timezone.now()
    )

    # Create default roles
    create_default_roles_for_organisation(organisation)
    
    return organisation


def create_outlet(organisation: Organisation, name: str, code: str, **kwargs) -> Outlet:
    """
    Creates an Outlet belonging to an Organisation.
    """
    cleaned_kwargs = {}
    for key, val in kwargs.items():
        if val == "":
            val = None
        cleaned_kwargs[key] = val

    return Outlet.objects.create(
        organisation=organisation,
        name=name,
        code=code,
        status=cleaned_kwargs.get('status', Outlet.STATUS_ACTIVE),
        address_line_1=cleaned_kwargs.get('address_line_1'),
        address_line_2=cleaned_kwargs.get('address_line_2'),
        city=cleaned_kwargs.get('city'),
        district=cleaned_kwargs.get('district'),
        state=cleaned_kwargs.get('state'),
        postal_code=cleaned_kwargs.get('postal_code'),
        phone_number=cleaned_kwargs.get('phone_number'),
        outlet_type=cleaned_kwargs.get('outlet_type', 'fuel_station'),
        operating_brand_code=cleaned_kwargs.get('operating_brand_code'),
        operating_brand_name=cleaned_kwargs.get('operating_brand_name'),
        dealer_code=cleaned_kwargs.get('dealer_code'),
        email=cleaned_kwargs.get('email')
    )


def add_organisation_member(
    organisation: Organisation,
    user,
    membership_type: str,
    status: str = OrganisationMembership.STATUS_INVITED,
    **kwargs
) -> OrganisationMembership:
    """
    Adds a user to an organisation with a specific membership type.
    """
    joined_at = timezone.now() if status == OrganisationMembership.STATUS_ACTIVE else None
    return OrganisationMembership.objects.create(
        organisation=organisation,
        user=user,
        membership_type=membership_type,
        status=status,
        joined_at=joined_at
    )


def grant_outlet_access(membership: OrganisationMembership, outlet: Outlet) -> OutletAccess:
    """
    Grants a membership access to an outlet.
    Raises ValidationError if the outlet and the membership belong to different organisations.
    """
    if membership.organisation_id != outlet.organisation_id:
        raise ValidationError("The outlet must belong to the same organisation as the membership.")
    
    return OutletAccess.objects.create(
        membership=membership,
        outlet=outlet
    )


def revoke_outlet_access(membership: OrganisationMembership, outlet: Outlet) -> None:
    """
    Revokes access to an outlet for a given membership.
    """
    OutletAccess.objects.filter(membership=membership, outlet=outlet).delete()


@transaction.atomic
def complete_onboarding(
    user,
    organisation_id: str,
    org_data: dict,
    outlet_data: dict,
    fy_data: dict
) -> tuple[Organisation, Outlet, FinancialYear]:
    """
    Completes initial onboarding for an organisation, its first outlet, and default financial year.
    All operations run within a single atomic transaction.
    """
    # 1. Verify acting user is owner/administrator of the organisation
    try:
        membership = OrganisationMembership.objects.get(
            user=user,
            organisation_id=organisation_id,
            status=OrganisationMembership.STATUS_ACTIVE,
            membership_type__in=[OrganisationMembership.TYPE_OWNER, OrganisationMembership.TYPE_ADMINISTRATOR]
        )
    except OrganisationMembership.DoesNotExist:
        raise ValidationError("You do not have permission to onboard this organisation.")

    organisation = membership.organisation

    # 2. Update organisation profile fields
    for key, val in org_data.items():
        if val == "":
            val = None
        setattr(organisation, key, val)
    
    organisation.onboarding_status = 'completed'
    organisation.onboarding_completed_at = timezone.now()
    organisation.full_clean()
    organisation.save()

    # 3. Create or update first outlet safely
    outlet = organisation.outlets.order_by('created_at').first()
    if not outlet:
        outlet = Outlet(organisation=organisation)
    
    for key, val in outlet_data.items():
        if val == "":
            val = None
        setattr(outlet, key, val)
    
    outlet.full_clean()
    outlet.save()

    # 4. Create or update financial year safely
    financial_year = organisation.financial_years.order_by('created_at').first()
    if not financial_year:
        financial_year = FinancialYear(organisation=organisation)
    
    for key, val in fy_data.items():
        if val == "":
            val = None
        setattr(financial_year, key, val)
    
    financial_year.status = 'open'
    financial_year.is_default = True
    
    financial_year.full_clean()
    financial_year.save()

    return organisation, outlet, financial_year


@transaction.atomic
def create_default_roles_for_organisation(organisation) -> list[Role]:
    """
    Idempotently creates default system roles and maps active foundation permissions.
    """
    default_roles = [
        {
            'name': 'Administrator',
            'description': 'Full access to all foundation features.',
            'permissions': [
                'organisation.view', 'organisation.update',
                'outlet.view', 'outlet.create', 'outlet.update', 'outlet.deactivate',
                'financial_year.view', 'financial_year.update',
                'user.view', 'user.add', 'user.update', 'user.suspend',
                'role.view', 'role.create', 'role.update', 'role.delete',
                'settings.view', 'settings.update',
                'fuel_product.view', 'fuel_product.create', 'fuel_product.update', 'fuel_product.deactivate',
                'product_price.view', 'product_price.update',
                'tank.view', 'tank.create', 'tank.update', 'tank.deactivate',
                'dispenser.view', 'dispenser.create', 'dispenser.update', 'dispenser.deactivate',
                'nozzle.view', 'nozzle.create', 'nozzle.update', 'nozzle.deactivate',
                'employee.view', 'employee.create', 'employee.update', 'employee.deactivate',
                'employee_designation.view', 'employee_designation.create', 'employee_designation.update', 'employee_designation.deactivate',
                'shift_definition.view', 'shift_definition.create', 'shift_definition.update', 'shift_definition.deactivate',
                'shift_roster.view', 'shift_roster.create', 'shift_roster.update',
                'opening_balance.view', 'opening_balance.configure', 'opening_balance.confirm',
                'dip_calibration.view', 'dip_calibration.import', 'dip_calibration.update', 'dip_calibration.activate', 'dip_calibration.assign',
                'shift.view', 'shift.open', 'shift.update_open', 'shift.close', 'shift.reopen',
                'meter_reading.view', 'meter_reading.record', 'meter_reading.correct', 'meter_event.record',
                'testing.view', 'testing.record', 'testing.update', 'testing.delete',
                'dip_reading.view', 'dip_reading.record', 'dip_reading.correct',
            ]
        },
        {
            'name': 'Manager',
            'description': 'Manage daily operations, users, and settings.',
            'permissions': [
                'organisation.view',
                'outlet.view', 'outlet.create', 'outlet.update',
                'financial_year.view',
                'user.view',
                'role.view',
                'settings.view',
                'fuel_product.view', 'fuel_product.create', 'fuel_product.update',
                'product_price.view', 'product_price.update',
                'tank.view', 'tank.create', 'tank.update',
                'dispenser.view', 'dispenser.create', 'dispenser.update',
                'nozzle.view', 'nozzle.create', 'nozzle.update',
                'employee.view', 'employee.create', 'employee.update',
                'employee_designation.view', 'employee_designation.create', 'employee_designation.update',
                'shift_definition.view', 'shift_definition.create', 'shift_definition.update',
                'shift_roster.view', 'shift_roster.create', 'shift_roster.update',
                'opening_balance.view', 'opening_balance.configure', 'opening_balance.confirm',
                'dip_calibration.view', 'dip_calibration.import', 'dip_calibration.update', 'dip_calibration.activate', 'dip_calibration.assign',
                'shift.view', 'shift.open', 'shift.update_open', 'shift.close',
                'meter_reading.view', 'meter_reading.record', 'meter_reading.correct', 'meter_event.record',
                'testing.view', 'testing.record', 'testing.update', 'testing.delete',
                'dip_reading.view', 'dip_reading.record', 'dip_reading.correct',
            ]
        },
        {
            'name': 'Accountant',
            'description': 'Financial access and settings view.',
            'permissions': [
                'organisation.view',
                'outlet.view',
                'financial_year.view',
                'settings.view',
                'fuel_product.view',
                'product_price.view', 'product_price.update',
                'tank.view',
                'dispenser.view',
                'nozzle.view',
                'employee.view',
                'shift_definition.view',
                'shift_roster.view',
                'opening_balance.view', 'opening_balance.confirm',
                'dip_calibration.view',
                'shift.view',
                'meter_reading.view',
                'testing.view',
                'dip_reading.view',
            ]
        },
        {
            'name': 'Shift Operator',
            'description': 'Operational view access.',
            'permissions': [
                'organisation.view',
                'outlet.view',
                'fuel_product.view',
                'product_price.view',
                'tank.view',
                'dispenser.view',
                'nozzle.view',
                'employee.view',
                'shift_definition.view',
                'shift_roster.view',
                'dip_calibration.view',
                'opening_balance.view',
                'shift.view', 'shift.open', 'shift.update_open',
                'meter_reading.view', 'meter_reading.record',
                'testing.view', 'testing.record',
                'dip_reading.view', 'dip_reading.record',
            ]
        },
        {
            'name': 'Viewer',
            'description': 'Read-only access to foundation features.',
            'permissions': [
                'organisation.view',
                'outlet.view',
                'financial_year.view',
                'fuel_product.view',
                'product_price.view',
                'tank.view',
                'dispenser.view',
                'nozzle.view',
                'employee.view',
                'employee_designation.view',
                'shift_definition.view',
                'shift_roster.view',
                'opening_balance.view',
                'dip_calibration.view',
                'shift.view',
                'meter_reading.view',
                'testing.view',
                'dip_reading.view',
            ]
        }
    ]

    roles_created = []
    for dr in default_roles:
        role, created = Role.objects.get_or_create(
            organisation=organisation,
            name=dr['name'],
            defaults={
                'description': dr['description'],
                'is_system': True,
                'is_active': True
            }
        )
        
        # Sync permissions
        active_perms = PermissionDefinition.objects.filter(code__in=dr['permissions'], is_active=True)
        for perm in active_perms:
            RolePermission.objects.get_or_create(role=role, permission=perm)
            
        roles_created.append(role)
        
    return roles_created


@transaction.atomic
def add_user(
    organisation,
    email: str,
    display_name: str,
    phone_number: str | None,
    membership_type: str,
    role_ids: list,
    outlet_ids: list,
    invited_by
) -> tuple[OrganisationUserActivation, str]:
    """
    Creates a pending user activation and triggers console email.
    """
    email = email.strip().lower()

    # Prevent adding an existing active organisation member
    from django.contrib.auth import get_user_model
    User = get_user_model()
    if OrganisationMembership.objects.filter(
        organisation=organisation,
        user__email__iexact=email,
        status=OrganisationMembership.STATUS_ACTIVE
    ).exists():
        raise ValidationError("This user is already an active member of the organisation.")

    # Prevent duplicate pending activations for the same email and organisation.
    if OrganisationUserActivation.objects.filter(
        organisation=organisation,
        email=email,
        status=OrganisationUserActivation.STATUS_PENDING,
        expires_at__gt=timezone.now()
    ).exists():
        raise ValidationError("A pending activation for this email already exists in this organisation.")

    # Validate roles belong to organisation
    roles = Role.objects.filter(id__in=role_ids, organisation=organisation, is_active=True)
    if len(roles) != len(role_ids):
        raise ValidationError("One or more assigned roles are invalid, inactive, or belong to another organisation.")

    # Validate outlets belong to organisation
    outlets = Outlet.objects.filter(id__in=outlet_ids, organisation=organisation)
    if len(outlets) != len(outlet_ids):
        raise ValidationError("One or more assigned outlets are invalid or belong to another organisation.")

    # Generate token
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()

    expiry_days = 7
    expires_at = timezone.now() + timedelta(days=expiry_days)

    activation = OrganisationUserActivation.objects.create(
        organisation=organisation,
        email=email,
        display_name=display_name,
        phone_number=phone_number,
        membership_type=membership_type,
        invited_by=invited_by,
        status=OrganisationUserActivation.STATUS_PENDING,
        token_hash=token_hash,
        expires_at=expires_at
    )

    # Assign roles and outlets
    for role in roles:
        ActivationRole.objects.create(activation=activation, role=role)
    for outlet in outlets:
        ActivationOutletAccess.objects.create(activation=activation, outlet=outlet)

    # Trigger development email
    front_url = getattr(settings, 'FRONTEND_ACTIVATION_URL', 'http://localhost:5173/activate-account')
    activation_link = f"{front_url}?token={raw_token}"

    subject = f"Invitation to join {organisation.name}"
    message = (
        f"Hello {display_name},\n\n"
        f"You have been added to {organisation.name} by {invited_by.display_name or invited_by.email}.\n\n"
        f"Please activate your account by clicking the link below:\n"
        f"{activation_link}\n\n"
        f"This link will expire in {expiry_days} days."
    )
    send_mail(
        subject,
        message,
        settings.DEFAULT_FROM_EMAIL,
        [email],
        fail_silently=False,
    )

    return activation, raw_token


@transaction.atomic
def resend_or_replace_activation(activation_id, organisation, actor) -> tuple[OrganisationUserActivation, str]:
    """
    Resends or replaces an activation.
    """
    try:
        old_activation = OrganisationUserActivation.objects.get(
            id=activation_id,
            organisation=organisation
        )
    except OrganisationUserActivation.DoesNotExist:
        raise ValidationError("Activation record not found.")

    if old_activation.status == OrganisationUserActivation.STATUS_ACTIVATED:
        raise ValidationError("Account is already activated.")

    # Revoke old activation
    old_activation.status = OrganisationUserActivation.STATUS_REVOKED
    old_activation.save()

    # Re-add with same details
    role_ids = list(old_activation.roles.values_list('id', flat=True))
    outlet_ids = list(old_activation.outlets.values_list('id', flat=True))

    return add_user(
        organisation=organisation,
        email=old_activation.email,
        display_name=old_activation.display_name,
        phone_number=old_activation.phone_number,
        membership_type=old_activation.membership_type,
        role_ids=role_ids,
        outlet_ids=outlet_ids,
        invited_by=actor
    )


@transaction.atomic
def revoke_activation(activation_id, organisation, actor) -> OrganisationUserActivation:
    try:
        activation = OrganisationUserActivation.objects.get(
            id=activation_id,
            organisation=organisation
        )
    except OrganisationUserActivation.DoesNotExist:
        raise ValidationError("Activation record not found.")

    if activation.status != OrganisationUserActivation.STATUS_PENDING:
        raise ValidationError("Only pending activations can be revoked.")

    activation.status = OrganisationUserActivation.STATUS_REVOKED
    activation.save()
    return activation


@transaction.atomic
def activate_user(token: str, password: str | None = None, logged_in_user = None) -> tuple:
    """
    Activates a user using the raw token.
    Returns (user, membership) on success.
    """
    token_hash = hashlib.sha256(token.encode('utf-8')).hexdigest()
    try:
        activation = OrganisationUserActivation.objects.get(
            token_hash=token_hash
        )
    except OrganisationUserActivation.DoesNotExist:
        raise ValidationError("Invalid or expired activation token.")

    if activation.status != OrganisationUserActivation.STATUS_PENDING:
        raise ValidationError("This activation token is no longer valid.")

    if activation.expires_at < timezone.now():
        activation.status = OrganisationUserActivation.STATUS_EXPIRED
        activation.save()
        raise ValidationError("This activation token has expired.")

    from django.contrib.auth import get_user_model
    User = get_user_model()
    email = activation.email

    # Check if user already exists
    user_exists = User.objects.filter(email__iexact=email).exists()

    if user_exists:
        if not logged_in_user:
            raise ValidationError("An account with this email already exists. Please log in first to accept this invitation.")
        
        if logged_in_user.email.strip().lower() != email:
            raise ValidationError("The logged-in user email does not match the activation email.")
        
        user = logged_in_user
    else:
        if not password:
            raise ValidationError("Password is required for new users.")
        
        # Validate password
        temp_user = User(email=email, display_name=activation.display_name)
        validate_password(password, temp_user)
        
        # Create user
        user = User.objects.create_user(
            email=email,
            password=password,
            display_name=activation.display_name,
            phone_number=activation.phone_number
        )

    # Check if membership already exists (active or suspended)
    membership_qs = OrganisationMembership.objects.filter(
        organisation=activation.organisation,
        user=user
    )
    if membership_qs.filter(status=OrganisationMembership.STATUS_ACTIVE).exists():
        activation.status = OrganisationUserActivation.STATUS_ACTIVATED
        activation.activated_at = timezone.now()
        activation.save()
        return user, membership_qs.filter(status=OrganisationMembership.STATUS_ACTIVE).first()

    # Create/update membership to active
    membership, created = OrganisationMembership.objects.update_or_create(
        organisation=activation.organisation,
        user=user,
        defaults={
            'membership_type': activation.membership_type,
            'status': OrganisationMembership.STATUS_ACTIVE,
            'joined_at': timezone.now()
        }
    )

    # Assign roles
    for act_role in activation.activation_roles.all():
        MembershipRole.objects.get_or_create(
            membership=membership,
            role=act_role.role
        )

    # Assign outlet access
    for act_outlet in activation.activation_outlet_accesses.all():
        OutletAccess.objects.get_or_create(
            membership=membership,
            outlet=act_outlet.outlet
        )

    # Mark activation as activated
    activation.status = OrganisationUserActivation.STATUS_ACTIVATED
    activation.activated_at = timezone.now()
    activation.save()

    return user, membership


def check_last_owner_protection(membership):
    if membership.membership_type == OrganisationMembership.TYPE_OWNER and membership.status == OrganisationMembership.STATUS_ACTIVE:
        active_owners = OrganisationMembership.objects.filter(
            organisation=membership.organisation,
            membership_type=OrganisationMembership.TYPE_OWNER,
            status=OrganisationMembership.STATUS_ACTIVE
        )
        if active_owners.count() <= 1:
            raise ValidationError("This operation is not allowed because this user is the only active Owner of the organisation.")


@transaction.atomic
def update_membership_access(membership, role_ids: list, outlet_ids: list, actor) -> OrganisationMembership:
    """
    Updates a membership's role and outlet access assignments.
    """
    if membership.membership_type == OrganisationMembership.TYPE_OWNER and actor.memberships.filter(organisation=membership.organisation, membership_type=OrganisationMembership.TYPE_ADMINISTRATOR).exists():
        raise ValidationError("Administrators cannot modify Owners.")

    # Validate roles belong to organisation
    roles = Role.objects.filter(id__in=role_ids, organisation=membership.organisation, is_active=True)
    if len(roles) != len(role_ids):
        raise ValidationError("One or more assigned roles are invalid or belong to another organisation.")

    # Validate outlets belong to organisation
    outlets = Outlet.objects.filter(id__in=outlet_ids, organisation=membership.organisation)
    if len(outlets) != len(outlet_ids):
        raise ValidationError("One or more assigned outlets are invalid or belong to another organisation.")

    # Replace roles
    MembershipRole.objects.filter(membership=membership).delete()
    for role in roles:
        MembershipRole.objects.create(membership=membership, role=role)

    # Replace outlet accesses
    OutletAccess.objects.filter(membership=membership).delete()
    for outlet in outlets:
        OutletAccess.objects.create(membership=membership, outlet=outlet)

    return membership


@transaction.atomic
def suspend_membership(membership, actor) -> OrganisationMembership:
    check_last_owner_protection(membership)

    if membership.membership_type == OrganisationMembership.TYPE_OWNER and actor.memberships.filter(organisation=membership.organisation, membership_type=OrganisationMembership.TYPE_ADMINISTRATOR).exists():
        raise ValidationError("Administrators cannot suspend Owners.")

    if membership.user == actor:
        if membership.membership_type == OrganisationMembership.TYPE_OWNER:
            check_last_owner_protection(membership)

    membership.status = OrganisationMembership.STATUS_SUSPENDED
    membership.save()
    return membership


@transaction.atomic
def reactivate_membership(membership, actor) -> OrganisationMembership:
    if membership.membership_type == OrganisationMembership.TYPE_OWNER and actor.memberships.filter(organisation=membership.organisation, membership_type=OrganisationMembership.TYPE_ADMINISTRATOR).exists():
        raise ValidationError("Administrators cannot reactivate Owners.")

    membership.status = OrganisationMembership.STATUS_ACTIVE
    membership.save()
    return membership


@transaction.atomic
def update_outlet(outlet: Outlet, name: str | None = None, code: str | None = None, **kwargs) -> Outlet:
    """
    Updates an Outlet belonging to an Organisation.
    """
    if name is not None:
        outlet.name = name
    if code is not None:
        outlet.code = code

    # Update other fields
    for field in [
        'address_line_1', 'address_line_2', 'city', 'district', 'state', 'postal_code',
        'phone_number', 'outlet_type', 'operating_brand_code', 'operating_brand_name',
        'dealer_code', 'email'
    ]:
        if field in kwargs:
            val = kwargs[field]
            if val == "":
                val = None
            setattr(outlet, field, val)

    outlet.full_clean()
    outlet.save()
    return outlet


@transaction.atomic
def update_outlet_status(outlet: Outlet, status: str) -> Outlet:
    """
    Updates the status of an Outlet.
    """
    if status not in [Outlet.STATUS_ACTIVE, Outlet.STATUS_INACTIVE]:
        raise ValidationError("Invalid status value.")
    
    if status == Outlet.STATUS_INACTIVE:
        # Check critical business rule: cannot deactivate the only active outlet in the organisation
        active_count = Outlet.objects.filter(
            organisation=outlet.organisation,
            status=Outlet.STATUS_ACTIVE
        ).count()
        if active_count <= 1:
            raise ValidationError("Cannot deactivate the only active outlet in the organisation.")

    outlet.status = status
    outlet.full_clean()
    outlet.save()
    return outlet

