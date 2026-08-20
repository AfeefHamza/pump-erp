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

---

## Session-Based Authentication

### Why Session Authentication was Selected
Rather than using JWT tokens, which are prone to XSS-based theft if stored in JavaScript-accessible storage (like `localStorage` or `sessionStorage`), the platform uses traditional **Django Session Authentication** with secure **HttpOnly cookies**.
- **No JS Exposure**: The session cookie (`sessionid`) is marked `HttpOnly`, preventing client-side scripts from reading or stealing session identifiers.
- **Backend Authority**: The server is the absolute authority for validating sessions, managing token lifespan, and enforcing authorization boundaries.
- **Session Rotation**: The session key is automatically rotated upon successful login using Django's built-in session renewal, mitigating session fixation attacks.

### CSRF Protection Flow
To prevent Cross-Site Request Forgery (CSRF) attacks:
1. The frontend client calls the CSRF initialization endpoint: `GET /api/v1/auth/csrf/`.
2. The backend responds by setting the `csrftoken` cookie (HttpOnly=False, allowing JavaScript to read it) and returning the token in the JSON body: `{"csrfToken": "..."}`.
3. The frontend fetch client caches this token in memory.
4. For all unsafe HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`), the frontend client automatically appends the token in the `X-CSRFToken` header of the request.
5. In development, SameSite is set to `Lax` to allow local development over HTTP.

### Production Cookie Requirements
When deploying to production, the following settings must be set to `True` to ensure HTTPS-only communication:
- `SESSION_COOKIE_SECURE = True`
- `CSRF_COOKIE_SECURE = True`
- `SESSION_COOKIE_SAMESITE = 'Lax'`
- `CSRF_COOKIE_SAMESITE = 'Lax'`
- `SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')`

### Signup Transaction
Signup is implemented as a single, atomic database transaction (`transaction.atomic` in the `SignupSerializer.create` method):
1. **User Creation**: The user is created using `User.objects.create_user`. The email is normalized to lowercase to prevent duplicates.
2. **Organisation Creation**: The organisation is created with the normalized organisation code (stripped and uppercased).
3. **Owner Membership**: An active `OrganisationMembership` is created linking the User and Organisation as an `owner`.
4. **Session Log In**: If any step fails (e.g. duplicate email or organisation code), the entire transaction is rolled back and no records are saved. On success, the user is authenticated into the session.

### Local Password Reset Testing
The password reset flow uses Django's built-in token mechanisms.
1. The client requests a reset link by calling `POST /api/v1/auth/password-reset/request/`.
2. The backend generates a temporary secure token and encodes the user ID.
3. The link is built as `{settings.PASSWORD_RESET_URL}?uid={uid}&token={token}`.
4. During local development, the email is printed to the Django development console because `EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'`.
5. The developer copies the link from the console, opens it in the browser, and submits the new password to `POST /api/v1/auth/password-reset/confirm/`.

### Organisation Context Loading
Upon application startup, the frontend:
1. Calls `/api/v1/auth/csrf/` to initialize CSRF token cache.
2. Calls `/api/v1/auth/me/` to load the authenticated user's profile, including their list of accessible organisations and respective outlets.
3. Restores the UI. The sidebar organization and outlet selectors are populated dynamically using this response instead of hardcoded demo lists.

### Onboarding Transaction
Initial onboarding is executed as a single atomic database transaction (`transaction.atomic` in the `complete_onboarding` service function):
1. **Membership Verification**: Verifies that the acting user has an active `owner` or `administrator` membership for the organisation.
2. **Organisation Update**: Saves the business profile fields and marks `onboarding_status = 'completed'` with a timestamp.
3. **First Outlet Setup**: Creates the first outlet or updates it if one was already registered.
4. **Financial Year Initialization**: Creates the default open `FinancialYear` ensuring dates are valid and non-overlapping.
5. **Rollback Safety**: Any validation error or database failure causes the entire sequence of changes to roll back immediately, preventing partial setup states.


