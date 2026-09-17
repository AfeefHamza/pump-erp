import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector, setOutlet } from '@/app/store';
import { ChevronRight, MapPin } from 'lucide-react';

export const OutletSelector: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);
  const { currentUser } = useAppSelector((state) => state.auth);

  const currentOrg = currentUser?.organisations.find(org => org.id === selectedOrgId);
  const outlets = React.useMemo(() => currentOrg?.outlets || [], [currentOrg?.outlets]);

  // Validate the selected outlet ID against the latest server response
  React.useEffect(() => {
    if (outlets.length === 0) {
      if (selectedOutletId) {
        dispatch(setOutlet(''));
      }
      return;
    }

    const outletExists = outlets.some(outlet => outlet.id === selectedOutletId);
    if (selectedOutletId && !outletExists) {
      dispatch(setOutlet(''));
    } else if (!selectedOutletId && outlets.length > 0) {
      dispatch(setOutlet(outlets[0].id));
    }
  }, [outlets, selectedOutletId, dispatch]);

  if (outlets.length === 0) {
    return (
      <div className="outlet-selector-wrapper" style={{ opacity: 0.6 }}>
        <div className="outlet-selector-icon-box">
          <MapPin size={16} />
        </div>
        <span className="sidebar-context-value">No accessible outlets</span>
      </div>
    );
  }

  return (
    <button type="button" className="outlet-selector-wrapper sidebar-context-button" onClick={() => navigate('/app/settings/outlets')} title="Open outlet switcher and management">
      <div className="outlet-selector-icon-box">
        <MapPin size={16} />
      </div>
      <div className="sidebar-context-copy"><small>Current outlet</small><span className="sidebar-context-value">{outlets.find((outlet) => outlet.id === selectedOutletId)?.name || 'Choose outlet'}</span></div>
      <ChevronRight size={15} className="sidebar-context-chevron"/>
    </button>
  );
};
