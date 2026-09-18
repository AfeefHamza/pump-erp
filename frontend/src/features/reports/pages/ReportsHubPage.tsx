import React, { useMemo, useState } from 'react';
import {
  BarChart3, Banknote, ChevronRight, ClipboardList, CreditCard, FileText,
  Fuel, Gauge, Landmark, PackageSearch, Receipt, Search, ShoppingBag, Truck, Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/navigation/PageHeader';

const groups = [
  {
    title: 'Business Performance',
    description: 'Management totals without counting billed credit slips twice.',
    reports: [
      { title: 'Daily Business Summary', description: 'Fuel and non-fuel sales, collections, purchases, expenses, shortages and shift drill-down for any selected period.', path: '/app/reports/daily-business-summary', icon: BarChart3 },
      { title: 'Employee Accountability', description: 'Employee-wise sales responsibility, collections, approved adjustments, shortages and excesses.', path: '/app/reports/employee-accountability', icon: Users },
    ],
  },
  {
    title: 'Shift & Forecourt Operations',
    description: 'The essential DSR, shift, meter, dip and credit-slip registers.',
    reports: [
      { title: 'Shift Card Register', description: 'Shift Cards with expected sales, accounted amount, difference and recorded status.', path: '/app/reports/operational-registers?section=shifts', icon: ClipboardList },
      { title: 'Meter Reading Report', description: 'Opening, closing, testing, net litres and sale amount by nozzle and attendant.', path: '/app/reports/operational-registers?section=meters', icon: Gauge },
      { title: 'Dip Reading Report', description: 'Opening and closing tank dips, converted stock, density and conversion method.', path: '/app/reports/operational-registers?section=dips', icon: Fuel },
      { title: 'Issued Credit Slips', description: 'Customer, vehicle, product, quantity, rate and employee responsibility.', path: '/app/reports/operational-registers?section=credit_slips', icon: Receipt },
    ],
  },
  {
    title: 'Sales & Receivables',
    description: 'Invoices and customer balances from active source documents.',
    reports: [
      { title: 'Sales Invoice Register', description: 'Sales invoices, taxes, payments and outstanding balances.', path: '/app/reports/core-registers?section=sales', icon: FileText },
      { title: 'Customer Outstanding & Ageing', description: 'Receivables, ageing buckets and unbilled fuel-credit balances.', path: '/app/sales/customer-outstanding', icon: Users },
    ],
  },
  {
    title: 'Purchases & Inventory',
    description: 'Supplier documents and append-only stock movement records.',
    reports: [
      { title: 'Purchase Bill Register', description: 'Supplier bills with taxable value, tax, payment and outstanding.', path: '/app/reports/core-registers?section=purchases', icon: ShoppingBag },
      { title: 'Tanker Receipt Report', description: 'Receipt quantity, accepted quantity, supplier, vehicle and product details.', path: '/app/reports/operational-registers?section=receipts', icon: Truck },
      { title: 'Fuel Stock Movement', description: 'Tank-wise inward, outward and reversal movements from the stock ledger.', path: '/app/reports/core-registers?section=stock', icon: Fuel },
      { title: 'Current Item Stock', description: 'Non-fuel item balances, reorder position and movement drill-down.', path: '/app/inventory/item-stock', icon: PackageSearch },
      { title: 'Supplier Outstanding & Ageing', description: 'Supplier payables, overdue bills, advances and ageing buckets.', path: '/app/purchases/supplier-outstanding', icon: Truck },
    ],
  },
  {
    title: 'Collections & Finance',
    description: 'Money received, settled, spent and held in payment accounts.',
    reports: [
      { title: 'Payment Mode Summary', description: 'Cash, card, UPI, fleet card and credit from recorded shifts.', path: '/app/reports/core-registers?section=payments', icon: CreditCard },
      { title: 'Digital Settlement Report', description: 'Pending and settled card, UPI and fleet collections with settlement differences.', path: '/app/finance/settlements', icon: Landmark },
      { title: 'Expense Register', description: 'Recorded expenses by date, category, payment account and payee.', path: '/app/reports/operational-registers?section=expenses', icon: Banknote },
      { title: 'Cash & Bank Books', description: 'Account balances, deposits, withdrawals and account-to-account transfers.', path: '/app/finance/cash-banking', icon: Landmark },
    ],
  },
];

export const ReportsHubPage: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const visibleGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return groups;
    return groups.map((group) => ({
      ...group,
      reports: group.reports.filter((report) => `${report.title} ${report.description}`.toLowerCase().includes(query)),
    })).filter((group) => group.reports.length > 0);
  }, [search]);

  return <div className="reports-hub-page">
    <PageHeader title="Reports" subtitle="Operational, inventory and financial reports from authoritative recorded transactions." />
    <div className="card reports-search-card">
      <Search size={18}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reports" aria-label="Search reports"/>
    </div>
    <div className="reports-basis-note">
      PetroPrime’s overlapping Daily Summary, DSR, Summary Sales and Shift Summary are consolidated into clear reports with drill-downs. Profit reports will be enabled only after valuation and cost-of-goods data are authoritative.
    </div>
    {visibleGroups.map((group) => <section className="report-group" key={group.title}>
      <div className="report-group-heading"><h2>{group.title}</h2><p>{group.description}</p></div>
      <div className="report-card-grid">
        {group.reports.map((report) => {
          const Icon = report.icon;
          return <button key={report.path} type="button" className="report-link-card" onClick={() => navigate(report.path)}>
            <span className="report-link-icon"><Icon size={20}/></span>
            <span className="report-link-copy"><strong>{report.title}</strong><small>{report.description}</small></span>
            <ChevronRight size={18}/>
          </button>;
        })}
      </div>
    </section>)}
    {!visibleGroups.length && <div className="card reports-empty">No reports match “{search}”.</div>}
  </div>;
};
