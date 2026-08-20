import React from 'react';
import { useAppDispatch, useAppSelector, setOrganization, setOutlet } from '@/app/store';
import { Building2 } from 'lucide-react';

export const OrganisationSelector: React.FC = () => {
  const dispatch = useAppDispatch();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);
  const { currentUser } = useAppSelector((state) => state.auth);

  const organisations = React.useMemo(() => currentUser?.organisations || [], [currentUser?.organisations]);

  // Validate the selected organisation ID against the latest server response
  React.useEffect(() => {
    if (organisations.length === 0) {
      if (selectedOrgId) {
        dispatch(setOrganization(''));
        dispatch(setOutlet(''));
      }
      return;
    }

    const orgExists = organisations.some(org => org.id === selectedOrgId);
    if (!selectedOrgId || !orgExists) {
      const defaultOrg = organisations[0];
      dispatch(setOrganization(defaultOrg.id));
      if (defaultOrg.outlets && defaultOrg.outlets.length > 0) {
        dispatch(setOutlet(defaultOrg.outlets[0].id));
      } else {
        dispatch(setOutlet(''));
      }
    }
  }, [organisations, selectedOrgId, dispatch]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const orgId = e.target.value;
    dispatch(setOrganization(orgId));
    
    // Proactively select the first outlet of this organisation
    const selectedOrg = organisations.find(org => org.id === orgId);
    if (selectedOrg && selectedOrg.outlets && selectedOrg.outlets.length > 0) {
      dispatch(setOutlet(selectedOrg.outlets[0].id));
    } else {
      dispatch(setOutlet(''));
    }
  };

  if (organisations.length === 0) {
    return (
      <div className="org-selector-wrapper" style={{ opacity: 0.6 }}>
        <div className="org-selector-icon-box">
          <Building2 size={16} />
        </div>
        <select className="org-selector-dropdown" disabled>
          <option value="">No organisation access</option>
        </select>
      </div>
    );
  }

  return (
    <div className="org-selector-wrapper">
      <div className="org-selector-icon-box">
        <Building2 size={16} />
      </div>
      <select
        value={selectedOrgId}
        onChange={handleChange}
        className="org-selector-dropdown"
      >
        {organisations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
    </div>
  );
};
