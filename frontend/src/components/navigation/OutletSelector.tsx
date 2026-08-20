import React from 'react';
import { useAppDispatch, useAppSelector, setOutlet } from '@/app/store';
import { MapPin } from 'lucide-react';

export const OutletSelector: React.FC = () => {
  const dispatch = useAppDispatch();
  const selectedOutletId = useAppSelector((state) => state.ui.selectedOutletId);

  const outlets = [
    { id: 'outlet-central', name: 'Central Outlet' },
    { id: 'outlet-highway', name: 'Highway Outlet' },
  ];

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
