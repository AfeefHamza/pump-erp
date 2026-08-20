import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  actionButton?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionButton,
}) => {
  return (
    <div className="empty-state">
      <div className="empty-state-icon-wrapper">
        <Inbox className="empty-state-icon" size={32} />
      </div>
      <h4 className="empty-state-title">{title}</h4>
      <p className="empty-state-description">{description}</p>
      {actionButton && <div className="empty-state-action">{actionButton}</div>}
    </div>
  );
};
