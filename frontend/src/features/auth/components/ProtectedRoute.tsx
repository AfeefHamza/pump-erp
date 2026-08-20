import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { AuthLoadingScreen } from './AuthLoadingScreen';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requireAuth = true }) => {
  const { currentUser, authenticationStatus } = useAppSelector((state) => state.auth);
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const location = useLocation();

  if (authenticationStatus === 'unknown' || authenticationStatus === 'loading') {
    return <AuthLoadingScreen />;
  }

  if (requireAuth && authenticationStatus === 'unauthenticated') {
    // Save the current location they were trying to access
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const currentOrg = currentUser?.organisations.find((o) => o.id === selectedOrgId) || currentUser?.organisations[0];
  const isOnboardingPath = location.pathname === '/app/onboarding';

  if (authenticationStatus === 'authenticated') {
    if (currentOrg) {
      const isOwnerOrAdmin = currentOrg.membership_type === 'owner' || currentOrg.membership_type === 'administrator';
      const onboardingIncomplete = currentOrg.onboarding_status !== 'completed' || !currentOrg.outlets || currentOrg.outlets.length === 0;

      if (requireAuth) {
        if (onboardingIncomplete && isOwnerOrAdmin) {
          if (!isOnboardingPath) {
            return <Navigate to="/app/onboarding" replace />;
          }
        } else {
          if (isOnboardingPath) {
            return <Navigate to="/app/dashboard" replace />;
          }
        }
      } else {
        if (onboardingIncomplete && isOwnerOrAdmin) {
          return <Navigate to="/app/onboarding" replace />;
        } else {
          const fromPath = (location.state as { from?: { pathname?: string } | null } | null)?.from?.pathname;
          const safeRedirect = fromPath && fromPath.startsWith('/') && !fromPath.startsWith('//') ? fromPath : '/app/dashboard';
          return <Navigate to={safeRedirect} replace />;
        }
      }
    } else {
      if (!requireAuth) {
        const fromPath = (location.state as { from?: { pathname?: string } | null } | null)?.from?.pathname;
        const safeRedirect = fromPath && fromPath.startsWith('/') && !fromPath.startsWith('//') ? fromPath : '/app/dashboard';
        return <Navigate to={safeRedirect} replace />;
      }
    }
  }

  return <>{children}</>;
};
