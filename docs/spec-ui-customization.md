# Spec: Full UI Customization (Theme System)

## Objective

Allow system admins to fully customize the application's visual identity beyond the current
brand color + logo. Changes are system-wide (all users see the same theme), persisted in the
database, applied via CSS custom properties at runtime (no build step required), and cached in
`localStorage` for instant paint on load.

**User story:** As an admin, I open Settings, pick a preset theme (or build my own), tweak
individual overrides, save, and every user immediately sees the new look without a reload.

## Success Criteria

- [ ] Settings page exposes preset cards + individual override controls for all properties below
- [ ] Selecting a preset instantly previews the change in the same tab
- [ ] Saving persists to the DB and broadcasts to all open tabs via `StorageEvent`
- [ ] On fresh page load, the theme is applied synchronously (no FOUC) from `localStorage`
- [ ] All server quality gates pass (ruff, mypy, lint-imports, pytest)
- [ ] `tsc && vite build` passes
- [ ] Existing E2E tests still pass

## Customizable Properties

| Property          | CSS target(s)                                           | Input type            |
|-------------------|---------------------------------------------------------|-----------------------|
| Page background   | `--heroui-background`                                   | color picker          |
| Surface / cards   | `--heroui-content1`, `content2`, `content3`             | color picker          |
| Primary text      | `--heroui-foreground`                                   | color picker          |
| Primary accent    | `--heroui-primary` + full scale (already implemented)   | color picker          |
| Divider / borders | `--heroui-divider`                                      | color picker          |
| Border radius     | `--heroui-radius-small/medium/large`                    | select (5 steps)      |
| Box shadow        | `--heroui-box-shadow-small/medium/large`                | select (4 steps)      |
| Font family       | `font-family` on `:root`                                | select (6 options)    |
| Sidebar bg        | `--sidebar-background`                                  | color picker          |

### Border Radius Steps
| Key      | small  | medium | large  |
|----------|--------|--------|--------|
| `none`   | 0px    | 0px    | 0px    |
| `small`  | 4px    | 8px    | 12px   |
| `medium` | 8px    | 12px   | 16px   | ← HeroUI default
| `large`  | 12px   | 16px   | 24px   |
| `full`   | 999px  | 999px  | 999px  |

### Box Shadow Steps
| Key      | value                                              |
|----------|----------------------------------------------------|
| `none`   | none                                               |
| `small`  | 0 1px 3px rgba(0,0,0,0.12)                         |
| `medium` | 0 4px 12px rgba(0,0,0,0.18)                        |
| `large`  | 0 8px 32px rgba(0,0,0,0.28)                        |

### Font Family Options
| Key           | CSS value                                    |
|---------------|----------------------------------------------|
| `system`      | system-ui, -apple-system, sans-serif         |
| `inter`       | Inter, system-ui, sans-serif                 |
| `roboto`      | Roboto, Helvetica Neue, Arial, sans-serif    |
| `helvetica`   | Helvetica Neue, Helvetica, Arial, sans-serif |
| `georgia`     | Georgia, Times New Roman, serif              |
| `mono`        | ui-monospace, Menlo, monospace               |

## Theme Presets

Five built-in presets that set all properties at once. Individual overrides layer on top.

| Preset       | Vibe                                          |
|--------------|-----------------------------------------------|
| `default`    | Current dark theme — no changes               |
| `corporate`  | White bg, sharp corners, flat (no shadows)    |
| `midnight`   | Deep navy/black, blue accent, large shadows   |
| `warm`       | Off-white / warm gray bg, rounded, cozy       |
| `minimal`    | Pure white, no shadows, no radius             |

## Data Model

### DB Changes

Add two nullable columns to `app_settings` table (Alembic migration required):

```python
theme_preset: Mapped[str | None]   = mapped_column(String(32), nullable=True)
custom_theme: Mapped[dict | None]  = mapped_column(JSON, nullable=True)
```

### `custom_theme` JSON Shape

```json
{
  "background":        "#0d0d0d",
  "foreground":        "#ededed",
  "content1":          "#1a1a1a",
  "content2":          "#161616",
  "content3":          "#121212",
  "divider":           "#2a2a2a",
  "radius":            "medium",
  "shadow":            "medium",
  "font_family":       "system",
  "sidebar_background":"#111111"
}
```

All keys are optional — missing keys fall back to the preset (or HeroUI default).

### Pydantic Schema (server)

```python
class CustomTheme(BaseModel):
    background:         str | None = None   # hex color
    foreground:         str | None = None
    content1:           str | None = None
    content2:           str | None = None
    content3:           str | None = None
    divider:            str | None = None
    radius:             Literal["none","small","medium","large","full"] | None = None
    shadow:             Literal["none","small","medium","large"] | None = None
    font_family:        Literal["system","inter","roboto","helvetica","georgia","mono"] | None = None
    sidebar_background: str | None = None

class PatchSettingsDto(BaseModel):  # existing, extended
    ...existing fields...
    theme_preset: str | None = None
    custom_theme: CustomTheme | None = None
```

Hex color fields get the same `@field_validator` as `brand_color` (must match `#[0-9a-fA-F]{6}`).

## Frontend Architecture

### `appSettings.ts` (extend)

Add `applyThemeOverrides(preset, custom)`:
1. Resolve the preset into a full `ResolvedTheme` object (all keys populated)
2. Apply individual `custom_theme` overrides on top
3. Set CSS vars on `document.documentElement.style`

HeroUI color vars use **HSL channel** format: `--heroui-background: 0 0% 5%`  
Sidebar and custom vars use **hex**: `--sidebar-background: #111111`

### Settings Page (extend)

Layout of the new UI section (below existing brand section):

```
┌─ Theme ───────────────────────────────────────────────────┐
│  Presets: [Default] [Corporate] [Midnight] [Warm] [Minimal]│
│                                                           │
│  Overrides                                                │
│  ├── Colors                                               │
│  │   Page background  [color picker]  #0d0d0d            │
│  │   Card surface     [color picker]  #1a1a1a            │
│  │   Primary text     [color picker]  #ededed            │
│  │   Accent color     [color picker]  #e07b54 (existing) │
│  │   Divider          [color picker]  #2a2a2a            │
│  │   Sidebar bg       [color picker]  #111111            │
│  ├── Shape                                                │
│  │   Border radius    [none|small|medium|large|full]      │
│  │   Box shadow       [none|small|medium|large]           │
│  └── Typography                                           │
│      Font family      [dropdown: 6 options]               │
└───────────────────────────────────────────────────────────┘
```

Preset cards show a mini live preview (colored square/swatch). Selecting a preset immediately
applies it via `applyAppSettingsToDocument` (preview-only, not saved until "Save Settings").

## Tech Stack

- **Backend:** Python 3.14 / FastAPI / SQLAlchemy / Alembic / Pydantic v2
- **Frontend:** TypeScript / React 18 / HeroUI v2 / Tailwind v4

## Commands

```bash
# Server quality gates
cd server && uv run ruff check . && uv run ruff format --check .
cd server && uv run mypy src/telaios
cd server && uv run lint-imports
cd server && uv run pytest

# Frontend build
cd frontend && npx tsc && npx vite build

# E2E
cd frontend && npm run test:e2e -- e2e/settings-page.spec.ts
```

## Implementation Order

1. **Alembic migration** — add `theme_preset` + `custom_theme` columns
2. **Server schemas** — `CustomTheme` model, extend `PatchSettingsDto` + `AppSettingsRead`
3. **`appSettings.ts`** — add preset definitions, `applyThemeOverrides`, extend cache shape
4. **Settings page UI** — preset cards + override controls
5. **Update E2E** — extend `saves settings` test to verify one theme property

## Boundaries

- **Always:** Run all server quality gates; keep `tsc && vite build` clean
- **Ask first:** Adding Google Fonts network loading; new npm dependencies
- **Never:** Store arbitrary CSS strings from the client (only validated hex/enum values)

## Open Questions

- Should the live preview in the settings page apply instantly as the user picks a color,
  or only on "Save Settings"? → **Instant preview (not persisted until Save)**
- Should non-admin users see a read-only view of the current theme? → Out of scope for now.
