import React from 'react';
import { BarChart3, ChevronRight, CreditCard, FileText, Fuel, ShoppingBag, Truck, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/navigation/PageHeader';

const reports = [
  {
    title: 'Daily Business Summary',
    description: 'Recorded fuel sales, collections, expenses, purchases, shortages and shift-level drill-down.',
    path: '/app/reports/daily-business-summary',
    icon: BarChart3,
  },
  {
    title: 'Employee Accountability',
    description: 'Employee-wise sales responsibility, collection methods, approved adjustments, shortages and excesses.',
    path: '/app/reports/employee-accountability',
    icon: Users,
  },
  {
    title: 'Sales Invoice Register',
    description: 'Active sales invoice documents, taxes, payments and outstanding balances.',
    path: '/app/reports/core-registers?section=sales',
    icon: FileText,
  },
  {
    title: 'Purchase Register',
    description: 'Recorded supplier bills with taxable value, taxes, payments and outstanding.',
    path: '/app/reports/core-registers?section=purchases',
    icon: ShoppingBag,
  },
  {
    title: 'Fuel Stock Movement',
    description: 'Tank-wise inward, outward and reversal movements from the append-only stock ledger.',
    path: '/app/reports/core-registers?section=stock',
    icon: Fuel,
  },
  {
    title: 'Payment Mode Summary',
    description: 'Cash, card, UPI, fleet card and credit from financially locked shifts.',
    path: '/app/reports/core-registers?section=payments',
    icon: CreditCard,
  },
  {
    title: 'Customer Outstanding',
    description: 'Customer receivables and unbilled fuel-credit balances.',
    path: '/app/sales/customer-outstanding',
    icon: Users,
  },
  {
    title: 'Supplier Outstanding',
    description: 'Supplier payables, overdue bills, advances and ageing.',
    path: '/app/purchases/supplier-outstanding',
    icon: Truck,
  },
];

export const ReportsHubPage: React.FC = () => {
  const navigate = useNavigate();
  return <div style={{ maxWidth: 1250, margin: '0 auto', padding: '1.5rem' }}>
    <PageHeader title="Reports" subtitle="Server-calculated operational reports based on recorded transactions." />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>
      {reports.map((report) => {
        const Icon = report.icon;
        return <button key={report.path} type="button" className="card" onClick={() => navigate(report.path)} style={{ padding: 22, textAlign: 'left', cursor: 'pointer', display: 'flex', gap: 16, border: '1px solid var(--border-color)', background: '#fff' }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: '#eff6ff', color: '#2563eb', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon size={22}/></div>
          <div style={{ flex: 1 }}><strong style={{ fontSize: 17 }}>{report.title}</strong><p className="text-muted" style={{ margin: '6px 0 0', lineHeight: 1.5 }}>{report.description}</p></div>
          <ChevronRight size={19}/>
        </button>;
      })}
    </div>
  </div>;
};
