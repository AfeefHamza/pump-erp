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
import { FuelProducts } from '@/features/settings/pages/FuelProducts';
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
import { LiveShiftWorkspace } from '@/features/operations/pages/LiveShiftWorkspace';
import { MeterReadingsPage } from '@/features/operations/pages/MeterReadingsPage';
import { DipReadingsPage } from '@/features/operations/pages/DipReadingsPage';
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
      // Operations
      {
        path: 'operations/shifts',
        element: <ShiftListPage />,
      },
      {
        path: 'operations/shifts/:shiftId',
        element: <LiveShiftWorkspace />,
      },
      {
        path: 'operations/meter-readings',
        element: <MeterReadingsPage />,
      },
      {
        path: 'operations/dip-readings',
        element: <DipReadingsPage />,
      },
      {
        path: 'operations/day-close',
        element: <ComingSoonPage title="Day Close" />,
      },
      // Sales
      {
        path: 'sales/credit-slips',
        element: <ComingSoonPage title="Credit Slips" />,
      },
      {
        path: 'sales/cash-sales',
        element: <ComingSoonPage title="Cash Sales" />,
      },
      {
        path: 'sales/invoices',
        element: <ComingSoonPage title="Invoices" />,
      },
      {
        path: 'sales/receipts',
        element: <ComingSoonPage title="Receipts" />,
      },
      {
        path: 'sales/customers',
        element: <ComingSoonPage title="Customers" />,
      },
      // Purchases
      {
        path: 'purchases/tanker-receipts',
        element: <ComingSoonPage title="Tanker Receipts" />,
      },
      {
        path: 'purchases/purchase-bills',
        element: <ComingSoonPage title="Purchase Bills" />,
      },
      {
        path: 'purchases/suppliers',
        element: <ComingSoonPage title="Suppliers" />,
      },
      // Inventory
      {
        path: 'inventory/fuel-stock',
        element: <ComingSoonPage title="Fuel Stock" />,
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
        element: <ComingSoonPage title="Lubricants" />,
      },
      {
        path: 'inventory/stock-transfers',
        element: <ComingSoonPage title="Stock Transfers" />,
      },
      {
        path: 'inventory/stock-adjustments',
        element: <ComingSoonPage title="Stock Adjustments" />,
      },
      // Finance
      {
        path: 'finance/cash-banking',
        element: <ComingSoonPage title="Cash & Banking" />,
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
        element: <ComingSoonPage title="Vouchers" />,
      },
      {
        path: 'finance/chart-of-accounts',
        element: <ComingSoonPage title="Chart of Accounts" />,
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
        element: <ComingSoonPage title="Cash Collections" />,
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
        element: <FuelProducts />,
      },
      {
        path: 'settings/products/:productId',
        element: <FuelProducts />,
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
