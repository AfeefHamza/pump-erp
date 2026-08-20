# apps/organizations/selectors.py
from django.db import models
from django.contrib.auth import get_user_model
from .models import Organisation, Outlet, OrganisationMembership

User = get_user_model()

def organisations_for_user(user) -> models.QuerySet:
    """
    Returns a queryset of Organisations that the user belongs to with active memberships.
    """
    if not user.is_authenticated:
        return Organisation.objects.none()
    
    return Organisation.objects.filter(
        memberships__user=user,
        memberships__status=OrganisationMembership.STATUS_ACTIVE
    ).distinct()


def outlets_for_user_in_organisation(user, organisation: Organisation) -> models.QuerySet:
    """
    Returns the outlets accessible to a user within a specific organisation.
    - Owners and Administrators have full access to all outlets in the organisation.
    - Regular members only have access to outlets explicitly assigned to them via OutletAccess.
    - If the user has no active membership in the organisation, returns an empty queryset.
    """
    if not user.is_authenticated:
        return Outlet.objects.none()

    try:
        membership = OrganisationMembership.objects.get(
            user=user,
            organisation=organisation,
            status=OrganisationMembership.STATUS_ACTIVE
        )
    except OrganisationMembership.DoesNotExist:
        return Outlet.objects.none()

    if membership.membership_type in [OrganisationMembership.TYPE_OWNER, OrganisationMembership.TYPE_ADMINISTRATOR]:
        return Outlet.objects.filter(organisation=organisation)

    return Outlet.objects.filter(
        organisation=organisation,
        outlet_accesses__membership=membership
    ).distinct()


def active_owners_of_organisation(organisation: Organisation) -> models.QuerySet:
    """
    Returns a queryset of active User objects who are active owners of the given organisation.
    """
    return User.objects.filter(
        memberships__organisation=organisation,
        memberships__membership_type=OrganisationMembership.TYPE_OWNER,
        memberships__status=OrganisationMembership.STATUS_ACTIVE,
        is_active=True
    ).distinct()
