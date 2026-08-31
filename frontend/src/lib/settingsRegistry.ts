import { 
  Store, 
  Users, 
  Shield, 
  Fuel, 
  Database, 
  Sliders, 
  Clock, 
  ClipboardCheck, 
  Contact,
  type LucideIcon
} from 'lucide-react';

export interface SettingItem {
  label: string;
  description: string;
  route: string;
  anyOfPermissions: string[];
  keywords: string[];
  icon: LucideIcon;
}

export interface SettingCategory {
  category: string;
  items: SettingItem[];
}

export const settingsRegistry: SettingCategory[] = [
  {
    category: 'ORGANISATION',
    items: [
      {
        label: 'Outlets',
        description: 'Manage stations & location codes',
        route: '/app/settings/outlets',
        anyOfPermissions: ['outlet.view'],
        keywords: ['outlets', 'locations', 'stations', 'branches', 'code'],
        icon: Store,
      },
    ],
  },
  {
    category: 'PEOPLE & ACCESS',
    items: [
      {
        label: 'Employees',
        description: 'Attendants, cashiers & supervisors',
        route: '/app/settings/employees',
        anyOfPermissions: ['employee.view'],
        keywords: ['employees', 'workers', 'staff', 'master', 'profiles', 'active list'],
        icon: Users,
      },
      {
        label: 'Designations',
        description: 'Manage job roles & system mapping',
        route: '/app/settings/designations',
        anyOfPermissions: ['employee_designation.view'],
        keywords: ['designations', 'job titles', 'employee roles', 'occupations'],
        icon: Contact,
      },
      {
        label: 'Users',
        description: 'System users & active invitations',
        route: '/app/settings/users',
        anyOfPermissions: ['user.view'],
        keywords: ['users', 'members', 'employees', 'invitations', 'access'],
        icon: Users,
      },
      {
        label: 'Roles & Permissions',
        description: 'Access control & permission flags',
        route: '/app/settings/roles',
        anyOfPermissions: ['role.view'],
        keywords: ['roles', 'permissions', 'security', 'authorization', 'access rights'],
        icon: Shield,
      },
    ],
  },
  {
    category: 'FUEL & FORECOURT',
    items: [
      {
        label: 'Products & Pricing',
        description: 'Fuel grades, products & tax rules',
        route: '/app/settings/products',
        anyOfPermissions: ['fuel_product.view'],
        keywords: ['products', 'pricing', 'fuel grades', 'tax', 'petrol', 'diesel'],
        icon: Fuel,
      },
      {
        label: 'Product Prices',
        description: 'Daily fuel selling prices',
        route: '/app/settings/product-prices',
        anyOfPermissions: ['product_price.view'],
        keywords: ['product prices', 'selling prices', 'daily prices', 'fuel rates'],
        icon: Fuel,
      },
      {
        label: 'Tanks',
        description: 'Storage capacity & fuel link master',
        route: '/app/settings/tanks',
        anyOfPermissions: ['tank.view'],
        keywords: ['tanks', 'storage', 'capacities', 'fuel stock', 'inventory'],
        icon: Database,
      },
      {
        label: 'Dispensers & Nozzles',
        description: 'Pumps, hoses & tank mappings',
        route: '/app/settings/dispensers-nozzles',
        anyOfPermissions: ['dispenser.view', 'nozzle.view'],
        keywords: ['dispensers', 'nozzles', 'pumps', 'hoses', 'tank mapping'],
        icon: Sliders,
      },
      {
        label: 'Forecourt Setup',
        description: 'Visual maps of storage & dispensers',
        route: '/app/settings/forecourt',
        anyOfPermissions: ['tank.view', 'dispenser.view', 'nozzle.view'],
        keywords: ['forecourt setup', 'layouts', 'visual maps', 'pumps layout'],
        icon: Sliders,
      },
      {
        label: 'Dip Calibration Charts',
        description: 'Dip height volume certified charts',
        route: '/app/settings/dip-calibrations',
        anyOfPermissions: ['dip_calibration.view'],
        keywords: ['dip calibration', 'charts', 'tank calibration', 'volume chart', 'height'],
        icon: Database,
      },
    ],
  },
  {
    category: 'OPERATIONS SETUP',
    items: [
      {
        label: 'Shift Definitions',
        description: 'Daily operational shifts & timing rules',
        route: '/app/settings/shifts',
        anyOfPermissions: ['shift_definition.view'],
        keywords: ['shift definitions', 'work shifts', 'shift timings', 'hours'],
        icon: Clock,
      },
      {
        label: 'Opening Balances',
        description: 'Initial stock, cash & meter readings',
        route: '/app/settings/opening-balances',
        anyOfPermissions: ['opening_balance.view'],
        keywords: ['opening balances', 'starting cash', 'initial stock', 'pump meters'],
        icon: Sliders,
      },
      {
        label: 'Outlet Readiness',
        description: 'Setup checker before opening',
        route: '/app/settings/outlet-readiness',
        anyOfPermissions: ['outlet.view'],
        keywords: ['outlet readiness', 'checklist', 'verification', 'open status'],
        icon: ClipboardCheck,
      },
    ],
  },
];
