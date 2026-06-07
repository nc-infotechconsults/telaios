# HeroUI v3 Migration — Slice 1: Foundation + Login Smoke Test

**Date:** 2026-06-07
**Status:** Draft — approved verbally, pending spec review
**Scope:** First of 7 slices in the program "Move frontend to HeroUI v3, delete glass CSS."

---

## 0. Program context (one-time read)

**Goal of the whole program:** replace the custom glassmorphism design system (1,180 lines of CSS, 150+ classes, 42 consuming `.tsx` files) with **HeroUI v3 (3.x stable)** across the entire frontend. End state: no glass CSS, no `MeshBackground`, no per-component design system; everything is HeroUI primitives + Tailwind v4 + HeroUI's themed tokens.

**Roadmap (7 slices, each its own spec):**

| # | Slice | Scope |
|---|-------|-------|
| **1** | **Foundation (this spec)** | Install HeroUI v3, upgrade React → 19, add the v3 theme bridge, rewrite `Login.tsx` as smoke test. Other pages untouched. |
| 2 | Shell | `ProjectLayout` + `AiSidebar` + `CommandPalette` |
| 3 | Settings reconciliation | Rework Sub-project A (Branding/Appearance); drop `glass_blur`/`density`/`theme_preset`/`custom_theme`; re-plan B–G outside this program. |
| 4 | Project pages | `ProjectDetail` + `Project*` sub-pages |
| 5 | Workspace pages | `Workspace*` |
| 6 | Operator + specialty | `operator/*`, `DocumentExplorer`, `DocumentViewer`, `ExecutionDashboard`, `EnvironmentDetail`, `DockerShellPage`, `LibraryAgentDetail`, `DesignChat`, `PlanningChat` |
| 7 | Cleanup | Delete remaining glass CSS, dead components (`MeshBackground`, custom `Modal`/`Select`), legacy class-name bridges. |

This spec is **only Slice 1**. Slices 2–7 each get their own spec when their turn comes.

## 1. Context & problem

Today:
- `frontend/src/index.css` is 1,180 lines of glass design system (`.glass`, `.card`, `.sb-*`, `.ai-*`, `.cmd-*`, `.set-*`, ~150+ classes).
- Only `@heroui/toast` is installed (transitively pulls `@heroui/system`, `@heroui/theme`, etc.). Full `@heroui/react` is absent.
- `tailwind.config.cjs` exposes HeroUI-v2-style tokens (`primary`, `default`, `content1-3`, `divider`, `success`, `warning`, `danger`) pointing at glass CSS vars. **77 `.tsx` files** consume these via Tailwind utilities (`bg-primary`, `text-default-foreground`, `border-divider`, …).
- React is **18.3.1**. HeroUI v3 requires **React 19+**.
- `applyAppSettingsToDocument` ([appSettings.ts:285](../../../frontend/src/lib/appSettings.ts#L285)) emits a v2-style `--heroui-primary-{50..900}` scale from `brand_color`. Dead code — nothing consumes it.
- `data-theme="light|dark"` is already set on `<html>` by the bridge. HeroUI v3 reads this attribute natively.

Why this is well-positioned for incremental adoption:
- HeroUI v3 does **not** require a provider component.
- HeroUI v3 uses Tailwind v4 (already in use here).
- HeroUI v3 reads `[data-theme="dark"]` directly (no Tailwind config change needed).
- HeroUI v3's primary color is `--accent` (single CSS var, not a scale).

## 2. Goals / non-goals

**Goals (Slice 1):**
1. `@heroui/react` + `@heroui/styles` installed at v3 (latest stable).
2. React + React DOM + types bumped to 19.
3. Tailwind v4 + HeroUI v3 styles wired in `index.css`; `@config "../tailwind.config.cjs"` removed; `tailwind.config.cjs` deleted.
4. Glass CSS file kept intact below the HeroUI imports — every unmigrated page still renders exactly as today.
5. `brand_color` (from settings) drives HeroUI's `--accent` and `--accent-foreground` in both light and dark mode.
6. Toast: `@heroui/toast` package replaced by `@heroui/react`'s built-in Toast; `lib/toast.ts` migrated to the v3 `toast()` API; `main.tsx` uses `<Toast.Provider />`.
7. **`pages/Login.tsx` rewritten end-to-end** using HeroUI primitives (`Card`, `Input`, `Button`, optional `Form`). No inline styles, no `MeshBackground`, no glass vars. Brand-color-driven accent visible on the submit button.
8. `tsc`, `vitest`, and Playwright e2e all pass. Login flow works in dev. No visual regression on unmigrated pages.

**Non-goals (deferred):**
- Migrating any non-Login page (slices 2–6).
- Removing or restructuring the glass CSS in `index.css` (slice 7).
- Reworking the settings UI or removing `glass_blur` / `density` / `theme_preset` / `custom_theme` from the AppSettings data model (slice 3 — DB migration there).
- Replacing the org `brand_color → glass vars` bridge (`--accent-1/2/grad`); other pages still need it.
- Component-level theming polish for migrated Login (e.g., custom Card shadow). HeroUI defaults are acceptable for Slice 1.
- Internationalization / `I18nProvider` (English-only today; revisit if needed during shell slice).

## 3. Approach

A single small PR with these steps:

1. **Upgrade React.** `react@19`, `react-dom@19`, `@types/react@19`, `@types/react-dom@19`. Verify peer deps for: `react-router-dom@^6.26`, `framer-motion@^11`, `@xyflow/react@^12`, `@monaco-editor/react@^4.7`, `@testing-library/react@^16`, `react-markdown@^10`. (All these versions advertise React 19 support.) Run `npm install`, then `tsc` and the vitest suite to catch regressions early.

2. **Install HeroUI v3.** `npm i @heroui/react@latest @heroui/styles@latest`. Then `npm uninstall @heroui/toast` — it's re-exported from `@heroui/react` in v3.

3. **Delete `tailwind.config.cjs`.** Tailwind v4 owns config via `@theme` directives in CSS; the cjs config exists only for legacy v3-style tokens that point at glass vars (most of which don't even exist anymore — see [tailwind.config.cjs](../../../frontend/tailwind.config.cjs) referencing `--fill-primary`, `--bg-secondary`, `--bg-tertiary` which are not defined). HeroUI's `@import "@heroui/styles"` provides the replacements.

4. **Edit `index.css`:**

   ```css
   @import "tailwindcss";
   @import "@heroui/styles";   /* NEW — must come after tailwindcss */

   /* Mirror Tailwind's `dark:` variant onto our existing data-theme attribute */
   @custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

   /* Legacy class-name bridge — slices 2-6 stop emitting these classes;
      slice 7 deletes this block once nothing references them.

      Includes a synthetic scale because unmigrated files use scaled tokens
      (e.g. text-default-400, bg-default-50, bg-default-100/20). HeroUI v3
      has no scale on --default; we approximate with color-mix to preserve
      visible behavior without per-page churn. */
   @theme inline {
     --color-primary: var(--accent);
     --color-primary-foreground: var(--accent-foreground);
     --color-content1: var(--surface);
     --color-content2: var(--surface-secondary);
     --color-content3: var(--surface-tertiary);
     --color-divider: var(--separator);
     --color-default-50:  color-mix(in oklab, var(--default) 35%, var(--background));
     --color-default-100: color-mix(in oklab, var(--default) 55%, var(--background));
     --color-default-200: color-mix(in oklab, var(--default) 75%, var(--background));
     --color-default-300: color-mix(in oklab, var(--default) 92%, var(--background));
     --color-default-400: color-mix(in oklab, var(--default-foreground) 35%, var(--default));
     --color-default-500: color-mix(in oklab, var(--default-foreground) 50%, var(--default));
     --color-default-600: color-mix(in oklab, var(--default-foreground) 62%, var(--default));
     --color-default-700: color-mix(in oklab, var(--default-foreground) 75%, var(--default));
     --color-default-800: color-mix(in oklab, var(--default-foreground) 88%, var(--default));
     --color-default-900: var(--default-foreground);
   }

   /* Geist font + reduced-motion + the entire glass design system stay as-is below */
   @import url('https://fonts.googleapis.com/css2?family=Geist...');
   :root { --accent-1: …; --glass: …; …  }   /* unchanged */
   ```

   Remove the `@config "../tailwind.config.cjs";` line.

5. **Edit `lib/appSettings.ts` (minimal, surgical):**
   - **Keep** every line that writes glass-related vars (`--accent-1`, `--accent-2`, `--accent-grad`, `--bg`, `--fg*`, `--glass*`, `--hairline`, `--blur`, `--radius-*`, `--shadow-*`, `data-density`, `data-theme`, `document.title`, favicon). Unmigrated pages still depend on all of these.
   - **Delete** the `--heroui-primary-*` emission block (lines ~297–301). It's v2-style and unused.
   - **Add** v3 emission: `--accent` and `--accent-foreground`, both on `documentElement` (single emission — same brand color and contrast-foreground apply in both light and dark mode). HeroUI v3 tokens use oklch, but CSS `var(--accent)` consumers accept any color value; we emit the raw hex (e.g. `s.setProperty("--accent", brandColor)`) and let HeroUI's `color-mix` calculated colors handle blending. `--accent-foreground` is `#fff` or `#000` per `pickForegroundChannels`. No oklch conversion needed in JS.

6. **Edit `main.tsx`:**
   - Replace `import { ToastProvider } from "@heroui/toast";` with `import { Toast } from "@heroui/react";`.
   - Replace `<ToastProvider placement="bottom-right" maxVisibleToasts={5} disableAnimation={true} />` with `<Toast.Provider placement="bottom-right" />`. Other v2 props (`maxVisibleToasts`, `disableAnimation`) are not part of the v3 `Toast.Provider` API per the v3 migration guide; drop them. If we later want a visible-count cap, it lives on individual `toast()` calls or via custom rendering — not blocking for Slice 1.
   - No `HeroUIProvider`. v3 doesn't need one.

7. **Edit `lib/toast.ts`:**
   - Replace `import { addToast } from "@heroui/toast";` with `import { toast } from "@heroui/react";`.
   - Rewrite the four helpers using v3's `toast.success(title, { description })`, `toast.danger(...)`, `toast.warning(...)`, `toast.info(...)`. Keep the `toast` object's surface identical so 36 callers don't change.

8. **Rewrite `pages/Login.tsx`:**

   ```tsx
   import { Card, Input, Button, Form } from "@heroui/react";
   import { TelaiOSLogo } from "../components/common/TelaiOSLogo";
   // …
   return (
     <main className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
       <Card className="w-full max-w-sm">
         <Card.Body className="p-8">
           <div className="flex items-center justify-center gap-2.5 mb-7">
             <TelaiOSLogo size={36} />
             <span className="text-[22px] font-bold tracking-tight">TelaiOS</span>
           </div>
           <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
             <Input
               type="email"
               label="Email"
               autoComplete="email"
               value={email}
               onChange={(e) => setEmail(e.target.value)}
               isRequired
             />
             <Input
               type="password"
               label="Password"
               autoComplete="current-password"
               value={password}
               onChange={(e) => setPassword(e.target.value)}
               isRequired
               errorMessage={error || undefined}
               isInvalid={!!error}
             />
             <Button type="submit" color="accent" isLoading={loading} className="w-full">
               Sign in
             </Button>
           </Form>
         </Card.Body>
       </Card>
     </main>
   );
   ```

   - Drop the `<MeshBackground>` import and JSX usage. (The `MeshBackground.tsx` file stays on disk — slice 7 deletes it.)
   - Drop the inline styles, gradient button CSS, and `apple-input` class.
   - `bg-background` and `text-foreground` resolve to HeroUI v3 tokens — same vars whether or not `data-theme` is set.
   - Wordmark stays as plain text for Slice 1; brand-name-from-settings comes in Slice 3.

## 4. Data model / DB

**Unchanged.** No migration in this slice. `density`, `glass_blur`, `theme_preset`, `custom_theme` columns stay; their values continue to drive glass vars. Slice 3 deals with them.

## 5. Files touched (exhaustive)

| File | Change |
|------|--------|
| `frontend/package.json` | +`@heroui/react`, +`@heroui/styles`, −`@heroui/toast`, react/react-dom + types → 19 |
| `frontend/package-lock.json` | regenerated |
| `frontend/tailwind.config.cjs` | **deleted** |
| `frontend/src/index.css` | drop `@config`, add `@import "@heroui/styles"`, add `@custom-variant dark`, add legacy class-name `@theme inline` bridge |
| `frontend/src/main.tsx` | swap toast provider to `Toast.Provider`, import from `@heroui/react` |
| `frontend/src/lib/toast.ts` | switch to v3 `toast()` API, same exported shape |
| `frontend/src/lib/appSettings.ts` | replace `--heroui-primary-*` block with `--accent` / `--accent-foreground` |
| `frontend/src/pages/Login.tsx` | full rewrite using HeroUI primitives |

**Total:** 6 source files modified, 1 deleted, 1 new dep installation. No DB migration. No backend change.

## 6. Verification

**Pre-merge checklist:**
- [ ] `cd frontend && npm install` exits 0
- [ ] `cd frontend && npx tsc --noEmit` exits 0
- [ ] `cd frontend && npm run test:run` exits 0 (vitest — `lib/appSettings.test.ts` may need an assertion update for the new `--accent` emission, plus toast-related tests if any)
- [ ] `cd frontend && npm run test:e2e` exits 0 (Playwright — login flow already covered)
- [ ] `npm run dev` starts; navigate to `/login`, observe HeroUI Card + Inputs + Button rendering. The Sign-in button color must equal the `brand_color` from cached/default settings (e.g., the default `#0a84ff` Apple blue).
- [ ] Manually flip `<html data-theme="dark">` in devtools; Login Card adopts dark surface; button stays brand-colored.
- [ ] Navigate to `/` (workspace overview). The shell should look **identical** to today (glass sidebar, glass topbar, etc.) — proving the legacy bridge works.
- [ ] Trigger an admin save in `/settings` Branding (change brand color). Login button color updates after re-navigation.

**Smoke for Tailwind class breakage** (the 77-file risk):
- `git grep -nE '\bclass(Name)?="[^"]*\b(bg-primary|bg-default|bg-content[123]|text-default-foreground|border-divider)\b' frontend/src` produces matches; spot-check 3–5 rendered pages and confirm those classes still resolve (now to HeroUI v3 tokens via the legacy bridge).

## 7. Risk + rollback

**Risks:**
- *React 19 incompatibility in a transitive dep.* Mitigation: run tests + dev server early in implementation; if blocking, downgrade just that dep or pin a React-19-supporting version. Worst case, snip Slice 1 down to "React 19 upgrade only" and defer HeroUI v3 install to a follow-up.
- *Tailwind v4 + HeroUI styles compile error.* Mitigation: HeroUI v3's `@import "@heroui/styles"` is officially supported with Tailwind v4 per `/docs/react/getting-started/quick-start`. If it fails, the error will be at build-time, easy to diagnose.
- *Legacy class-name bridge has a mismatch* (e.g., `bg-primary-50` won't resolve — only `bg-primary` will, since v3 `--accent` isn't a scale). Mitigation: grep for `-{50..900}` suffix usage during implementation; convert those handful of call sites to `bg-accent-soft` or a direct Tailwind color if any exist.
- *Toast variant mismatch.* `lib/toast.ts` currently maps `info → "primary"` severity (a v2-`@heroui/toast` value). In v3 `toast.info(...)` exists as a helper that uses the `accent` variant. Mitigation: write a tiny adapter; the public shape (`toast.success/error/info/warning`) is preserved.

**Rollback plan:** Single PR; revert PR. Glass CSS, `@heroui/toast`, React 18, Tailwind cjs config are all restored by the revert. No DB or backend state to unwind.

## 8. Follow-ups (out of scope for this slice)

- **Slice 2 (Shell):** write its own spec; consumes the bridge we set up here.
- **Slice 3 (Settings):** rewrites Appearance pane around HeroUI's light/dark instead of presets; DB migration drops `glass_blur` and likely `density` + `theme_preset` + `custom_theme`. (The `--heroui-primary-*` v2 bridge is fully gone after Slice 1; no remnants.)
- **Slice 7 (Cleanup):** deletes the `@theme inline` legacy bridge block from `index.css`, deletes the glass CSS blocks, deletes `MeshBackground.tsx`, custom `Modal.tsx`, custom `Select.tsx`.
