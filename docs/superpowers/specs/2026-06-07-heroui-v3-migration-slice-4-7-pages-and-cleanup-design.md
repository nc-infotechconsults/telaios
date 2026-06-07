# HeroUI v3 Migration — Slices 4-7: Page Sweep + Cleanup (Consolidated)

**Date:** 2026-06-07
**Status:** Draft — approved verbally via /goal, pending spec review
**Scope:** Final four slices consolidated, given the established migration pattern from Slices 1-3 + 2.5. Covers project pages, workspace pages, operator pages, specialty pages, and the final cleanup of glass CSS / MeshBackground / legacy bridge.

---

## 0. Program context

Slices 1, 2, 2.5, 3 (HeroUI v3 + theme bridge + login + shell + AI sidebar + settings reconciliation) shipped 25 commits to `main`. The shell is HeroUI v3 throughout; only **inner page content** still uses glass classes (via the legacy `@theme inline` token bridge in `index.css` plus literal class names like `.card`, `.repo-row`, `.stat-l`).

This consolidation reflects the established pattern: each page replaces glass class usages with HeroUI v3 primitives + Tailwind utilities. The pattern is mechanical at this point; we don't gain from per-page specs.

## 1. Context & problem

Approximate inventory of remaining glass-class references per page (from `grep -cE 'glass|card|sb-|tb-|pill-|stat-|repo-|act-|mbr-|inbox-|notif-|conv-|set-|seg|adm-|crumb|tm-|vis-|spec-|session-'`):

| Group | Page | Glass class hits | Lines |
|---|---|---:|---:|
| Project | ProjectMembers | 45 | 407 |
| Project | ProjectAgents | 29 | 524 |
| Project | ProjectLibrary | 27 | 430 |
| Project | ProjectDashboard | 27 | 305 |
| Project | ProjectRepositories | 18 | 322 |
| Project | ProjectDocuments | 12 | 550 |
| Project | ProjectDesigns | 10 | 405 |
| Project | ProjectPlans/Inbox/Conversation | 0 | — |
| Workspace | WorkspaceSettings | 24 | 589 |
| Workspace | WorkspaceSecurity | 23 | — |
| Workspace | WorkspaceOverview | 21 | — |
| Workspace | WorkspaceBilling | 17 | — |
| Workspace | WorkspaceProjects | 13 | — |
| Workspace | WorkspacePeople | 13 | — |
| Workspace | WorkspaceLibrary | 10 | — |
| Workspace | WorkspaceAuditLog/Agents/Users | 2-4 | — |
| Workspace | WorkspaceAnalytics | 0 | — |
| Operator | OperatorOverview | 17 | — |
| Operator | OperatorLayout | 14 | — |
| Operator | OperatorWorkspaces | 10 | — |
| Operator | OperatorSystem/Audit | 3-4 | — |
| Specialty | DesignChat, PlanningChat, DocumentExplorer, DocumentViewer, ExecutionDashboard, EnvironmentDetail, DockerShellPage, LibraryAgentDetail | varied | varied |

Total: ~25 files of meaningful work + cleanup.

## 2. Goals / non-goals

**Goals (this consolidated slice):**
1. Replace glass class references (`.card`, `.stat-*`, `.repo-*`, `.act-*`, `.mbr-*`, `.inbox-*`, `.notif-*`, `.conv-*`, `.docs-*`, `.set-*`, `.seg`, `.pill-btn`, `.adm-*`, `.crumb-tag`, etc.) in every remaining page with HeroUI v3 + Tailwind equivalents. After this, **no page file references glass classes**.
2. Delete the now-unused glass CSS blocks from `frontend/src/index.css`. Keep only: `@import "tailwindcss"`, `@import "@heroui/styles"`, the legacy `@theme inline` token bridge (kept until all Tailwind-class consumers are confirmed migrated — likely permanent since `bg-primary`/`bg-default-100` etc. are convenient), the `@custom-variant dark`, the `@layer base` global resets, and the `:root` CSS vars that the appSettings bridge writes to (`--accent-1`, `--accent-2`, `--accent-grad`).
3. Delete `frontend/src/components/MeshBackground.tsx` (unreferenced after Slice 2).
4. Delete `frontend/src/components/AiSidebar.tsx` (the unused standalone, confirmed dead).
5. Delete `frontend/src/components/ui/Modal.tsx` and `frontend/src/components/ui/Select.tsx` if confirmed unused (they were custom glass shims; HeroUI's primitives supersede).
6. tsc + vitest + build all clean; live browser smoke shows every route renders in HeroUI v3 styling.

**Non-goals:**
- New features.
- Touching the just-merged Sub-project A flows for the (already migrated) Branding + Appearance panes.
- Backend changes (none required).

## 3. Approach — pattern library

Per-page migration uses this established pattern (proven in Slices 1-3 + 2.5):

| Glass class | HeroUI v3 / Tailwind equivalent |
|---|---|
| `.glass`, `.glass-strong`, `.glass-weak` | `bg-surface shadow-surface rounded-2xl` (panel) / `bg-surface-secondary` / `bg-default` |
| `.card` | `rounded-2xl bg-surface p-4 shadow-surface` |
| `.card-head` | `flex items-center gap-2.5 mb-3` |
| `.card-title` | `text-sm font-semibold` |
| `.card-sub` | `text-xs text-muted ms-auto` |
| `.stat-l` | `text-[11px] uppercase tracking-wider font-medium text-muted` |
| `.stat-v` | `text-[28px] font-semibold tracking-tight tabular-nums` |
| `.stat-delta` | `text-[11.5px] font-medium text-success` |
| `.repo-row` / `.repo-name` / `.repo-meta` etc. | grid/flex Tailwind utilities + `text-muted`/`text-foreground` |
| `.act-row` / `.act-body` / `.act-avatar` | flex utilities + HeroUI `Avatar` |
| `.mbr-row` / `.mbr-table` | HeroUI `Table` (or grid utilities) |
| `.inbox-row` / `.inbox-list` | flex + button + `bg-surface-secondary` |
| `.notif-pop` / `.notif-row` | HeroUI `Popover` + `ListBox` |
| `.conv-bubble` / `.conv-input` | as in AI sidebar (Slice 2.5 established) |
| `.pill-btn` | HeroUI `Button size="sm" variant="secondary"` |
| `.set-row` / `.set-group` / `.set-toggle` | keep `SetRow`/`SetGroup` shells if file-local (WorkspaceSettings pattern) or migrate to HeroUI `Switch`/`Card` |
| `.seg` / `.seg-btn` | HeroUI `ToggleButtonGroup` + `ToggleButton` |
| `.crumb-tag` | HeroUI `Chip size="sm" variant="secondary"` |
| `.tm-avatar` / `av-1..5` | HeroUI `Avatar` with `bg-<accent|success|warning|danger|secondary>` |
| `.vis-btn` / `.vis-wrap` | HeroUI `Dropdown` + `Button` trigger |
| `.spec-trail-chip` | HeroUI `Chip` |
| `.session-row` etc. | as in AI sidebar (Slice 2.5 established) |
| `.docs-3col` / `.docs-tree` / `.docs-list` etc. | grid + flex utilities; HeroUI `Listbox` for tree |

The bridge in `appSettings.ts` already emits `--accent-1`, `--accent-2`, `--accent-grad`, `--accent`, `--accent-foreground`. HeroUI v3 tokens (`bg-surface`, `bg-surface-secondary`, `text-foreground`, `text-muted`, `border-separator`, `border-border`) are available via `@heroui/styles` (loaded in `index.css`).

## 4. Files touched

**Pages migrated (~25):**
- `frontend/src/pages/project/{ProjectMembers,ProjectAgents,ProjectLibrary,ProjectDashboard,ProjectRepositories,ProjectDocuments,ProjectDesigns}.tsx`
- `frontend/src/pages/workspace/{WorkspaceSettings,WorkspaceSecurity,WorkspaceOverview,WorkspaceBilling,WorkspaceProjects,WorkspacePeople,WorkspaceLibrary,WorkspaceAuditLog,WorkspaceAgents,WorkspaceUsers}.tsx`
- `frontend/src/pages/operator/{OperatorOverview,OperatorLayout,OperatorWorkspaces,OperatorSystem,OperatorAudit}.tsx`
- `frontend/src/pages/{DesignChat,PlanningChat,DocumentExplorer,DocumentViewer,ExecutionDashboard,EnvironmentDetail,DockerShellPage,LibraryAgentDetail}.tsx`

**Cleanup:**
- `frontend/src/index.css` — delete glass class blocks; keep imports, dark variant, legacy bridge, @layer base resets, :root CSS vars.
- `frontend/src/components/MeshBackground.tsx` — delete.
- `frontend/src/components/AiSidebar.tsx` — delete (unused).
- `frontend/src/components/ui/Modal.tsx`, `frontend/src/components/ui/Select.tsx` — delete if unused (verify via grep first).

## 5. Verification

Per-page: visit the page in the browser, check no console errors, check no obvious layout breaks.
Cumulative: tsc + vitest + vite build green. `grep -rE 'className="(card|sb-|tb-|pill-|stat-|repo-|act-|mbr-|inbox-|notif-|conv-|set-|seg|adm-|crumb|tm-|vis-|spec-|session-|ai-|cmd-|app|sidebar|topbar|main)' frontend/src` returns no matches (except `set-*` which is the file-local SetRow/SetGroup naming in WorkspaceSettings).

## 6. Risk + rollback

**Risks:** Per-page edits may inadvertently lose interactive behavior (hover styles, transitions). Mitigation: copy the existing JSX structure exactly; only swap class names. Spot-check each migrated page in the browser. 

**Rollback:** revert the slice's commits.

## 7. Execution strategy

Given ~25 files to migrate plus cleanup, execution proceeds page-by-page in priority order:
1. Most-visible pages first (Project + Workspace overview pages).
2. Then auxiliary pages (admin, audit, billing).
3. Then specialty pages.
4. Then cleanup pass.

Each page = one commit. The legacy `@theme inline` bridge remains throughout so `bg-primary`/`bg-default-100`/etc. continue to resolve.
