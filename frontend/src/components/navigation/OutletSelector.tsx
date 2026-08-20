import React from 'react';
import { useAppDispatch, useAppSelector, setOutlet } from '@/app/store';
import { MapPin } from 'lucide-react';

export const OutletSelector: React.FC = () => {
  const dispatch = useAppDispatch();
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
    if (!selectedOutletId || !outletExists) {
      dispatch(setOutlet(outlets[0].id));
    }
  }, [outlets, selectedOutletId, dispatch]);

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
        onChange={(e) => dispatch(setOutlet(e.target.value))}
        className="outlet-selector-dropdown"
      >
        {outlets.map((outlet) => (
          <option key={outlet.id} value={outlet.id}>
            {outlet.name}
          </option>
        ))}
      </select>
    </div>
  );
};
