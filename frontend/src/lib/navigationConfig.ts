import {
  LayoutDashboard,
  Clock,
  Droplet,
  FileText,
  DollarSign,
  Users,
  Truck,
  ShoppingBag,
  Briefcase,
  Layers,
  BookOpen,
  ClipboardList,
  Settings,
  Landmark,
  WalletCards,
  ReceiptText,
  PackageCheck,
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
      { name: 'Shift Cards', path: '/app/operations/shift-cards', icon: Clock },
      { name: 'Dip Readings', path: '/app/operations/dip-readings', icon: Droplet },
      { name: 'Shift Assignments', path: '/app/operations/shift-assignments', icon: ClipboardList },
    ],
  },
  {
    title: 'SALES',
    items: [
      { name: 'Sales Invoices', path: '/app/sales/invoices', icon: ReceiptText },
      { name: 'Customer Receipts', path: '/app/sales/receipts', icon: WalletCards },
      { name: 'Credit Slips', path: '/app/sales/credit-slips', icon: FileText },
      { name: 'Customers', path: '/app/sales/customers', icon: Users },
      { name: 'Customer Outstanding', path: '/app/sales/customer-outstanding', icon: DollarSign },
    ],
  },
  {
    title: 'PURCHASES',
    items: [
      { name: 'Tanker Receipts', path: '/app/purchases/tanker-receipts', icon: Truck },
      { name: 'Purchase Bills', path: '/app/purchases/purchase-bills', icon: ShoppingBag },
      { name: 'Supplier Payments', path: '/app/purchases/supplier-payments', icon: WalletCards },
      { name: 'Suppliers', path: '/app/purchases/suppliers', icon: Briefcase },
      { name: 'Supplier Outstanding', path: '/app/purchases/supplier-outstanding', icon: DollarSign },
    ],
  },
  {
    title: 'INVENTORY',
    items: [
      { name: 'Items', path: '/app/inventory/items', icon: BookOpen },
      { name: 'Item Stock', path: '/app/inventory/item-stock', icon: PackageCheck },
      { name: 'Fuel Stock', path: '/app/inventory/fuel-stock', icon: Layers },
    ],
  },
  {
    title: 'FINANCE',
    items: [
      { name: 'Cash & Banking', path: '/app/finance/cash-banking', icon: Landmark },
    ],
  },
];

export const standaloneItems: MenuItem[] = [
  { name: 'Settings', path: '/app/settings', icon: Settings },
];
