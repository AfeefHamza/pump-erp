import React from 'react';
import { PageHeader } from '@/components/navigation/PageHeader';
import { StatCard } from '@/components/data-display/StatCard';
import { DataTable, type ColumnDef } from '@/components/data-display/DataTable';
import { StatusBadge, type StatusType } from '@/components/data-display/StatusBadge';
import { 
  Fuel, 
  Coins, 
  FileSpreadsheet, 
  Clock, 
  Activity, 
  Play,
  Gauge,
  Droplet,
  FileText,
  TrendingDown,
  Truck,
  ClipboardCheck
} from 'lucide-react';

interface Transaction {
  id: number;
  ref: string;
  type: string;
  outlet: string;
  amount: number;
  status: StatusType;
  statusLabel: string;
  dateTime: string;
}

interface Tank {
  id: number;
  name: string;
  fuelType: string;
  currentVolume: number;
  capacity: number;
  status: 'success' | 'warning' | 'danger';
}

export const Dashboard: React.FC = () => {
  // Format to Indian Currency
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const tanks: Tank[] = [
    { id: 1, name: 'MS Tank 1 (Petrol)', fuelType: 'Unleaded 95', currentVolume: 15200, capacity: 20000, status: 'success' },
    { id: 2, name: 'MS Tank 2 (Petrol)', fuelType: 'Unleaded 95', currentVolume: 8400, capacity: 20000, status: 'warning' },
    { id: 3, name: 'HSD Tank 1 (Diesel)', fuelType: 'High Speed Diesel', currentVolume: 18900, capacity: 25000, status: 'success' },
    { id: 4, name: 'HSD Tank 2 (Diesel)', fuelType: 'High Speed Diesel', currentVolume: 2500, capacity: 25000, status: 'danger' },
    { id: 5, name: 'Speed Tank 1 (Premium)', fuelType: 'Speed Petrol', currentVolume: 4800, capacity: 10000, status: 'success' },
  ];

  const formatVolume = (val: number) => {
    return new Intl.NumberFormat('en-IN').format(val) + ' L';
  };

  const columns: ColumnDef<Transaction>[] = [
    { key: 'ref', header: 'Reference' },
    { key: 'type', header: 'Type' },
    { key: 'outlet', header: 'Outlet' },
    { 
      key: 'amount', 
      header: 'Amount', 
      align: 'right',
      render: (row) => <strong>{formatCurrency(row.amount)}</strong> 
    },
    { 
      key: 'status', 
      header: 'Status',
      render: (row) => <StatusBadge label={row.statusLabel} status={row.status} /> 
    },
    { key: 'dateTime', header: 'Date/Time' },
  ];

  const transactions: Transaction[] = [
    { id: 1, ref: 'CS-20260820-01', type: 'Credit Slip', outlet: 'Central Outlet', amount: 15450, status: 'success', statusLabel: 'Approved', dateTime: '20-08-2026 02:15 PM' },
    { id: 2, ref: 'EXP-20260820-03', type: 'Expense Voucher', outlet: 'Highway Outlet', amount: 2500, status: 'pending', statusLabel: 'Pending Approval', dateTime: '20-08-2026 01:30 PM' },
    { id: 3, ref: 'TR-20260820-02', type: 'Tanker Receipt', outlet: 'Central Outlet', amount: 280000, status: 'success', statusLabel: 'Completed', dateTime: '20-08-2026 11:45 AM' },
    { id: 4, ref: 'CS-20260820-02', type: 'Cash Sale', outlet: 'Highway Outlet', amount: 48900, status: 'success', statusLabel: 'Completed', dateTime: '20-08-2026 10:15 AM' },
    { id: 5, ref: 'SET-20260820-01', type: 'Settlement Check', outlet: 'Central Outlet', amount: 12000, status: 'warning', statusLabel: 'Disputed', dateTime: '20-08-2026 09:00 AM' },
  ];

  const handleActionClick = (actionName: string) => {
    alert(`"${actionName}" is a demonstration placeholder. ERP workflows will be implemented in a future phase.`);
  };

  return (
    <div>
      <PageHeader 
        title="Dashboard" 
        subtitle="Fuel station daily operations overview"
        actions={<span className="demo-data-label">Demonstration Mode</span>}
      />

      {/* Quick Actions Grid */}
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 'var(--space-md)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Quick Actions
        </h3>
        <div className="quick-actions-grid">
          <button className="quick-action-button" onClick={() => handleActionClick('Open Shift')}>
            <Play className="quick-action-icon" size={20} />
            <span>Open Shift</span>
          </button>
          <button className="quick-action-button" onClick={() => handleActionClick('Add Meter Reading')}>
            <Gauge className="quick-action-icon" size={20} />
            <span>Meter Reading</span>
          </button>
          <button className="quick-action-button" onClick={() => handleActionClick('Record Dip')}>
            <Droplet className="quick-action-icon" size={20} />
            <span>Record Dip</span>
          </button>
          <button className="quick-action-button" onClick={() => handleActionClick('Create Credit Slip')}>
            <FileText className="quick-action-icon" size={20} />
            <span>Credit Slip</span>
          </button>
          <button className="quick-action-button" onClick={() => handleActionClick('Record Expense')}>
            <TrendingDown className="quick-action-icon" size={20} />
            <span>Record Expense</span>
          </button>
          <button className="quick-action-button" onClick={() => handleActionClick('Receive Tanker')}>
            <Truck className="quick-action-icon" size={20} />
            <span>Receive Tanker</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid">
        <StatCard 
          title="Today's Fuel Sales" 
          value={formatCurrency(425850)} 
          icon={Fuel} 
          trend={{ value: '4.2%', isPositive: true }}
          description="from yesterday"
        />
        <StatCard 
          title="Cash Collected" 
          value={formatCurrency(210300)} 
          icon={Coins} 
          trend={{ value: '2.1%', isPositive: true }}
          description="net receipts"
        />
        <StatCard 
          title="Credit Sales" 
          value={formatCurrency(195550)} 
          icon={FileSpreadsheet} 
          trend={{ value: '8.5%', isPositive: true }}
          description="account customers"
        />
        <StatCard 
          title="Pending Settlements" 
          value={formatCurrency(45200)} 
          icon={ClipboardCheck} 
          trend={{ value: '1.2%', isPositive: false }}
          description="due cards/wallets"
        />
        <StatCard 
          title="Stock Variance" 
          value="-12.5 L" 
          icon={Activity} 
          trend={{ value: '0.05%', isPositive: false }}
          description="allowable range"
        />
        <StatCard 
          title="Open Shifts" 
          value="3 / 4 Outlets" 
          icon={Clock} 
          description="currently active"
        />
      </div>

      {/* Dashboard Grid */}
      <div className="dashboard-grid">
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h4 className="dashboard-card-title">Recent Transactions <span className="demo-data-label">Demo Data</span></h4>
            <span className="dashboard-card-header-actions" onClick={() => alert('View All Transactions is a placeholder')}>View all</span>
          </div>
          <DataTable columns={columns} data={transactions} />
        </div>

        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h4 className="dashboard-card-title">Fuel Tanks Status <span className="demo-data-label">Demo Data</span></h4>
          </div>
          <div className="tanks-list" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {tanks.map((tank) => {
              const percentage = Math.round((tank.currentVolume / tank.capacity) * 100);
              let progressColor = 'var(--color-accent)'; // success (teal)
              if (tank.status === 'warning') progressColor = '#f59e0b'; // warning (amber)
              if (tank.status === 'danger') progressColor = '#ef4444'; // danger (red)

              return (
                <div key={tank.id} className="tank-status-item" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div className="tank-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="tank-name" style={{ fontWeight: 600, color: 'var(--text-main)' }}>{tank.name}</span>
                      <span className="tank-fuel" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tank.fuelType}</span>
                    </div>
                    <span className="tank-capacity" style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {formatVolume(tank.currentVolume)} / {formatVolume(tank.capacity)} ({percentage}%)
                    </span>
                  </div>
                  <div className="tank-progress-bar-container" style={{ width: '100%', height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                    <div 
                      className="tank-progress-bar" 
                      style={{ 
                        width: `${percentage}%`, 
                        height: '100%', 
                        backgroundColor: progressColor, 
                        borderRadius: '4px',
                        transition: 'width 0.3s ease'
                      }} 
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
