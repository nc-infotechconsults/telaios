# HeroUI v3 Migration — Slice 3 Implementation Plan (Settings Reconciliation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop the glass-specific settings columns (`density`, `glass_blur`, `theme_preset`, `custom_theme`) from the DB + backend schemas + frontend types + frontend bridge; rewrite the WorkspaceSettings Branding + Appearance panes using HeroUI v3 primitives.

**Architecture:** Backend-first, then frontend. Each task leaves both halves in a coherent state — types/contracts/migration in lockstep. The legacy `@theme inline` token bridge from Slice 1 keeps shell-adjacent pages rendering throughout.

**Tech Stack:** Backend — Python 3.11+, SQLAlchemy 2, Alembic, Pydantic v2, FastAPI. Frontend — React 19, HeroUI v3.1.0 (`TextField`, `Input`, `ColorField`, `RadioGroup`, `Button`, `Card`), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-07-heroui-v3-migration-slice-3-settings-design.md`

---

## File Structure

| Path | Action | Purpose |
|------|--------|---------|
| `server/alembic/versions/20260607_2100_<rev>_drop_glass_settings_columns.py` | create | Reversible migration dropping `density`/`glass_blur`/`theme_preset`/`custom_theme` |
| `server/src/telaios/db/models/app_settings.py` | modify | Drop the 4 column mappings |
| `server/src/telaios/modules/settings/schemas.py` | modify | Drop `CustomTheme` + 4 fields from `SettingsRead` + `PatchSettingsDto` + the 4 enum imports |
| `server/src/telaios/domain/enums.py` | modify | Delete `ThemePreset`, `ThemeRadius`, `ThemeShadow`, `ThemeFontFamily` (confirmed zero other consumers) |
| `frontend/src/types/index.ts` | modify | Drop the 4 AppSettings fields and the 5 ancillary types (`ThemePreset`, `CustomTheme`, `RadiusStep`, `ShadowStep`, `FontFamilyKey`, `Density`) |
| `frontend/src/lib/appSettings.ts` | modify | ~150 → ~80 lines: drop preset/density/blur machinery; keep brand_color → --accent/--accent-1 emission |
| `frontend/src/lib/appSettings.test.ts` | modify | Drop 6 tests for removed behaviors; keep 7 tests for accent/title/favicon |
| `frontend/src/lib/api.ts` | modify | DEMO mock loses the 4 fields from `getSettings`/`patchSettings` |
| `frontend/src/pages/workspace/WorkspaceSettings.tsx` | modify | Rewrite Branding + Appearance panes using HeroUI; other panes untouched |

Total: 1 new file, 8 modified.

---

## Task 1: Pre-flight + backend test baseline

**Files:** none modified.

- [ ] **Step 1: Confirm clean tree + Slice 2 shipped.**
  Run: `git log --oneline -3 && git status`
  Expected: latest 3 include `e0789a2 docs(heroui): spec for Slice 3`, `66faab6 refactor(frontend): rename ProjectLayout → shell/AppShell`, `4dfe20c refactor(frontend): swap AI sidebar outer wrapper`. Tree clean apart from pre-existing untracked.

- [ ] **Step 2: Frontend baseline.**
  Run: `cd frontend && ./node_modules/.bin/tsc --noEmit && npm run test:run 2>&1 | tail -6`
  Expected: tsc clean; 18/18 vitest pass.

- [ ] **Step 3: Backend baseline.**
  Run: `cd server && pytest -q 2>&1 | tail -6` (or whatever the project's preferred pytest invocation is — `uv run pytest`, `poetry run pytest`, etc. — match the project convention).
  Expected: all pass. If pytest infrastructure isn't set up locally, skip with a note; the DB-migration tasks below still need verification before merge.

- [ ] **Step 4: Identify Alembic head.**
  Run: `cd server && alembic heads` (or `uv run alembic heads` per project convention).
  Expected: a single head, almost certainly `a7b8c9d0e1f2` (the `add_density_glass_blur_to_settings` revision). Record it — the new migration's `down_revision` points here.

- [ ] **Step 5: No commit; observation only.**

---

## Task 2: Alembic migration — drop the four columns

**Files:**
- Create: `server/alembic/versions/20260607_2100_<rev>_drop_glass_settings_columns.py`

- [ ] **Step 1: Generate a revision ID.** Use `alembic revision -m "drop glass settings columns"` to scaffold (it will produce the file + a fresh rev ID); discard the generated empty body, fill in the upgrade/downgrade below. Or hand-write the file using a fresh 12-char hex rev ID (e.g., from `python -c "import secrets; print(secrets.token_hex(6))"`).

- [ ] **Step 2: Write the migration.** Replace the scaffolded body with:

  ```python
  """drop glass settings columns

  Revision ID: <generated>
  Revises: a7b8c9d0e1f2
  Create Date: 2026-06-07 21:00:00
  """
  from __future__ import annotations

  import sqlalchemy as sa
  from alembic import op
  from sqlalchemy.dialects import postgresql

  revision = "<generated>"
  down_revision = "a7b8c9d0e1f2"
  branch_labels = None
  depends_on = None


  def upgrade() -> None:
      op.drop_column("settings", "custom_theme")
      op.drop_column("settings", "theme_preset")
      op.drop_column("settings", "glass_blur")
      op.drop_column("settings", "density")


  def downgrade() -> None:
      op.add_column(
          "settings",
          sa.Column("density", sa.String(length=16), nullable=False, server_default="regular"),
      )
      op.add_column(
          "settings",
          sa.Column("glass_blur", sa.Integer(), nullable=False, server_default="28"),
      )
      op.add_column(
          "settings",
          sa.Column("theme_preset", sa.String(length=32), nullable=True),
      )
      op.add_column(
          "settings",
          sa.Column("custom_theme", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
      )
  ```

  Confirm `down_revision` matches what Task 1 Step 4 reported.

- [ ] **Step 3: Apply locally and roundtrip.**
  Run:
  ```bash
  cd server && alembic upgrade head && alembic downgrade -1 && alembic upgrade head
  ```
  Expected: each command exits 0. The columns vanish on upgrade and reappear on downgrade.

- [ ] **Step 4: Commit.**
  ```bash
  git add server/alembic/versions/20260607_2100_*_drop_glass_settings_columns.py
  git commit -m "$(cat <<'EOF'
  feat(db): drop glass-specific settings columns

  Alembic migration removes density, glass_blur, theme_preset, and
  custom_theme from the settings singleton. These columns drove the
  glass design system's data-density attribute, --blur var, named
  presets, and per-property surface overrides — none of which the new
  HeroUI v3 shell reads. Reversible downgrade re-adds them with the
  original server defaults.

  Existing rows lose their custom_theme JSON irrecoverably. Acceptable
  per the HeroUI v3 migration program; the data was driving
  glass-only output.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 3: Backend model + schemas + enums cleanup

**Files:**
- Modify: `server/src/telaios/db/models/app_settings.py`
- Modify: `server/src/telaios/modules/settings/schemas.py`
- Modify: `server/src/telaios/domain/enums.py`

- [ ] **Step 1: Drop the four column mappings from the model.** Delete these blocks in `server/src/telaios/db/models/app_settings.py`:

  ```python
  density: Mapped[str] = mapped_column(
      String(16), nullable=False, default="regular", server_default="regular"
  )
  glass_blur: Mapped[int] = mapped_column(
      Integer, nullable=False, default=28, server_default="28"
  )

  # ── Extended theme customisation ─────────────────────────────────────────
  theme_preset: Mapped[str | None] = mapped_column(String(32), nullable=True)
  custom_theme: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
  ```

  Also drop the now-unused `from sqlalchemy.dialects.postgresql import JSONB` import if nothing else in the file uses it.

- [ ] **Step 2: Strip schemas.py.** Replace `server/src/telaios/modules/settings/schemas.py` with the simplified version:

  ```python
  """Settings schemas.

  UI customisation settings: brand identity (name, color, logo,
  favicon) and theme polarity (light/dark). Slice 3 of the HeroUI v3
  migration dropped the glass-specific knobs (density, glass_blur,
  theme_preset, custom_theme).
  """

  from __future__ import annotations

  from datetime import datetime

  from pydantic import BaseModel, ConfigDict, Field
  from pydantic.functional_validators import field_validator


  class SettingsRead(BaseModel):
      model_config = ConfigDict(from_attributes=True)

      id: int
      brand_name: str
      brand_color: str
      logo_url: str | None
      favicon_url: str | None
      default_theme: str
      updated_at: datetime


  class PatchSettingsDto(BaseModel):
      brand_name: str | None = Field(default=None, min_length=1, max_length=255)
      brand_color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
      logo_url: str | None = Field(default=None, max_length=700_000)
      favicon_url: str | None = Field(default=None, max_length=150_000)
      default_theme: str | None = Field(default=None, pattern=r"^(light|dark)$")

      @field_validator("logo_url", "favicon_url")
      @classmethod
      def _validate_data_url(cls, value: str | None) -> str | None:
          if value is None or value == "":
              return None if value is None else value
          if not value.startswith("data:image/"):
              raise ValueError("must be a base64 data URL starting with 'data:image/'")
          return value


  __all__ = ["PatchSettingsDto", "SettingsRead"]
  ```

  Note: keep the `_validate_data_url` validator if the current file has one for logo_url/favicon_url; otherwise the snippet above shows a minimal version. **Read the current file first** to preserve any validation behaviors the spec didn't enumerate. If the current schema's `logo_url`/`favicon_url` validators are richer than the version above, retain them.

- [ ] **Step 3: Drop the four theme enums from `server/src/telaios/domain/enums.py`.**

  Run: `grep -n "ThemeRadius\|ThemeShadow\|ThemeFontFamily\|ThemePreset" server/src/telaios/domain/enums.py`
  Expected output: 4 class definitions around lines 377, 385, 392, 401.

  Delete each of those `class ThemeX(StrEnum): …` blocks (including their member definitions) and any surrounding comment headers that are now empty (e.g., a `# ── Theme ─────────────────` comment).

- [ ] **Step 4: Grep for any service.py / repository.py field references.**

  Run: `grep -rnE "density|glass_blur|theme_preset|custom_theme" server/src/telaios/modules/settings/`
  Expected: empty (after Steps 1-3 the schemas no longer ship the fields; service/repo typically pass-through). If anything matches, edit the file to drop the reference.

- [ ] **Step 5: Backend type-check + tests.**

  Run: `cd server && python -m mypy src/telaios/modules/settings/ 2>&1 | tail -5` (or whatever the project's preferred check is — e.g., `pyright`, `ruff check`, etc.). Expected: clean.

  Run: `cd server && pytest -q tests/ 2>&1 | tail -10` (or project convention).
  Expected: pass. If a test asserts on the dropped fields, update it to drop the assertion.

- [ ] **Step 6: Commit.**

  ```bash
  git add server/src/telaios/db/models/app_settings.py server/src/telaios/modules/settings/schemas.py server/src/telaios/domain/enums.py
  # Add any test files you adjusted in Step 5:
  # git add server/tests/...
  git commit -m "$(cat <<'EOF'
  refactor(settings): drop glass-specific fields from model + schemas + enums

  Mirrors the DB migration from the previous commit. AppSettings
  model loses the four columns; SettingsRead + PatchSettingsDto lose
  the same four fields; CustomTheme Pydantic class is gone; the four
  theme enums (ThemePreset, ThemeRadius, ThemeShadow, ThemeFontFamily)
  are removed from domain/enums.py (confirmed zero other importers).

  The settings module is now exactly: brand identity + light/dark
  polarity. Anything richer is the HeroUI v3 program's frontend
  business.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 4: Frontend types cleanup

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Locate the affected sections.**

  Run: `grep -n "ThemePreset\|CustomTheme\|RadiusStep\|ShadowStep\|FontFamilyKey\|Density\|density\|glass_blur\|theme_preset\|custom_theme" frontend/src/types/index.ts`
  Expected: hits around lines 949 (ThemePreset), 955 (CustomTheme), and 976-991 (AppSettings/PatchSettingsPayload fields).

- [ ] **Step 2: Delete the 5 type definitions.** In `frontend/src/types/index.ts`:

  - Delete `export type ThemePreset = …` (line ~949).
  - Delete `export type RadiusStep = …` and `export type ShadowStep = …` and `export type FontFamilyKey = …` (look for these between ~949 and ~955).
  - Delete `export interface CustomTheme { … }` (line ~955).
  - Delete the standalone `export type Density = "compact" | "regular" | "comfy"` if it exists (Task 1 Step 1 may have noted whether WorkspaceSettings imports `Density`; if so, this type lives nearby).

- [ ] **Step 3: Drop the four fields from AppSettings and PatchSettingsPayload.** Find the `AppSettings` interface around line 970 and remove these properties:

  ```ts
  density: Density;
  glass_blur: number;
  theme_preset: ThemePreset | null;
  custom_theme: CustomTheme | null;
  ```

  Then find `PatchSettingsPayload` (likely just below) and remove:

  ```ts
  density?: Density;
  glass_blur?: number;
  theme_preset?: ThemePreset | null;
  custom_theme?: CustomTheme | null;
  ```

- [ ] **Step 4: Type-check.**

  Run: `cd frontend && ./node_modules/.bin/tsc --noEmit 2>&1 | tail -15`
  Expected: errors that point at the still-uncleaned-up consumers in `lib/appSettings.ts`, `lib/api.ts`, `pages/workspace/WorkspaceSettings.tsx`. These are fixed in Tasks 5, 6, 7. **Do not commit yet** — let the type-check failures guide the next tasks. (If you prefer commit-per-task, you can commit just the types/index.ts deletion now and accept tsc errors until Task 7.)

  For this plan, **delay the commit** until Task 6 so each commit leaves the tree green.

---

## Task 5: Frontend bridge cleanup — `appSettings.ts` + test

**Files:**
- Modify: `frontend/src/lib/appSettings.ts`
- Modify: `frontend/src/lib/appSettings.test.ts`

- [ ] **Step 1: Rewrite `frontend/src/lib/appSettings.ts`.** Replace the file with:

  ```ts
  import type { AppSettings } from "../types";

  const DEFAULT_BRAND_NAME = "TelaiOS";
  const DEFAULT_BRAND_COLOR = "#0a84ff";
  const DEFAULT_FAVICON_PATH = "/favicon.svg";

  export const APP_SETTINGS_STORAGE_KEY = "telaios_app_settings";
  export const APP_SETTINGS_UPDATED_EVENT = "telaios:app-settings-updated";

  type Theme = "light" | "dark";
  type Rgb = { r: number; g: number; b: number };

  export const DEFAULT_APP_SETTINGS: AppSettings = {
    id: 1,
    brand_name: DEFAULT_BRAND_NAME,
    brand_color: DEFAULT_BRAND_COLOR,
    logo_url: null,
    favicon_url: null,
    default_theme: "dark",
    updated_at: new Date().toISOString(),
  };

  // ── Colour utilities ────────────────────────────────────────────────────────

  export function isHexColor(value: unknown): value is string {
    return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
  }

  export function isThemeValue(value: unknown): value is Theme {
    return value === "light" || value === "dark";
  }

  function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
  }

  function parseHexColor(hex: string): Rgb {
    const n = isHexColor(hex) ? hex : DEFAULT_BRAND_COLOR;
    const int = Number.parseInt(n.slice(1), 16);
    return { r: (int >> 16) & 0xff, g: (int >> 8) & 0xff, b: int & 0xff };
  }

  function rgbToHex({ r, g, b }: Rgb): string {
    const h = (x: number) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
  }

  function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === rn) h = ((gn - bn) / d) % 6;
      else if (max === gn) h = (bn - rn) / d + 2;
      else h = (rn - gn) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    const l = (max + min) / 2;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    return { h, s, l };
  }

  function hslToRgb(h: number, s: number, l: number): Rgb {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r1 = 0, g1 = 0, b1 = 0;
    if (h < 60) [r1, g1, b1] = [c, x, 0];
    else if (h < 120) [r1, g1, b1] = [x, c, 0];
    else if (h < 180) [r1, g1, b1] = [0, x, c];
    else if (h < 240) [r1, g1, b1] = [0, x, c];
    else if (h < 300) [r1, g1, b1] = [x, 0, c];
    else [r1, g1, b1] = [c, 0, x];
    return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
  }

  /** A harmonious secondary accent: rotate hue +50°, nudge lightness up. */
  export function deriveSecondaryAccent(hex: string): string {
    const { h, s, l } = rgbToHsl(parseHexColor(hex));
    return rgbToHex(hslToRgb((h + 50) % 360, clamp(s, 0, 1), clamp(l + 0.08, 0, 1)));
  }

  function luminanceChannel(c: number): number {
    const n = c / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  }

  function relativeLuminance(rgb: Rgb): number {
    return 0.2126 * luminanceChannel(rgb.r) + 0.7152 * luminanceChannel(rgb.g) + 0.0722 * luminanceChannel(rgb.b);
  }

  /** WCAG contrast ratio between two hex colours (1..21). */
  export function contrastRatio(a: string, b: string): number {
    const la = relativeLuminance(parseHexColor(a));
    const lb = relativeLuminance(parseHexColor(b));
    const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
  }

  // ── Favicon helpers ──────────────────────────────────────────────────────────

  function ensureFaviconLink(): HTMLLinkElement {
    let link = document.querySelector<HTMLLinkElement>("link[data-app-favicon='true']");
    if (link) return link;
    link = document.createElement("link");
    link.setAttribute("data-app-favicon", "true");
    link.rel = "icon";
    document.head.appendChild(link);
    return link;
  }

  function setFavicon(url: string | null): void {
    const link = ensureFaviconLink();
    const href = url ?? DEFAULT_FAVICON_PATH;
    link.href = href;
    link.type = href.startsWith("data:image/png")
      ? "image/png"
      : href.endsWith(".ico")
        ? "image/x-icon"
        : "image/svg+xml";
  }

  // ── Main apply ───────────────────────────────────────────────────────────────

  export function applyAppSettingsToDocument(settings: AppSettings): void {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const s = root.style;

    // Brand accent (legacy glass vars + HeroUI v3 vars).
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

    // Theme polarity.
    root.setAttribute("data-theme", isThemeValue(settings.default_theme) ? settings.default_theme : "dark");

    // Title + favicon.
    document.title = settings.brand_name?.trim() || DEFAULT_BRAND_NAME;
    setFavicon(settings.favicon_url ?? null);
  }

  // ── Cache + broadcast ────────────────────────────────────────────────────────

  function normalize(parsed: Partial<AppSettings>): AppSettings {
    return {
      ...DEFAULT_APP_SETTINGS,
      ...parsed,
      brand_name:
        typeof parsed.brand_name === "string" && parsed.brand_name.trim()
          ? parsed.brand_name
          : DEFAULT_APP_SETTINGS.brand_name,
      brand_color: isHexColor(parsed.brand_color) ? parsed.brand_color : DEFAULT_APP_SETTINGS.brand_color,
      default_theme: isThemeValue(parsed.default_theme) ? parsed.default_theme : DEFAULT_APP_SETTINGS.default_theme,
    };
  }

  export function loadCachedAppSettings(): AppSettings {
    if (typeof window === "undefined") return DEFAULT_APP_SETTINGS;
    try {
      const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
      if (!raw) return DEFAULT_APP_SETTINGS;
      return normalize(JSON.parse(raw) as Partial<AppSettings>);
    } catch {
      return DEFAULT_APP_SETTINGS;
    }
  }

  export function saveCachedAppSettings(settings: AppSettings): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }

  export function persistAndApplyAppSettings(settings: AppSettings): void {
    saveCachedAppSettings(settings);
    applyAppSettingsToDocument(settings);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent<AppSettings>(APP_SETTINGS_UPDATED_EVENT, { detail: settings }));
    }
  }

  export function subscribeToAppSettingsUpdates(listener: (s: AppSettings) => void): () => void {
    if (typeof window === "undefined") return () => {};
    const onEvent = (e: Event) => {
      const ce = e as CustomEvent<AppSettings>;
      if (ce.detail) listener(ce.detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== APP_SETTINGS_STORAGE_KEY || !e.newValue) return;
      try {
        listener(normalize(JSON.parse(e.newValue) as Partial<AppSettings>));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener(APP_SETTINGS_UPDATED_EVENT, onEvent as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(APP_SETTINGS_UPDATED_EVENT, onEvent as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }
  ```

  This is the full file. Compared to the existing ~340-line version, this drops `THEME_PRESETS`, `RADIUS_VALUES`, `SHADOW_VALUES`, `FONT_FAMILY_VALUES`, `PRESET_SHELL_VARS`, `ShellTheme`, `resolveShellTheme`, `applyShellTheme`, `clearShellTheme`, `pickForegroundChannels`/`rgbToHslChannels`/`PRIMARY_STOPS`/`buildPrimaryScale` (already removed in Slice 1), `alpha`, and the body-font / density / blur write paths. Keeps `deriveSecondaryAccent`, `contrastRatio` (both exported — verify no other module uses them and remove if not).

- [ ] **Step 2: Adjust `frontend/src/lib/appSettings.test.ts`** — delete the 6 tests that exercise removed behavior, keep the 7 that don't:

  Replace the entire `describe("appSettings bridge", () => { ... })` body with:

  ```ts
  describe("appSettings bridge", () => {
    beforeEach(() => {
      document.documentElement.removeAttribute("style");
      document.documentElement.removeAttribute("data-theme");
    });

    it("sets the accent var from brand_color", () => {
      applyAppSettingsToDocument(settings({ brand_color: "#112233" }));
      expect(document.documentElement.style.getPropertyValue("--accent-1")).toBe("#112233");
      expect(document.documentElement.style.getPropertyValue("--accent-grad")).toContain("#112233");
    });

    it("emits HeroUI v3 --accent + --accent-foreground from brand_color", () => {
      applyAppSettingsToDocument(settings({ brand_color: "#0a84ff" }));
      expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#0a84ff");
      expect(document.documentElement.style.getPropertyValue("--accent-foreground")).toBe("#ffffff");
    });

    it("picks black foreground for light brand_color", () => {
      applyAppSettingsToDocument(settings({ brand_color: "#fff8a0" }));
      expect(document.documentElement.style.getPropertyValue("--accent-foreground")).toBe("#000000");
    });

    it("no longer emits the v2-style --heroui-primary-* scale", () => {
      applyAppSettingsToDocument(settings({ brand_color: "#0a84ff" }));
      expect(document.documentElement.style.getPropertyValue("--heroui-primary")).toBe("");
      expect(document.documentElement.style.getPropertyValue("--heroui-primary-500")).toBe("");
      expect(document.documentElement.style.getPropertyValue("--heroui-primary-foreground")).toBe("");
    });

    it("sets data-theme from default_theme", () => {
      applyAppSettingsToDocument(settings({ default_theme: "light" }));
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });

    it("computes contrast ratio (white on black ~21)", () => {
      expect(Math.round(contrastRatio("#ffffff", "#000000"))).toBe(21);
    });

    it("derives a different secondary accent", () => {
      expect(deriveSecondaryAccent("#0a84ff")).not.toBe("#0a84ff");
    });
  });
  ```

  Net: 7 tests retained (down from 13 in Slice 1). The deleted tests are: `--blur`, `data-density`, preset palette, custom_theme override, body font, body font cleared.

- [ ] **Step 3: Type-check + tests.**
  Run: `cd frontend && ./node_modules/.bin/tsc --noEmit 2>&1 | tail -10`
  Expected: errors remaining only in `lib/api.ts` and `pages/workspace/WorkspaceSettings.tsx` (Tasks 6 and 7). The bridge itself + test file are clean.

  Run: `npm run test:run 2>&1 | tail -10`
  Expected: failures in `appSettings.test.ts` should be gone (or replaced by the 7 retained tests passing). Total count drops from 18 to ~12.

- [ ] **Step 4: Don't commit yet** — Task 6 and Task 7 still need to land before tsc is fully clean.

---

## Task 6: Frontend API DEMO mock cleanup

**Files:**
- Modify: `frontend/src/lib/api.ts` (lines 367, 370 per the Slice 3 spec)

- [ ] **Step 1: Edit `frontend/src/lib/api.ts`.** Drop the four fields from the DEMO mock objects on lines 367 and 370.

  Before:
  ```ts
  DEMO ? delay<AppSettings>({ id: 1, brand_name: "TelaiOS", brand_color: "#006FEE", logo_url: null, favicon_url: null, default_theme: "dark", density: "regular", glass_blur: 28, theme_preset: null, custom_theme: null, updated_at: new Date().toISOString() }) : http.get<AppSettings>("/settings").then((r) => r.data);
  ```

  After:
  ```ts
  DEMO ? delay<AppSettings>({ id: 1, brand_name: "TelaiOS", brand_color: "#006FEE", logo_url: null, favicon_url: null, default_theme: "dark", updated_at: new Date().toISOString() }) : http.get<AppSettings>("/settings").then((r) => r.data);
  ```

  Same edit for the `patchSettings` line just below.

- [ ] **Step 2: Type-check.**
  Run: `cd frontend && ./node_modules/.bin/tsc --noEmit 2>&1 | tail -10`
  Expected: errors remaining only in `pages/workspace/WorkspaceSettings.tsx` (Task 7). Bridge + types + api.ts are clean.

- [ ] **Step 3: Don't commit yet** — Task 7 still pending.

---

## Task 7: Rewrite WorkspaceSettings Branding + Appearance panes

**Files:**
- Modify: `frontend/src/pages/workspace/WorkspaceSettings.tsx`

This task makes the largest single-file change of the slice. Read the existing 589-line file first; the goal is to **rewrite only `BrandingSection` and `AppearanceSection` (lines ~94-280) using HeroUI v3 primitives**; everything else (the section nav, other placeholder panes) stays.

- [ ] **Step 1: Find the section boundaries.**

  Run: `grep -nE 'function BrandingSection|function AppearanceSection|^}|^function ' frontend/src/pages/workspace/WorkspaceSettings.tsx | head -20`
  Expected: `function BrandingSection() {` around line 94, `function AppearanceSection() {` around line 198, and the next `function ...` after Appearance marking the end of Appearance.

  Read both sections (`Read` the file with offset=94 and limit=200) to confirm their current props/state and any helpers they use (`THEME_OPTIONS`, `chip`, `selectTheme`, density radio, glass blur slider, etc.).

- [ ] **Step 2: Replace BrandingSection.** Substitute with:

  ```tsx
  function BrandingSection() {
    const { settings, save, isAdmin } = useAppSettings();
    const [brandName, setBrandName] = useState(settings.brand_name);
    const [brandColor, setBrandColor] = useState(settings.brand_color);
    const [logo, setLogo] = useState<string | null>(settings.logo_url);
    const [favicon, setFavicon] = useState<string | null>(settings.favicon_url);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
      setBrandName(settings.brand_name);
      setBrandColor(settings.brand_color);
      setLogo(settings.logo_url);
      setFavicon(settings.favicon_url);
    }, [settings]);

    const handleSave = async () => {
      if (!isAdmin) return;
      setSaving(true);
      try {
        await save({ brand_name: brandName, brand_color: brandColor, logo_url: logo, favicon_url: favicon });
      } finally {
        setSaving(false);
      }
    };

    return (
      <Card className="w-full">
        <Card.Header>
          <Card.Title>Branding</Card.Title>
          <Card.Description>Customise how the app presents itself across your workspace.</Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-5">
          <TextField
            value={brandName}
            onChange={setBrandName}
            isDisabled={!isAdmin}
            isRequired
          >
            <Label>Brand name</Label>
            <Input placeholder="TelaiOS" />
            <Description>Replaces the product name in the title bar and sidebar.</Description>
          </TextField>

          <ColorField
            value={brandColor}
            onChange={(c) => setBrandColor(typeof c === "string" ? c : c?.toString("hex") ?? brandColor)}
            isDisabled={!isAdmin}
          >
            <Label>Brand color</Label>
            <Input placeholder="#0a84ff" />
            <Description>Drives the accent color across the app.</Description>
          </ColorField>

          {/* Logo + favicon upload — reuse existing UploadImageButton if available;
              otherwise inline a file input + downscale via lib/image.ts. */}
          <BrandImageUploadField
            label="Logo"
            value={logo}
            onChange={setLogo}
            isDisabled={!isAdmin}
            maxBytes={700_000}
            hint="PNG, JPG, or SVG. Max 700 KB."
          />
          <BrandImageUploadField
            label="Favicon"
            value={favicon}
            onChange={setFavicon}
            isDisabled={!isAdmin}
            maxBytes={150_000}
            hint="PNG, JPG, or ICO. Max 150 KB."
          />
        </Card.Content>
        <Card.Footer>
          <Button color="accent" isPending={saving} isDisabled={!isAdmin} onPress={handleSave}>
            Save branding
          </Button>
        </Card.Footer>
      </Card>
    );
  }
  ```

  `BrandImageUploadField` is a small local helper (define at the bottom of the file, ~30 lines): renders a HeroUI `<Button variant="secondary">Upload</Button>` that triggers a hidden `<input type="file">` and pipes through `lib/image.ts`'s `downscaleAndEncode` (use whatever helper the current code uses; grep for it). Show a thumbnail of the current value with a "Remove" button next to it.

  Add the necessary imports at the top of the file:

  ```tsx
  import { Button, Card, ColorField, Description, Input, Label, TextField } from "@heroui/react";
  ```

- [ ] **Step 3: Replace AppearanceSection.** Substitute with:

  ```tsx
  function AppearanceSection() {
    const { settings, save, isAdmin } = useAppSettings();

    return (
      <Card className="w-full">
        <Card.Header>
          <Card.Title>Appearance</Card.Title>
          <Card.Description>Light or dark mode for the whole workspace.</Card.Description>
        </Card.Header>
        <Card.Content>
          <RadioGroup
            value={settings.default_theme}
            onChange={(v) => isAdmin && void save({ default_theme: v as "light" | "dark" })}
            isDisabled={!isAdmin}
            aria-label="Theme polarity"
          >
            <Radio value="light">Light</Radio>
            <Radio value="dark">Dark</Radio>
          </RadioGroup>
        </Card.Content>
      </Card>
    );
  }
  ```

  Add to the imports:

  ```tsx
  import { Radio, RadioGroup } from "@heroui/react";
  ```

- [ ] **Step 4: Remove now-dead helpers/constants.**

  Remove from `WorkspaceSettings.tsx`:
  - The `THEME_OPTIONS` constant (around line 186 per the Task 1 grep)
  - The `chip` / `selectTheme` functions inside `AppearanceSection`
  - The `Density` / `ThemePreset` type imports (`import type { Density, ThemePreset } from "../../types"`)
  - The `THEME_PRESETS` import from `lib/appSettings` (it no longer exists after Task 5)
  - The density radio markup + glass blur slider + custom_theme color editors

- [ ] **Step 5: Type-check + run vitest.**
  Run: `cd frontend && ./node_modules/.bin/tsc --noEmit 2>&1 | tail -10`
  Expected: clean.

  Run: `npm run test:run 2>&1 | tail -10`
  Expected: ~12 tests pass.

- [ ] **Step 6: Boot dev server + browser smoke.**
  Run: `cd frontend && npm run dev` (background)
  Open `http://localhost:5173/settings`:
  - Branding pane shows HeroUI TextField (brand name), HeroUI ColorField (brand color), two upload fields (logo + favicon), Save button.
  - Click Save — settings PATCH and the new --accent applies to the shell.
  - Appearance pane shows a RadioGroup with Light / Dark; click toggles `data-theme` on `<html>`.

- [ ] **Step 7: Commit the full frontend slice as a single coherent commit.**

  ```bash
  git add frontend/src/types/index.ts frontend/src/lib/appSettings.ts frontend/src/lib/appSettings.test.ts frontend/src/lib/api.ts frontend/src/pages/workspace/WorkspaceSettings.tsx
  git commit -m "$(cat <<'EOF'
  feat(settings): drop glass settings from frontend; rewrite Branding+Appearance in HeroUI v3

  Mirrors the backend changes from the previous commit.

  - types/index.ts: drop AppSettings.{density,glass_blur,theme_preset,
    custom_theme} + the 5 ancillary types (ThemePreset, CustomTheme,
    RadiusStep, ShadowStep, FontFamilyKey, Density).
  - lib/appSettings.ts: ~340 → ~180 lines. Drop THEME_PRESETS,
    RADIUS_VALUES, SHADOW_VALUES, FONT_FAMILY_VALUES, PRESET_SHELL_VARS,
    resolveShellTheme/applyShellTheme/clearShellTheme, body-font/density/
    blur write paths. applyAppSettingsToDocument is now: brand_color →
    --accent-1/-2/-grad/--accent/--accent-foreground; default_theme →
    data-theme; brand_name → document.title; favicon_url → <link>.
  - lib/appSettings.test.ts: 13 → 7 tests (drop the 6 testing dropped
    behaviors; keep accent/foreground/data-theme/derive/contrast tests).
  - lib/api.ts: DEMO mock loses the 4 fields.
  - WorkspaceSettings.tsx: BrandingSection rewritten with HeroUI Card +
    TextField + ColorField + BrandImageUploadField (local helper) +
    Button. AppearanceSection rewritten with HeroUI Card + RadioGroup
    of light/dark. Other panes (Notifications, Knowledge, Integrations,
    Privacy, Keyboard, TEOS) untouched — they remain placeholders.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 8: Final verification + memory update

**Files:** none modified.

- [ ] **Step 1: Full backend + frontend quality gate.**
  ```bash
  cd server && alembic upgrade head 2>&1 | tail -3
  cd server && pytest -q 2>&1 | tail -10
  cd frontend && ./node_modules/.bin/tsc --noEmit && npm run test:run 2>&1 | tail -6
  cd frontend && ./node_modules/.bin/vite build 2>&1 | tail -3
  ```
  Expected: all green.

- [ ] **Step 2: Roundtrip migration.**
  ```bash
  cd server && alembic downgrade -1 && alembic upgrade head
  ```
  Expected: clean.

- [ ] **Step 3: Manual UI walk.**
  Dev server + Playwright (or manual browser):
  - `/login` — Sign-in button reads new `--accent`.
  - `/settings` — Branding: change brand name → `document.title` updates; change brand color via ColorField → Sign-in button updates after re-render. Upload logo → sidebar shows it. Appearance: toggle Light/Dark → `<html data-theme>` flips, HeroUI shell adopts the new polarity.
  - `/` (workspace overview) — still renders via legacy bridge (other glass pages unaffected).
  - Confirm no console error referencing `density`, `glass_blur`, `theme_preset`, `custom_theme`.

- [ ] **Step 4: Capture diff stats for the PR description.**
  ```bash
  git log --oneline efef3d8..HEAD   # all of Slice 3
  git diff --stat efef3d8..HEAD
  ```

- [ ] **Step 5: Memory update.** Append a Slice 3 entry under the roadmap in `~/.claude/projects/-Users-nicocardone-Desktop-DEV-PERSONALI-telaios/memory/project_heroui_v3_migration.md` summarizing what landed (Alembic migration, schemas trimmed, frontend bridge cut roughly in half, WorkspaceSettings Branding + Appearance rewritten in HeroUI).

---

## Verification checklist (cumulative for the slice)

- [ ] Alembic upgrade/downgrade/upgrade roundtrip green
- [ ] `pytest` (backend) green
- [ ] `tsc --noEmit` (frontend) green
- [ ] `npm run test:run` (frontend) green — ~12 tests pass
- [ ] `vite build` green
- [ ] `/settings` Branding pane: HeroUI TextField + ColorField + uploads + Save
- [ ] `/settings` Appearance pane: HeroUI RadioGroup (Light/Dark only)
- [ ] No regressions on shell or unmigrated glass pages
- [ ] Memory updated with Slice 3 completion note
