# HeroUI v3 Migration — Slice 2: Shell + Command Palette

**Date:** 2026-06-07
**Status:** Draft — approved verbally via /goal, pending spec review
**Scope:** Second of 7 slices in the program "Move frontend to HeroUI v3, delete glass CSS."

---

## 0. Program context

Continues the work from **Slice 1** (`2026-06-07-heroui-v3-migration-slice-1-foundation-design.md`), which landed HeroUI v3.1.0 + the theme bridge + the Login smoke test. The legacy `@theme inline` token bridge in `index.css` keeps all unmigrated pages working; this slice does not change the bridge.

After Slice 2, three remaining shell concerns are deferred to their own follow-ups:
- AI sidebar **internals** (TEOS chat thread, session drawer, specialist menu) — Slice 2.5 (separate spec).
- Settings reconciliation, page-by-page migration, cleanup — Slices 3-7.

## 1. Context & problem

The shell is rendered on **every authenticated route**:

| File | Lines | Role |
|------|-------|------|
| [ProjectLayout.tsx](../../../frontend/src/components/ProjectLayout.tsx) | 858 | Grid orchestrator + sidebar markup + topbar markup + workspace/project view switch + workspace switcher + bottom nav + view rendering + TEOS state |
| [AiSidebar.tsx](../../../frontend/src/components/AiSidebar.tsx) | 536 | Right-column TEOS chat sidebar (chat thread, session drawer, specialist menu) |
| [CommandPalette.tsx](../../../frontend/src/components/CommandPalette.tsx) | 194 | ⌘K palette (inline-styled overlay + glass-panel + keyboard nav) |
| [MeshBackground.tsx](../../../frontend/src/components/MeshBackground.tsx) | small | Fixed background blobs |

Today these use the custom glass design system: `.app` / `.sidebar` / `.topbar` / `.main` / `.ai-side` grid classes, `.sb-row` / `.tb-btn` / `.crumb` / `.cmd-overlay` styling classes, the entire glass CSS-var palette, and `<MeshBackground />`. None of them use HeroUI primitives.

ProjectLayout has grown too large for confident editing — it conflates **grid layout**, **sidebar contents**, **topbar contents**, **TEOS state & SSE wiring**, **workspace-view routing**, and **project-view routing**. The migration is a good time to extract focused sub-components with clear interfaces.

## 2. Goals / non-goals

**Goals (Slice 2):**
1. Replace the custom grid (`<div className="app">` + `<aside className="sidebar glass">` + `<header className="topbar glass">` + `<main className="main glass">`) with Tailwind utility-class grid + HeroUI primitives. Same overall layout (`sidebar | main | ai-side`), responsive collapse behavior preserved.
2. Decompose `ProjectLayout.tsx` into focused files: `AppShell.tsx`, `shell/Sidebar.tsx`, `shell/SidebarNav.tsx`, `shell/Topbar.tsx`, `shell/WorkspaceSwitcher.tsx`. `ProjectLayout.tsx` is **deleted**; `main.tsx` imports `AppShell` directly. Each new file ≤ 200 lines.
3. Rewrite `CommandPalette.tsx` using HeroUI `Modal` + a search-driven `ListBox` (or `Autocomplete`). Keyboard nav still works (⌘K to open, ↑/↓/Enter/Esc).
4. Remove `<MeshBackground />` from the shell render path (component file stays on disk; deleted in Slice 7).
5. AI sidebar mount: the existing `<AiSidebar />` import keeps rendering inside the new shell at the right edge of the grid. Its **internals are not migrated in this slice** — its outer container (a single `<aside className="ai-side glass">` wrapper) gets converted to a Tailwind/HeroUI surface so it fits the new grid, but the chat thread / sessions / specialists internals are still glass. Slice 2.5 migrates those.
6. Brand name + logo from settings (already wired) continue to render in the sidebar.
7. Active route highlighting in the sidebar uses `react-router-dom`'s `useLocation`/`<NavLink>` semantics where appropriate (current code uses raw `window.location.href` — preserve behavior, optionally improve to client-side `navigate()`).
8. tsc + vitest + production build all pass. No regression on any view.

**Non-goals (deferred):**
- AI sidebar internals (chat/sessions/specialists) — separate Slice 2.5 spec.
- Migrating any project-view or workspace-view component (slices 4-6).
- Removing or restructuring the glass CSS in `index.css` (slice 7).
- Removing dead `.sb-*` / `.tb-*` / `.cmd-*` / `.app` / `.main` / `.sidebar` / `.topbar` blocks from index.css (slice 7).
- Adding `MeshBackground` back in any form. Stock HeroUI background is the new look.
- Replacing the `Icon.tsx` SVG component (it works fine; HeroUI doesn't have a built-in icon system and we already use FontAwesome via `<i className="fa-solid">` in some places).

## 3. Approach

### 3.1 New file layout

```
frontend/src/components/
  shell/
    AppShell.tsx          # top-level grid + view dispatch (~120 lines)
    Sidebar.tsx           # left sidebar layout shell (~80 lines)
    SidebarNav.tsx        # HeroUI Listbox of nav items (~80 lines)
    Topbar.tsx            # breadcrumb + search + actions + avatar (~140 lines)
    WorkspaceSwitcher.tsx # HeroUI Dropdown of workspaces (~60 lines)
    CommandPalette.tsx    # HeroUI Modal + search ListBox (~120 lines)
  AiSidebar.tsx           # outer container migrated; internals unchanged
  ProjectLayout.tsx       # deleted — main.tsx imports AppShell directly
  CommandPalette.tsx      # deleted — main.tsx / AppShell uses shell/CommandPalette
  MeshBackground.tsx      # untouched — slice 7 deletes
```

### 3.2 Grid layout

Today's grid is `grid-template-columns: 240px 1fr auto` with rows `56px 1fr` and a 10px gap. In Tailwind v4 utility classes:

```tsx
<div className="grid grid-cols-[240px_1fr_auto] grid-rows-[56px_1fr] gap-2.5 h-screen p-2.5 bg-background text-foreground">
  <Sidebar className="row-span-2 ..." />
  <Topbar className="col-start-2" />
  <main className="col-start-2 overflow-auto rounded-2xl bg-surface ...">
    {renderView()}
  </main>
  <AiSidebar className="row-span-2 col-start-3" collapsed={aiCollapsed} onToggle={...} />
</div>
```

Responsive breakpoints (1280px, 1100px, 900px) preserved via Tailwind responsive utilities (`xl:grid-cols-[220px_1fr_auto]`, `lg:grid-cols-[200px_1fr_auto]`, `max-md:grid-cols-[64px_1fr_auto]`). The breakpoint values in `index.css` (1280/1100/900) don't perfectly match Tailwind's defaults — keep the closest equivalents and accept minor layout drift, or define custom screens in `index.css` via `@theme inline { --breakpoint-xl: 1280px; --breakpoint-lg: 1100px; ... }`. Decision: **use Tailwind defaults**; layout drift on those exact widths is acceptable.

### 3.3 Sidebar

`shell/Sidebar.tsx` renders:
- Brand header: logo (if `appSettings.logo_url`) or `<TelaiOSLogo size={20} />` + brand wordmark + version tag — flex row, HeroUI doesn't have a brand component; just styled div with `text-foreground` etc.
- `<SidebarNav>` for the main nav (workspace nav if `wsView`, project nav otherwise) — uses HeroUI `ListBox` with `selectedKeys` driven by the active view/route. Item renders `<Icon>` + label + optional badge `<Chip>`.
- Admin section (workspace mode) — second `<SidebarNav>` instance.
- Projects list (project mode) — third `<SidebarNav>` for child projects, with colored dot indicator.
- Workspace switcher pinned at the bottom (`mt-auto`) — `<WorkspaceSwitcher>`.

### 3.4 SidebarNav

Thin wrapper around HeroUI `ListBox`:

```tsx
import { ListBox } from "@heroui/react";

interface SidebarNavProps<K extends string> {
  items: { key: K; label: string; icon: string; badge?: string | null; href?: string }[];
  selectedKey?: K;
  onSelect: (key: K) => void;
  className?: string;
}
```

HeroUI ListBox uses `selectedKeys` (set) and `onSelectionChange`. The `<ListBox.Item>` renders an icon + label. Keyboard nav is built in.

### 3.5 Topbar

`shell/Topbar.tsx` is a flex row:
- Breadcrumb (project name + view label + optional chip) — plain styled divs + HeroUI `<Chip>`.
- Spacer.
- Search trigger: HeroUI `<Button variant="tertiary">` that opens the CommandPalette (⌘K shortcut). Shows a `<Kbd>` "⌘K" badge.
- Icon buttons (notifications, theme, etc.): HeroUI `<Button isIconOnly variant="tertiary">`.
- User menu: HeroUI `<Dropdown>` with `<Avatar>` trigger; menu items for "Profile", "Sign out" etc.

### 3.6 WorkspaceSwitcher

HeroUI `<Dropdown>` with trigger = current workspace avatar+name button; menu items list workspaces; `onAction` navigates. Replaces today's static workspace switcher with proper popover.

For Slice 2, list is `[{ id: user.organization_id, name: user.organization_name }]` — single workspace. Multi-workspace support is a separate feature, out of scope.

### 3.7 CommandPalette

`shell/CommandPalette.tsx` uses HeroUI `<Modal>` (opened by ⌘K) containing a `<SearchField>` + a filtered `<ListBox>` of commands. Pressing Enter on a selected item triggers `onNavigate(view)` and closes the modal. Esc closes. ⌘K from anywhere toggles open.

Today's `COMMANDS` array (in `CommandPalette.tsx`) is retained verbatim. The `kbd ESC` footer hints become HeroUI `<Kbd>` components.

### 3.8 AiSidebar outer container

`AiSidebar.tsx` currently wraps everything in `<aside className="ai-side glass" ...>`. Change just that outer wrapper:

```tsx
// before
<aside className="ai-side glass" style={{ display: aiCollapsed ? "none" : "flex" }}>

// after
<aside
  className={`row-span-2 col-start-3 flex flex-col overflow-hidden rounded-2xl bg-surface shadow-surface transition-[width] duration-300 ${
    collapsed ? "w-0 opacity-0 pointer-events-none" : "w-[380px]"
  }`}
>
```

Everything inside (`.ai-head`, `.ai-thread`, `.ai-msg`, `.ai-input-wrap`, sessions drawer, vis menu, etc.) stays exactly as today — glass-styled. Slice 2.5 migrates the internals.

This means the AI sidebar visually goes from a glass panel to a HeroUI Surface panel, but its inner content remains glass. Cosmetic mismatch is acceptable for this slice; it's a temporary state.

### 3.9 Routing improvement

Today's sidebar uses `window.location.href = "/projects/..."` for navigation, which is a full page reload. Switch to react-router's `useNavigate()` for client-side routing. This is a small cleanup that comes naturally with the refactor.

Caveat: some current behaviors rely on full page reload to reset client state. Audit during implementation; if a navigation breaks because of stale state, revert that one call to `window.location.href`. Document any retained reload-on-nav cases inline.

### 3.10 Background

The `<MeshBackground />` import and JSX usage in ProjectLayout disappears. The grid root uses `bg-background` (HeroUI v3 token) which is a flat surface — same approach as the new Login. No mesh, no blobs.

## 4. Data model / DB

**Unchanged.** No backend or schema changes in this slice.

## 5. Files touched

| Path | Action | LOC delta (approx) |
|------|--------|--------------------|
| `frontend/src/components/shell/AppShell.tsx` | create | +120 |
| `frontend/src/components/shell/Sidebar.tsx` | create | +80 |
| `frontend/src/components/shell/SidebarNav.tsx` | create | +80 |
| `frontend/src/components/shell/Topbar.tsx` | create | +140 |
| `frontend/src/components/shell/WorkspaceSwitcher.tsx` | create | +60 |
| `frontend/src/components/shell/CommandPalette.tsx` | create | +120 |
| `frontend/src/components/AiSidebar.tsx` | modify (outer wrapper only) | ~-20 / +20 |
| `frontend/src/components/ProjectLayout.tsx` | delete | -858 |
| `frontend/src/components/CommandPalette.tsx` | delete | -194 |
| `frontend/src/main.tsx` | update route imports `ProjectLayout` → `AppShell` | ~5 lines touched |
| `frontend/e2e/*.spec.ts` | grep for `.sb-row`/`.tb-btn`/`.glass`/`.crumb` selectors; replace with `[role="..."]` / `[aria-label="..."]` / HeroUI BEM (`.button`, `.list-box-item`) — exact files determined during implementation by grep | varies |

**Total:** +600 new lines, -1100 deleted lines = net ~500 lines removed. ProjectLayout's many concerns become 6 focused files averaging ~100 lines each.

## 6. Verification

**Quality gate:**
- `cd frontend && ./node_modules/.bin/tsc --noEmit` exits 0
- `cd frontend && npm run test:run` exits 0 (the 18 existing tests; possibly add 1-2 for SidebarNav selection state if straightforward)
- `cd frontend && ./node_modules/.bin/vite build` exits 0
- `cd frontend && npm run test:e2e` exits 0 (existing e2e specs may need selector updates if they hit `.sidebar` / `.topbar` glass classes)

**Manual smoke checklist (dev server + browser):**
- [ ] `/` workspace overview renders. New HeroUI sidebar shows Workspace nav (Overview, Projects, Library, Analytics, Agents) + Admin section. Active item highlighted (HeroUI ListBox selection). Sidebar bottom has Workspace Switcher.
- [ ] Click a sidebar item: navigates client-side, active highlight updates without page reload.
- [ ] `/projects/<id>` renders with project nav (Dashboard, Conversation, Repositories, Documents, Designs, Agents, Library, Plans) + bottom nav (Inbox, Members, Settings) + projects list.
- [ ] Topbar shows breadcrumb (project name → view label), search button "⌘K", icon buttons (notifications), Avatar dropdown (user menu: Profile, Sign out).
- [ ] ⌘K opens the CommandPalette modal. Type to filter. ↑/↓ moves selection. Enter navigates. Esc closes.
- [ ] AI sidebar appears on the right (380px). Toggle to collapse (width → 0, smooth). Its internals (chat thread, sessions drawer) still look glass-styled — that's expected.
- [ ] On the conversation view, the AI sidebar auto-collapses (preserved behavior).
- [ ] No `<MeshBackground>` blobs anywhere.
- [ ] Dark mode (`<html data-theme="dark">`): shell adopts HeroUI dark tokens; AI sidebar internals stay glass-dark.
- [ ] Brand name from settings shows in sidebar; logo if uploaded.

**Visual regression risk:** the AI sidebar's glass interior next to the new HeroUI exterior is visually inconsistent for the duration of Slice 2 → Slice 2.5. Acceptable.

## 7. Risk + rollback

**Risks:**
- *Breaking client-side routing.* Be cautious: change one navigation at a time and verify the route updates without state loss. If a behavior depends on full reload, retain `window.location.href` for that one nav and document why inline.
- *Tailwind responsive classes drift at 1280/1100/900px.* Mitigation: accept small drift to `xl:` (1280) and `lg:` (1024) breakpoints, or define `--breakpoint-*` overrides in `index.css` `@theme inline`. Default: accept drift.
- *HeroUI ListBox selection state vs `view` React state out of sync.* The component is controlled; pass `selectedKeys={new Set([view])}` and update on `onSelectionChange`. Test by clicking nav items repeatedly.
- *⌘K shortcut conflict with browser/OS or with an input that's focused.* Implement listener with `event.metaKey && event.key === 'k'` + check for non-input focus. Same as current behavior.
- *E2E specs targeting glass classes.* Audit `frontend/e2e/*.spec.ts` for `[class*="sb-row"]` / `[class*="tb-btn"]` / `.glass` selectors and update to either HeroUI BEM (`.button`, `.list-box-item`) or `role`/`aria-label` based locators.

**Rollback:** single revert of the slice's commits restores ProjectLayout/CommandPalette. AiSidebar revert restores its glass outer wrapper.

## 8. Follow-ups (out of scope for this slice)

- **Slice 2.5 — AI sidebar internals:** migrate chat thread, session drawer, specialist menu, vis menu to HeroUI primitives. Roughly 300-400 lines of internal glass markup to convert.
- **Slice 3 — Settings reconciliation.**
- **Slice 7 — Cleanup:** delete the unused glass blocks (`.app`, `.sidebar`, `.topbar`, `.main`, `.sb-*`, `.tb-*`, `.cmd-*`) from `index.css`. Delete `MeshBackground.tsx`.
