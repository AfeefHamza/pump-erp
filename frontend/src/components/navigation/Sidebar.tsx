import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector, toggleSidebar } from '@/app/store';
import { OrganisationSelector } from './OrganisationSelector';
import { OutletSelector } from './OutletSelector';
import { navigationMenu, standaloneItems, dashboardItem } from '@/lib/navigationConfig';
import { ChevronLeft, ChevronRight, ChevronDown, Fuel } from 'lucide-react';

interface SidebarProps {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, setMobileOpen }) => {
  const dispatch = useAppDispatch();
  const sidebarExpanded = useAppSelector((state) => state.ui.sidebarExpanded);
  const location = useLocation();
  const navigate = useNavigate();
  const DashboardIcon = dashboardItem.icon;

  // Manage accordion section state
  const [expandedSection, setExpandedSection] = useState<string | null>('OPERATIONS');

  const handleToggleSection = (sectionTitle: string) => {
    setExpandedSection(prev => prev === sectionTitle ? null : sectionTitle);
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  return (
    <>
      <aside className={`sidebar ${sidebarExpanded ? '' : 'collapsed'} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo" style={{ cursor: 'pointer' }} onClick={() => handleNavigate('/')}>
            <Fuel className="sidebar-logo-icon" size={24} />
            {sidebarExpanded && <span>Pump ERP</span>}
          </div>
          <button 
            className="sidebar-toggle-btn"
            onClick={() => dispatch(toggleSidebar())}
            title={sidebarExpanded ? 'Collapse' : 'Expand'}
          >
            {sidebarExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>

        {sidebarExpanded && (
          <div className="sidebar-selectors">
            <OrganisationSelector />
            <OutletSelector />
          </div>
        )}

        <nav className="sidebar-nav">
          {/* Dashboard item */}
          <div 
            className={`nav-item ${location.pathname === dashboardItem.path ? 'active' : ''}`}
            onClick={() => handleNavigate(dashboardItem.path)}
            title={dashboardItem.name}
          >
            {DashboardIcon && <DashboardIcon className="nav-item-icon" size={18} />}
            {sidebarExpanded && <span>{dashboardItem.name}</span>}
          </div>

          {/* Collapsible Sections */}
          {navigationMenu.map((section) => {
            const isSectionExpanded = expandedSection === section.title;
            return (
              <div key={section.title} className="nav-section">
                {sidebarExpanded ? (
                  <div 
                    className="nav-section-header"
                    onClick={() => handleToggleSection(section.title)}
                  >
                    <span>{section.title}</span>
                    <ChevronDown 
                      size={12} 
                      style={{ 
                        transform: isSectionExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.15s ease'
                      }} 
                    />
                  </div>
                ) : (
                  <div style={{ height: '1px', backgroundColor: 'var(--border-sidebar)', margin: 'var(--space-sm) 0' }} />
                )}

                {(isSectionExpanded || !sidebarExpanded) && (
                  <div className="nav-section-items">
                    {section.items.map((item) => {
                      const isActive = location.pathname === item.path;
                      const ItemIcon = item.icon;
                      return (
                        <div
                          key={item.path}
                          className={`nav-item ${isActive ? 'active' : ''}`}
                          onClick={() => handleNavigate(item.path)}
                          title={item.name}
                        >
                          {ItemIcon && <ItemIcon className="nav-item-icon" size={18} />}
                          {sidebarExpanded && <span>{item.name}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Standalone Items */}
          <div style={{ height: '1px', backgroundColor: 'var(--border-sidebar)', margin: 'var(--space-sm) 0' }} />
          
          {standaloneItems.map((item) => {
            const isActive = location.pathname === item.path;
            const ItemIcon = item.icon;
            return (
              <div
                key={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => handleNavigate(item.path)}
                title={item.name}
              >
                {ItemIcon && <ItemIcon className="nav-item-icon" size={18} />}
                {sidebarExpanded && <span>{item.name}</span>}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
};
