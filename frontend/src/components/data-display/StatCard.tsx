import React from 'react';
import { type LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  trend?: {
    value: string;
    isPositive: boolean;
  };
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon: Icon,
  description,
  trend,
}) => {
  return (
    <div className="stat-card">
      <div className="stat-card-header">
        <span className="stat-card-title">{title}</span>
        <div className="stat-card-icon-wrapper">
          <Icon className="stat-card-icon" size={20} />
        </div>
      </div>
      <div className="stat-card-body">
        <h3 className="stat-card-value">{value}</h3>
        {(trend || description) && (
          <div className="stat-card-footer">
            {trend && (
              <span className={`stat-card-trend ${trend.isPositive ? 'trend-up' : 'trend-down'}`}>
                {trend.isPositive ? '+' : ''}{trend.value}
              </span>
            )}
            {description && <span className="stat-card-desc">{description}</span>}
          </div>
        )}
      </div>
    </div>
  );
};
