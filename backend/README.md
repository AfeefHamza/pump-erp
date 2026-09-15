# Pump ERP Backend

This is the Python Django backend for the Pump ERP SaaS system.

## Stack
- Python 3.14.7
- Django 5.2
- Django REST Framework 3.15
- PostgreSQL 16 for development and tests

## Folder Structure
- `config/`: Global project configurations (`settings.py`, `urls.py`).
- `apps/`: Application modules namespace.
  - `core/`: Health check, reusable views, utilities, base classes.
  - `users/`: Custom users and session authentication.
  - `organizations/`: Organisations, outlets, memberships, roles and permissions.
  - `forecourt/`: Fuel compatibility, prices, tanks, dispensers and nozzles.
  - `inventory/`: Canonical Item Master and fuel-stock ledger.
  - `shifts/`: Shift Cards, readings, collections and reconciliation.
  - `purchases/`: Suppliers, tanker receipts, Purchase Bills and taxation.
  - `finance/`: Payment Accounts, Supplier Payments, allocations and money movements.

## Quick Start

1. Create Python virtual environment:
   ```bash
   python -m venv .venv
   ```

2. Activate virtual environment:
   - On Windows (PowerShell):
     ```powershell
     .venv\Scripts\Activate.ps1
     ```
   - On Linux/macOS:
     ```bash
     source .venv/bin/activate
     ```

3. Install requirements:
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

4. Configure local Environment:
   - Copy `.env.example` to `.env`
   - Adjust values for database, secret key, debug mode.

5. Run Django Server:
   ```bash
   python manage.py runserver
   ```

6. Run Backend Tests:
   To run the full suite (including new authentication, atomic signup, case-insensitive uniqueness, and token confirmation tests):
   ```bash
   python manage.py test
   ```

## Local Password Reset testing
The project is configured to use the Django **console email backend** for local development. 
When you trigger a password reset request via the `POST /api/v1/auth/password-reset/request/` endpoint, the reset email is printed directly into your running `runserver` terminal. 
Copy the generated URL (e.g., `http://localhost:5173/reset-password?uid={uid}&token={token}`) and paste it into your browser to verify the password reset confirmation form interface.
