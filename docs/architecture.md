# System Architecture

This document describes the architectural decisions and patterns governing the Pump ERP SaaS platform.

## Repository Pattern
The system is built as a single repository containing two independent and decoupled components:
1. `frontend/` - Single-Page React Application (Vite, TypeScript, Redux).
2. `backend/` - Django Python REST API.

Both environments communicate exclusively via HTTP REST APIs.

---

## Architectural Decisions

### 1. Modular Monolith Backend
The backend is organized as a Modular Monolith. 
- Python modules are encapsulated in independent apps under the `backend/apps/` folder.
- Tight coupling is avoided: apps should interact through services, selectors, or events, and avoid direct circular imports.
- App-specific business rules remain encapsulated in their respective domains.

### 2. Feature-Oriented Frontend
The frontend follows a domain-driven feature structure (`frontend/src/features/`).
- Shared/Generic elements go to `components/` (e.g. data tables, buttons, feedback cards).
- Domain-specific views, slices, and utility functions live within their respective feature folder (e.g. `features/sales/`, `features/inventory/`).
- This minimizes folder jumping and makes domain expansion extremely local.

### 3. PostgreSQL on Windows
PostgreSQL 16 is installed directly on the developer's Windows OS without virtualization (Docker) to keep setups lightweight and natively high-performing. All configuration endpoints connect via environment variables.

### 4. API as the Security Authority
The backend API is the absolute authority for authorization, validation, and multi-tenant security.
- The frontend only manages client-side presentation states.
- Every API endpoint must perform validation and confirm that the user has tenant-level permission to view or execute operations.

### 5. Custom User Model & Identity
The platform uses a custom `User` model (`users.User`) extending Django's `AbstractUser` with a UUID primary key. 
- Email is the primary identifier (`USERNAME_FIELD = 'email'`), required, unique, and normalized.
- The default `username` is retained internally for backward compatibility with Django and third-party packages.
- Additional fields include `display_name` and optional `phone_number`.

### 6. Tenant Hierarchy and Isolation Principles
The system operates as a multi-tenant SaaS platform where:
- **Organisation**: Represents a tenant (legal entity/business owner). Holds configuration details like currency, timezone, and financial year settings.
- **Outlet**: Represents a physical gas station/retail outlet belonging to an Organisation.
- **OrganisationMembership**: Connects a `User` to an `Organisation` with specific roles (`owner`, `administrator`, `member`).
- **OutletAccess**: Grants a specific user membership access to specific `Outlet`s.

#### Why Organisation is not stored directly on the User model:
Storing `organisation_id` directly on the `User` table would restrict a user to exactly one tenant. In retail fuel operations, business owners frequently own multiple distinct corporate entities, and accounting/consulting services require accessing multiple client organizations under a single user account.

#### Security & Access Boundaries:
- A user may belong to multiple organisations.
- Membership in one organisation grants no access to another.
- Outlet access is always scoped through organisation membership.
- An outlet cannot be assigned through a membership belonging to a different organisation. Model-level validation (`clean()`) and service-layer validation enforce this constraint.
- The frontend is never treated as a security boundary. All API querysets/selectors must filter by the tenant/outlet context securely on the backend.

### 7. Redux Scope Limitation
Redux is utilized strictly and exclusively for genuine global UI states:
- Selected active organization ID.
- Selected active station outlet ID.
- Global navigation sidebar expanded/collapsed state.

All other local states (such as form inputs, active modal windows, search filters, and table pagination) must reside in local component state (`useState`) to prevent state bloating and unnecessary renders.

### 8. Financial Precision (Decimals)
All financial calculations, rates, quantities, and fuel volumes must use decimal structures on both the frontend and backend.
- **Backend**: Django `DecimalField` and Python's `decimal.Decimal` must be used. Never use floats.
- **Frontend**: Values must be formatted using utility functions with decimal formatting (e.g., using `Intl.NumberFormat` or custom rounding utilities) to prevent floating-point calculation anomalies.

### 9. Immutable Posted Transactions
Once a shift is closed, or a voucher/invoice is posted, the transaction becomes immutable. No deletions or edits are allowed. Adjustments must be performed through reversal transactions or adjustments (debit/credit notes, adjustments).

### 10. Business Logic Boundaries
Backend business logic must remain decoupled from views and serializers:
- **Models**: Responsible for state, simple validations, and DB invariants.
- **Services**: Responsible for executing commands, business logic side effects, and state mutations.
- **Selectors**: Responsible for querying and formatting complex, multi-model reports or read actions.
- **Views**: Responsible exclusively for HTTP request/response validation and routing.

### 11. Postponements
- **Reports**: Postponed for the core ERP development phase. Currently represented by placeholder pages.
- **Authentication/JWT**: Postponed. Current endpoints are open (public) for foundation testing.
