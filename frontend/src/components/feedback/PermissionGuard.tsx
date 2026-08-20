import React from 'react';

interface PermissionGuardProps {
  children: React.ReactNode;
  allowedPermissions: string[];
  fallback?: React.ReactNode;
}

export const PermissionGuard: React.FC<PermissionGuardProps> = ({
  children,
  allowedPermissions,
  fallback = null,
}) => {
  // Placeholder permission logic: allows all checks by default during foundation stage
  const hasPermission = allowedPermissions.length >= 0; 

  if (!hasPermission) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
