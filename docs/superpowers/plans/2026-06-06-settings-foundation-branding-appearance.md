# Settings Foundation + Branding + Appearance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/settings` Branding + Appearance sections real, org-wide, admin-controlled, fetched at startup, and actually applied to the glassmorphism shell.

**Architecture:** Extend the `settings` singleton with `density` + `glass_blur` columns. On the client, a single `AppSettingsProvider` fetches settings once post-login, applies them by writing the **glass-shell** CSS variables (`--bg`, `--fg`, `--glass*`, `--accent-1/2`, `--hairline`, `--density-pad`, `--blur`, radii, shadows, font) — re-pointing the existing preset/`custom_theme` engine away from the unused `--heroui-*` layer — caches to localStorage, and broadcasts changes. The page is admin-editable, read-only for members.

**Tech Stack:** FastAPI + SQLAlchemy + Alembic + Pydantic (backend, run via `uv run`); React 18 + TypeScript + Vite (frontend); **vitest + @testing-library/react + jsdom** added for frontend unit/component tests; Playwright for e2e.

**Spec:** [docs/superpowers/specs/2026-06-06-settings-foundation-branding-appearance-design.md](../specs/2026-06-06-settings-foundation-branding-appearance-design.md)

---

## File Structure

**Backend**
- Modify `server/src/telaios/db/models/app_settings.py` — add `density`, `glass_blur` columns.
- Modify `server/src/telaios/modules/settings/schemas.py` — add fields to `SettingsRead` + `PatchSettingsDto`.
- Create `server/alembic/versions/20260606_1200_a7b8c9d0e1f2_add_density_glass_blur_to_settings.py` — migration.
- Modify `server/tests/unit/modules/settings/test_schemas.py` — validation tests.
- Modify `server/tests/integration/modules/test_settings.py` — endpoint tests.

**Frontend — test infra**
- Modify `frontend/package.json` — devDeps + `test`/`test:run` scripts.
- Create `frontend/vitest.config.ts`, `frontend/src/test/setup.ts`.

**Frontend — logic**
- Modify `frontend/src/types/index.ts` — `Density` type; add fields to `AppSettings` + `PatchSettingsPayload`.
- Modify `frontend/src/lib/api.ts` — DEMO mocks include new fields.
- Rewrite `frontend/src/lib/appSettings.ts` — bridge to glass-shell vars. Create `frontend/src/lib/appSettings.test.ts`.
- Create `frontend/src/lib/image.ts` + `frontend/src/lib/image.test.ts` — validate/downscale uploads.
- Create `frontend/src/context/AppSettingsContext.tsx` + `frontend/src/context/AppSettingsContext.test.tsx`.
- Modify `frontend/src/context/ThemeContext.tsx` — thin shim over settings.
- Modify `frontend/src/main.tsx` — mount provider.

**Frontend — UI**
- Rewrite Branding + Appearance in `frontend/src/pages/workspace/WorkspaceSettings.tsx` (other 6 sections unchanged).
- Modify `frontend/src/components/ProjectLayout.tsx` + `frontend/src/pages/operator/OperatorLayout.tsx` — wordmark/logo from settings.
- Modify `frontend/src/index.css` — `prefers-reduced-motion` rule.
- Modify `frontend/e2e/settings-page.spec.ts` — align to new design.

**Conventions:** backend commands run from `server/` via `uv run`. After backend code changes run `uv run ruff format . && uv run ruff check . && uv run mypy src/telaios`. Frontend type-check: `npm run build` (runs `tsc`). Iconography uses the existing `<Icon name=.../>` component (valid names listed in `frontend/src/components/Icon.tsx`) or FA `<i className="fa-solid fa-*"/>`; never emoji.

---

## Task 1: Backend — schema validation for `density` + `glass_blur`

**Files:**
- Modify: `server/src/telaios/modules/settings/schemas.py`
- Test: `server/tests/unit/modules/settings/test_schemas.py`

- [ ] **Step 1: Write failing unit tests**

Append to `server/tests/unit/modules/settings/test_schemas.py`:

```python
import pytest
from pydantic import ValidationError

from telaios.modules.settings.schemas import PatchSettingsDto


class TestDensityGlassBlur:
    def test_accepts_valid_density_and_blur(self) -> None:
        dto = PatchSettingsDto(density="compact", glass_blur=30)
        assert dto.density == "compact"
        assert dto.glass_blur == 30

    def test_rejects_unknown_density(self) -> None:
        with pytest.raises(ValidationError):
            PatchSettingsDto(density="huge")

    @pytest.mark.parametrize("blur", [-1, 61, 100])
    def test_rejects_out_of_range_blur(self, blur: int) -> None:
        with pytest.raises(ValidationError):
            PatchSettingsDto(glass_blur=blur)

    def test_fields_optional(self) -> None:
        dto = PatchSettingsDto()
        assert dto.density is None
        assert dto.glass_blur is None
```

- [ ] **Step 2: Run tests — verify they fail**

Run (from `server/`): `uv run pytest tests/unit/modules/settings/test_schemas.py -v`
Expected: FAIL — `PatchSettingsDto` has no `density`/`glass_blur` fields (validation errors on unexpected kwargs or attribute access).

- [ ] **Step 3: Add fields to schemas**

In `server/src/telaios/modules/settings/schemas.py`, add `Literal` to the typing import and add fields. Update `SettingsRead`:

```python
from typing import Any, Literal
```

In `class SettingsRead(...)`, after `default_theme: str`:

```python
    density: str
    glass_blur: int
```

In `class PatchSettingsDto(...)`, after the `default_theme` field:

```python
    density: Literal["compact", "regular", "comfy"] | None = None
    glass_blur: int | None = Field(default=None, ge=0, le=60)
```

- [ ] **Step 4: Run tests — verify pass**

Run: `uv run pytest tests/unit/modules/settings/test_schemas.py -v`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
cd server && uv run ruff format . && uv run ruff check . && cd ..
git add server/src/telaios/modules/settings/schemas.py server/tests/unit/modules/settings/test_schemas.py
git commit -m "feat(settings): validate density and glass_blur in schemas"
```

---

## Task 2: Backend — model columns + migration

**Files:**
- Modify: `server/src/telaios/db/models/app_settings.py`
- Create: `server/alembic/versions/20260606_1200_a7b8c9d0e1f2_add_density_glass_blur_to_settings.py`
- Test: `server/tests/integration/modules/test_settings.py`

- [ ] **Step 1: Write failing integration tests**

Append to `class TestPatchSettings` in `server/tests/integration/modules/test_settings.py`:

```python
    def test_admin_can_patch_density_and_glass_blur(
        self, client: TestClient, admin_token: str
    ) -> None:
        res = client.patch(
            "/settings",
            json={"density": "compact", "glass_blur": 40},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["density"] == "compact"
        assert body["glass_blur"] == 40

    def test_rejects_invalid_density(self, client: TestClient, admin_token: str) -> None:
        res = client.patch(
            "/settings",
            json={"density": "huge"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 422
```

Also extend `TestGetSettings.test_member_gets_settings` to assert defaults:

```python
        body = res.json()
        assert body["density"] == "regular"
        assert body["glass_blur"] == 28
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `uv run pytest tests/integration/modules/test_settings.py -v`
Expected: FAIL — `KeyError`/`AssertionError` on `density`/`glass_blur` (column + response field missing).

- [ ] **Step 3: Add model columns**

In `server/src/telaios/db/models/app_settings.py`, after the `default_theme` column:

```python
    density: Mapped[str] = mapped_column(
        String(16), nullable=False, default="regular", server_default="regular"
    )
    glass_blur: Mapped[int] = mapped_column(
        Integer, nullable=False, default=28, server_default="28"
    )
```

- [ ] **Step 4: Create the migration**

Create `server/alembic/versions/20260606_1200_a7b8c9d0e1f2_add_density_glass_blur_to_settings.py`:

```python
"""add_density_glass_blur_to_settings

Revision ID: a7b8c9d0e1f2
Revises: c1d2e3f4a5b6
Create Date: 2026-06-06 12:00:00.000000+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7b8c9d0e1f2"
down_revision: str | None = "c1d2e3f4a5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "settings",
        sa.Column("density", sa.String(length=16), nullable=False, server_default="regular"),
    )
    op.add_column(
        "settings",
        sa.Column("glass_blur", sa.Integer(), nullable=False, server_default="28"),
    )


def downgrade() -> None:
    op.drop_column("settings", "glass_blur")
    op.drop_column("settings", "density")
```

- [ ] **Step 5: Apply the migration**

Run: `uv run alembic upgrade head`
Expected: completes without error; `uv run alembic heads` shows `a7b8c9d0e1f2`.

- [ ] **Step 6: Run integration tests — verify pass**

Run: `uv run pytest tests/integration/modules/test_settings.py -v`
Expected: PASS. (If the integration suite needs the dev Postgres and it is unavailable, note this in the task review; the unit-level validation in Task 1 still gates schema correctness.)

- [ ] **Step 7: Type-check, lint, commit**

```bash
cd server && uv run ruff format . && uv run ruff check . && uv run mypy src/telaios && cd ..
git add server/src/telaios/db/models/app_settings.py server/alembic/versions/20260606_1200_a7b8c9d0e1f2_add_density_glass_blur_to_settings.py server/tests/integration/modules/test_settings.py
git commit -m "feat(settings): add density and glass_blur columns + migration"
```

---

## Task 3: Frontend — vitest setup

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`, `frontend/src/test/setup.ts`, `frontend/src/test/sanity.test.ts`

- [ ] **Step 1: Add dev dependencies**

Run (from `frontend/`):

```bash
npm install -D vitest@^2.1.8 jsdom@^25.0.1 @testing-library/react@^16.1.0 @testing-library/jest-dom@^6.6.3 @testing-library/user-event@^14.5.2
```

- [ ] **Step 2: Add test scripts**

In `frontend/package.json` `"scripts"`, add:

```json
    "test": "vitest",
    "test:run": "vitest run",
```

- [ ] **Step 3: Create vitest config**

Create `frontend/vitest.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 4: Create test setup**

Create `frontend/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 5: Add a sanity test**

Create `frontend/src/test/sanity.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("vitest", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run — verify pass**

Run: `npm run test:run`
Expected: 1 passing test.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/src/test/setup.ts frontend/src/test/sanity.test.ts
git commit -m "test(frontend): add vitest + testing-library setup"
```

---

## Task 4: Frontend — extend types + DEMO mocks

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add the `Density` type and extend interfaces**

In `frontend/src/types/index.ts`, in the "System Settings" block, after the `FontFamilyKey` line add:

```ts
export type Density = "compact" | "regular" | "comfy";
```

In `interface AppSettings`, after `default_theme: string;` add:

```ts
  density: Density;
  glass_blur: number;
```

In `interface PatchSettingsPayload`, after `default_theme?: string;` add:

```ts
  density?: Density;
  glass_blur?: number;
```

- [ ] **Step 2: Update DEMO mocks in api.ts**

In `frontend/src/lib/api.ts`, in `getSettings` DEMO branch add `density: "regular", glass_blur: 28,` to the object. In `patchSettings` DEMO branch add `density: data.density ?? "regular", glass_blur: data.glass_blur ?? 28,`.

- [ ] **Step 3: Type-check**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: PASS (no missing-property errors yet — the singleton consumers get defaults next tasks). If `tsc` reports `DEFAULT_APP_SETTINGS` missing the new fields, that is fixed in Task 5.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/lib/api.ts
git commit -m "feat(settings): add density + glass_blur to client types and demo mocks"
```

---

## Task 5: Frontend — rewrite the theming bridge onto glass-shell vars

This is the core. The bridge resolves `AppSettings` into the glass-shell CSS variables and applies them to `document.documentElement`. Light/Dark clears preset/custom overrides; a preset/custom theme sets them.

**Files:**
- Rewrite: `frontend/src/lib/appSettings.ts`
- Create: `frontend/src/lib/appSettings.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/lib/appSettings.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_APP_SETTINGS,
  applyAppSettingsToDocument,
  contrastRatio,
  deriveSecondaryAccent,
} from "./appSettings";
import type { AppSettings } from "../types";

function settings(overrides: Partial<AppSettings>): AppSettings {
  return { ...DEFAULT_APP_SETTINGS, ...overrides };
}

describe("appSettings bridge", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-density");
  });

  it("sets the accent var from brand_color", () => {
    applyAppSettingsToDocument(settings({ brand_color: "#112233" }));
    expect(document.documentElement.style.getPropertyValue("--accent-1")).toBe("#112233");
    expect(document.documentElement.style.getPropertyValue("--accent-grad")).toContain("#112233");
  });

  it("sets data-theme and data-density", () => {
    applyAppSettingsToDocument(settings({ default_theme: "light", density: "compact" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-density")).toBe("compact");
  });

  it("sets --blur from glass_blur", () => {
    applyAppSettingsToDocument(settings({ glass_blur: 42 }));
    expect(document.documentElement.style.getPropertyValue("--blur")).toBe("42px");
  });

  it("applies a preset palette to shell vars", () => {
    applyAppSettingsToDocument(settings({ theme_preset: "corporate" }));
    // corporate background is #ffffff
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe("#ffffff");
  });

  it("clears preset shell vars when no preset/custom", () => {
    applyAppSettingsToDocument(settings({ theme_preset: "corporate" }));
    applyAppSettingsToDocument(settings({ theme_preset: null, custom_theme: null }));
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe("");
  });

  it("custom_theme overrides a preset", () => {
    applyAppSettingsToDocument(
      settings({ theme_preset: "corporate", custom_theme: { background: "#010203" } }),
    );
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe("#010203");
  });

  it("computes contrast ratio (white on black ~21)", () => {
    expect(Math.round(contrastRatio("#ffffff", "#000000"))).toBe(21);
  });

  it("derives a different secondary accent", () => {
    expect(deriveSecondaryAccent("#0a84ff")).not.toBe("#0a84ff");
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npm run test:run -- src/lib/appSettings.test.ts`
Expected: FAIL — `contrastRatio`/`deriveSecondaryAccent` not exported; vars not set as asserted.

- [ ] **Step 3: Rewrite `appSettings.ts`**

Replace the entire contents of `frontend/src/lib/appSettings.ts` with:

```ts
import type {
  AppSettings,
  CustomTheme,
  FontFamilyKey,
  RadiusStep,
  ShadowStep,
  ThemePreset,
} from "../types";

const DEFAULT_BRAND_NAME = "TelaiOS";
const DEFAULT_BRAND_COLOR = "#0a84ff";
const DEFAULT_FAVICON_PATH = "/favicon.svg";

export const APP_SETTINGS_STORAGE_KEY = "telaios_app_settings";
export const APP_SETTINGS_UPDATED_EVENT = "telaios:app-settings-updated";

type Theme = "light" | "dark";
type Rgb = { r: number; g: number; b: number };

// ── Preset definitions (values reused; now applied to glass-shell vars) ──────

interface ShellTheme {
  polarity: Theme;
  background: string;
  foreground: string;
  surfaceStrong: string; // content1 -> --glass-strong
  surface: string; // content2 -> --glass
  surfaceWeak: string; // content3 -> --glass-weak
  divider: string; // -> --hairline
  radius: RadiusStep;
  shadow: ShadowStep;
  font_family: FontFamilyKey;
}

export const THEME_PRESETS: Record<ThemePreset, ShellTheme> = {
  default: { polarity: "dark", background: "#0b0d12", foreground: "#f4f4f7", surfaceStrong: "#2c2c2e", surface: "#1c1c1e", surfaceWeak: "#141418", divider: "rgba(255,255,255,0.08)", radius: "medium", shadow: "medium", font_family: "system" },
  corporate: { polarity: "light", background: "#ffffff", foreground: "#111111", surfaceStrong: "#f5f5f5", surface: "#eeeeee", surfaceWeak: "#e8e8e8", divider: "#dddddd", radius: "none", shadow: "none", font_family: "helvetica" },
  midnight: { polarity: "dark", background: "#050c1a", foreground: "#e8f0ff", surfaceStrong: "#0a1628", surface: "#081322", surfaceWeak: "#06101d", divider: "#1a2d4d", radius: "medium", shadow: "large", font_family: "inter" },
  warm: { polarity: "light", background: "#fdf8f2", foreground: "#2d1f0e", surfaceStrong: "#fef4e8", surface: "#fdf0e0", surfaceWeak: "#fcebd8", divider: "#e8d5ba", radius: "large", shadow: "small", font_family: "georgia" },
  minimal: { polarity: "light", background: "#ffffff", foreground: "#000000", surfaceStrong: "#fafafa", surface: "#f5f5f5", surfaceWeak: "#f0f0f0", divider: "#e0e0e0", radius: "none", shadow: "none", font_family: "system" },
  ocean: { polarity: "dark", background: "#04101a", foreground: "#d6eeff", surfaceStrong: "#071c2e", surface: "#061726", surfaceWeak: "#05121e", divider: "#0f3050", radius: "medium", shadow: "large", font_family: "inter" },
  forest: { polarity: "dark", background: "#061209", foreground: "#d4f0da", surfaceStrong: "#0d2114", surface: "#0b1c11", surfaceWeak: "#09170e", divider: "#163a1f", radius: "large", shadow: "medium", font_family: "georgia" },
  sunset: { polarity: "dark", background: "#160508", foreground: "#fde8d8", surfaceStrong: "#26080f", surface: "#1f060c", surfaceWeak: "#180509", divider: "#3d1018", radius: "medium", shadow: "large", font_family: "system" },
};

const RADIUS_VALUES: Record<RadiusStep, { xs: string; sm: string; md: string; lg: string; xl: string }> = {
  none: { xs: "0px", sm: "0px", md: "0px", lg: "0px", xl: "0px" },
  small: { xs: "4px", sm: "6px", md: "8px", lg: "10px", xl: "12px" },
  medium: { xs: "8px", sm: "12px", md: "16px", lg: "22px", xl: "28px" },
  large: { xs: "12px", sm: "18px", md: "24px", lg: "30px", xl: "36px" },
  full: { xs: "999px", sm: "999px", md: "999px", lg: "999px", xl: "999px" },
};

const SHADOW_VALUES: Record<ShadowStep, { lg: string; sm: string }> = {
  none: { lg: "none", sm: "none" },
  small: { lg: "0 6px 18px -8px rgba(20,20,40,0.18)", sm: "0 1px 3px rgba(0,0,0,0.12)" },
  medium: { lg: "0 12px 32px -16px rgba(20,20,40,0.28)", sm: "0 2px 8px -2px rgba(0,0,0,0.18)" },
  large: { lg: "0 30px 80px -30px rgba(0,0,0,0.6), 0 12px 32px -16px rgba(0,0,0,0.45)", sm: "0 6px 18px -8px rgba(0,0,0,0.4)" },
};

const FONT_FAMILY_VALUES: Record<FontFamilyKey, string> = {
  system: "'Geist', -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif",
  inter: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
  roboto: "Roboto, 'Helvetica Neue', Arial, sans-serif",
  helvetica: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'SF Mono', 'Geist Mono', 'Fira Code', monospace",
};

// Every shell var the bridge may set when a preset/custom theme is active.
// Listed so they can be cleared when reverting to the plain Light/Dark stylesheet.
const PRESET_SHELL_VARS = [
  "--bg", "--fg", "--fg-2", "--fg-3", "--fg-4",
  "--glass", "--glass-strong", "--glass-weak", "--hairline",
  "--radius-xs", "--radius-sm", "--radius-md", "--radius-lg", "--radius-xl",
  "--shadow-lg", "--shadow-sm",
];

export const DEFAULT_APP_SETTINGS: AppSettings = {
  id: 1,
  brand_name: DEFAULT_BRAND_NAME,
  brand_color: DEFAULT_BRAND_COLOR,
  logo_url: null,
  favicon_url: null,
  default_theme: "dark",
  density: "regular",
  glass_blur: 28,
  theme_preset: null,
  custom_theme: null,
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
  else if (h < 180) [r1, g1, b1] = [0, c, x];
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

function pickForegroundChannels(base: Rgb): string {
  const lum = relativeLuminance(base);
  const white = 1.05 / (lum + 0.05);
  const black = (lum + 0.05) / 0.05;
  return white >= black ? "0 0% 100%" : "0 0% 0%";
}

function rgbToHslChannels(rgb: Rgb): string {
  const { h, s, l } = rgbToHsl(rgb);
  return `${h.toFixed(2)} ${(s * 100).toFixed(2)}% ${(l * 100).toFixed(2)}%`;
}

// HeroUI primary scale (kept for embedded HeroUI controls in plan/chat/ProviderForm).
const PRIMARY_STOPS: Array<{ key: string; amount: number; toWhite: boolean }> = [
  { key: "50", amount: 0.92, toWhite: true }, { key: "100", amount: 0.82, toWhite: true },
  { key: "200", amount: 0.66, toWhite: true }, { key: "300", amount: 0.5, toWhite: true },
  { key: "400", amount: 0.3, toWhite: true }, { key: "500", amount: 0, toWhite: true },
  { key: "600", amount: 0.12, toWhite: false }, { key: "700", amount: 0.24, toWhite: false },
  { key: "800", amount: 0.38, toWhite: false }, { key: "900", amount: 0.54, toWhite: false },
];

function buildPrimaryScale(hex: string): Record<string, string> {
  const base = parseHexColor(hex);
  const out: Record<string, string> = {};
  for (const stop of PRIMARY_STOPS) {
    const t = stop.toWhite ? 255 : 0;
    const mixed: Rgb = stop.amount === 0 ? base : {
      r: base.r + (t - base.r) * stop.amount,
      g: base.g + (t - base.g) * stop.amount,
      b: base.b + (t - base.b) * stop.amount,
    };
    out[stop.key] = rgbToHslChannels(mixed);
  }
  return out;
}

function alpha(hex: string, a: number): string {
  const { r, g, b } = parseHexColor(hex);
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}

// ── Theme resolution + application ───────────────────────────────────────────

function resolveShellTheme(preset: ThemePreset | null, custom: CustomTheme | null): ShellTheme | null {
  if (!preset && !custom) return null;
  const base = THEME_PRESETS[preset ?? "default"];
  return {
    polarity: base.polarity,
    background: isHexColor(custom?.background) ? custom!.background! : base.background,
    foreground: isHexColor(custom?.foreground) ? custom!.foreground! : base.foreground,
    surfaceStrong: isHexColor(custom?.content1) ? custom!.content1! : base.surfaceStrong,
    surface: isHexColor(custom?.content2) ? custom!.content2! : base.surface,
    surfaceWeak: isHexColor(custom?.content3) ? custom!.content3! : base.surfaceWeak,
    divider: isHexColor(custom?.divider) ? custom!.divider! : base.divider,
    radius: custom?.radius ?? base.radius,
    shadow: custom?.shadow ?? base.shadow,
    font_family: custom?.font_family ?? base.font_family,
  };
}

function applyShellTheme(theme: ShellTheme): void {
  const s = document.documentElement.style;
  s.setProperty("--bg", theme.background);
  if (isHexColor(theme.foreground)) {
    s.setProperty("--fg", theme.foreground);
    s.setProperty("--fg-2", alpha(theme.foreground, 0.64));
    s.setProperty("--fg-3", alpha(theme.foreground, 0.4));
    s.setProperty("--fg-4", alpha(theme.foreground, 0.18));
  } else {
    s.setProperty("--fg", theme.foreground);
  }
  s.setProperty("--glass-strong", theme.surfaceStrong);
  s.setProperty("--glass", theme.surface);
  s.setProperty("--glass-weak", theme.surfaceWeak);
  s.setProperty("--hairline", theme.divider);
  const r = RADIUS_VALUES[theme.radius];
  s.setProperty("--radius-xs", r.xs); s.setProperty("--radius-sm", r.sm);
  s.setProperty("--radius-md", r.md); s.setProperty("--radius-lg", r.lg);
  s.setProperty("--radius-xl", r.xl);
  const sh = SHADOW_VALUES[theme.shadow];
  s.setProperty("--shadow-lg", sh.lg); s.setProperty("--shadow-sm", sh.sm);
  s.setProperty("font-family", FONT_FAMILY_VALUES[theme.font_family]);
}

function clearShellTheme(): void {
  const s = document.documentElement.style;
  for (const v of PRESET_SHELL_VARS) s.removeProperty(v);
  s.removeProperty("font-family");
}

// ── Favicon / title helpers ──────────────────────────────────────────────────

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
  link.type = href.startsWith("data:image/png") ? "image/png"
    : href.endsWith(".ico") ? "image/x-icon" : "image/svg+xml";
}

// ── Main apply ───────────────────────────────────────────────────────────────

export function applyAppSettingsToDocument(settings: AppSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const s = root.style;

  // Accent (drives the whole glass shell)
  const brandColor = isHexColor(settings.brand_color) ? settings.brand_color : DEFAULT_BRAND_COLOR;
  const accent2 = deriveSecondaryAccent(brandColor);
  s.setProperty("--accent-1", brandColor);
  s.setProperty("--accent-2", accent2);
  s.setProperty("--accent-grad", `linear-gradient(135deg, ${brandColor} 0%, ${accent2} 100%)`);

  // HeroUI primary (embedded controls)
  const scale = buildPrimaryScale(brandColor);
  s.setProperty("--heroui-primary", scale["500"]);
  s.setProperty("--heroui-primary-foreground", pickForegroundChannels(parseHexColor(brandColor)));
  for (const [k, v] of Object.entries(scale)) s.setProperty(`--heroui-primary-${k}`, v);

  // Theme + density + blur
  const theme = resolveShellTheme(settings.theme_preset ?? null, settings.custom_theme ?? null);
  if (theme) {
    root.setAttribute("data-theme", theme.polarity);
    applyShellTheme(theme);
  } else {
    root.setAttribute("data-theme", isThemeValue(settings.default_theme) ? settings.default_theme : "dark");
    clearShellTheme();
  }
  root.setAttribute("data-density", settings.density ?? "regular");
  s.setProperty("--blur", `${clamp(settings.glass_blur ?? 28, 0, 60)}px`);

  // Title + favicon
  document.title = settings.brand_name?.trim() || DEFAULT_BRAND_NAME;
  setFavicon(settings.favicon_url ?? null);
}

// ── Cache + broadcast ────────────────────────────────────────────────────────

function normalize(parsed: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    ...parsed,
    brand_name: typeof parsed.brand_name === "string" && parsed.brand_name.trim() ? parsed.brand_name : DEFAULT_APP_SETTINGS.brand_name,
    brand_color: isHexColor(parsed.brand_color) ? parsed.brand_color : DEFAULT_APP_SETTINGS.brand_color,
    default_theme: isThemeValue(parsed.default_theme) ? parsed.default_theme : DEFAULT_APP_SETTINGS.default_theme,
    density: parsed.density === "compact" || parsed.density === "comfy" || parsed.density === "regular" ? parsed.density : DEFAULT_APP_SETTINGS.density,
    glass_blur: typeof parsed.glass_blur === "number" ? clamp(parsed.glass_blur, 0, 60) : DEFAULT_APP_SETTINGS.glass_blur,
    theme_preset: parsed.theme_preset != null && parsed.theme_preset in THEME_PRESETS ? (parsed.theme_preset as ThemePreset) : null,
    custom_theme: parsed.custom_theme != null && typeof parsed.custom_theme === "object" ? (parsed.custom_theme as CustomTheme) : null,
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

- [ ] **Step 4: Run tests — verify pass**

Run: `npm run test:run -- src/lib/appSettings.test.ts`
Expected: PASS (all assertions).

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc --noEmit` (Expected: PASS).

```bash
git add frontend/src/lib/appSettings.ts frontend/src/lib/appSettings.test.ts
git commit -m "feat(settings): re-point theme engine onto glass-shell CSS vars"
```

---

## Task 6: Frontend — image validation + downscale util

**Files:**
- Create: `frontend/src/lib/image.ts`, `frontend/src/lib/image.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/lib/image.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateImageDataUrl } from "./image";

describe("validateImageDataUrl", () => {
  it("accepts a small image data url", () => {
    const url = "data:image/png;base64,AAAA";
    expect(validateImageDataUrl(url, 700_000)).toEqual({ ok: true });
  });

  it("rejects non-image data url", () => {
    expect(validateImageDataUrl("data:text/plain;base64,AAAA", 700_000).ok).toBe(false);
  });

  it("rejects oversize data url", () => {
    const url = `data:image/png;base64,${"a".repeat(800_000)}`;
    expect(validateImageDataUrl(url, 700_000).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npm run test:run -- src/lib/image.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `frontend/src/lib/image.ts`:

```ts
export interface ImageValidation {
  ok: boolean;
  error?: string;
}

/** Validate a base64 image data URL against a max byte budget (the encoded string length). */
export function validateImageDataUrl(dataUrl: string, maxBytes: number): ImageValidation {
  if (!/^data:image\/[a-zA-Z.+-]+;base64,/.test(dataUrl)) {
    return { ok: false, error: "File must be an image." };
  }
  if (dataUrl.length > maxBytes) {
    return { ok: false, error: `Image is too large (max ${Math.round(maxBytes / 1000)} KB).` };
  }
  return { ok: true };
}

/**
 * Read a File into a base64 data URL, downscaling raster images so the encoded
 * string fits maxBytes. SVGs are returned as-is. Browser-only (uses canvas).
 */
export async function fileToDataUrl(file: File, maxBytes: number, maxDim = 512): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("Failed to read file"));
    fr.readAsDataURL(file);
  });
  if (file.type === "image/svg+xml" || raw.length <= maxBytes) return raw;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Failed to decode image"));
    i.src = raw;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return raw;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let quality = 0.9;
  let out = canvas.toDataURL("image/png");
  while (out.length > maxBytes && quality > 0.3) {
    out = canvas.toDataURL("image/jpeg", quality);
    quality -= 0.15;
  }
  return out;
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npm run test:run -- src/lib/image.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/image.ts frontend/src/lib/image.test.ts
git commit -m "feat(settings): image validation + downscale util for logo/favicon"
```

---

## Task 7: Frontend — `AppSettingsProvider`

**Files:**
- Create: `frontend/src/context/AppSettingsContext.tsx`, `frontend/src/context/AppSettingsContext.test.tsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/context/AppSettingsContext.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api", () => ({
  getSettings: vi.fn(),
  patchSettings: vi.fn(),
}));
vi.mock("./AuthContext", () => ({
  useAuth: () => ({ user: { system_role: "admin" } }),
}));

import * as api from "../lib/api";
import { AppSettingsProvider, useAppSettings } from "./AppSettingsContext";
import { DEFAULT_APP_SETTINGS } from "../lib/appSettings";

function Probe() {
  const { settings, isAdmin } = useAppSettings();
  return (
    <div>
      <span data-testid="brand">{settings.brand_name}</span>
      <span data-testid="admin">{String(isAdmin)}</span>
    </div>
  );
}

describe("AppSettingsProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("fetches settings on mount and exposes them + isAdmin", async () => {
    (api.getSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_APP_SETTINGS,
      brand_name: "Acme",
    });
    render(
      <AppSettingsProvider>
        <Probe />
      </AppSettingsProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("brand")).toHaveTextContent("Acme"));
    expect(screen.getByTestId("admin")).toHaveTextContent("true");
    expect(document.documentElement.style.getPropertyValue("--accent-1")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npm run test:run -- src/context/AppSettingsContext.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the provider**

Create `frontend/src/context/AppSettingsContext.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getSettings, patchSettings } from "../lib/api";
import {
  DEFAULT_APP_SETTINGS,
  applyAppSettingsToDocument,
  loadCachedAppSettings,
  persistAndApplyAppSettings,
  subscribeToAppSettingsUpdates,
} from "../lib/appSettings";
import type { AppSettings, PatchSettingsPayload } from "../types";
import { useAuth } from "./AuthContext";

interface AppSettingsContextValue {
  settings: AppSettings;
  isAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  save: (patch: PatchSettingsPayload) => Promise<void>;
}

const AppSettingsContext = createContext<AppSettingsContextValue>({
  settings: DEFAULT_APP_SETTINGS,
  isAdmin: false,
  loading: true,
  refresh: async () => {},
  save: async () => {},
});

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isAdmin = user?.system_role === "admin";
  const [settings, setSettings] = useState<AppSettings>(loadCachedAppSettings);
  const [loading, setLoading] = useState(true);
  const lastGood = useRef<AppSettings>(settings);

  const apply = useCallback((next: AppSettings) => {
    lastGood.current = next;
    setSettings(next);
    persistAndApplyAppSettings(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const fresh = await getSettings();
      apply(fresh);
    } catch {
      // keep cached/default; non-blocking
    } finally {
      setLoading(false);
    }
  }, [apply]);

  const save = useCallback(
    async (patch: PatchSettingsPayload) => {
      const optimistic = { ...settings, ...patch } as AppSettings;
      setSettings(optimistic);
      applyAppSettingsToDocument(optimistic);
      try {
        const updated = await patchSettings(patch);
        apply(updated);
      } catch (err) {
        // revert to last-known-good
        setSettings(lastGood.current);
        applyAppSettingsToDocument(lastGood.current);
        throw err;
      }
    },
    [apply, settings],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Cross-tab + cross-component sync.
  useEffect(() => subscribeToAppSettingsUpdates((s) => setSettings(s)), []);

  return (
    <AppSettingsContext.Provider value={{ settings, isAdmin, loading, refresh, save }}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  return useContext(AppSettingsContext);
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npm run test:run -- src/context/AppSettingsContext.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/context/AppSettingsContext.tsx frontend/src/context/AppSettingsContext.test.tsx
git commit -m "feat(settings): AppSettingsProvider (fetch, apply, cache, optimistic save)"
```

---

## Task 8: Frontend — mount the provider in main.tsx

**Files:**
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Mount the provider**

In `frontend/src/main.tsx`, add the import:

```tsx
import { AppSettingsProvider } from "./context/AppSettingsContext";
```

Wrap the app: place `<AppSettingsProvider>` directly inside `<AuthProvider>` and around `<AppProvider>`:

```tsx
        <AuthProvider>
          <AppSettingsProvider>
            <AppProvider>
              {/* ...existing BrowserRouter/Routes... */}
            </AppProvider>
          </AppSettingsProvider>
        </AuthProvider>
```

(The existing top-of-file `applyAppSettingsToDocument(loadCachedAppSettings());` call stays — it paints cached settings before React mounts. `ThemeProvider` is left unchanged here and simplified later in Task 12, after its `setTheme` callers are removed — this keeps every commit compiling under `noUnusedLocals`.)

- [ ] **Step 2: Type-check + commit**

Run (from `frontend/`): `npx tsc --noEmit` → PASS.

```bash
git add frontend/src/main.tsx
git commit -m "feat(settings): mount AppSettingsProvider at app root"
```

---

## Task 9: Frontend — rewrite Branding + Appearance sections

Rewrite **both** `BrandingSection` and `AppearanceSection` in `frontend/src/pages/workspace/WorkspaceSettings.tsx` in one task (they share the file's imports; splitting would leave an intermediate state that fails `noUnusedLocals`). Keep the existing `SetGroup`/`SetRow`/`SetToggle`/`SetSelect` primitives and the other six section components **unchanged**.

**Files:**
- Modify: `frontend/src/pages/workspace/WorkspaceSettings.tsx`

- [ ] **Step 1: Update imports at the top of the file**

Replace the current top imports (the `useState`/`Icon`/`useTheme`/`getSettings`/`patchSettings`/`AppSettings`/`persistAndApplyAppSettings`/`toast` lines) with exactly:

```tsx
import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { useAppSettings } from "../../context/AppSettingsContext";
import { fileToDataUrl, validateImageDataUrl } from "../../lib/image";
import { THEME_PRESETS } from "../../lib/appSettings";
import type { Density, ThemePreset } from "../../types";
import { toast } from "../../lib/toast";
```

(The custom-theme editor in Task 10 will extend these imports with `contrastRatio` and the `CustomTheme`/`RadiusStep`/`ShadowStep`/`FontFamilyKey` types.)

- [ ] **Step 2: Add a read-only notice primitive**

Add near the other primitives:

```tsx
function ReadOnlyNotice() {
  return (
    <div className="set-readonly-note" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", color: "var(--fg-3)", fontSize: 12.5 }}>
      <Icon name="lock" size="sm" /> Only workspace admins can change these settings.
    </div>
  );
}
```

- [ ] **Step 3: Replace `BrandingSection`**

```tsx
const LOGO_MAX = 700_000;
const FAVICON_MAX = 150_000;

function BrandingSection() {
  const { settings, isAdmin, save } = useAppSettings();
  const [brandName, setBrandName] = useState(settings.brand_name);
  const [brandColor, setBrandColor] = useState(settings.brand_color);
  const [logo, setLogo] = useState<string | null>(settings.logo_url);
  const [favicon, setFavicon] = useState<string | null>(settings.favicon_url);
  const [saving, setSaving] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const faviconInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setBrandName(settings.brand_name);
    setBrandColor(settings.brand_color);
    setLogo(settings.logo_url);
    setFavicon(settings.favicon_url);
  }, [settings]);

  const pick = async (file: File | undefined, max: number, set: (v: string) => void) => {
    if (!file) return;
    try {
      const url = await fileToDataUrl(file, max);
      const v = validateImageDataUrl(url, max);
      if (!v.ok) return toast.error(v.error ?? "Invalid image");
      set(url);
    } catch {
      toast.error("Could not read image");
    }
  };

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await save({ brand_name: brandName, brand_color: brandColor, logo_url: logo, favicon_url: favicon });
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SetGroup title="Branding" desc="Customise how TelaiOS presents itself across your workspace.">
      {!isAdmin && <ReadOnlyNotice />}
      <SetRow label="Brand name" hint="Replaces the product name in the title bar and sidebar.">
        <input className="form-input" value={brandName} disabled={!isAdmin}
          onChange={(e) => setBrandName(e.target.value)} placeholder="TelaiOS" />
      </SetRow>
      <SetRow label="Accent color" hint="Drives primary actions, focus states and the TEOS orb.">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input type="color" value={brandColor} disabled={!isAdmin}
            onChange={(e) => setBrandColor(e.target.value)}
            style={{ width: 36, height: 36, borderRadius: 6, border: "0.5px solid var(--hairline)", cursor: isAdmin ? "pointer" : "default", padding: 2 }} />
          <input className="form-input" value={brandColor} disabled={!isAdmin}
            onChange={(e) => setBrandColor(e.target.value)} placeholder="#0a84ff" style={{ width: 110 }} />
        </div>
      </SetRow>
      <SetRow label="Logo" hint="Shown in the sidebar. PNG or SVG, up to 700 KB.">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {logo && <img src={logo} alt="Preview" style={{ height: 28, borderRadius: 6 }} />}
          <input ref={logoInput} type="file" accept="image/*" hidden
            onChange={(e) => void pick(e.target.files?.[0], LOGO_MAX, setLogo)} />
          <button className="pill-btn" disabled={!isAdmin} onClick={() => logoInput.current?.click()}>
            <Icon name="upload" size="sm" /> Upload
          </button>
          {logo && <button className="pill-btn" disabled={!isAdmin} onClick={() => setLogo(null)}>Remove</button>}
        </div>
      </SetRow>
      <SetRow label="Favicon" hint="Browser tab icon. Up to 150 KB.">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {favicon && <img src={favicon} alt="Favicon preview" style={{ height: 24, width: 24, borderRadius: 4 }} />}
          <input ref={faviconInput} type="file" accept="image/*" hidden
            onChange={(e) => void pick(e.target.files?.[0], FAVICON_MAX, setFavicon)} />
          <button className="pill-btn" disabled={!isAdmin} onClick={() => faviconInput.current?.click()}>
            <Icon name="upload" size="sm" /> Upload
          </button>
          {favicon && <button className="pill-btn" disabled={!isAdmin} onClick={() => setFavicon(null)}>Remove</button>}
        </div>
      </SetRow>
      {isAdmin && (
        <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4 }}>
          <button className="pill-btn" style={{ background: "var(--accent-1)", color: "#fff", borderColor: "transparent", opacity: saving ? 0.5 : 1 }}
            onClick={() => void onSave()} disabled={saving}>
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      )}
    </SetGroup>
  );
}
```

- [ ] **Step 4: Replace `AppearanceSection`** — removes the dead accent-swatches, sidebar-collapsed, reduce-motion, and AI-sidebar controls

```tsx
const THEME_OPTIONS: { id: "light" | "dark" | ThemePreset; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "corporate", label: "Corporate" },
  { id: "midnight", label: "Midnight" },
  { id: "minimal", label: "Minimal" },
  { id: "ocean", label: "Ocean" },
  { id: "forest", label: "Forest" },
  { id: "sunset", label: "Sunset" },
  { id: "warm", label: "Warm" },
];

function AppearanceSection() {
  const { settings, isAdmin, save } = useAppSettings();
  const [saving, setSaving] = useState(false);

  const current: "light" | "dark" | ThemePreset = settings.theme_preset ?? (settings.default_theme === "light" ? "light" : "dark");

  const chip = (id: "light" | "dark" | ThemePreset) => {
    if (id === "light") return { bg: "#ffffff", fg: "#111111" };
    if (id === "dark") return { bg: "#0b0d12", fg: "#f4f4f7" };
    const p = THEME_PRESETS[id];
    return { bg: p.background, fg: p.foreground };
  };

  const persist = async (patch: Parameters<typeof save>[0]) => {
    if (saving) return;
    setSaving(true);
    try {
      await save(patch);
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const selectTheme = (id: "light" | "dark" | ThemePreset) => {
    if (!isAdmin) return;
    if (id === "light" || id === "dark") void persist({ default_theme: id, theme_preset: null });
    else void persist({ theme_preset: id, default_theme: THEME_PRESETS[id].polarity });
  };

  return (
    <>
      <SetGroup title="Theme" desc="Workspace-wide appearance. Applies to everyone.">
        {!isAdmin && <ReadOnlyNotice />}
        <SetRow label="Theme" hint="Light, Dark, or a branded preset palette." vertical>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 4 }}>
            {THEME_OPTIONS.map((o) => {
              const c = chip(o.id);
              const active = current === o.id;
              return (
                <button key={o.id} disabled={!isAdmin} onClick={() => selectTheme(o.id)}
                  data-active={active ? "true" : undefined}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                    borderRadius: 10, cursor: isAdmin ? "pointer" : "default",
                    border: active ? "1.5px solid var(--accent-1)" : "1px solid var(--hairline)",
                    background: "var(--glass-weak)",
                  }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, background: c.bg, border: "1px solid var(--hairline)", display: "inline-block" }}>
                    <span style={{ display: "block", width: 8, height: 8, margin: "5px", borderRadius: 2, background: c.fg }} />
                  </span>
                  <span style={{ fontSize: 12.5 }}>{o.label}</span>
                </button>
              );
            })}
          </div>
        </SetRow>
      </SetGroup>

      <SetGroup title="Materials" desc="Tune the density and glass of the interface.">
        <SetRow label="Density" hint="How tight rows, cards and lists feel.">
          <div className="seg">
            {(["compact", "regular", "comfy"] as Density[]).map((d) => (
              <button key={d} className="seg-btn" disabled={!isAdmin}
                data-active={settings.density === d ? "true" : undefined}
                onClick={() => void persist({ density: d })}>
                {d}
              </button>
            ))}
          </div>
        </SetRow>
        <SetRow label="Glass blur" hint={`${settings.glass_blur}px backdrop blur on translucent panels.`}>
          <GlassBlurControl
            value={settings.glass_blur}
            disabled={!isAdmin}
            onCommit={(v) => void persist({ glass_blur: v })}
          />
        </SetRow>
      </SetGroup>
    </>
  );
}

function GlassBlurControl({ value, disabled, onCommit }: { value: number; disabled: boolean; onCommit: (v: number) => void }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 220 }}>
      <input type="range" min={0} max={60} value={local} disabled={disabled}
        aria-label="Glass blur"
        onChange={(e) => {
          const v = parseInt(e.target.value);
          setLocal(v);
          document.documentElement.style.setProperty("--blur", `${v}px`); // live preview
        }}
        onMouseUp={() => onCommit(local)}
        onTouchEnd={() => onCommit(local)}
        style={{ flex: 1 }} />
      <span className="mono" style={{ fontSize: 12, color: "var(--fg-3)", minWidth: 36 }}>{local}px</span>
    </div>
  );
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. Remove any unused imports/helpers `tsc` flags (under `noUnusedLocals`). Keep `SetToggle`/`SetSelect` if other (unchanged) sections still use them.

- [ ] **Step 6: Run all frontend unit tests**

Run: `npm run test:run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/workspace/WorkspaceSettings.tsx
git commit -m "feat(settings): real Branding + Appearance sections wired to provider"
```

---

## Task 10: Frontend — wordmark/logo from settings; remove per-user theme toggle

Theme is now org-controlled, so the per-user Light/Dark switcher in the topbar user menu is removed from both layouts.

**Files:**
- Modify: `frontend/src/components/ProjectLayout.tsx`
- Modify: `frontend/src/pages/operator/OperatorLayout.tsx`

- [ ] **Step 1: ProjectLayout — brand + logo, remove toggle**

In `frontend/src/components/ProjectLayout.tsx`, add the import:

```tsx
import { useAppSettings } from "../context/AppSettingsContext";
```

Inside the component body (near other hooks), add:

```tsx
  const { settings: appSettings } = useAppSettings();
  const brand = appSettings.brand_name?.trim() || "TelaiOS";
```

Replace the hardcoded wordmark occurrences:
- Line ~241 `const projectName = wsView ? "TelaiOS" : ...` → use `brand` instead of `"TelaiOS"`.
- Line ~314 sidebar `<span>TelaiOS</span>` → render the logo when set, else brand text:

```tsx
            {appSettings.logo_url
              ? <img src={appSettings.logo_url} alt={`${brand} logo`} style={{ height: 20 }} />
              : <span>{brand}</span>}
```

- Line ~415 `<b>{wsView ? "TelaiOS" : projectName}</b>` → `<b>{wsView ? brand : projectName}</b>`.
- Line ~478 `<span style={{ color: "var(--fg-3)" }}>TelaiOS</span>` → `{brand}`.

Then **delete the Light/Dark toggle button group** (the two `<button>`s with `onClick={() => setTheme("light")}` / `setTheme("dark")` around lines ~595–618, and the wrapping row container). After deleting, run `npx tsc --noEmit` and remove the now-unused `useTheme`/`theme`/`setTheme` references and import it flags (delete the `const { theme, setTheme } = useTheme();` line and the `useTheme` import if no longer used).

- [ ] **Step 2: OperatorLayout — brand text, remove toggle**

In `frontend/src/pages/operator/OperatorLayout.tsx`, add `import { useAppSettings } from "../../context/AppSettingsContext";`, read `const { settings: appSettings } = useAppSettings();`, and replace the `TelaiOS Operator` text (~line 168) with `{(appSettings.brand_name?.trim() || "TelaiOS")} Operator`. Leave the `<TelaiOSLogo />` glyph as-is. Then **delete the Light/Dark toggle button group** (the two `<button>`s with `onClick={() => setTheme(...)}` around lines ~295–315). Run `npx tsc --noEmit` and remove now-unused `useTheme`/`theme`/`setTheme` references + import.

- [ ] **Step 3: Type-check + commit**

Run: `npx tsc --noEmit` → PASS.

```bash
git add frontend/src/components/ProjectLayout.tsx frontend/src/pages/operator/OperatorLayout.tsx
git commit -m "feat(settings): brand name/logo in chrome; remove per-user theme toggle"
```

---

## Task 11: Frontend — simplify ThemeContext (org-controlled)

Now that no component calls `setTheme`/`toggle`/`syncThemeWithDefault`, reduce `ThemeContext` to expose only `theme`, derived from settings.

**Files:**
- Modify: `frontend/src/context/ThemeContext.tsx`

- [ ] **Step 1: Replace ThemeContext body**

Replace the entire contents of `frontend/src/context/ThemeContext.tsx` with:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { isThemeValue, loadCachedAppSettings, subscribeToAppSettingsUpdates } from "../lib/appSettings";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: "dark" });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    isThemeValue(loadCachedAppSettings().default_theme)
      ? (loadCachedAppSettings().default_theme as Theme)
      : "dark",
  );

  useEffect(
    () =>
      subscribeToAppSettingsUpdates((s) => {
        const next = s.theme_preset ? null : s.default_theme;
        if (isThemeValue(next)) setThemeState(next);
      }),
    [],
  );

  // data-theme is owned by applyAppSettingsToDocument; this context only exposes
  // the current polarity for components that branch on it.
  return <ThemeContext.Provider value={{ theme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. If any file still imports `setTheme`/`toggle`/`syncThemeWithDefault` from `useTheme`, fix it (none should remain after Tasks 9–10).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/context/ThemeContext.tsx
git commit -m "refactor(settings): ThemeContext exposes org-controlled theme only"
```

---

## Task 12: Frontend — reduced-motion CSS + remove dead controls confirmation

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Add a global reduced-motion rule**

Append to `frontend/src/index.css`:

```css
/* Respect each user's OS-level reduced-motion preference (replaces the old toggle). */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 2: Verify no leftover references to removed controls**

Run: `grep -n "Reduce motion\|Sidebar collapsed\|Show AI sidebar\|Accent color\b" frontend/src/pages/workspace/WorkspaceSettings.tsx`
Expected: no matches inside `AppearanceSection` (the only `Accent color` is now in `BrandingSection`). Fix if any remain.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(settings): respect prefers-reduced-motion globally"
```

---

## Task 13: Update e2e settings spec to the new design

The existing spec asserts `--heroui-radius-small` and `--brand-primary`; update to the new glass-shell behavior and the new copy ("Save Settings" already matches; heading is now "Settings").

**Files:**
- Modify: `frontend/e2e/settings-page.spec.ts`

- [ ] **Step 1: Update the spec**

Replace the file contents of `frontend/e2e/settings-page.spec.ts` with:

```ts
import { expect, test } from "@playwright/test";

test.describe("Settings page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 15_000 });
  });

  test("saves branding and applies accent + name in the shell", async ({ page }) => {
    const suffix = Date.now().toString().slice(-6);
    const brandName = `E2E Brand ${suffix}`;
    const brandColor = "#0c8a4a";

    await page.getByPlaceholder("TelaiOS").fill(brandName);
    await page.getByPlaceholder("#0a84ff").fill(brandColor);
    await page.getByRole("button", { name: "Save Settings" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible({ timeout: 10_000 });

    await page.goto("/");
    await expect(page.getByText(brandName).first()).toBeVisible({ timeout: 10_000 });
    expect(await page.title()).toBe(brandName);

    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--accent-1").trim(),
    );
    expect(accent.toLowerCase()).toBe(brandColor);
  });

  test("applies a preset palette to glass-shell vars", async ({ page }) => {
    await page.getByText("Appearance").click();
    await page.getByRole("button", { name: "Corporate" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible({ timeout: 10_000 });

    await page.goto("/");
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--bg").trim().toLowerCase(),
    );
    expect(bg).toBe("#ffffff");
  });

  test("changes density attribute", async ({ page }) => {
    await page.getByText("Appearance").click();
    await page.getByRole("button", { name: "compact", exact: true }).click();
    await expect(page.getByText("Settings saved")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("[data-density='compact']").first()).toBeVisible();
  });

  test("accepts logo upload and shows it after save", async ({ page }) => {
    const logoDataUrl =
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc5NicgaGVpZ2h0PSczMicgdmlld0JveD0nMCAwIDk2IDMyJz48cmVjdCB3aWR0aD0nOTYnIGhlaWdodD0nMzInIHJ4PSc4JyBmaWxsPScjMEQ5N0Y2Jy8+PC9zdmc+";
    const fileInput = page.locator("input[type='file']").first();
    await fileInput.setInputFiles({
      name: "e2e-logo.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(logoDataUrl.split(",")[1], "base64"),
    });
    await expect(page.getByAltText("Preview")).toBeVisible();
    await page.getByRole("button", { name: "Save Settings" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible({ timeout: 10_000 });

    await page.goto("/");
    await expect(page.getByAltText(/logo$/i)).toBeVisible({ timeout: 10_000 });
  });
});
```

- [ ] **Step 2: (Optional, full-stack env) run e2e**

Run (requires backend + seeded data per `global-setup`): `npm run test:e2e -- settings-page`
Expected: PASS. If the full stack is unavailable in this environment, note it and rely on unit + backend tests; the spec is committed for CI.

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/settings-page.spec.ts
git commit -m "test(settings): align e2e spec with glass-shell theming + new copy"
```

---

## Task 14: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Backend gates**

Run (from `server/`): `uv run ruff format . && uv run ruff check . && uv run mypy src/telaios && uv run pytest tests/unit/modules/settings tests/integration/modules/test_settings.py -v`
Expected: all PASS (integration may require dev DB — note if skipped).

- [ ] **Step 2: Frontend gates**

Run (from `frontend/`): `npm run test:run && npm run build`
Expected: vitest all PASS; `tsc && vite build` succeeds with no type errors.

- [ ] **Step 3: Manual smoke (if app runnable)**

Start backend + `npm run dev`, sign in as admin, open `/settings`: change accent → UI recolors; pick "Corporate" → light palette; change density/glass → layout updates; upload a logo → appears in sidebar; reload → persists. Sign in as a member → controls disabled, notice shown, branding still applied.

- [ ] **Step 4: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "chore(settings): final cleanup for sub-project A" || echo "nothing to commit"
```

---

## Self-Review Notes (author)

- **Task map (1–14):** T1 backend schema validation · T2 backend model+migration · T3 vitest setup · T4 client types+demo mocks · T5 theming bridge (glass-shell) · T6 image util · T7 AppSettingsProvider · T8 mount provider · T9 Branding+Appearance rewrite · T10 chrome wordmark/logo + remove per-user toggle · T11 simplify ThemeContext · T12 reduced-motion CSS · T13 e2e · T14 final verification.
- **Spec coverage:** data model (T1–T2); AppSettingsProvider fetch/apply/cache/optimistic-revert (T7) + mount (T8); bridge onto glass-shell vars incl. presets re-pointed + contrast helper (T5); Branding incl. logo/favicon/accent (T9); Appearance theme/preset/density/glass (T9); admin read-only via `isAdmin` (T9); wordmark/logo + org-only theme (T10–T11); reduced-motion + dead-control removal (T12); tests backend+unit+e2e (T1/T2/T5/T6/T7/T13/T14).
- **Intentional deferral:** the **granular per-property custom-theme editor** (spec §8) is deferred to a fast-follow. The `custom_theme` data path, validation, and bridge application are fully built and tested (presets exercise them end-to-end), so the editor is purely additive UI later. This keeps sub-project A a focused, fully-tested vertical slice. Flagged to the user.
- **Always-compiling order:** every task leaves the tree type-clean under `noUnusedLocals` — ThemeContext is simplified (T11) only after its `setTheme` callers are removed (T9 WorkspaceSettings, T10 chrome); Branding+Appearance are rewritten together (T9) to avoid a half-migrated import set.
- **Placeholder scan:** no TBD/TODO; every code step has complete code; every command lists expected output.
- **Type consistency:** `Density`, `ThemePreset`, `AppSettings.density/glass_blur`, `THEME_PRESETS` (ShellTheme shape), `useAppSettings()`, `save()/refresh()`, `applyAppSettingsToDocument`, `deriveSecondaryAccent`, `contrastRatio`, `validateImageDataUrl`, `fileToDataUrl` are named consistently across tasks.
