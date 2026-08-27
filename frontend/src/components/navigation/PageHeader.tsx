import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  backLink?: {
    to: string;
    label: string;
  };
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions, backLink }) => {
  return (
    <div className="page-header">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {backLink && (
          <Link 
            to={backLink.to} 
            className="back-to-settings-link"
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px', 
              color: 'var(--color-accent)', 
              fontSize: '0.85rem', 
              fontWeight: 500,
              textDecoration: 'none',
              marginBottom: '6px',
            }}
          >
            <ArrowLeft size={14} />
            {backLink.label}
          </Link>
        )}
        <div className="page-header-text">
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
};
