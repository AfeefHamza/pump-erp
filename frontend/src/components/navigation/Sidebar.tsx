import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector, toggleSidebar } from '@/app/store';
import { OrganisationSelector } from './OrganisationSelector';
import { OutletSelector } from './OutletSelector';
import { navigationMenu, standaloneItems, dashboardItem } from '@/lib/navigationConfig';
import { ChevronLeft, ChevronRight, ChevronDown, Fuel, Store } from 'lucide-react';
import { usePermission } from '@/features/auth/hooks/usePermission';


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

  // Permissions for standalone items
  const hasUserView = usePermission('user.view');
  const hasRoleView = usePermission('role.view');
  const hasSettingsView = usePermission('settings.view');
  const hasOutletView = usePermission('outlet.view');
  const hasProductView = usePermission('fuel_product.view');
  const hasPriceView = usePermission('product_price.view');
  const hasTankView = usePermission('tank.view');
  const hasDispenserView = usePermission('dispenser.view');
  const hasNozzleView = usePermission('nozzle.view');
  const hasForecourtView = hasTankView || hasDispenserView || hasNozzleView;
  const hasAdminAccess = hasUserView || hasRoleView;

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
            // Check permissions for Administration and Settings
            if (item.path === '/app/administration') {
              if (!hasAdminAccess) return null;
            }
            if (item.path === '/app/settings') {
              if (!hasSettingsView && !hasOutletView) return null;
            }

            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            const ItemIcon = item.icon;

            return (
              <React.Fragment key={item.path}>
                <div
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => handleNavigate(item.path)}
                  title={item.name}
                >
                  {ItemIcon && <ItemIcon className="nav-item-icon" size={18} />}
                  {sidebarExpanded && <span>{item.name}</span>}
                </div>
                {item.path === '/app/settings' && sidebarExpanded && (
                  <div className="nav-section-items" style={{ paddingLeft: '2.5rem', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {hasOutletView && (
                      <div
                        className={`nav-item ${location.pathname.startsWith('/app/settings/outlets') ? 'active' : ''}`}
                        onClick={() => handleNavigate('/app/settings/outlets')}
                        title="Outlets"
                        style={{ fontSize: '0.9rem', height: '32px' }}
                      >
                        <Store size={14} className="nav-item-icon" />
                        <span>Outlets</span>
                      </div>
                    )}
                    {hasProductView && (
                      <div
                        className={`nav-item ${location.pathname.startsWith('/app/settings/products') ? 'active' : ''}`}
                        onClick={() => handleNavigate('/app/settings/products')}
                        title="Products & Pricing"
                        style={{ fontSize: '0.9rem', height: '32px' }}
                      >
                        <Fuel size={14} className="nav-item-icon" />
                        <span>Products & Pricing</span>
                      </div>
                    )}
                    {hasPriceView && (
                      <div
                        className={`nav-item ${location.pathname.startsWith('/app/settings/product-prices') ? 'active' : ''}`}
                        onClick={() => handleNavigate('/app/settings/product-prices')}
                        title="Product Prices"
                        style={{ fontSize: '0.9rem', height: '32px' }}
                      >
                        <Fuel size={14} className="nav-item-icon" style={{ opacity: 0.7 }} />
                        <span>Product Prices</span>
                      </div>
                    )}
                    {hasForecourtView && (
                      <div
                        className={`nav-item ${location.pathname.startsWith('/app/settings/forecourt') ? 'active' : ''}`}
                        onClick={() => handleNavigate('/app/settings/forecourt')}
                        title="Forecourt Setup"
                        style={{ fontSize: '0.9rem', height: '32px' }}
                      >
                        <Fuel size={14} className="nav-item-icon" />
                        <span>Forecourt Setup</span>
                      </div>
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      </aside>
    </>
  );
};

