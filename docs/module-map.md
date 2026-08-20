# Module Map

This document tracks implemented modules and maps planned business components for the Pump ERP system.

## Foundational Core Modules (Implemented)

### 1. Core (`apps/core`, `components/`)
Provides shared utilities, base models, health check endpoints, layout shells, and reusable UI presentation wrappers.
- **Backend**: Health check endpoint (`/api/v1/health/`), test suites.
- **Frontend**: Global layout shell (`AppShell`), selectors, navigation (`Sidebar`, `TopBar`), reusable stats cards, data table, status badges.

### 2. Organizations (`apps/organizations`, `features/administration/`)
Prepares the multi-tenant architecture boundaries.
- **Backend**:
  - Models: `Organisation`, `Outlet`, `OrganisationMembership`, `OutletAccess`
  - Services: `create_organisation_with_owner()`, `create_outlet()`, `add_organisation_member()`, `grant_outlet_access()`, `revoke_outlet_access()`
  - Selectors: `organisations_for_user()`, `outlets_for_user_in_organisation()`, `active_owners_of_organisation()`
  - Admin: Full integration with Django Admin for all models.
- **Frontend**: Navigation organization and outlet selectors with Redux store connections.

### 3. Users (`apps/users/`)
Prepares the user authentication structure.
- **Backend**:
  - Custom `User` model inheriting from `AbstractUser` with UUID primary key, unique normalized email, custom `UserManager`, `display_name`, and optional `phone_number`.
  - Admin: Configured Django Admin using a custom `UserAdmin` subclass.

---

## Planned Business Modules (Postponed)

### 1. Shifts & Operations
- **Shifts**: Track active shifts, cashiers assigned, nozzle allocations, and shift transitions.
- **Meter Readings**: Nozzle opening and closing readings to calculate actual volumes sold.
- **Dip Readings**: Physical tank fuel depth measurements to compare with theoretical stock levels.
- **Day Close**: Reconcile daily metrics, check stock variances, lock records, and sync journal entries.

### 2. Sales
- **Credit Slips**: Manage sales credit vouchers issued to corporate fleet accounts.
- **Cash Sales**: Real-time sales transactions paid via cash, credit cards, or digital wallets.
- **Invoices**: Tax invoices generated for corporate customer bill cycles.
- **Receipts**: Record incoming customer payments against outstanding invoices.
- **Customers**: Manage customer account details, billing terms, and credit limits.

### 3. Purchases
- **Tanker Receipts**: Record incoming fuel tanker decanting, density checks, and temperature factors.
- **Purchase Bills**: Track vendor invoices for fuel shipments and retail items.
- **Suppliers**: Manage supplier contracts and payment schedules.

### 4. Inventory
- **Fuel Stock & Tanks**: Track fuel stock levels inside underground storage tanks.
- **Dispensers & Nozzles**: Map fuel dispensers and individual nozzles to physical fuel tanks.
- **Lubricants**: Manage retail items, lubricants, inventory levels, and sales margins.
- **Stock Transfers & Adjustments**: Move inventory between stations and adjust variances.

### 5. Finance
- **Cash & Banking**: Manage cash safe vaults, bank deposits, and credit card settlements.
- **Expenses**: Record daily station operating expenses.
- **Chart of Accounts**: Double-entry ledger core accounts setup.

### 6. Employees
- **Employees**: Manage station workers, roles, and shifts.
- **Shift Assignments**: Track roster schedules.
- **Cash Collections**: Reconcile cash collected by nozzle cashiers at shift close.
