import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector, setOutlet } from '@/app/store';
import { usePermission } from '@/features/auth/hooks/usePermission';
import { MapPin } from 'lucide-react';

export const OutletSelector: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);
  const { currentUser } = useAppSelector((state) => state.auth);

  const currentOrg = currentUser?.organisations.find(org => org.id === selectedOrgId);
  const outlets = React.useMemo(() => currentOrg?.outlets || [], [currentOrg?.outlets]);

  const hasOutletView = usePermission('outlet.view');
  const hasOutletCreate = usePermission('outlet.create');

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

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__manage__') {
      navigate('/app/settings/outlets');
      e.target.value = selectedOutletId; // restore selection
    } else if (val === '__add__') {
      navigate('/app/settings/outlets', { state: { openAdd: true } });
      e.target.value = selectedOutletId; // restore selection
    } else {
      dispatch(setOutlet(val));
    }
  };

  if (outlets.length === 0) {
    return (
      <div className="outlet-selector-wrapper" style={{ opacity: 0.6 }}>
        <div className="outlet-selector-icon-box">
          <MapPin size={16} />
        </div>
        <select className="outlet-selector-dropdown" disabled>
          <option value="">No accessible outlets</option>
        </select>
      </div>
    );
  }

  return (
    <div className="outlet-selector-wrapper">
      <div className="outlet-selector-icon-box">
        <MapPin size={16} />
      </div>
      <select
        value={selectedOutletId}
        onChange={handleChange}
        className="outlet-selector-dropdown"
      >
        {outlets.map((outlet) => (
          <option key={outlet.id} value={outlet.id}>
            {outlet.name}
          </option>
        ))}
        {(hasOutletView || hasOutletCreate) && (
          <option disabled>──────────</option>
        )}
        {hasOutletView && (
          <option value="__manage__">
            ⚙️ Manage Outlets
          </option>
        )}
        {hasOutletCreate && (
          <option value="__add__">
            ➕ Add New Outlet
          </option>
        )}
      </select>
    </div>
  );
};
