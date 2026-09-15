import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/app/layouts/AppShell';
import { Dashboard } from '@/features/dashboard/Dashboard';
import { ComingSoonPage } from '@/components/feedback/ComingSoonPage';
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { SignupPage } from '@/features/auth/pages/SignupPage';
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage';
import { OnboardingPage } from '@/features/auth/pages/OnboardingPage';
import { UserManagement } from '@/features/administration/pages/UserManagement';
import { RolesManagement } from '@/features/administration/pages/RolesManagement';
import { PublicActivation } from '@/features/auth/pages/PublicActivation';
import { OutletsManagement } from '@/features/settings/pages/OutletsManagement';
import { ProductPrices } from '@/features/settings/pages/ProductPrices';
import { ForecourtSetup } from '@/features/settings/pages/ForecourtSetup';
import { TanksManagement } from '@/features/inventory/pages/TanksManagement';
import { DispensersNozzlesManagement } from '@/features/inventory/pages/DispensersNozzlesManagement';
import { EmployeesManagement } from '@/features/employees/pages/EmployeesManagement';
import { DesignationsManagement } from '@/features/employees/pages/DesignationsManagement';
import { ShiftAssignments } from '@/features/employees/pages/ShiftAssignments';
import { ShiftDefinitions } from '@/features/settings/pages/ShiftDefinitions';
import { OpeningBalances } from '@/features/settings/pages/OpeningBalances';
import { OutletReadiness } from '@/features/settings/pages/OutletReadiness';
import { DipCalibrations } from '@/features/settings/pages/DipCalibrations';
import { SettingsHub } from '@/features/settings/pages/SettingsHub';
import { ShiftListPage } from '@/features/operations/pages/ShiftListPage';
import { ShiftCardWorkspace } from '@/features/operations/pages/ShiftCardWorkspace';
import { ShiftCardParentOverview } from '@/features/operations/pages/ShiftCardParentOverview';
import { DipReadingsPage } from '@/features/operations/pages/DipReadingsPage';
import { CustomersPage } from '@/features/sales/pages/CustomersPage';
import { CustomerDetailPage } from '@/features/sales/pages/CustomerDetailPage';
import { CreditSlipsPage } from '@/features/sales/pages/CreditSlipsPage';
import { SalesInvoiceListPage } from '@/features/sales/pages/SalesInvoiceListPage';
import { SalesInvoiceFormPage } from '@/features/sales/pages/SalesInvoiceFormPage';
import { SalesInvoiceDetailPage } from '@/features/sales/pages/SalesInvoiceDetailPage';
import { CustomerOutstandingPage } from '@/features/sales/pages/CustomerOutstandingPage';
import { CustomerReceiptsPage } from '@/features/sales/pages/CustomerReceiptsPage';
import { CustomerReceiptFormPage } from '@/features/sales/pages/CustomerReceiptFormPage';
import { TankerReceiptListPage } from '@/features/purchases/pages/TankerReceiptListPage';
import { TankerReceiptWorkspace } from '@/features/purchases/pages/TankerReceiptWorkspace';
import { PurchaseBillListPage } from '@/features/purchases/pages/PurchaseBillListPage';
import { PurchaseBillWorkspace } from '@/features/purchases/pages/PurchaseBillWorkspace';
import { SupplierOutstandingPage } from '@/features/purchases/pages/SupplierOutstandingPage';
import { SuppliersPage } from '@/features/purchases/pages/SuppliersPage';
import { ItemsMasterPage } from '@/features/inventory/pages/ItemsMasterPage';
import { ItemFormPage } from '@/features/inventory/pages/ItemFormPage';
import { TaxTreatmentsPage } from '@/features/settings/pages/TaxTreatmentsPage';
import { FuelStockDashboardPage } from '@/features/inventory/pages/FuelStockDashboardPage';
import { TankLedgerPage } from '@/features/inventory/pages/TankLedgerPage';
import { ItemStockPage } from '@/features/inventory/pages/ItemStockPage';
import { PaymentAccountsPage } from '@/features/finance/pages/PaymentAccountsPage';
import { SupplierPaymentsPage } from '@/features/finance/pages/SupplierPaymentsPage';
import { SupplierPaymentFormPage } from '@/features/finance/pages/SupplierPaymentFormPage';
import { SupplierPaymentDetailPage } from '@/features/finance/pages/SupplierPaymentDetailPage';
import { ChartOfAccountsPage } from '@/features/accounting/pages/ChartOfAccountsPage';
import { LedgerAccountFormPage } from '@/features/accounting/pages/LedgerAccountFormPage';
import { JournalVoucherListPage } from '@/features/accounting/pages/JournalVoucherListPage';
import { JournalVoucherFormPage } from '@/features/accounting/pages/JournalVoucherFormPage';
import { JournalVoucherDetailPage } from '@/features/accounting/pages/JournalVoucherDetailPage';
import { AccountingPeriodsPage } from '@/features/accounting/pages/AccountingPeriodsPage';
import { useParams, useLocation } from 'react-router-dom';

const RedirectWithSearchAndHash: React.FC<{ getDest: (params: Record<string, string | undefined>) => string }> = ({ getDest }) => {
  const params = useParams();
  const location = useLocation();
  const dest = getDest(params);
  return <Navigate to={`${dest}${location.search}${location.hash}`} replace />;
};

const RedirectUserWithId: React.FC = () => {
  const { membershipId } = useParams();
  const location = useLocation();
  const dest = membershipId ? `/app/settings/users/${membershipId}` : '/app/settings/users';
  return <Navigate to={`${dest}${location.search}${location.hash}`} replace />;
};

const RedirectRoleWithId: React.FC = () => {
  const { roleId } = useParams();
  const location = useLocation();
  const dest = roleId ? `/app/settings/roles/${roleId}` : '/app/settings/roles';
  return <Navigate to={`${dest}${location.search}${location.hash}`} replace />;
};

export const router = createBrowserRouter([
  // Guest Routes (Guarded: redirect to app if already authenticated)
  {
    path: '/login',
    element: (
      <ProtectedRoute requireAuth={false}>
        <LoginPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/signup',
    element: (
      <ProtectedRoute requireAuth={false}>
        <SignupPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/forgot-password',
    element: (
      <ProtectedRoute requireAuth={false}>
        <ForgotPasswordPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/reset-password',
    element: (
      <ProtectedRoute requireAuth={false}>
        <ResetPasswordPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/activate-account',
    element: <PublicActivation />,
  },



  // Protected Onboarding Route
  {
    path: '/app/onboarding',
    element: (
      <ProtectedRoute requireAuth={true}>
        <OnboardingPage />
      </ProtectedRoute>
    ),
  },

  // Protected App Routes
  {
    path: '/app',
    element: (
      <ProtectedRoute requireAuth={true}>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      {
        path: 'dashboard',
        element: <Dashboard />,
      },
      // Operations: Shift Cards Workflow
      {
        path: 'operations/shift-cards',
        element: <ShiftListPage />,
      },
      {
        path: 'operations/shift-cards/entry',
        element: <ShiftCardWorkspace />,
      },
      {
        path: 'operations/shift-cards/entry/:cardId',
        element: <ShiftCardWorkspace />,
      },
      {
        path: 'operations/shift-cards/parent/:shiftId',
        element: <ShiftCardParentOverview />,
      },
      // Retired live routes redirects (Requirement 5)
      {
        path: 'operations/shifts',
        element: <Navigate to="/app/operations/shift-cards" replace />,
      },
      {
        path: 'operations/shifts/:shiftId',
        element: <RedirectWithSearchAndHash getDest={(p) => `/app/operations/shift-cards/parent/${p.shiftId}`} />,
      },
      {
        path: 'operations/shifts/:shiftId/reconciliation',
        element: <RedirectWithSearchAndHash getDest={(p) => `/app/operations/shift-cards/parent/${p.shiftId}`} />,
      },
      {
        path: 'operations/meter-readings',
        element: <Navigate to="/app/operations/shift-cards" replace />,
      },
      {
        path: 'operations/dip-readings',
        element: <DipReadingsPage />,
      },
      // Sales
      {
        path: 'sales/credit-slips',
        element: <CreditSlipsPage />,
      },
      {
        path: 'sales/credit-slips/:creditSlipId',
        element: <CreditSlipsPage />,
      },
      {
        path: 'sales/cash-sales',
        element: <Navigate to="/app/sales/invoices/new?type=cash" replace />,
      },
      {
        path: 'sales/invoices',
        element: <SalesInvoiceListPage />,
      },
      {
        path: 'sales/invoices/new',
        element: <SalesInvoiceFormPage />,
      },
      {
        path: 'sales/invoices/:invoiceId',
        element: <SalesInvoiceDetailPage />,
      },
      {
        path: 'sales/receipts',
        element: <CustomerReceiptsPage />,
      },
      {
        path: 'sales/receipts/new',
        element: <CustomerReceiptFormPage />,
      },
      {
        path: 'sales/customers',
        element: <CustomersPage />,
      },
      {
        path: 'sales/customers/:customerId',
        element: <CustomerDetailPage />,
      },
      {
        path: 'sales/customer-outstanding',
        element: <CustomerOutstandingPage />,
      },
      // Purchases
      {
        path: 'purchases/tanker-receipts',
        element: <TankerReceiptListPage />,
      },
      {
        path: 'purchases/tanker-receipts/new',
        element: <TankerReceiptWorkspace />,
      },
      {
        path: 'purchases/tanker-receipts/:receiptId',
        element: <TankerReceiptWorkspace />,
      },
      {
        path: 'purchases/purchase-bills',
        element: <PurchaseBillListPage />,
      },
      {
        path: 'purchases/purchase-bills/new',
        element: <PurchaseBillWorkspace />,
      },
      {
        path: 'purchases/purchase-bills/:billId',
        element: <PurchaseBillWorkspace />,
      },
      {
        path: 'purchases/supplier-outstanding',
        element: <SupplierOutstandingPage />,
      },
      {
        path: 'purchases/suppliers',
        element: <SuppliersPage />,
      },
      {
        path: 'purchases/supplier-payments',
        element: <SupplierPaymentsPage />,
      },
      {
        path: 'purchases/supplier-payments/new',
        element: <SupplierPaymentFormPage />,
      },
      {
        path: 'purchases/supplier-payments/:paymentId',
        element: <SupplierPaymentDetailPage />,
      },
      {
        path: 'purchases/items',
        element: <RedirectWithSearchAndHash getDest={() => '/app/inventory/items'} />,
      },
      {
        path: 'purchases/tax-codes',
        element: <RedirectWithSearchAndHash getDest={() => '/app/settings/tax-treatments'} />,
      },
      // Inventory
      {
        path: 'inventory/items',
        element: <ItemsMasterPage />,
      },
      {
        path: 'inventory/items/new',
        element: <ItemFormPage />,
      },
      {
        path: 'inventory/items/:itemId/edit',
        element: <ItemFormPage />,
      },
      {
        path: 'inventory/fuel-stock',
        element: <FuelStockDashboardPage />,
      },
      {
        path: 'inventory/fuel-stock/:tankId',
        element: <TankLedgerPage />,
      },
      {
        path: 'inventory/item-stock',
        element: <ItemStockPage />,
      },
      {
        path: 'inventory/tanks',
        element: <RedirectWithSearchAndHash getDest={() => '/app/settings/tanks'} />,
      },
      {
        path: 'inventory/tanks/:tankId',
        element: <RedirectWithSearchAndHash getDest={(p) => `/app/settings/tanks/${p.tankId}`} />,
      },
      {
        path: 'inventory/dispensers-nozzles',
        element: <RedirectWithSearchAndHash getDest={() => '/app/settings/dispensers-nozzles'} />,
      },
      {
        path: 'inventory/dispensers/:dispenserId',
        element: <RedirectWithSearchAndHash getDest={(p) => `/app/settings/dispensers/${p.dispenserId}`} />,
      },
      {
        path: 'inventory/nozzles/:nozzleId',
        element: <RedirectWithSearchAndHash getDest={(p) => `/app/settings/nozzles/${p.nozzleId}`} />,
      },
      {
        path: 'inventory/lubricants',
        element: <Navigate to="/app/inventory/items?type=stock_item" replace />,
      },
      {
        path: 'inventory/stock-transfers',
        element: <ComingSoonPage title="Stock Transfers" />,
      },
      {
        path: 'inventory/stock-adjustments',
        element: <Navigate to="/app/inventory/item-stock" replace />,
      },
      // Finance
      {
        path: 'finance/cash-banking',
        element: <PaymentAccountsPage />,
      },
      {
        path: 'finance/settlements',
        element: <ComingSoonPage title="Settlements" />,
      },
      {
        path: 'finance/expenses',
        element: <ComingSoonPage title="Expenses" />,
      },
      {
        path: 'finance/vouchers',
        element: <JournalVoucherListPage />,
      },
      {
        path: 'finance/vouchers/new',
        element: <JournalVoucherFormPage />,
      },
      {
        path: 'finance/vouchers/:journalId',
        element: <JournalVoucherDetailPage />,
      },
      {
        path: 'finance/chart-of-accounts',
        element: <ChartOfAccountsPage />,
      },
      {
        path: 'finance/chart-of-accounts/new',
        element: <LedgerAccountFormPage />,
      },
      {
        path: 'finance/chart-of-accounts/:accountId/edit',
        element: <LedgerAccountFormPage />,
      },
      {
        path: 'finance/accounting-periods',
        element: <AccountingPeriodsPage />,
      },
      // Employees Redirects for backward compatibility
      {
        path: 'employees',
        element: <RedirectWithSearchAndHash getDest={() => '/app/settings/employees'} />,
      },
      {
        path: 'employees/:employeeId',
        element: <RedirectWithSearchAndHash getDest={(p) => `/app/settings/employees/${p.employeeId}`} />,
      },
      {
        path: 'employees/designations',
        element: <RedirectWithSearchAndHash getDest={() => '/app/settings/designations'} />,
      },
      {
        path: 'employees/list',
        element: <RedirectWithSearchAndHash getDest={() => '/app/settings/employees'} />,
      },
      {
        path: 'employees/shift-assignments',
        element: <Navigate to="/app/operations/shift-assignments" replace />,
      },
      {
        path: 'operations/shift-assignments',
        element: <ShiftAssignments />,
      },
      {
        path: 'employees/cash-collections',
        element: <Navigate to="/app/operations/shift-cards" replace />,
      },
      {
        path: 'employees/cash-collections/:shiftId',
        element: <RedirectWithSearchAndHash getDest={(p) => `/app/operations/shift-cards/parent/${p.shiftId}`} />,
      },
      {
        path: 'employees/cash-collections/:shiftId/:employeeId',
        element: <Navigate to="/app/operations/shift-cards" replace />,
      },
      {
        path: 'employees/accounts',
        element: <ComingSoonPage title="Employee Accounts" />,
      },

      // Standalone
      {
        path: 'reports',
        element: <ComingSoonPage title="Reports — Coming Later" />,
      },
      // Redirects for Administration backward compatibility
      {
        path: 'administration',
        element: <Navigate to="/app/settings/users" replace />,
      },
      {
        path: 'administration/users',
        element: <Navigate to="/app/settings/users" replace />,
      },
      {
        path: 'administration/users/:membershipId',
        element: <RedirectUserWithId />,
      },
      {
        path: 'administration/roles',
        element: <Navigate to="/app/settings/roles" replace />,
      },
      {
        path: 'administration/roles/:roleId',
        element: <RedirectRoleWithId />,
      },

      // Settings Hub & configuration routes
      {
        path: 'settings',
        element: <SettingsHub />,
      },
      {
        path: 'settings/outlets',
        element: <OutletsManagement />,
      },
      {
        path: 'settings/outlets/:outletId',
        element: <OutletsManagement />,
      },
      {
        path: 'settings/products',
        element: <RedirectWithSearchAndHash getDest={() => '/app/inventory/items?type=fuel'} />,
      },
      {
        path: 'settings/products/:productId',
        element: <RedirectWithSearchAndHash getDest={() => '/app/inventory/items?type=fuel'} />,
      },
      {
        path: 'settings/tax-treatments',
        element: <TaxTreatmentsPage />,
      },
      {
        path: 'settings/product-prices',
        element: <ProductPrices />,
      },
      {
        path: 'settings/forecourt',
        element: <ForecourtSetup />,
      },
      {
        path: 'settings/shifts',
        element: <ShiftDefinitions />,
      },
      {
        path: 'settings/opening-balances',
        element: <OpeningBalances />,
      },
      {
        path: 'settings/outlet-readiness',
        element: <OutletReadiness />,
      },
      {
        path: 'settings/dip-calibrations',
        element: <DipCalibrations />,
      },
      {
        path: 'settings/dip-calibrations/:chartId',
        element: <DipCalibrations />,
      },
      {
        path: 'inventory/tanks/:tankId/calibration',
        element: <RedirectWithSearchAndHash getDest={(p) => `/app/settings/tanks/${p.tankId}/calibration`} />,
      },
      // Migrated Master Data settings routes
      {
        path: 'settings/employees',
        element: <EmployeesManagement />,
      },
      {
        path: 'settings/employees/:employeeId',
        element: <EmployeesManagement />,
      },
      {
        path: 'settings/designations',
        element: <DesignationsManagement />,
      },
      {
        path: 'settings/tanks',
        element: <TanksManagement />,
      },
      {
        path: 'settings/tanks/:tankId',
        element: <TanksManagement />,
      },
      {
        path: 'settings/tanks/:tankId/calibration',
        element: <DipCalibrations />,
      },
      {
        path: 'settings/dispensers-nozzles',
        element: <DispensersNozzlesManagement />,
      },
      {
        path: 'settings/dispensers/:dispenserId',
        element: <DispensersNozzlesManagement />,
      },
      {
        path: 'settings/nozzles/:nozzleId',
        element: <DispensersNozzlesManagement />,
      },
      // Migrated Administration routes
      {
        path: 'settings/users',
        element: <UserManagement />,
      },
      {
        path: 'settings/users/:membershipId',
        element: <UserManagement />,
      },
      {
        path: 'settings/roles',
        element: <RolesManagement />,
      },
      {
        path: 'settings/roles/:roleId',
        element: <RolesManagement />,
      },

      {
        path: 'help-support',
        element: <ComingSoonPage title="Help & Support" />,
      },
    ],
  },

  // Default Redirect
  {
    path: '/',
    element: <Navigate to="/app/dashboard" replace />,
  },
  {
    path: '*',
    element: <Navigate to="/app/dashboard" replace />,
  },
]);
