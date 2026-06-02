# Project Status Simplification

**Date:** 2026-06-02  
**Status:** Approved

## Overview

Replace the legacy project status model (`planning | executing | done`) with a simpler, broader model: `active | archived | closed`. The old statuses were tied to a planning/execution workflow that no longer reflects the broader scope of projects in TelaiOS.

## New Status Values

| Value | Meaning |
|-------|---------|
| `active` | Project is live and in use. Default on creation. |
| `archived` | Project is preserved but inactive — paused or deprioritized. |
| `closed` | Project is finished and no longer worked on. |

No state-machine transition guards are introduced. Any project owner may set any status value freely, consistent with the current model.

## Migration Strategy

All existing rows are migrated to `active` regardless of their previous status (Option B). The column default changes from `"planning"` to `"active"`.

## Backend Changes

### `server/src/telaios/domain/enums.py`
Replace `ProjectStatus` enum values:
- Remove: `PLANNING = "planning"`, `EXECUTING = "executing"`, `DONE = "done"`
- Add: `ACTIVE = "active"`, `ARCHIVED = "archived"`, `CLOSED = "closed"`

### `server/src/telaios/db/models/projects.py`
Change `status` column default and `server_default` from `"planning"` to `"active"`.

### `server/src/telaios/domain/entities.py`
Change entity default from `ProjectStatus.PLANNING` to `ProjectStatus.ACTIVE`.

### `server/src/telaios/modules/projects/schemas.py`
No structural changes. `status` remains an optional field in `ProjectCreate` and `ProjectPatch`.

### Alembic Migration
- `UPDATE projects SET status = 'active'` for all existing rows
- Update column `server_default` to `'active'`

## Frontend Changes

### `frontend/src/types/index.ts`
`ProjectStatus = "active" | "archived" | "closed"`

### `frontend/src/pages/workspace/WorkspaceProjects.tsx`
Update `STATUS_LABEL`, `STATUS_COLOR`, and filter options to the three new values.

### `frontend/src/pages/ProjectDetail.tsx`
Update `PROJECT_STATUS_OPTIONS` array and all label/badge rendering.

## Tests

Update integration tests asserting default status `"planning"` to assert `"active"`. No new test cases needed — no transition logic exists.
