# Spec: Settings Redesign + Agent Library Base Agents

## Objective

Redesign the Settings page to focus on **UI customization** (brand identity, colors, logo) rather than LLM configuration. Move LLM provider/model/API-key configuration into **agent-specific settings** in the Library. Establish a protected set of **base agents** for each role that cannot be deleted — only cloned and customised — while still allowing users to create completely fresh agents from scratch.

## Tech Stack
- Python 3.14 / FastAPI / SQLAlchemy / Alembic
- TypeScript / React / Vite / HeroUI
- PostgreSQL (existing)

## Commands
```bash
# Backend
cd server && uv sync
cd server && uv run uvicorn telaios.main:app --reload --port 8000

# Frontend
cd frontend && npm ci
cd frontend && npm run dev

# Quality gates
cd server && uv run ruff check . && uv run ruff format --check .
cd server && uv run mypy src/telaios
cd server && uv run lint-imports
cd server && uv run pytest
```

## Assumptions I'm Making
1. **UI customization scope** is limited to: primary brand color, logo URL/upload, app name, and favicon. No full CSS override or component-level theming.
2. **"Base agents"** are pre-seeded in the DB at app startup (or via migration) and are protected from deletion and direct editing. They serve as templates.
3. **"Each role"** means the 7 existing roles: `planner`, `coder`, `reviewer`, `tester`, `infra`, `knowledge`, `custom`. (Not `document-copilot` — that seems like a feature, not a role.)
4. **Agent LLM config** replaces the global settings: each agent in the library has its own `llm_provider`, `llm_model`, `llm_api_key`, etc. Project agents inherit from their library source but can override.
5. **Settings access** remains admin-only for now.
6. **Logo storage** uses the existing S3/MinIO setup (same bucket, prefixed path).

→ **Correct me now or I'll proceed with these.**

---

## Changes Overview

### 1. Settings Page — UI Customisation

Replace the LLM config form with:
- **Brand name** — text input, default "TelaiOS"
- **Primary colour** — colour picker (hex), applied as CSS custom property `--brand-primary`
- **Logo** — image upload (SVG/PNG, max 500KB), stored in S3, served via `/assets/logo`
- **Favicon** — image upload (ICO/PNG, max 100KB)
- **Dark/light default** — select (user can still override locally)
- All persisted in `app_settings` table (new columns: `brand_name`, `brand_color`, `logo_url`, `favicon_url`, `default_theme`)

### 2. Global LLM Settings → Absorbed by Agents

- **Remove** `GET /settings` and `PATCH /settings` LLM endpoints
- **Remove** `SettingsRead` / `PatchSettingsDto` schemas (LLM fields)
- **Remove** `llm_router` (the `GET /llm/providers` stays — it's still needed for agent forms)
- **Add** `llm_provider`, `llm_model`, `llm_api_key`, `llm_base_url`, `llm_temperature`, `llm_max_tokens` fields directly to `LibraryAgent` create/patch/update flows
- **Add** same fields to `ProjectAgent` (overrides library defaults)
- Frontend: `ProviderForm` component is reused inside `LibraryAgentForm` and `AgentProfileForm`

### 3. Base Agents — Protected Library Entries

- **Add** `is_base: bool = False` column to `library_agents` table
- **Add** `cloned_from_id: UUID | None` column (FK to `library_agents.id`, nullable)
- **Seed** 7 base agents at app startup (one per role) with sensible defaults:
  - `planner` — planning & architecture
  - `coder` — code generation & editing
  - `reviewer` — code review & quality
  - `tester` — testing & QA
  - `infra` — infrastructure & DevOps
  - `knowledge` — documentation & research
  - `custom` — general-purpose fallback
- **Protect** base agents:
  - `DELETE /library/agents/{id}` → 403 if `is_base=true`
  - `PATCH /library/agents/{id}` → 403 if `is_base=true` (direct edit blocked; clone instead)
- **Clone** endpoint: `POST /library/agents/{id}/clone` → creates a new agent with `cloned_from_id` set, `is_base=false`, name suffixed "(Copy)", all same config

### 4. Frontend — Library Page Changes

- Base agents shown in library with a "Base" badge
- Delete/edit buttons hidden on base agents
- "Clone" button shown on base agents (and optionally on any agent)
- "Create from scratch" button remains for fresh agents
- Role filter tabs still work

### 5. Frontend — Settings Page Changes

- New `UISettingsForm` component
- Settings page shows brand color live-preview
- Logo upload with drag-and-drop

---

## Database Schema Changes

### `app_settings` table
```sql
ALTER TABLE app_settings
  ADD COLUMN brand_name VARCHAR(255) DEFAULT 'TelaiOS',
  ADD COLUMN brand_color VARCHAR(7) DEFAULT '#006FEE',  -- HeroUI primary blue
  ADD COLUMN logo_url TEXT,
  ADD COLUMN favicon_url TEXT,
  ADD COLUMN default_theme VARCHAR(10) DEFAULT 'dark';
  -- REMOVE: llm_provider, llm_model, llm_base_url, llm_temperature, llm_max_tokens, llm_api_key
```

### `library_agents` table
```sql
ALTER TABLE library_agents
  ADD COLUMN is_base BOOLEAN DEFAULT FALSE NOT NULL,
  ADD COLUMN cloned_from_id UUID REFERENCES library_agents(id) ON DELETE SET NULL;
```

---

## API Changes

### Removed
- `GET /settings` (LLM version)
- `PATCH /settings` (LLM version)

### Modified
- `GET /settings` → returns UI settings (`brand_name`, `brand_color`, `logo_url`, `favicon_url`, `default_theme`)
- `PATCH /settings` → accepts UI settings payload
- `LibraryAgentRead` schema → adds `is_base: bool`, `cloned_from_id: str | None`
- `LibraryAgentCreate` schema → adds LLM fields (was previously in settings)
- `DELETE /library/agents/{id}` → rejects if `is_base=true`
- `PATCH /library/agents/{id}` → rejects if `is_base=true`

### Added
- `POST /library/agents/{id}/clone` → clone any agent
- `GET /assets/logo` → serve uploaded logo
- `GET /assets/favicon` → serve uploaded favicon

---

## Project Structure

```
server/src/telaios/
  modules/settings/
    router.py          # UI settings only
    schemas.py         # UI settings schemas
    service.py         # UI settings CRUD
    repository.py      # unchanged
  modules/library/
    router.py          # add clone endpoint, protect base agents
    schemas.py         # add is_base, cloned_from_id, LLM fields
    service.py         # add clone logic, base agent protection
    repository.py      # add clone method
  db/models/
    app_settings.py    # add UI columns, remove LLM columns
    library.py         # add is_base, cloned_from_id
  core/seeders/
    base_agents.py     # seed 7 base agents at startup

frontend/src/
  pages/
    SettingsPage.tsx   # rewrite for UI customization
    LibraryPage.tsx    # add clone buttons, hide delete on base
  components/
    settings/
      UISettingsForm.tsx    # new: brand/color/logo form
      ProviderForm.tsx      # moved here from agent form
    library/
      LibraryAgentCard.tsx  # show base badge, clone button
      LibraryAgentForm.tsx  # add LLM config section
```

---

## Code Style

- Python: PEP 8, ruff-enforced, type hints required
- React: functional components, hooks, HeroUI components
- Naming: `is_base`, `cloned_from_id`, `brand_color` (snake_case backend, camelCase frontend)

---

## Testing Strategy

- **Backend unit tests**: settings service (UI fields), library service (clone, base protection), seeders
- **Backend integration tests**: clone endpoint, delete protection, settings CRUD
- **Frontend**: build passes, browser test of settings page upload + preview, library clone flow
- **Smoke tests**: update to match new API shape

---

## Boundaries

### Always do
- Run full quality gates before committing
- Add Alembic migration for DB changes
- Update smoke tests when API changes
- Browser-test every changed page

### Ask first
- Adding new Python dependencies (e.g., Pillow for image validation)
- Changing the `app_settings` primary key (currently hardcoded to `id=1`)
- Removing the global LLM settings entirely vs. keeping a "default fallback" for agents without explicit config

### Never do
- Commit S3 credentials or test uploads
- Drop the `app_settings` table without migration
- Remove existing agent profiles or project agents

---

## Success Criteria

1. `/settings` page shows brand name, colour picker, logo upload, favicon upload — no LLM fields
2. Changing brand colour immediately updates the UI primary colour (live preview)
3. Logo upload works and is persisted across reloads
4. Library has exactly 7 base agents (one per role) after fresh DB setup
5. Base agents show "Base" badge in library, cannot be deleted or edited directly
6. Clone button on base agents creates a new editable agent with identical config
7. Creating a fresh agent still works (not cloned from base)
8. Each agent in the library has its own LLM provider/model/key config
9. All 1184+ tests pass, ruff/mypy/lint-imports clean
10. Frontend build passes, 0 console errors on all changed pages

---

## Open Questions

1. **Should the global LLM config be kept as a "default fallback"** for agents that don't specify their own provider/model? Or completely removed?
2. **Should base agents have pre-filled system prompts** for each role? If yes, do you want to write them or should I use generic placeholders?
3. **Logo storage**: Should we store files in S3/MinIO (existing) or as base64 in the DB? S3 is cleaner but requires bucket setup.
4. **Should non-admin users see the Settings link** with read-only access, or hide it completely?
5. **Should cloned agents be linked back to their base** (e.g., "Clone of Planner") or just be independent copies?
6. **Role coverage**: Are the 7 roles (planner, coder, reviewer, tester, infra, knowledge, custom) correct, or do you want different ones?
7. **Should base agents be seeded on every startup** (idempotent upsert) or only via an explicit admin command / migration?
