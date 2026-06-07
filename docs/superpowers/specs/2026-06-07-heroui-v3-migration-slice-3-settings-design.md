# HeroUI v3 Migration — Slice 3: Settings Reconciliation

**Date:** 2026-06-07
**Status:** Draft — approved verbally via /goal, pending spec review
**Scope:** Third of 7 slices in the program "Move frontend to HeroUI v3, delete glass CSS." Touches **backend + frontend** for the first time.

---

## 0. Program context

Slice 1 (Foundation + Login) and Slice 2 (Shell) shipped. The shell + Login render in HeroUI v3. Inner pages still use the legacy `@theme inline` token bridge from Slice 1 to keep glass styles resolving.

The just-merged Sub-project A (Settings Foundation + Branding + Appearance, 2026-06-06) introduced **DB columns specific to the glass design**:
- `density` (compact|regular|comfy) — controls `data-density` attribute → glass CSS row heights/padding
- `glass_blur` (0–60) — controls `--blur` var → glass `backdrop-filter` strength
- `theme_preset` (one of 8 stylized themes: corporate, midnight, ocean, forest, sunset, warm, minimal, default)
- `custom_theme` JSONB (per-property overrides: background/foreground/content1-3/divider/radius/shadow/font_family/sidebar_background)

Per the Slice 1 spec's explicit user decision ("Light + Dark only — drop the 8 presets, drop density, drop glass_blur"), **these fields must die**. Their continued presence in the DB and the settings UI is dead weight: nothing renders them (the shell is HeroUI now), and the UI controls for them act on glass vars that the migrated shell no longer consumes.

## 1. Context & problem

Today the settings stack contains, for each dropped field, layers that all reference it:

| Layer | File | Today's content for the dropped fields |
|---|---|---|
| DB | `server/alembic/versions/20260606_1200_a7b8c9d0e1f2_add_density_glass_blur_to_settings.py` | Migration that added `density` + `glass_blur` columns |
| Model | `server/src/telaios/db/models/app_settings.py` | `density`, `glass_blur`, `theme_preset`, `custom_theme` column mappings |
| Schema | `server/src/telaios/modules/settings/schemas.py` | `CustomTheme` class; `SettingsRead.density/glass_blur/theme_preset/custom_theme`; `PatchSettingsDto.density/glass_blur/theme_preset/custom_theme` |
| Enums | `server/src/telaios/domain/enums.py` | `ThemePreset`, `ThemeRadius`, `ThemeShadow`, `ThemeFontFamily` |
| Frontend types | `frontend/src/types/index.ts` | `ThemePreset`, `CustomTheme`, `RadiusStep`, `ShadowStep`, `FontFamilyKey`, plus the AppSettings fields |
| Bridge | `frontend/src/lib/appSettings.ts` | ~150 lines: `THEME_PRESETS`, `RADIUS_VALUES`, `SHADOW_VALUES`, `FONT_FAMILY_VALUES`, `PRESET_SHELL_VARS`, `resolveShellTheme`, `applyShellTheme`, `clearShellTheme`, plus density/blur write paths in `applyAppSettingsToDocument` |
| DEMO mock | `frontend/src/lib/api.ts` (lines 367, 370) | Mock values for `density`, `glass_blur`, `theme_preset`, `custom_theme` |
| UI | `frontend/src/pages/workspace/WorkspaceSettings.tsx` (589 lines) | Theme preset chips (light/dark + 8 named), custom-theme color pickers, density radio, glass blur slider |

Beyond this stack, the only other place the legacy glass design surfaces is `frontend/src/index.css` — which still has all the glass classes that inner pages use. The bridge variables `--bg`, `--fg*`, `--glass*`, `--hairline`, `--blur`, `--radius-*`, `--shadow-*`, `data-density`, `[data-theme]` are still read by those pages. **We do not remove the glass CSS file in this slice (Slice 7 does)** — but we stop emitting `--blur` and `data-density` from the bridge, and we drop the preset/custom-theme emissions entirely. Glass classes that read these vars fall back to their `:root` defaults, which is fine for the duration.

## 2. Goals / non-goals

**Goals (Slice 3):**
1. **DB migration** that drops `density`, `glass_blur`, `theme_preset`, `custom_theme` columns from the `settings` table. Reversible downgrade re-adds them with their current defaults.
2. **Backend schemas + model** lose all references to the dropped fields. `CustomTheme` Pydantic class and the enums `ThemePreset`/`ThemeRadius`/`ThemeShadow`/`ThemeFontFamily` (in `server/.../domain/enums.py`) are deleted if no other module imports them; otherwise kept.
3. **Frontend AppSettings** type drops the four fields plus the four ancillary types (`ThemePreset`, `CustomTheme`, `RadiusStep`, `ShadowStep`, `FontFamilyKey`).
4. **`appSettings.ts` bridge** drops `THEME_PRESETS`, `RADIUS_VALUES`, `SHADOW_VALUES`, `FONT_FAMILY_VALUES`, `PRESET_SHELL_VARS`, `resolveShellTheme`, `applyShellTheme`, `clearShellTheme`, plus the body-font and density/blur write paths. The simplified `applyAppSettingsToDocument` does exactly: brand color → `--accent-1/2/grad` + `--accent`/`--accent-foreground`; `default_theme` → `data-theme`; brand name → `document.title`; favicon → `<link>`. Roughly 150 lines → ~80 lines.
5. **`api.ts` DEMO mock** drops the four fields from both `getSettings` and `patchSettings`.
6. **`WorkspaceSettings.tsx` rewritten** using HeroUI v3 primitives. Two panes: (a) Branding (HeroUI `TextField` for brand name, `ColorField` for brand color, file inputs for logo + favicon — same upload + validate + downscale flow as today, just HeroUI-styled) and (b) Appearance (HeroUI `RadioGroup` or `ToggleButtonGroup` with two options: Light, Dark). No density control, no glass-blur slider, no theme preset selector, no custom-theme color editors. Other current panes in WorkspaceSettings.tsx that are "out of scope for Sub-project A" stay as-is (still hardcoded `onChange={() => {}}` placeholders) — Slice 5 (Workspace pages) migrates them. **Only Branding + Appearance are rewritten this slice.**
7. **Test updates** — `frontend/src/lib/appSettings.test.ts` loses tests for `--blur`, `data-density`, the preset palette, the custom_theme override, and the body-font. Three new bridge tests (`--accent` emission, accent-foreground luminance pick, and absence of `--heroui-primary-*`) from Slice 1 stay. Backend tests (if any cover settings) updated to drop the four fields.
8. tsc + vitest + production build + alembic upgrade/downgrade roundtrip all pass. No visible regression on shell pages.

**Non-goals (deferred):**
- Slice 2.5 — AI sidebar internals migration.
- Slice 4-6 — page-by-page migration.
- Slice 7 — delete `index.css` glass blocks + the legacy `@theme inline` token bridge + `MeshBackground.tsx`.
- Other settings panes (Notifications, Knowledge, Integrations, Privacy, Keyboard, TEOS routing) — those were already placeholders in Sub-project A and stay placeholders this slice; their build-out is a separate program.

## 3. Approach

### 3.1 DB migration

New Alembic revision under `server/alembic/versions/` following the existing convention (`YYYYMMDD_HHMM_<rev>_<slug>.py`):

```
20260607_2100_<rev>_drop_glass_settings_columns.py
```

`upgrade()`:
```python
def upgrade() -> None:
    op.drop_column("settings", "density")
    op.drop_column("settings", "glass_blur")
    op.drop_column("settings", "theme_preset")
    op.drop_column("settings", "custom_theme")
```

`downgrade()` re-adds with the original defaults so this migration is reversible:
```python
def downgrade() -> None:
    op.add_column("settings", sa.Column("custom_theme", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("settings", sa.Column("theme_preset", sa.String(length=32), nullable=True))
    op.add_column("settings", sa.Column("glass_blur", sa.Integer, nullable=False, server_default="28"))
    op.add_column("settings", sa.Column("density", sa.String(length=16), nullable=False, server_default="regular"))
```

`down_revision` points at the most recent revision (the agent_overrides one or the density/glass_blur migration — verify during implementation by reading `alembic_version` head).

### 3.2 Backend model + schemas

In `server/src/telaios/db/models/app_settings.py`, delete the four column mappings. The `density`, `glass_blur`, `theme_preset`, `custom_theme` lines go.

In `server/src/telaios/modules/settings/schemas.py`:
- Delete the `CustomTheme` Pydantic class entirely.
- Drop the four fields from `SettingsRead` and `PatchSettingsDto`.
- Drop the imports of `ThemePreset`, `ThemeRadius`, `ThemeShadow`, `ThemeFontFamily` from `telaios.domain.enums`.

In `server/src/telaios/domain/enums.py`, **grep for other consumers** of `ThemePreset`/`ThemeRadius`/`ThemeShadow`/`ThemeFontFamily`. If none (likely), delete those enum classes.

Service + repository (`service.py`, `repository.py`): grep for the field names; remove anything that mentions them (typically just field passthroughs in `patch`).

### 3.3 Frontend types

In `frontend/src/types/index.ts`:
- Delete `ThemePreset` (line 949), `CustomTheme` (line 955), `RadiusStep`, `ShadowStep`, `FontFamilyKey` types.
- Delete the four fields from `AppSettings` interface (lines ~976-978) and from `PatchSettingsPayload`.

### 3.4 Frontend bridge — `appSettings.ts`

Reduce `applyAppSettingsToDocument` to:

```ts
export function applyAppSettingsToDocument(settings: AppSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const s = root.style;

  // Brand accent (shell + HeroUI)
  const brandColor = isHexColor(settings.brand_color) ? settings.brand_color : DEFAULT_BRAND_COLOR;
  const accent2 = deriveSecondaryAccent(brandColor);
  s.setProperty("--accent-1", brandColor);
  s.setProperty("--accent-2", accent2);
  s.setProperty("--accent-grad", `linear-gradient(135deg, ${brandColor} 0%, ${accent2} 100%)`);
  s.setProperty("--accent", brandColor);
  s.setProperty(
    "--accent-foreground",
    relativeLuminance(parseHexColor(brandColor)) > 0.5 ? "#000000" : "#ffffff",
  );

  // Theme polarity
  root.setAttribute("data-theme", isThemeValue(settings.default_theme) ? settings.default_theme : "dark");

  // Title + favicon
  document.title = settings.brand_name?.trim() || DEFAULT_BRAND_NAME;
  setFavicon(settings.favicon_url ?? null);
}
```

Delete: `THEME_PRESETS`, `RADIUS_VALUES`, `SHADOW_VALUES`, `FONT_FAMILY_VALUES`, `PRESET_SHELL_VARS`, `ShellTheme` interface, `resolveShellTheme`, `applyShellTheme`, `clearShellTheme`, `rgbToHsl`, `hslToRgb`, `deriveSecondaryAccent` *(keep — still used)*, plus the `normalize()` references to the dropped fields.

`normalize()` simplifies to:
```ts
function normalize(parsed: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    ...parsed,
    brand_name: typeof parsed.brand_name === "string" && parsed.brand_name.trim() ? parsed.brand_name : DEFAULT_APP_SETTINGS.brand_name,
    brand_color: isHexColor(parsed.brand_color) ? parsed.brand_color : DEFAULT_APP_SETTINGS.brand_color,
    default_theme: isThemeValue(parsed.default_theme) ? parsed.default_theme : DEFAULT_APP_SETTINGS.default_theme,
  };
}
```

`DEFAULT_APP_SETTINGS` loses the four fields.

### 3.5 Frontend api.ts DEMO mock

Drop the four fields from the DEMO `getSettings()` and `patchSettings()` mock returns.

### 3.6 Frontend settings UI — `WorkspaceSettings.tsx`

This is the biggest change. Today's file is 589 lines covering many sections (Branding, Appearance, Notifications, Knowledge, Integrations, Privacy, Keyboard, TEOS). Only Branding + Appearance had real backend wiring per Sub-project A.

**Strategy:** *Keep the section navigation and pane shell intact.* Rewrite only Branding + Appearance sub-components with HeroUI primitives. The rest of the panes stay as today (HTML form elements + hardcoded handlers) — they're placeholders until their own future migration.

**Branding pane** (was `BrandingSection.tsx` or inline):
- `<TextField>` for `brand_name` with `Label`/`Input`/`FieldError` anatomy, validates non-empty.
- `<ColorField>` or `<ColorPicker>` for `brand_color`. HeroUI v3 has both — `ColorField` is a hex/rgb input field, `ColorPicker` is a popover swatch picker. Use `ColorPicker` for the visual swatch + a `ColorField` as fallback text entry. Decision: **`ColorField`** (simpler; user can paste a hex). If they want a swatch picker we can add `ColorPicker` later.
- Two `<Button>` + hidden `<input type="file">` pairs for logo + favicon upload. Image validation + downscaling reuses `lib/image.ts` (untouched).
- Save button: `<Button color="accent" isPending={saving}>Save branding</Button>` (matches the new HeroUI pattern from Login).

**Appearance pane**:
- Single `<RadioGroup>` with two options: "Light" and "Dark". Bound to `settings.default_theme`, optimistic-saves on change.
- That's it. No density, no glass blur, no preset chips, no custom-theme color editors.

**Other panes** (Notifications, Knowledge, etc.): **untouched**. They render as today using whatever glass markup they have; the legacy bridge keeps them rendering.

### 3.7 Tests

`frontend/src/lib/appSettings.test.ts`:
- Delete: "sets --blur from glass_blur", "applies a preset palette to shell vars", "clears preset shell vars when no preset/custom", "custom_theme overrides a preset", "applies the preset font to <body>", "clears the body font when reverting to plain Light/Dark", "sets data-density and data-theme" (split: keep the data-theme assertion, drop the data-density part).
- Keep + adjust: "sets the accent var from brand_color", "emits HeroUI v3 --accent + --accent-foreground", "picks black foreground for light brand_color", "no longer emits the v2-style --heroui-primary-*".
- Backend settings tests (if any in `server/tests/`): grep for the dropped field names; remove assertions.

`AppSettingsContext.test.tsx`: should already work post-cleanup since it doesn't assert the dropped fields directly. Re-run after changes to confirm.

### 3.8 Alembic migration head verification

Run `alembic heads` in the implementation to confirm the new revision attaches correctly. The Slice 2 work didn't touch alembic, so the head should be `20260606_1200_a7b8c9d0e1f2_add_density_glass_blur_to_settings` (the migration that *added* the columns we're now dropping).

## 4. Files touched (exhaustive)

**Backend:**
| Path | Action |
|------|--------|
| `server/alembic/versions/20260607_2100_<rev>_drop_glass_settings_columns.py` | create |
| `server/src/telaios/db/models/app_settings.py` | modify (drop 4 columns) |
| `server/src/telaios/modules/settings/schemas.py` | modify (drop CustomTheme + 4 fields per schema; drop enum imports) |
| `server/src/telaios/modules/settings/service.py` | modify if it references dropped fields |
| `server/src/telaios/modules/settings/repository.py` | modify if it references dropped fields |
| `server/src/telaios/domain/enums.py` | modify (delete the 4 theme enums if no other consumer) |
| `server/tests/...` | modify if any settings test asserts the dropped fields |

**Frontend:**
| Path | Action |
|------|--------|
| `frontend/src/types/index.ts` | modify (drop 5 types + 4 fields) |
| `frontend/src/lib/appSettings.ts` | modify (~150 → ~80 lines, drop preset/density/blur machinery) |
| `frontend/src/lib/appSettings.test.ts` | modify (drop 6 tests, keep 7) |
| `frontend/src/lib/api.ts` | modify (drop DEMO mock fields) |
| `frontend/src/pages/workspace/WorkspaceSettings.tsx` | modify (rewrite Branding + Appearance; keep other panes untouched) |
| `frontend/src/components/settings/ProviderForm.tsx` | **no change** — it's an agent-provider form (unrelated to theme); Slice 5 (Workspace pages) covers it. |

## 5. Verification

- [ ] `cd server && alembic upgrade head` from a checkpoint clean DB — succeeds.
- [ ] `cd server && alembic downgrade -1` — succeeds; the four columns reappear with their original defaults.
- [ ] `cd server && pytest` — passes.
- [ ] `cd frontend && ./node_modules/.bin/tsc --noEmit` — clean.
- [ ] `cd frontend && npm run test:run` — vitest count drops by ~6 (from 18 to ~12); all pass.
- [ ] `cd frontend && ./node_modules/.bin/vite build` — succeeds.
- [ ] Manual: load `/settings`, change brand_color via the new ColorField — it persists, the Sign-in button on `/login` updates accent. Change Light/Dark toggle — `data-theme` flips on `<html>`, shell adopts the new mode.
- [ ] Manual: shell pages (`/`, `/projects/<id>`) still render via the legacy bridge — no visible regression.

## 6. Risk + rollback

**Risks:**
- *Migration drops data.* Anyone who had a `custom_theme` configured loses it permanently. Acceptable per the program's decision; the data was driving glass-only output that no longer renders.
- *Backend tests reference dropped fields.* Grep + fix during impl.
- *Other backend modules import `CustomTheme` or the theme enums.* Grep `from telaios.modules.settings.schemas import CustomTheme` and `from telaios.domain.enums import Theme(Preset|Radius|Shadow|FontFamily)` before deleting.
- *Frontend has `density`/etc. references outside the audited paths.* Pre-impl grep confirmed: only types/index.ts, lib/appSettings.ts, lib/api.ts, and pages/workspace/WorkspaceSettings.tsx reference them. Re-grep at impl time before committing the type deletion.

**Rollback:** revert the slice's commits. `alembic downgrade -1` re-adds the columns. Backend code recompiles, frontend recompiles, settings UI restores its 8-preset / custom-theme editor.

## 7. Follow-ups (out of scope for this slice)

- Slice 2.5 — AI sidebar internals.
- Slice 4-6 — page migrations.
- Slice 7 — delete `index.css` glass blocks + `MeshBackground.tsx` + unused `AiSidebar.tsx` + the legacy `@theme inline` token bridge.
- Settings B–G (Notifications, Knowledge, Integrations, Privacy, Keyboard, TEOS) — separate program; their build-out re-uses the HeroUI patterns established here.
