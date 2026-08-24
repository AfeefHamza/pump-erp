import { useAppSelector } from '@/app/store';

/**
 * Checks if the current authenticated user has the specified functional permission in the selected organisation.
 * Owners implicitly receive full effective access.
 */
export function usePermission(permissionCode: string): boolean {
  const { permissions, loading } = useAppSelector((state) => state.permissions);
  const currentUser = useAppSelector((state) => state.auth.currentUser);
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);

  if (!currentUser || !selectedOrgId) return false;
  if (loading) return false; // Do not show actions during permissions loading

  const org = currentUser.organisations?.find((o) => o.id === selectedOrgId);
  if (!org) return false;

  // Owners implicitly receive every active permission
  if (org.membership_type === 'owner') {
    return true;
  }

  return permissions.includes(permissionCode);
}

/**
 * Checks if the current authenticated user can access the specified outlet.
 * Owners and Administrators have full access. Members see only explicitly assigned outlets.
 */
export function useOutletAccess(outletId: string): boolean {
  const currentUser = useAppSelector((state) => state.auth.currentUser);
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);

  if (!currentUser || !selectedOrgId || !outletId) return false;

  const org = currentUser.organisations?.find((o) => o.id === selectedOrgId);
  if (!org) return false;

  // Owners and Administrators have full access
  if (org.membership_type === 'owner' || org.membership_type === 'administrator') {
    return true;
  }

  // Members see only explicitly assigned outlets
  return org.outlets?.some((o) => o.id === outletId) || false;
}
