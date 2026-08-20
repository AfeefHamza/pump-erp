# Development Standards

This document establishes the coding style and standard guidelines for the Pump ERP codebase.

## Backend (Python/Django)

### Python Version Requirement
- Standardize the project requirement as: `Python >=3.14,<3.15` (specifically targeting Python 3.14.7).

### Code Style
- Adhere to **PEP 8** style guidelines.
- Use 4 spaces for indentation.
- Maintain a line length maximum of 120 characters where possible.
- Files must end with a single newline.

### Imports
Organize imports alphabetically in three blocks:
1. Python standard library imports.
2. Third-party packages (Django, DRF, etc.).
3. Local application imports.

Example:
```python
import os
import sys

from django.db import models
from rest_framework import serializers

from apps.core.models import BaseModel
```

### Models & Services
- **Business Logic Boundaries**:
  - Avoid placing business logic, validation, or write workflows inside Django views or serializers.
  - Views and serializers should only handle HTTP validation, request parsing, and routing.
- **Custom User Model Reference**:
  - Always reference the User model using `settings.AUTH_USER_MODEL` in ForeignKey or ManyToMany relationships.
  - In Python code, resolve the active model dynamically using `django.contrib.auth.get_user_model()`. Never import the custom `User` class directly from `apps.users.models`.
- **Services (`services.py`)**:
  - All write operations (mutations, creation, updates) must be implemented inside explicit service functions.
  - Services that mutate related states (e.g. creating an organisation with its owner membership) must use `transaction.atomic` to ensure database consistency.
  - Do not use Django signals for core business workflows; invoke services explicitly.
- **Selectors (`selectors.py`)**:
  - Implement read queries, reporting logic, and complex filters inside selector files.
  - Selectors must enforce multi-tenant safety boundaries. They should accept the current user context and implicitly filter querysets by the user's active membership or granted outlet accesses.

---

## Frontend (TypeScript/React)

### Strict Mode
- Maintain strict type-checking (`strict: true` in `tsconfig.json`).
- Avoid using `any`. If a type cannot be inferred, write a proper interface or use a union type.

### File Naming
- Use PascalCase for component files (e.g. `StatCard.tsx`, `Sidebar.tsx`).
- Use camelCase for utility and state files (e.g. `index.ts`, `navigationConfig.ts`).
- Folder names under `features` and `components` should be kebab-case or camelCase (e.g. `data-display`, `dashboard`).

### Path Mappings
- Always use the `@/` path alias for absolute imports from the `src/` directory.
- Avoid deep relative paths (e.g., `../../../components/StatCard`).

Example:
```typescript
import { StatCard } from '@/components/data-display/StatCard';
import { useAppSelector } from '@/app/store';
```

---

## Styling Rules (Vanilla CSS)

### Reusable Tokens
- Avoid inline CSS styles or layout-specific utility styles where possible.
- Always use the predefined CSS variables from `:root` in `styles/index.css` for colors, padding margins, border radii, and shadows to maintain design uniformity.
- Do not write hardcoded hex codes.

### Layout & Responsiveness
- The application layout is desktop-first, but must adapt smoothly to tablet and mobile screens.
- Use CSS grid and flexbox for layouts and alignments instead of absolute positioning.
- Use `@media` queries to handle responsive variations (e.g. collapsing sidebar to mobile drawer, hiding details).
