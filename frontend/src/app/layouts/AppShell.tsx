import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/navigation/Sidebar';
import { TopBar } from '@/components/navigation/TopBar';
import { useAppDispatch, useAppSelector } from '@/app/store';
import { loadPermissions, clearPermissions } from '@/features/auth/permissionsSlice';

export const AppShell: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const dispatch = useAppDispatch();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);

  useEffect(() => {
    if (selectedOrgId) {
      dispatch(clearPermissions());
      dispatch(loadPermissions(selectedOrgId));
    } else {
      dispatch(clearPermissions());
    }
  }, [selectedOrgId, dispatch]);

  return (
    <div className="app-shell">
      {/* Sidebar for navigation */}
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      {/* Overlay to close sidebar on mobile tap */}
      <div 
        className={`mobile-overlay ${mobileOpen ? 'active' : ''}`}
        onClick={() => setMobileOpen(false)}
      />

      {/* Main viewport */}
      <main className="main-content">
        <TopBar setMobileOpen={setMobileOpen} />
        
        {/* Page output */}
        <div className="page-container">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

