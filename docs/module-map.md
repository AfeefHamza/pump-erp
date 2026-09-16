# Module Map

This document tracks implemented modules and maps planned business components for the Pump ERP system.

## Foundational Core Modules (Implemented)

### 1. Core (`apps/core`, `components/`)
Provides shared utilities, base models, health check endpoints, layout shells, and reusable UI presentation wrappers.
- **Backend**: Health check endpoint (`/api/v1/health/`), test suites.
- **Frontend**: Global layout shell (`AppShell`), selectors, navigation (`Sidebar`, `TopBar`), reusable stats cards, data table, status badges.

### 2. Organizations (`apps/organizations`, `features/administration/`)
Prepares the multi-tenant architecture boundaries and onboarding setup.
- **Backend**:
  - Models: `Organisation` (extended with profile fields & onboarding status), `Outlet` (extended with brand and outlet type), `OrganisationMembership`, `OutletAccess`, and `FinancialYear` (scoped to organisation with non-overlapping and single-default validations).
  - Services: `create_organisation_with_owner()`, `create_outlet()`, `add_organisation_member()`, `grant_outlet_access()`, `revoke_outlet_access()`, and `complete_onboarding()` (atomic setup transaction).
  - Selectors: `organisations_for_user()`, `outlets_for_user_in_organisation()`, `active_owners_of_organisation()`
  - Admin: Full integration with Django Admin for all models.
  - API: Tenant-safe REST endpoints under `/api/v1/organisations/` for profiles, outlets, financial years, and onboarding.
- **Frontend**: 
  - Dynamic navigation organization and outlet selectors with Redux store connections.
  - Wizard-guided onboarding page at `/app/onboarding` for setting up first organisation profile, outlet, and financial year.

### 3. Users & Authentication (`apps/users/`, `features/auth/`)
Implements secure user authentication, signup, and session management.
- **Backend**:
  - Custom `User` model inheriting from `AbstractUser` with UUID primary key, unique normalized email, custom `UserManager`, `display_name`, and optional `phone_number`.
  - Database-level case-insensitive unique constraint on email.
  - Custom `CaseInsensitiveModelBackend` for email login.
  - DRF API endpoints under `/api/v1/auth/` for `signup/`, `login/`, `logout/`, `me/`, `csrf/`, and `password-reset/`.
  - Secure session-based HttpOnly cookie authentication and CSRF token verification.
- **Frontend**:
  - Redux `auth` slice with thunks for initial session retrieval, login, signup, and logout.
  - Route protection wrapper (`ProtectedRoute`) for guarding guest and protected path namespaces.
  - Fully responsive, glassmorphism-styled pages for `/login`, `/signup`, `/forgot-password`, and `/reset-password`.
  - Dynamic user profile and context bindings for `OrganisationSelector`, `OutletSelector`, and `TopBar`.

---

### 4. Live Shift Operations (`apps/shifts/`, `features/operations/`)
Live forecourt shift operations, meter totalizers, testing records, in-shift price segments, tank dip observations, and shift closing/reopening workflows.
- **Backend**:
  - Models: `OperationalShift`, `OperationalShiftStaff`, `OperationalShiftNozzleAssignment`, `ShiftNozzleMeter`, `ShiftNozzlePriceSegment`, `ShiftMeterEvent`, `ShiftTestingRecord`, `ShiftTankDipObservation`, `ShiftActivityLog`.
  - Services: `prepare_shift_opening()`, `open_operational_shift()`, `update_open_shift_assignments()`, `record_closing_meter_reading()`, `record_meter_event()`, `record_testing()`, `record_shift_dip()`, `apply_product_price_change_during_shift()`, `close_operational_shift()`, `reopen_operational_shift()`, `log_shift_activity()`.
  - Selectors: `get_open_shift_for_outlet()`, `derive_nozzle_opening_reading()`, `calculate_shift_totals()`, `preview_shift_closing_data()`, `check_can_reopen_shift()`.
  - APIs: Comprehensive REST API under `/api/v1/organisations/<org_id>/outlets/<outlet_id>/operational-shifts/`.
- **Frontend**:
  - Live Shift Operations page at `/app/operations/shifts`.
  - Shift Workspace at `/app/operations/shifts/:shiftId` with real-time overview, meters, testing deductions, tank dips, price segments, attendants, and audit trail.
  - Dedicated operational pages at `/app/operations/meter-readings` and `/app/operations/dip-readings`.
  - Guided step-by-step `OpenShiftWizard`, `CloseShiftModal`, `ReopenShiftModal`, `PriceChangeModal`, `MeterEventModal`, and `RecordTestingModal`.

### 5. Collections, Credit Slips & Shift Reconciliation (Milestone 10, Implemented)
Employee-wise collection accountability, customer-linked credit slips, cash denominations, authorized shift deductions, and shift reconciliation.
- **Backend**:
  - Models: `Customer`, `CustomerOutletAssignment`, `FuelCreditSlip`, `EmployeeShiftCollection`, `EmployeeCashDenomination`, `EmployeeShiftDeduction`, `EmployeeShiftSettlement`, `ShiftReconciliation`, `CollectionAuditLog`.
  - Services: `create_customer()`, `update_customer()`, `deactivate_customer()`, `create_credit_slip()`, `update_credit_slip()`, `void_credit_slip()`, `create_employee_collection()`, `update_employee_collection()`, `void_employee_collection()`, `create_employee_shift_deduction()`, `void_employee_shift_deduction()`, `reconcile_employee_settlement()`, `reopen_employee_settlement()`, `calculate_shift_reconciliation()`, `get_customer_credit_position()`.
  - Selectors: `get_employee_accountability_summary()`, `preview_employee_reconciliation()`, `check_can_reopen_shift()` (enforces settlement lock).
  - APIs: 20 tenant-safe REST endpoints under `/api/v1/organisations/<org_id>/` and `/outlets/<outlet_id>/operational-shifts/<shift_id>/`.
- **Frontend**:
  - Customer Master at `/app/sales/customers` and `/app/sales/customers/:customerId`.
  - Credit Slips management at `/app/sales/credit-slips`.
  - Cash Collections shifts overview at `/app/employees/cash-collections`.
  - Shift Collections Workspace at `/app/employees/cash-collections/:shiftId`.
  - Attendant Detail Workspace at `/app/employees/cash-collections/:shiftId/:employeeId`.
  - Shift Financial Reconciliation at `/app/operations/shifts/:shiftId/reconciliation`.

---

### 6. Purchases & Fuel Stock Ledger (Milestone 11, Implemented)
Document-based backdated tanker receipts, fuel stock ledger, append-only movement journal, balance projections, and dip variance acknowledgements.
- **Backend**:
  - **Purchases (`apps/purchases/`)**:
    - Models: `Supplier`, `TankerReceipt`, `TankerReceiptProductLine`, `TankerReceiptTankAllocation`, `TankerReceiptAttachment`.
    - Services: `create_supplier()`, `update_supplier()`, `create_tanker_receipt()`, `update_tanker_receipt()`, `confirm_tanker_receipt()`, `void_tanker_receipt()`, `acknowledge_receipt_variance()`, `upload_receipt_attachment()`, `preview_dip_volume_for_tank()`.
    - Selectors: `get_tanker_receipt_detail()`, `list_tanker_receipts_for_outlet()`, `list_suppliers_for_org()`.
    - APIs: 12 REST endpoints under `/api/v1/organisations/<org_id>/suppliers/` and `/outlets/<outlet_id>/tanker-receipts/`.
  - **Inventory (`apps/inventory/`)**:
    - Models: `TankStockMovement` (append-only, immutable, idempotency key), `TankStockBalanceProjection` (mutable balance projection), `StockAdjustment`, `StockAdjustmentAttachment`.
    - Services: `recalculate_tank_projection()`, `post_tank_stock_movement()`, `post_opening_balance_movements()`, `post_tanker_receipt_movements()`, `reverse_tanker_receipt_movements()`, `sync_shift_card_stock_movements()`, `reverse_shift_card_stock_movements()`, `record_stock_adjustment()`, `reverse_stock_adjustment()`, `backfill_operational_stock_data()`.
    - Selectors: `get_latest_physical_dip_for_tank()`, `get_tank_stock_summary()`, `get_tank_movement_ledger()`.
    - Management command: `python manage.py backfill_fuel_stock`.
    - APIs: 8 REST endpoints under `/api/v1/organisations/<org_id>/outlets/<outlet_id>/fuel-stock/`.
- **Frontend**:
  - Suppliers Master at `/app/purchases/suppliers`.
  - Tanker Receipts list at `/app/purchases/tanker-receipts`.
  - Tanker Receipt Workspace at `/app/purchases/tanker-receipts/new` and `/app/purchases/tanker-receipts/:receiptId`.
  - Fuel Stock Dashboard at `/app/inventory/fuel-stock`.
  - Tank Movement Ledger at `/app/inventory/fuel-stock/:tankId`.
  - Stock Adjustment Drawer (`StockAdjustmentDrawer`) for recording authorised offsets.

---

### 7. Purchase Bills & Supplier Outstanding (Milestone 12, Implemented)
Financial invoice tracking for fuel deliveries and goods, strictly isolated from physical inventory movements. Tracks accounts payable, supplier ageing buckets, and chronological ledger statements.
- **Backend (`apps/purchases/`)**:
  - Models: `PurchaseBillSequence` (concurrency-locked document numbering), `PurchaseBill`, `PurchaseBillReceiptLink` (single source of truth for receipt links; active when `released_at IS NULL`), `PurchaseBillLine`, `PurchaseBillAdjustmentComponent` (charges, discounts, taxes, round-off with base = gross lines minus line discounts), `PurchaseBillAttachment`, `PurchaseBillAuditLog`. Direct deletion blocked with `on_delete=PROTECT` on audit records.
  - Services: `normalize_invoice_number()`, `generate_next_bill_number()`, `calculate_bill_totals()`, `create_purchase_bill()`, `update_purchase_bill()`, `void_purchase_bill()`, `upload_bill_attachment()`. Guard prevents voiding tanker receipts linked to active purchase bills.
  - Selectors: `list_purchase_bills()`, `get_purchase_bill_detail()`, `get_available_tanker_receipts_for_billing()`, `get_supplier_outstanding_summary()` (5 ageing buckets: Not Due, 1–30, 31–60, 61–90, >90), `get_supplier_statement()`.
  - APIs: 8 REST endpoints under `/api/v1/organisations/<org_id>/outlets/<outlet_id>/purchase-bills/` and `/supplier-outstanding/`.
- **Frontend**:
  - Purchase Bills List at `/app/purchases/purchase-bills` with KPI cards, multi-criteria filters, and atomic void modal.
  - Purchase Bill Workspace at `/app/purchases/purchase-bills/new` and `/app/purchases/purchase-bills/:billId` with 9 sections (Supplier/Invoice, Link Receipts, Product Lines, Adjustments, Server-Managed Totals, Due Date, Attachments, Notes, Audit Timeline).
  - Supplier Outstanding & Ageing at `/app/purchases/supplier-outstanding` with 5-bucket ageing breakdown and chronological statement drawer.

### 8. Cash/Bank Accounts & Supplier Payments (Milestone 13, Implemented)
- **Backend (`apps/finance/`)**:
  - Cash and bank payment-account master with organisation-wide or outlet-specific scope.
  - Direct-save Supplier Payments with immutable Purchase Bill allocations and unapplied supplier advances.
  - Append-only account movements; voiding creates an equal reversal and restores affected bill projections.
  - Server-derived `amount_paid` and `outstanding_amount`, open-bill selectors, supplier statement credits, permissions and reconciliation command.
- **Frontend**:
  - Cash & Banking account master at `/app/finance/cash-banking`.
  - Supplier Payments list at `/app/purchases/supplier-payments`.
  - Full-page payment entry at `/app/purchases/supplier-payments/new` with oldest-first auto-allocation.
  - Read-only payment detail, additional allocation and controlled void workflow.

---

## Latest Implemented Milestone

### 9. Sales Invoices, Customer Receipts & Item Stock (Milestone 14, Implemented)
- **Backend (`apps/sales/`)**: Immutable cash/credit Sales Invoices, server-calculated effective-dated Tax Treatments, customer receipts and invoice allocations, unallocated customer advances, customer outstanding selectors, controlled void/reversal services, and idempotent document numbering.
- **Inventory (`apps/inventory/`)**: Ordinary quantity-ledger stock for stock items and lubricants, append-only item movements, balance projections, direct stock adjustments, and exact reversal entries. Product sales reduce this ledger; services and non-stock items do not.
- **Fuel safety**: Petrol/diesel cannot be entered as a direct product line. Existing meter-linked Credit Slips are selected for billing and do not create a second sale or tank-stock movement. Non-GST Petroleum remains distinct from Exempt and Out of Scope.
- **Finance integration**: Cash invoices and customer receipts create positive Cash/Bank account movements. Voiding creates equal reversal movements and restores invoice allocations.
- **Frontend**: Full-page Sales Invoice and Customer Receipt workspaces, invoice list/detail/print, Customer Outstanding, and Item Stock ledger/adjustment pages.

### 10. Accounting Core (Milestone 15, Implemented)
- **Chart of Accounts**: Organisation-scoped account hierarchy with standard system accounts, posting controls, safe deactivation and structural locking after use.
- **General Ledger**: Exact double-entry Journal Vouchers with immutable account snapshots, idempotent numbering, tenant/outlet validation and reversal-only correction.
- **Reports**: Outlet Trial Balance and individual account-ledger selectors are derived from posted journal lines.
- **Period control**: Open Financial Year validation plus audited organisation-wide or outlet-month locks. This is not an operational Day Close.
- **Frontend**: Chart of Accounts and Trial Balance, full-page Journal Voucher entry, read-only voucher detail/reversal, and Accounting Period controls under Finance.

### 11. Automatic Ledger Posting (Milestone 16, Implemented)
- **Operational posting**: Sales Invoices, Purchase Bills, Customer Receipts and Supplier Payments create balanced General Ledger journals inside the same database transaction.
- **Mappings**: Every Cash & Banking account has one stable Asset ledger; standard Receivable, Payable, Sales, Purchases, Input/Output Tax and customer/supplier advance accounts are used automatically.
- **Corrections**: Posted source documents are immutable. Voiding creates an exact linked reversal; later supplier-advance allocations create a separate Payable/Advance journal.
- **Traceability**: Source APIs expose their journal ID, transaction screens link to the voucher, and Chart of Accounts opens a chronological running ledger.
- **Safe migration**: `reconcile_general_ledger` previews missing historical journals by default and writes only with the explicit `--apply` flag.
- **Valuation boundary**: This milestone does not invent stock values. COGS and Inventory-value journals remain pending until a valuation method is implemented.

---

## Planned Business Modules (Remaining)

### 3. Purchases (Remaining)
- **Debit/Credit Notes**: Supplier debit notes, credits and return reconciliation.

### 4. Inventory (Remaining)
- **Sales Margins**: Cost/valuation-based product margin reporting.
- **Stock Transfers**: Move inventory between stations and bulk depots.

### 5. Finance
- **Cash & Banking**: Manage cash safe vaults, bank deposits, and credit card settlements.
- **Expenses**: Record daily station operating expenses.
- **Inventory valuation postings**: Connect valued stock movements and COGS to the General Ledger after a valuation method is implemented.

### 6. Employees
- **Shift Assignments**: Track roster schedules.
- **Employee Accounts**: Ledger postings for salary deductions and permanent employee recovery.
