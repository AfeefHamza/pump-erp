import React from 'react';

export type StatusType = 'pending' | 'success' | 'warning' | 'danger' | 'info' | 'active' | 'closed';

interface StatusBadgeProps {
  label: string;
  status: StatusType;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ label, status }) => {
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      {label}
    </span>
  );
};
