# apps/organizations/services.py
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError
from .models import Organisation, Outlet, OrganisationMembership, OutletAccess

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
    return Outlet.objects.create(
        organisation=organisation,
        name=name,
        code=code,
        status=kwargs.get('status', Outlet.STATUS_ACTIVE),
        address_line_1=kwargs.get('address_line_1', ''),
        address_line_2=kwargs.get('address_line_2', ''),
        city=kwargs.get('city', ''),
        district=kwargs.get('district', ''),
        state=kwargs.get('state', ''),
        postal_code=kwargs.get('postal_code', ''),
        phone_number=kwargs.get('phone_number', '')
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
