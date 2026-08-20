import React from 'react';
import { useAppDispatch, useAppSelector, setOrganization } from '@/app/store';
import { Building2 } from 'lucide-react';

export const OrganisationSelector: React.FC = () => {
  const dispatch = useAppDispatch();
  const selectedOrgId = useAppSelector((state) => state.ui.selectedOrganizationId);

  const organisations = [
    { id: 'org-demo-fuel', name: 'Demo Fuel Services' },
  ];

  return (
    <div className="org-selector-wrapper">
      <div className="org-selector-icon-box">
        <Building2 size={16} />
      </div>
      <select
        value={selectedOrgId}
        onChange={(e) => dispatch(setOrganization(e.target.value))}
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
