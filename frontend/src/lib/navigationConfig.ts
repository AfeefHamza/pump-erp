import {
  LayoutDashboard,
  Clock,
  Gauge,
  Droplet,
  CalendarDays,
  FileText,
  DollarSign,
  Receipt,
  Users,
  Truck,
  ShoppingBag,
  Briefcase,
  Layers,
  Compass,
  Shuffle,
  Sliders,
  Wallet,
  CreditCard,
  TrendingDown,
  Tags,
  BookOpen,
  ClipboardList,
  Coins,
  UserSquare2,
  BarChart3,
  Settings,
  HelpCircle
} from 'lucide-react';
import { type MenuSection, type MenuItem } from '@/types/navigation';

export const dashboardItem: MenuItem = {
  name: 'Dashboard',
  path: '/app/dashboard',
  icon: LayoutDashboard,
};

export const navigationMenu: MenuSection[] = [
  {
    title: 'OPERATIONS',
    items: [
      { name: 'Shifts', path: '/app/operations/shifts', icon: Clock },
      { name: 'Meter Readings', path: '/app/operations/meter-readings', icon: Gauge },
      { name: 'Dip Readings', path: '/app/operations/dip-readings', icon: Droplet },
      { name: 'Day Close', path: '/app/operations/day-close', icon: CalendarDays },
    ],
  },
  {
    title: 'SALES',
    items: [
      { name: 'Credit Slips', path: '/app/sales/credit-slips', icon: FileText },
      { name: 'Cash Sales', path: '/app/sales/cash-sales', icon: DollarSign },
      { name: 'Invoices', path: '/app/sales/invoices', icon: Receipt },
      { name: 'Receipts', path: '/app/sales/receipts', icon: Receipt },
      { name: 'Customers', path: '/app/sales/customers', icon: Users },
    ],
  },
  {
    title: 'PURCHASES',
    items: [
      { name: 'Tanker Receipts', path: '/app/purchases/tanker-receipts', icon: Truck },
      { name: 'Purchase Bills', path: '/app/purchases/purchase-bills', icon: ShoppingBag },
      { name: 'Suppliers', path: '/app/purchases/suppliers', icon: Briefcase },
    ],
  },
  {
    title: 'INVENTORY',
    items: [
      { name: 'Fuel Stock', path: '/app/inventory/fuel-stock', icon: Layers },
      { name: 'Lubricants', path: '/app/inventory/lubricants', icon: Compass },
      { name: 'Stock Transfers', path: '/app/inventory/stock-transfers', icon: Shuffle },
      { name: 'Stock Adjustments', path: '/app/inventory/stock-adjustments', icon: Sliders },
    ],
  },
  {
    title: 'FINANCE',
    items: [
      { name: 'Cash & Banking', path: '/app/finance/cash-banking', icon: Wallet },
      { name: 'Settlements', path: '/app/finance/settlements', icon: CreditCard },
      { name: 'Expenses', path: '/app/finance/expenses', icon: TrendingDown },
      { name: 'Vouchers', path: '/app/finance/vouchers', icon: Tags },
      { name: 'Chart of Accounts', path: '/app/finance/chart-of-accounts', icon: BookOpen },
    ],
  },
  {
    title: 'EMPLOYEES',
    items: [
      { name: 'Shift Assignments', path: '/app/employees/shift-assignments', icon: ClipboardList },
      { name: 'Cash Collections', path: '/app/employees/cash-collections', icon: Coins },
      { name: 'Employee Accounts', path: '/app/employees/accounts', icon: UserSquare2 },
    ],
  },
];

export const standaloneItems: MenuItem[] = [
  { name: 'Reports', path: '/app/reports', icon: BarChart3 },
  { name: 'Settings', path: '/app/settings', icon: Settings },
  { name: 'Help & Support', path: '/app/help-support', icon: HelpCircle },
];

