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

  if (organisations.length === 0) {
    return (
      <div className="org-selector-wrapper" style={{ opacity: 0.6 }}>
        <div className="org-selector-icon-box">
          <Building2 size={16} />
        </div>
        <span className="sidebar-context-value">No organisation access</span>
      </div>
    );
  }

  return (
    <div className="org-selector-wrapper">
      <div className="org-selector-icon-box">
        <Building2 size={16} />
      </div>
      <div className="sidebar-context-copy"><small>Organisation</small><span className="sidebar-context-value">{organisations.find((org) => org.id === selectedOrgId)?.name || organisations[0].name}</span></div>
    </div>
  );
};
