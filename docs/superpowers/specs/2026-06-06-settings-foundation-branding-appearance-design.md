# Settings Foundation + Branding + Appearance (Sub-project A)

**Date:** 2026-06-06
**Status:** Approved design — ready for implementation plan
**Scope:** First sub-project of the "real settings page" build-out program.

---

## 1. Context & problem

The `/settings` page ([WorkspaceSettings.tsx](../../../frontend/src/pages/workspace/WorkspaceSettings.tsx)) presents 8 sections and ~50 controls, but only **Branding** (brand name + color) and **Appearance → Dark mode** are wired. Everything else is local React state or hardcoded `onChange={() => {}}`.

Two deeper problems make even the "real" settings ineffective:

1. **No startup fetch.** [main.tsx](../../../frontend/src/main.tsx) applies only *cached* settings; `getSettings()` is called only inside the Branding section. A fresh browser / non-admin user never loads branding or theme from the backend, so custom branding never reaches most users.
2. **The theme engine targets the wrong CSS layer.** The redesigned UI is the glassmorphism shell, whose variables (`--bg`, `--fg`, `--glass*`, `--accent-1/2`, `--hairline`, `--density-pad`, `--blur`) are read by **32 source files**. The existing `theme_preset` + `custom_theme` machinery in [appSettings.ts](../../../frontend/src/lib/appSettings.ts) writes **only** `--heroui-*` + `--sidebar-background`, which **no shell file reads** (0 files use `--heroui-*` directly). So the 8 presets and the `custom_theme` schema currently have near-zero visible effect. `--heroui-*` remains a secondary layer used by embedded form controls (plan/chat/ProviderForm).

This sub-project makes Branding + Appearance fully real, org-wide, and actually applied to the shell, and establishes the client architecture (`AppSettingsProvider`) that later sub-projects (B–G) plug into.

## 2. Goals / non-goals

**Goals**
- Branding (name, color, logo, favicon) persists to backend and visibly changes the real UI for **all** users.
- Appearance (theme, custom palette, density, glass blur) persists and re-styles the glass shell.
- Settings are fetched once at startup and applied app-wide (admins and non-admins alike).
- The page is admin-editable and read-only for non-admins.
- No control is shown that does not work.

**Non-goals (deferred to B–G)**
- Notifications, Knowledge config, Integrations/OAuth, Privacy & data, Keyboard, TEOS routing/visibility/model selection.

## 3. Ownership model (decided)

**All org-wide, admin-only.** One source of truth: the `settings` singleton. Admins set branding **and** appearance for everyone. Non-admins see a read-only page but the settings still apply to them. The per-user `localStorage["theme"]` override is **removed**; the former "dark mode" toggle becomes the admin **Theme** control. (`require_admin` already gates PATCH; GET is readable by any authenticated principal.)

## 4. Data model

Keep the typed `settings` singleton. Existing columns: `brand_name`, `brand_color`, `logo_url`, `favicon_url`, `default_theme`, `theme_preset`, `custom_theme` (JSONB), audit cols.

**Add two typed columns** (one alembic migration):
- `density` — `varchar(16)`, one of `compact|regular|comfy`, `NOT NULL`, default `regular`, server_default `regular`.
- `glass_blur` — `integer`, range `0–60`, `NOT NULL`, default `28`, server_default `28`.

**Rule (production):** scalar/enumerated/validated knobs → typed columns (DB constraints + Pydantic typing + explicit API). Only the open-ended per-property override bag stays JSONB (`custom_theme`). Future sub-projects B–G each add their own JSONB section/column; no generic key-value store.

## 5. Backend changes

- **Model** ([app_settings.py](../../../server/src/telaios/db/models/app_settings.py)): add `density`, `glass_blur` columns.
- **Schemas** ([schemas.py](../../../server/src/telaios/modules/settings/schemas.py)):
  - `SettingsRead`: add `density: str`, `glass_blur: int`.
  - `PatchSettingsDto`: add `density: Literal["compact","regular","comfy"] | None`, `glass_blur: int | None = Field(ge=0, le=60)`.
  - `CustomTheme` is unchanged (already supports background/foreground/content1-3/divider/radius/shadow/font_family/sidebar_background with hex validators).
- **Service/repository**: no logic change beyond passing the new fields through `patch`.
- **Migration**: new file under `server/alembic/versions/` following the `YYYYMMDD_HHMM_<rev>_<slug>.py` convention; `upgrade` adds both columns with server defaults, `downgrade` drops them.
- **Auth**: unchanged — GET = `CurrentPrincipal`, PATCH = `require_admin`.

## 6. Frontend architecture

### 6.1 `AppSettingsProvider` (new context)
Single source of truth for client settings; replaces the scattered wiring.
- **First paint:** synchronously apply `loadCachedAppSettings()` (no flash).
- **On mount (post-login):** `GET /settings` → apply → cache. Applies for all authenticated users.
- **On admin save:** `PATCH` → update context → re-apply → re-cache → broadcast via the existing custom-event + `storage` sync (multi-tab).
- **Exposes:** `settings`, `refresh()`, `save(patch)`, `isAdmin` (from auth).
- Mounted high in the tree (in `main.tsx`, around the router).

### 6.2 ThemeContext fold-in
`default_theme` becomes org-wide. Remove the per-user `localStorage["theme"]` override and `hasStoredThemeOverride`/`syncThemeWithDefault` semantics. Keep a thin `useTheme()` shim returning `{ theme }` derived from `settings.default_theme` so existing consumers compile; the setter path is the admin Theme control (via `save`). `data-theme` continues to be set on `document.documentElement`.

### 6.3 The bridge — `applyAppSettingsToDocument` rewritten onto glass-shell vars
One function maps settings → the vars the real UI reads. Keep writing `--heroui-primary*` from `brand_color` so embedded HeroUI controls stay coherent.

| Setting | Drives (glass shell) | Notes |
|---|---|---|
| `brand_color` | `--accent-1`, derived `--accent-2`, `--accent-grad` | also `--heroui-primary*`; `--accent-2` = hue-rotated harmonious secondary |
| `default_theme` | `data-theme="light\|dark"` | base polarity |
| `density` | `data-density` | CSS already present (`[data-density]`) |
| `glass_blur` | `--blur` | CSS already present |
| `theme_preset` + `custom_theme` | full palette: `--bg`, `--fg`(+`--fg-2/3/4`), `--glass`/`-strong`/`-weak`, `--hairline`, `--hover`, `--shadow-lg/sm`, `--radius-*`, body `font-family` | the 8 presets are re-pointed here from `--heroui-*` |
| `brand_name` | `document.title` + wordmark | replaces hardcoded "TelaiOS" |
| `logo_url` / `favicon_url` | logo `<img>` slot / favicon `<link>` | fall back to SVG / default favicon when null |

`custom_theme` → shell mapping: `background→--bg`, `foreground→--fg` (derive `--fg-2/3/4` as opacity steps), `content1/2/3→--glass-strong/--glass/--glass-weak`, `divider→--hairline`, `radius→--radius-*` scale, `shadow→--shadow-lg/sm`, `font_family→body font`. `sidebar_background` has no shell consumer today — either introduce `--sidebar-bg` and apply it to the sidebar, or omit; **decision: omit for A** (the sidebar uses `.glass`/`--bg`), revisit if needed.

### 6.4 Theme resolution algorithm
- **Theme selector** options: `Light`, `Dark`, + 8 presets. No "Auto/follow-OS" (per-device variance contradicts org-wide).
- `Light`/`Dark` → `theme_preset = null`; bridge **clears** preset/custom palette vars so the stylesheet `:root`/`[data-theme]` defaults win; sets `default_theme` accordingly.
- A preset → `theme_preset = <name>`; bridge sets the full palette from the preset; `default_theme` set to the preset's polarity so `[data-theme]` selectors stay consistent.
- `custom_theme` overrides layer on top of whichever is chosen. Only keys present override; others fall through to preset/base.
- **Contrast guardrail:** when resolving `custom_theme`, compute WCAG contrast of foreground vs background; if below AA (4.5:1 for text), surface a non-blocking warning in the editor (do not block save).

## 7. UI — Branding section (admin-editable; read-only for non-admins)

- **Brand name** (text) → wordmark + `document.title`. Replace hardcoded "TelaiOS" in [ProjectLayout.tsx](../../../frontend/src/components/ProjectLayout.tsx) (lines ~241, 314, 415, 478) and [OperatorLayout.tsx](../../../frontend/src/pages/operator/OperatorLayout.tsx) (~168) with the brand name from context.
- **Logo** — image upload → base64 data URL. Validate MIME (`data:image/*`) + size (≤ 700 KB, mirrors `PatchSettingsDto`); client-downscale oversized images before encoding. Render in the `TelaiOSLogo` slot ([TelaiOSLogo.tsx](../../../frontend/src/components/common/TelaiOSLogo.tsx)) as `<img>` when set, else the inline SVG. Preview + remove.
- **Favicon** — same flow, ≤ 150 KB. Updates the dynamic favicon `<link>`.
- **Accent color** (= `brand_color`) — color input + hex field + a few suggested swatches; drives `--accent-1` + gradient. The dead "Accent color" swatches currently in Appearance move here.
- Per-section **Save** (optimistic; pattern from current `BrandingSection`).

## 8. UI — Appearance section (admin-editable)

- **Theme** — the unified selector (Light/Dark + 8 presets), rendered as palette preview chips.
- **Customize (advanced, collapsible)** — the `custom_theme` editor: background, foreground, surface (content), divider, radius (`none/small/medium/large/full`), shadow (`none/small/medium/large`), font family (the 6 keys). "Reset to preset" clears overrides. Live preview + contrast warning.
- **Density** — segmented `compact/regular/comfy` → `data-density`.
- **Glass blur** — slider `0–60` → `--blur`, live preview, mono value label.
- Per-section **Save** (optimistic).

## 9. Removed / replaced controls

- **Reduce motion toggle → removed**, replaced by a global `@media (prefers-reduced-motion: reduce)` rule in `index.css` that disables non-essential animations (respects each user's OS setting — the correct a11y approach; an org-wide motion toggle would be wrong).
- **Accent swatches** (Appearance) → merged into Branding.
- **Sidebar collapsed** → removed (per-user UI state, not org config).
- **"Show AI sidebar by default"** → deferred to sub-project B (TEOS).
- All other sections (TEOS assistant, Notifications, Knowledge, Integrations, Keyboard, Privacy) → **left rendering exactly as-is in this sub-project** (no code changes to those section components), tracked for B–G. This keeps the PR focused on Branding + Appearance + the foundation. We do **not** add "coming soon" states here.

## 10. Access control

`AppSettingsProvider.isAdmin` drives the page. Non-admins: controls disabled, Save hidden, an inline notice ("Only workspace admins can change these settings"). Settings still apply to them via the startup fetch. Admin determination uses the existing auth principal / `system_role`.

## 11. Error handling

- **Load failure** → fall back to cached/default; non-blocking inline notice; never block the app.
- **Save failure** → error toast; **revert optimistic apply** to the last-known-good snapshot held in the provider.
- **Image upload** → client validation of MIME + size mirroring server caps, with clear rejection messages; downscale oversized images.
- **Client validation parity** with server: hex `^#[0-9A-Fa-f]{6}$`, density enum, blur `0–60`, contrast check.
- Iconography stays Font Awesome solid (no emoji), per project convention.

## 12. Testing strategy

**Backend**
- `SettingsService.patch_settings` with new fields + validation (valid/invalid density, blur bounds).
- Migration up/down (columns added with defaults; downgrade drops).
- Auth: 403 on non-admin PATCH; 200 GET for a member.

**Frontend — unit**
- Bridge: given `AppSettings` → asserts exact CSS vars / attributes set on a fake `documentElement`; preset resolution; custom overrides; clear-on-null; contrast helper.
- `AppSettingsProvider`: cache applied on first paint; fetch+apply on mount; broadcast on save; optimistic revert on PATCH failure.
- Components: admin sees editable controls; non-admin sees read-only; Branding save flow; image validation rejects oversize.

**Frontend — e2e (Playwright, `frontend/e2e/`)**
- Accent color change → `--accent-1` on `:root`.
- Pick a preset → `--bg` changes.
- Density change → `data-density` attribute.
- Glass blur slider → `--blur`.
- Logo upload → `<img>` renders in wordmark slot; brand name updates the wordmark.
- Non-admin → read-only.
- Follow established e2e patterns: native-select assertions, Slider accessible name, select key→value, modal `scrollBehavior`, `evaluate`-click for viewport.

## 13. Rollout / migration notes

- The legacy `applyThemeOverrides` → HeroUI-only behavior is replaced; preserve `--heroui-primary*` derivation from `brand_color` so plan/chat/ProviderForm controls stay coherent.
- Existing rows: new columns get server defaults (`regular`, `28`); existing `custom_theme`/`theme_preset` values continue to validate (schema unchanged).
- Demo mode (`VITE_DEMO_MODE`) mocks must return the two new fields.

## 14. Component boundaries (for isolation/testability)

- `lib/appSettings.ts` — pure functions: `resolveTheme(settings) → vars map`, `applyAppSettingsToDocument`, cache load/save, contrast helper, image downscale/validate. No React.
- `context/AppSettingsProvider.tsx` — owns fetch/save/broadcast/`isAdmin`; depends on `lib/api` + `lib/appSettings`.
- `pages/workspace/WorkspaceSettings.tsx` — presentation only; reads from provider; Branding + Appearance subcomponents.
- Backend settings module unchanged in shape; only fields added.

## 15. Decisions resolved

1. Ownership: **all org-wide, admin-only**.
2. Approach: **re-point the theme engine onto the glass shell** (Approach 2).
3. `density`/`glass_blur`: **typed columns**, not JSONB.
4. Theme: **one unified selector** (Light/Dark + 8 presets), no Auto.
5. `custom_theme.sidebar_background`: **omitted** in A (no shell consumer).
6. Other 6 sections: **left unchanged** in A; tracked for B–G.
