import React, { useState, useRef, useEffect } from 'react';
import { Breadcrumbs } from './Breadcrumbs';
import { Menu, Search, Plus, Bell, CheckSquare, LogOut, ChevronDown } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/app/store';
import { logout } from '@/features/auth/authSlice';
import { useNavigate } from 'react-router-dom';

interface TopBarProps {
  setMobileOpen: (open: boolean) => void;
}

export const TopBar: React.FC<TopBarProps> = ({ setMobileOpen }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { currentUser } = useAppSelector((state) => state.auth);
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentOrg = currentUser?.organisations.find(org => org.id === selectedOrgId);
  const roleMap: Record<string, string> = {
    owner: 'Owner',
    administrator: 'Administrator',
    member: 'Member',
  };
  const roleLabel = currentOrg ? roleMap[currentOrg.membership_type] || 'Member' : 'Member';

  const displayName = currentUser?.display_name || currentUser?.email || 'User';
  const avatarInitials = displayName
    .split(' ')
    .filter(Boolean)
    .map(name => name[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'U';

  const handleLogout = async () => {
    await dispatch(logout());
    navigate('/login');
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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
        <div 
          className="user-profile-trigger" 
          onClick={() => setDropdownOpen(!dropdownOpen)}
          ref={dropdownRef}
          style={{ 
            position: 'relative', 
            cursor: 'pointer', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            userSelect: 'none'
          }}
        >
          <div className="avatar">{avatarInitials}</div>
          <div className="user-details">
            <span className="user-name">{displayName}</span>
            <span className="user-role">{roleLabel}</span>
          </div>
          <ChevronDown size={14} style={{ opacity: 0.7 }} />

          {dropdownOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '12px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              width: '160px',
              zIndex: 1000,
              overflow: 'hidden',
            }}>
              <button
                onClick={handleLogout}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 14px',
                  border: 'none',
                  background: 'none',
                  color: 'var(--color-danger-text)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                }}
              >
                <LogOut size={14} />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
