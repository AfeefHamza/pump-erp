import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export const Breadcrumbs: React.FC = () => {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter((x) => x);

  const formatCrumb = (text: string) => {
    return text
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <nav className="breadcrumbs" aria-label="breadcrumb">
      <Link to="/" className="breadcrumb-item link">
        Dashboard
      </Link>
      {pathnames.map((name, index) => {
        const isLast = index === pathnames.length - 1;
        const routeTo = `/${pathnames.slice(0, index + 1).join('/')}`;
        const displayName = formatCrumb(name);

        // If the path is just dashboard (like /dashboard), we don't need to repeat it
        if (name.toLowerCase() === 'dashboard') {
          return null;
        }

        return (
          <React.Fragment key={routeTo}>
            <ChevronRight className="breadcrumb-separator" size={14} />
            {isLast ? (
              <span className="breadcrumb-item active">{displayName}</span>
            ) : (
              <Link to={routeTo} className="breadcrumb-item link">
                {displayName}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};
