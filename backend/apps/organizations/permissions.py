# apps/organizations/permissions.py
from django.core.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission
from .models import OrganisationMembership, OutletAccess, PermissionDefinition

def permissions_for_membership(membership) -> set[str]:
    """
    Returns a set of active permission codes for a given membership.
    - Suspended or pending (invited) memberships receive no permissions.
    - Owners receive all active system permissions.
    - Administrators and members receive functional permissions from their active roles.
    """
    if not membership or membership.status != OrganisationMembership.STATUS_ACTIVE:
        return set()

    # Active system permissions in the database
    active_permissions = set(
        PermissionDefinition.objects.filter(is_active=True).values_list('code', flat=True)
    )

    if membership.membership_type == OrganisationMembership.TYPE_OWNER:
        return active_permissions

    # Administrators and Members get permissions from their assigned active roles
    # Note: Suspended and pending memberships receive no permissions (checked above)
    role_permissions = set(
        PermissionDefinition.objects.filter(
            is_active=True,
            roles__membership_roles__membership=membership,
            roles__is_active=True
        ).values_list('code', flat=True)
    )
    return role_permissions

def can_access_outlet(membership, outlet) -> bool:
    """
    Checks if a membership is permitted to access a specific outlet.
    - Outlet and membership must belong to the same organisation.
    - Owners and Administrators receive full access to all outlets.
    - Members only see explicitly assigned outlets.
    """
    if not membership or not outlet:
        return False

    if membership.organisation_id != outlet.organisation_id:
        return False

    if membership.status != OrganisationMembership.STATUS_ACTIVE:
        return False

    if membership.membership_type in [
        OrganisationMembership.TYPE_OWNER,
        OrganisationMembership.TYPE_ADMINISTRATOR
    ]:
        return True

    return OutletAccess.objects.filter(membership=membership, outlet=outlet).exists()

def has_permission(user, organisation, permission_code: str, outlet=None) -> bool:
    """
    Evaluates if user has the specified permission in the organisation.
    Optionally scopes down to check outlet access if outlet is provided.
    """
    if not user or not user.is_authenticated or not user.is_active:
        return False

    if not organisation:
        return False

    try:
        membership = OrganisationMembership.objects.get(
            user=user,
            organisation=organisation,
            status=OrganisationMembership.STATUS_ACTIVE
        )
    except OrganisationMembership.DoesNotExist:
        return False

    # Check permission code
    if permission_code not in permissions_for_membership(membership):
        return False

    # If checking outlet access
    if outlet is not None:
        return can_access_outlet(membership, outlet)

    return True

def require_permission(user, organisation, permission_code: str, outlet=None):
    """
    Raises PermissionDenied if the user lacks the permission.
    """
    if not has_permission(user, organisation, permission_code, outlet=outlet):
        raise PermissionDenied("You do not have permission to perform this action.")

class HasGranularPermission(BasePermission):
    """
    DRF permission class for checking permissions.
    Expects view.kwargs.get('org_id') to retrieve organisation context.
    Usage in View:
        permission_classes = [IsAuthenticated, HasGranularPermission]
        required_permission = 'outlet.view'
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        required_permission = getattr(view, 'required_permission', None)
        if not required_permission:
            # If no permission is specified on the view, default to allow if authenticated
            return True

        org_id = view.kwargs.get('org_id')
        if not org_id:
            org_id = request.query_params.get('org_id')
        if not org_id:
            org_id = request.data.get('org_id') or request.data.get('organisation_id')

        if not org_id:
            return False

        outlet_id = view.kwargs.get('outlet_id')
        outlet = None
        if outlet_id:
            from .models import Outlet
            try:
                outlet = Outlet.objects.get(id=outlet_id, organisation_id=org_id)
            except Outlet.DoesNotExist:
                return False

        return has_permission(request.user, org_id, required_permission, outlet=outlet)
