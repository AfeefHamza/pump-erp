import React from 'react';

interface ReviewSectionProps {
  orgData: Record<string, string>;
  outletData: Record<string, string>;
  fyData: Record<string, string>;
}

export const ReviewSection: React.FC<ReviewSectionProps> = ({ orgData, outletData, fyData }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: 'var(--space-xs)' }}>
          Review and Complete
        </h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Please review the setup details below before completing the initial onboarding.
        </p>
      </div>

      {/* Review details grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        {/* Org details card */}
        <div style={{ padding: 'var(--space-md)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-accent)', marginBottom: 'var(--space-sm)' }}>
            Organisation
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)', fontSize: '0.875rem' }}>
            <div><strong>Name:</strong> {orgData.name}</div>
            <div><strong>Legal Name:</strong> {orgData.legal_name || 'N/A'}</div>
            <div><strong>GSTIN:</strong> {orgData.gstin || 'N/A'}</div>
            <div><strong>PAN:</strong> {orgData.pan || 'N/A'}</div>
            <div><strong>Phone:</strong> {orgData.phone_number || 'N/A'}</div>
            <div><strong>Address:</strong> {orgData.address_line_1 ? `${orgData.address_line_1}, ${orgData.city}, ${orgData.state} - ${orgData.postal_code}` : 'N/A'}</div>
          </div>
        </div>

        {/* Outlet details card */}
        <div style={{ padding: 'var(--space-md)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-accent)', marginBottom: 'var(--space-sm)' }}>
            First Outlet
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)', fontSize: '0.875rem' }}>
            <div><strong>Name:</strong> {outletData.name}</div>
            <div><strong>Code:</strong> {outletData.code}</div>
            <div><strong>Type:</strong> {outletData.outlet_type || 'Fuel Station'}</div>
            <div><strong>Operating Brand:</strong> {outletData.operating_brand_name || outletData.operating_brand_code}</div>
            <div><strong>Dealer Code:</strong> {outletData.dealer_code || 'N/A'}</div>
            <div><strong>Address:</strong> {outletData.address_line_1 ? `${outletData.address_line_1}, ${outletData.city}, ${outletData.state} - ${outletData.postal_code}` : 'N/A'}</div>
          </div>
        </div>

        {/* FY details card */}
        <div style={{ padding: 'var(--space-md)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-accent)', marginBottom: 'var(--space-sm)' }}>
            Financial Year
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)', fontSize: '0.875rem' }}>
            <div><strong>Name:</strong> {fyData.name}</div>
            <div><strong>Start Date:</strong> {fyData.start_date}</div>
            <div><strong>End Date:</strong> {fyData.end_date}</div>
            <div><strong>Default Period:</strong> Yes</div>
          </div>
        </div>
      </div>
    </div>
  );
};
