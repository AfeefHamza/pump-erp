import React from 'react';
import { Breadcrumbs } from './Breadcrumbs';
import { Menu, Search, Plus, Bell, CheckSquare } from 'lucide-react';

interface TopBarProps {
  setMobileOpen: (open: boolean) => void;
}

export const TopBar: React.FC<TopBarProps> = ({ setMobileOpen }) => {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button 
          className="menu-toggle-mobile" 
          onClick={() => setMobileOpen(true)}
          aria-label="Toggle mobile menu"
        >
          <Menu size={20} />
        </button>
        <Breadcrumbs />
      </div>

      <div className="topbar-right">
        {/* Search Placeholder */}
        <button className="search-btn" onClick={() => alert('Search is a placeholder')}>
          <Search size={14} />
          <span>Search...</span>
        </button>

        {/* Quick Create Placeholder */}
        <button className="quick-create-btn" onClick={() => alert('Quick Create is a placeholder')}>
          <Plus size={14} />
          <span>Quick Create</span>
        </button>

        {/* Approvals Indicator */}
        <button className="topbar-icon-btn" title="Pending Approvals" onClick={() => alert('Approvals dashboard is a placeholder')}>
          <CheckSquare size={18} />
          <span className="badge-dot" />
        </button>

        {/* Notifications */}
        <button className="topbar-icon-btn" title="Notifications" onClick={() => alert('Notifications panel is a placeholder')}>
          <Bell size={18} />
          <span className="badge-dot" />
        </button>

        {/* User Profile */}
        <div className="user-profile-trigger">
          <div className="avatar">DF</div>
          <div className="user-details">
            <span className="user-name">Demo Fueler</span>
            <span className="user-role">Super Admin</span>
          </div>
        </div>
      </div>
    </header>
  );
};
