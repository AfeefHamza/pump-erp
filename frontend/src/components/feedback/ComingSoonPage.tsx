import React from 'react';
import { Construction } from 'lucide-react';

interface ComingSoonPageProps {
  title: string;
}

export const ComingSoonPage: React.FC<ComingSoonPageProps> = ({ title }) => {
  return (
    <div className="coming-soon-container">
      <div className="coming-soon-card">
        <div className="coming-soon-icon-wrapper">
          <Construction className="coming-soon-icon" size={48} />
        </div>
        <h1 className="coming-soon-title">{title}</h1>
        <p className="coming-soon-message">
          The {title} module is currently under development. This screen serves as a functional placeholder for the platform's foundation.
        </p>
        <div className="coming-soon-badge">Postponed for ERP Phase</div>
      </div>
    </div>
  );
};
