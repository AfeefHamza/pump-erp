import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '@/app/store';
import { AuthLoadingScreen } from './AuthLoadingScreen';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requireAuth = true }) => {
  const { authenticationStatus } = useAppSelector((state) => state.auth);
  const location = useLocation();

  if (authenticationStatus === 'unknown' || authenticationStatus === 'loading') {
    return <AuthLoadingScreen />;
  }

  if (requireAuth && authenticationStatus === 'unauthenticated') {
    // Save the current location they were trying to access
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!requireAuth && authenticationStatus === 'authenticated') {
    // If they are authenticated but on a login/signup page, redirect to dashboard or safe destination
    const fromPath = (location.state as { from?: { pathname?: string } | null } | null)?.from?.pathname;
    const safeRedirect = fromPath && fromPath.startsWith('/') && !fromPath.startsWith('//') ? fromPath : '/app/dashboard';
    return <Navigate to={safeRedirect} replace />;
  }

  return <>{children}</>;
};
