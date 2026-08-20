# apps/organizations/services.py
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError
from .models import Organisation, Outlet, OrganisationMembership, OutletAccess, FinancialYear

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
