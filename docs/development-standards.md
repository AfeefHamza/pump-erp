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
- Avoid placing heavy business logic inside Django views or serializers.
- Define DB constraints and data integrity constraints inside models.
- Implement mutations and complex state changes inside service files (`services.py`).
- Implement complex queries inside selector files (`selectors.py`).

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
