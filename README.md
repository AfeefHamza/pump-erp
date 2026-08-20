# Pump ERP - Multi-Tenant Fuel Station ERP SaaS

A professional, high-performance, multi-tenant SaaS Enterprise Resource Planning (ERP) platform designed specifically for Fuel Station Networks.

## Technology Stack

### Frontend
- **Framework**: React 19 (TypeScript, Vite)
- **State Management**: Redux Toolkit (React Redux)
- **Routing**: React Router v6
- **Styling**: Vanilla CSS (Premium design tokens, responsive, no CSS libraries)
- **Icons**: Lucide React

### Backend
- **Core**: Python 3.14.7, Django 5.2
- **API**: Django REST Framework (DRF) 3.15
- **Database**: PostgreSQL 16 (on Windows)
- **Configurations**: django-environ, django-cors-headers, psycopg (v3)

---

## Folder Structure

```text
pump-erp/
├── frontend/             # Vite + React TypeScript application
│   ├── src/
│   │   ├── app/          # Store, Router, Layouts
│   │   ├── components/   # Reusable UI components
│   │   ├── features/     # Feature-oriented domain modules
│   │   ├── styles/       # Vanilla CSS tokens and styles
│   │   ├── types/        # TypeScript interfaces
│   │   └── lib/          # Helper utils and configurations
│   ├── tsconfig.json
│   └── vite.config.ts
├── backend/              # Django Python REST API
│   ├── .venv/            # Python virtual environment (ignored)
│   ├── config/           # Django project settings
│   ├── apps/             # Backend domain modules (core, organizations, users)
│   ├── manage.py
│   ├── requirements.txt
│   └── .env.example
├── docs/                 # System documentation
├── scripts/              # Automation and helper scripts (if any)
├── .editorconfig
├── .gitignore
├── README.md
└── package.json          # Root scripts for running/validating the project
```

---

## Prerequisites

Ensure you have the following installed on your machine:
1. **Git** (version 2.x)
2. **Node.js** (version 22.x) and **npm** (version 10.x)
3. **Python** (version 3.14.7)
4. **PostgreSQL** (version 16.x) installed directly on Windows

---

## Getting Started

### 1. Database Setup (PostgreSQL 16)
Create the database and user inside your PostgreSQL instance. Run the following commands in your PostgreSQL shell (`psql`):

```sql
-- Connect to psql as superuser (e.g. postgres)
-- Create the application database
CREATE DATABASE pump_erp;

-- Create the database user
CREATE USER pump_user WITH PASSWORD 'pump_password';

-- Grant privileges to the user on the database
GRANT ALL PRIVILEGES ON DATABASE pump_erp TO pump_user;
```

### 2. Backend Virtual Environment & Installation
Navigate to the root directory and set up the Python environment:

```powershell
# Create virtual environment
python -m venv backend/.venv

# Activate virtual environment
# On Windows PowerShell:
backend\.venv\Scripts\Activate.ps1

# Upgrade pip and install packages
pip install --upgrade pip
pip install -r backend/requirements.txt
```

### 3. Environment Configuration
Copy the `.env.example` in `backend/` to `.env`:

```powershell
Copy-Item backend\.env.example backend\.env
```

Open `backend/.env` and update credentials if your local database uses a different user or password:
```text
DJANGO_SECRET_KEY=your-custom-secret-key-here
DJANGO_DEBUG=True
DB_NAME=pump_erp
DB_USER=pump_user
DB_PASSWORD=pump_password
DB_HOST=127.0.0.1
DB_PORT=5432
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

### 4. Frontend Setup
Navigate to the `frontend/` directory and install dependencies:

```powershell
cd frontend
npm install
```

---

## Development Commands

### Running Backend API Server
With the backend virtual environment activated, run:
```powershell
python backend/manage.py runserver
```
The API is available at `http://localhost:8000/api/v1/`.

### Running Frontend Development Server
Inside the `frontend/` directory, run:
```powershell
npm run dev
```
The frontend is available at `http://localhost:5173/`.

### Root Shortcuts
You can also run or validate the frontend from the project root using npm:
```powershell
# Run frontend dev server from root
npm run dev --prefix frontend

# Build frontend from root
npm run build --prefix frontend
```

---

## Testing & Verification Commands

### Run Backend Tests
Backend unit tests fall back to a local SQLite database automatically to enable database-independent execution (no active local PostgreSQL required for testing). Run the full suite using:
```powershell
# Navigate to backend/ directory and run:
python manage.py test
```

### Run Frontend Linting & Type Checks
```powershell
# Type check the frontend typescript files
npm run typecheck --prefix frontend

# Lint frontend files
npm run lint --prefix frontend

# Build production bundle
npm run build --prefix frontend
```
