import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/navigation/PageHeader';
import { usePermission } from '@/features/auth/hooks/usePermission';
import { settingsRegistry, type SettingItem } from '@/lib/settingsRegistry';
import { Search, ChevronRight, Settings } from 'lucide-react';

const escapeRegExp = (str: string) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const SettingsHub: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');

  // Call hook for each individual permission code statically at the top level
  const hasOutletView = usePermission('outlet.view');
  const hasUserView = usePermission('user.view');
  const hasRoleView = usePermission('role.view');
  const hasFuelProductView = usePermission('fuel_product.view');
  const hasProductPriceView = usePermission('product_price.view');
  const hasTankView = usePermission('tank.view');
  const hasDispenserView = usePermission('dispenser.view');
  const hasNozzleView = usePermission('nozzle.view');
  const hasDipCalibrationView = usePermission('dip_calibration.view');
  const hasShiftDefinitionView = usePermission('shift_definition.view');
  const hasOpeningBalanceView = usePermission('opening_balance.view');
  const hasEmployeeDesignationView = usePermission('employee_designation.view');
  const hasEmployeeView = usePermission('employee.view');
  const hasSettingsView = usePermission('settings.view');

  // Map permissions to a key-value resolver
  const permissionMap: Record<string, boolean> = {
    'outlet.view': hasOutletView,
    'user.view': hasUserView,
    'role.view': hasRoleView,
    'fuel_product.view': hasFuelProductView,
    'product_price.view': hasProductPriceView,
    'tank.view': hasTankView,
    'dispenser.view': hasDispenserView,
    'nozzle.view': hasNozzleView,
    'dip_calibration.view': hasDipCalibrationView,
    'shift_definition.view': hasShiftDefinitionView,
    'opening_balance.view': hasOpeningBalanceView,
    'employee_designation.view': hasEmployeeDesignationView,
    'employee.view': hasEmployeeView,
    'settings.view': hasSettingsView,
  };

  const hasAccess = (item: SettingItem) => {
    // anyOfPermissions rule evaluation
    return item.anyOfPermissions.some(perm => permissionMap[perm]);
  };

  // Safe React text segment highlighting helper (avoids dangerouslySetInnerHTML)
  const highlightText = (text: string, search: string) => {
    if (!search.trim()) return <span>{text}</span>;
    const regex = new RegExp(`(${escapeRegExp(search)})`, 'gi');
    const parts = text.split(regex);
    return (
      <span>
        {parts.map((part, i) => 
          regex.test(part) ? (
            <mark key={i} className="highlighted-text">{part}</mark>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  // Filter Registry based on user permissions and search input
  const getFilteredRegistry = () => {
    const query = searchTerm.toLowerCase().trim();

    return settingsRegistry
      .map((cat) => {
        // First filter items based on permission guards
        const permittedItems = cat.items.filter(hasAccess);

        // Next filter permitted items based on search query if search is active
        const matchedItems = permittedItems.filter((item) => {
          if (!query) return true;
          return (
            item.label.toLowerCase().includes(query) ||
            item.description.toLowerCase().includes(query) ||
            cat.category.toLowerCase().includes(query) ||
            item.keywords.some((kw) => kw.toLowerCase().includes(query))
          );
        });

        return {
          category: cat.category,
          items: matchedItems,
        };
      })
      // Hide category sections that have no matching visible items
      .filter((cat) => cat.items.length > 0);
  };

  const filteredRegistry = getFilteredRegistry();

  // Category Theme classes/styles
  const getCategoryStyles = (categoryName: string) => {
    switch (categoryName) {
      case 'ORGANISATION':
        return { accent: '#0284c7', bg: '#f0f9ff' }; // Blue
      case 'PEOPLE & ACCESS':
        return { accent: '#4f46e5', bg: '#eef2ff' }; // Indigo
      case 'FUEL & FORECOURT':
        return { accent: '#0f766e', bg: '#f0fdfa' }; // Teal
      case 'OPERATIONS SETUP':
        return { accent: '#d97706', bg: '#fffbeb' }; // Amber
      default:
        return { accent: '#64748b', bg: '#f8fafc' }; // Slate
    }
  };

  return (
    <div className="settings-hub-page">
      <PageHeader 
        title="Settings" 
        subtitle="Configure your organisation, outlets and fuel-station operations" 
      />

      <div className="settings-hub">
        {/* Compact Search Bar section */}
        <div className="settings-hub-header" style={{ padding: 'var(--space-sm) var(--space-md)' }}>
          <div className="settings-hub-search-container" style={{ maxWidth: '400px' }}>
            <Search className="settings-hub-search-icon" size={16} />
            <input
              type="text"
              className="settings-hub-search-input"
              style={{ padding: '8px 12px 8px 38px', fontSize: '0.875rem' }}
              placeholder="Search settings (e.g. tank, nozzle, shift, employee)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Compact Categories Section */}
        {filteredRegistry.length > 0 ? (
          <div className="settings-hub-grid">
            {filteredRegistry.map((cat) => {
              const styles = getCategoryStyles(cat.category);
              return (
                <div key={cat.category} className="settings-panel">
                  <div className="settings-panel-header" style={{ borderLeft: `3px solid ${styles.accent}` }}>
                    <h2 className="settings-panel-title">{highlightText(cat.category, searchTerm)}</h2>
                  </div>
                  <div className="settings-panel-rows">
                    {cat.items.map((item) => {
                      const IconComponent = item.icon;
                      return (
                        <div 
                          key={item.route} 
                          className="settings-row" 
                          onClick={() => navigate(item.route)}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              navigate(item.route);
                            }
                          }}
                        >
                          <div className="settings-row-content">
                            <div 
                              className="settings-row-icon-wrapper"
                              style={{ backgroundColor: styles.bg, color: styles.accent }}
                            >
                              <IconComponent size={14} />
                            </div>
                            <div className="settings-row-text">
                              <span className="settings-row-name">{highlightText(item.label, searchTerm)}</span>
                              {item.description && (
                                <span className="settings-row-desc">{highlightText(item.description, searchTerm)}</span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="settings-chevron" size={14} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="settings-no-results" style={{ padding: 'var(--space-lg)' }}>
            <Settings size={36} style={{ opacity: 0.3, marginBottom: 'var(--space-xs)' }} />
            <h3 className="h4" style={{ color: 'var(--text-main)', marginBottom: '4px' }}>No settings found</h3>
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>We couldn't find any settings matching "{searchTerm}" that you have access to view.</p>
          </div>
        )}
      </div>
    </div>
  );
};
