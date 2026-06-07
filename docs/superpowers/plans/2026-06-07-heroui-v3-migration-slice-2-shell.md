# HeroUI v3 Migration — Slice 2 Implementation Plan (Shell + Command Palette)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the 858-line `ProjectLayout.tsx` into 6 focused shell components, all using HeroUI v3 primitives; rewrite `CommandPalette` with HeroUI Modal + ListBox + SearchField; swap `AiSidebar`'s outer wrapper to a HeroUI Surface; drop `MeshBackground` from the shell render path. Each incremental task leaves the app working.

**Architecture:** Bottom-up extraction. Build each sub-component, wire it into `ProjectLayout` immediately, commit. The last task swaps `ProjectLayout` itself for a thin `AppShell` orchestrator and deletes the old file. AI sidebar's internal chat/sessions/specialists machinery stays glass-styled and unchanged this slice (Slice 2.5 migrates those). Sidebar navigation moves from `window.location.href` reloads to react-router `useNavigate`.

**Tech Stack:** React 19, HeroUI v3.1.0 (`ListBox`, `Modal`, `Dropdown`, `SearchField`, `Avatar`, `Chip`, `Kbd`, `Surface`), Tailwind v4, react-router-dom v6.

**Spec:** `docs/superpowers/specs/2026-06-07-heroui-v3-migration-slice-2-shell-design.md`

---

## File Structure

| Path | Action | Purpose |
|------|--------|---------|
| `frontend/src/components/shell/SidebarNav.tsx` | create (~80 lines) | Typed wrapper around HeroUI `ListBox` for nav items |
| `frontend/src/components/shell/WorkspaceSwitcher.tsx` | create (~60 lines) | HeroUI `Dropdown` showing current workspace + workspace list |
| `frontend/src/components/shell/Sidebar.tsx` | create (~140 lines) | Brand header + nav sections + projects list + bottom nav + WorkspaceSwitcher |
| `frontend/src/components/shell/Topbar.tsx` | create (~150 lines) | Breadcrumb + search-trigger button + icon buttons + user `Dropdown` |
| `frontend/src/components/shell/CommandPalette.tsx` | create (~120 lines) | HeroUI `Modal` + `SearchField` + filtered `ListBox` |
| `frontend/src/components/shell/AppShell.tsx` | create (~120 lines) | Grid root + view-switch (workspace + project view dispatch) |
| `frontend/src/components/AiSidebar.tsx` | modify (outer wrapper only) | Glass `<aside className="ai-side glass">` → Tailwind Surface |
| `frontend/src/components/ProjectLayout.tsx` | delete | Replaced by `AppShell` |
| `frontend/src/components/CommandPalette.tsx` | delete | Replaced by `shell/CommandPalette.tsx` |
| `frontend/src/main.tsx` | modify | Import `AppShell` instead of `ProjectLayout` (10 route lines updated) |
| `frontend/e2e/*.spec.ts` | modify if needed | Replace `.sb-row`/`.tb-btn`/`.glass`/`.crumb` selectors with role/aria/HeroUI BEM |

---

## Task 1: Pre-flight baseline

**Files:** none modified.

- [ ] **Step 1: Confirm Slice 1 is shipped and tree is clean.**

  Run: `cd /Users/nicocardone/Desktop/DEV/PERSONALI/telaios && git log --oneline -10 && git status`
  Expected: most recent commits include `efef3d8 docs(heroui): spec for Slice 2` and the 6 Slice 1 code commits. Working tree clean (apart from pre-existing untracked `server/.coverage` etc. and the modified `frontend/vite.config.ts` from before this work started).

- [ ] **Step 2: Baseline test pass.**

  Run: `cd frontend && ./node_modules/.bin/tsc --noEmit && npm run test:run`
  Expected: tsc clean, vitest 18/18 pass.

- [ ] **Step 3: Identify which e2e specs reference glass shell selectors.**

  Run: `grep -lE '\.sb-row|\.tb-btn|\.glass\b|\.crumb|\.cmd-|\.app\[' frontend/e2e/*.spec.ts || echo "no matches"`
  Capture the result — these are the specs that may need selector updates in Task 9.

- [ ] **Step 4: No commit; this task is observation only.**

---

## Task 2: Create `shell/SidebarNav.tsx` (HeroUI ListBox wrapper)

**Files:**
- Create: `frontend/src/components/shell/SidebarNav.tsx`

- [ ] **Step 1: Create the directory.**

  Run: `mkdir -p frontend/src/components/shell`

- [ ] **Step 2: Write `frontend/src/components/shell/SidebarNav.tsx`.**

  ```tsx
  import { ListBox } from "@heroui/react";
  import { Icon } from "../Icon";

  export interface SidebarNavItem<K extends string> {
    key: K;
    label: string;
    icon: string;
    badge?: string | null;
  }

  interface SidebarNavProps<K extends string> {
    items: ReadonlyArray<SidebarNavItem<K>>;
    selectedKey?: K;
    onSelect: (key: K) => void;
    ariaLabel: string;
    className?: string;
  }

  export function SidebarNav<K extends string>({
    items,
    selectedKey,
    onSelect,
    ariaLabel,
    className,
  }: SidebarNavProps<K>) {
    return (
      <ListBox
        aria-label={ariaLabel}
        className={className}
        selectionMode="single"
        selectedKeys={selectedKey ? new Set([selectedKey]) : new Set()}
        onAction={(key) => onSelect(String(key) as K)}
      >
        {items.map((item) => (
          <ListBox.Item key={item.key} id={item.key} textValue={item.label}>
            <Icon name={item.icon} className="size-4 shrink-0 text-muted" />
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge && (
              <span className="ms-auto rounded-md bg-default px-1.5 py-0.5 text-[10.5px] font-medium text-muted">
                {item.badge}
              </span>
            )}
          </ListBox.Item>
        ))}
      </ListBox>
    );
  }
  ```

- [ ] **Step 3: Type-check.**

  Run: `cd frontend && ./node_modules/.bin/tsc --noEmit 2>&1 | tail -10`
  Expected: clean (no output). If `selectedKeys` typing complains, change `new Set([selectedKey])` to `new Set([selectedKey]) as Set<string>`.

- [ ] **Step 4: Commit.**

  ```bash
  git add frontend/src/components/shell/SidebarNav.tsx
  git commit -m "$(cat <<'EOF'
  feat(frontend): add shell/SidebarNav (HeroUI ListBox wrapper)

  Typed wrapper around HeroUI v3 ListBox for sidebar nav items.
  Each item renders icon + label + optional badge. Single-selection
  mode driven by selectedKey; onSelect fires when an item is clicked
  or activated via keyboard. Used by the new Sidebar in the next
  task.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 3: Create `shell/WorkspaceSwitcher.tsx` (HeroUI Dropdown)

**Files:**
- Create: `frontend/src/components/shell/WorkspaceSwitcher.tsx`

- [ ] **Step 1: Write the file.**

  ```tsx
  import { Avatar, Button, Dropdown } from "@heroui/react";
  import { useAuth } from "../../context/AuthContext";

  export function WorkspaceSwitcher() {
    const { user } = useAuth();
    if (!user) return null;

    const orgName = user.organization_name ?? "Workspace";
    const initials = orgName.slice(0, 1).toUpperCase();

    return (
      <Dropdown>
        <Button
          variant="tertiary"
          className="h-auto w-full justify-start gap-2.5 rounded-xl bg-surface-secondary px-2 py-2 text-left"
        >
          <Avatar size="sm" className="bg-accent-soft text-accent-soft-foreground">
            <Avatar.Fallback>{initials}</Avatar.Fallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[12.5px] font-semibold text-foreground">{orgName}</span>
            <span className="truncate text-[11px] text-muted">{user.display_name ?? user.email}</span>
          </div>
        </Button>
        <Dropdown.Menu aria-label="Switch workspace">
          <Dropdown.Item id={user.organization_id} textValue={orgName}>
            {orgName}
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>
    );
  }
  ```

  This is intentionally a placeholder for multi-workspace support: today there's only one organization per user, so the dropdown lists just it. Future multi-workspace work expands the menu items.

- [ ] **Step 2: Type-check.**

  Run: `cd frontend && ./node_modules/.bin/tsc --noEmit`
  Expected: clean.

- [ ] **Step 3: Commit.**

  ```bash
  git add frontend/src/components/shell/WorkspaceSwitcher.tsx
  git commit -m "$(cat <<'EOF'
  feat(frontend): add shell/WorkspaceSwitcher (HeroUI Dropdown)

  Single-workspace dropdown at the bottom of the sidebar. Shows org
  initials Avatar + name + user display name. Lists current
  workspace as the only item for now (multi-workspace support is
  future work).

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 4: Create `shell/Sidebar.tsx` and wire it into `ProjectLayout`

**Files:**
- Create: `frontend/src/components/shell/Sidebar.tsx`
- Modify: `frontend/src/components/ProjectLayout.tsx` (replace inline sidebar markup)

- [ ] **Step 1: Write `frontend/src/components/shell/Sidebar.tsx`.**

  ```tsx
  import { useNavigate } from "react-router-dom";
  import { useAppSettings } from "../../context/AppSettingsContext";
  import { TelaiOSLogo } from "../common/TelaiOSLogo";
  import { SidebarNav, type SidebarNavItem } from "./SidebarNav";
  import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
  import type { ProjectView, WsView } from "../AppShell";

  const WS_NAV: ReadonlyArray<SidebarNavItem<WsView> & { href: string }> = [
    { key: "overview",  label: "Overview",       icon: "home",     href: "/" },
    { key: "projects",  label: "Projects",       icon: "layers",   href: "/projects-list" },
    { key: "library",   label: "Library",        icon: "cube",     href: "/library" },
    { key: "analytics", label: "Analytics",      icon: "workflow", href: "/analytics" },
    { key: "agents",    label: "Agents",         icon: "bot",      href: "/agents" },
  ];

  const WS_ADMIN_NAV: ReadonlyArray<SidebarNavItem<WsView> & { href: string }> = [
    { key: "people",   label: "People",   icon: "users",    href: "/people"   },
    { key: "audit",    label: "Audit Log", icon: "inbox",   href: "/audit"    },
    { key: "billing",  label: "Billing",  icon: "layers",   href: "/billing"  },
    { key: "security", label: "Security", icon: "settings", href: "/security" },
    { key: "settings", label: "Settings", icon: "settings", href: "/settings" },
  ];

  const PROJECT_NAV: ReadonlyArray<SidebarNavItem<ProjectView>> = [
    { key: "dashboard",    label: "Dashboard",    icon: "home"     },
    { key: "conversation", label: "Conversation", icon: "chat"     },
    { key: "repositories", label: "Repositories", icon: "git"      },
    { key: "documents",    label: "Documents",    icon: "book"     },
    { key: "designs",      label: "Designs",      icon: "spark"    },
    { key: "agents",       label: "Agents",       icon: "bot"      },
    { key: "library",      label: "Library",      icon: "cube"     },
    { key: "plans",        label: "Plans",        icon: "workflow" },
  ];

  const PROJECT_BOTTOM_NAV: ReadonlyArray<SidebarNavItem<ProjectView>> = [
    { key: "inbox",    label: "Inbox",    icon: "inbox"    },
    { key: "members",  label: "Members",  icon: "users"    },
    { key: "settings", label: "Settings", icon: "settings" },
  ];

  interface SidebarProps {
    mode:
      | { kind: "workspace"; wsView: WsView }
      | { kind: "project"; projectId: string; projectName: string; view: ProjectView; onSelectView: (v: ProjectView) => void; projects: Array<{ id: string; name: string; color: string }> };
  }

  export function Sidebar({ mode }: SidebarProps) {
    const { settings } = useAppSettings();
    const brand = settings.brand_name?.trim() || "TelaiOS";
    const navigate = useNavigate();

    return (
      <aside className="row-span-2 flex flex-col gap-1 overflow-hidden rounded-2xl bg-surface p-2.5 shadow-surface">
        <div className="mb-1 flex items-center gap-2.5 px-2 pt-1.5 pb-3.5 text-[13.5px] font-semibold tracking-tight">
          {settings.logo_url ? (
            <img src={settings.logo_url} alt={`${brand} logo`} className="h-5 w-auto" />
          ) : (
            <TelaiOSLogo size={26} />
          )}
          <span className="truncate text-foreground">{brand}</span>
          <span className="ms-auto text-[11px] font-medium text-muted">v2.4</span>
        </div>

        {mode.kind === "workspace" ? (
          <>
            <h2 className="px-2.5 pt-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
              Navigation
            </h2>
            <SidebarNav
              items={WS_NAV}
              selectedKey={mode.wsView}
              onSelect={(key) => {
                const item = WS_NAV.find((n) => n.key === key);
                if (item) navigate(item.href);
              }}
              ariaLabel="Workspace navigation"
            />
            <h2 className="px-2.5 pt-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
              Admin
            </h2>
            <SidebarNav
              items={WS_ADMIN_NAV}
              selectedKey={mode.wsView}
              onSelect={(key) => {
                const item = WS_ADMIN_NAV.find((n) => n.key === key);
                if (item) navigate(item.href);
              }}
              ariaLabel="Workspace admin"
            />
          </>
        ) : (
          <>
            <h2 className="truncate px-2.5 pt-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
              {mode.projectName}
            </h2>
            <SidebarNav
              items={PROJECT_NAV}
              selectedKey={mode.view}
              onSelect={mode.onSelectView}
              ariaLabel="Project navigation"
            />
            <h2 className="px-2.5 pt-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
              Projects
            </h2>
            <ul className="flex flex-col gap-0.5 px-0.5">
              {mode.projects.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/projects/${p.id}`)}
                    data-active={mode.projectId === p.id}
                    className="flex h-7.5 w-full items-center gap-2.5 rounded-lg px-2.5 text-[12.5px] text-muted hover:bg-default-hover hover:text-foreground data-[active=true]:bg-surface-secondary data-[active=true]:text-foreground"
                  >
                    <span
                      aria-hidden
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ background: p.color }}
                    />
                    <span className="truncate">{p.name}</span>
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="flex h-7.5 w-full items-center gap-2.5 rounded-lg px-2.5 text-[12.5px] text-muted hover:bg-default-hover hover:text-foreground"
                >
                  <span className="size-4 text-center text-muted">+</span>
                  <span>All projects</span>
                </button>
              </li>
            </ul>
          </>
        )}

        <div className="flex-1" />

        {mode.kind === "project" && (
          <SidebarNav
            items={PROJECT_BOTTOM_NAV}
            selectedKey={mode.view}
            onSelect={mode.onSelectView}
            ariaLabel="Project bottom navigation"
            className="pt-2"
          />
        )}

        <div className="pt-2">
          <WorkspaceSwitcher />
        </div>
      </aside>
    );
  }
  ```

- [ ] **Step 2: Wire the new Sidebar into `ProjectLayout.tsx`** — replace the `<aside className="sidebar glass">…</aside>` block (lines ~309-440) with:

  ```tsx
  <Sidebar
    mode={
      wsView
        ? { kind: "workspace", wsView }
        : {
            kind: "project",
            projectId: projectId!,
            projectName: project?.name ?? "Project",
            view,
            onSelectView: setView,
            projects: sidebarProjects,
          }
    }
  />
  ```

  At the top of `ProjectLayout.tsx`, add:
  ```tsx
  import { Sidebar } from "./shell/Sidebar";
  ```
  Remove now-dead imports: `Icon` is still used by Topbar inline markup, keep for now. The `WS_NAV` / `WS_ADMIN_NAV` / `mainNav` / `bottomNav` consts in ProjectLayout.tsx are now duplicated in Sidebar.tsx — **delete them from ProjectLayout.tsx** to prevent drift.

  *Note:* the `Sidebar` references `ProjectView` and `WsView` types from `../AppShell`, but `AppShell.tsx` doesn't exist yet. Temporary fix for this commit: import them from `../ProjectLayout` (export them from ProjectLayout for now), and in Task 9 we'll move the types to `AppShell.tsx` and update the import.

  In `ProjectLayout.tsx`, change the existing type declarations to be exported:
  ```tsx
  export type ProjectView = …
  export type WsView = …
  ```

  And in `Sidebar.tsx`, change the import:
  ```tsx
  import type { ProjectView, WsView } from "../ProjectLayout";
  ```

- [ ] **Step 3: Type-check.**

  Run: `cd frontend && ./node_modules/.bin/tsc --noEmit 2>&1 | tail -20`
  Expected: clean.

- [ ] **Step 4: Boot dev server, verify sidebar renders and nav works.**

  Run: `cd frontend && npm run dev` (background)
  Run: `until curl -sf -o /dev/null http://localhost:5173/; do sleep 1; done`

  Navigate to `http://localhost:5173/` in a browser (or via the playwright MCP):
  - Sidebar appears on the left as a HeroUI Surface column with rounded corners.
  - Workspace nav items (Overview, Projects, Library, Analytics, Agents) render as ListBox items. Click one — URL changes (client-side), active highlight updates.
  - Admin section visible below Navigation.
  - Workspace switcher Dropdown appears at the bottom (org name + initials avatar).

  Navigate to `/projects/<id>`:
  - Sidebar shows project name as section title; project nav items appear; projects list appears; bottom nav (Inbox, Members, Settings) appears.

  Ctrl-C dev server.

- [ ] **Step 5: Commit.**

  ```bash
  git add frontend/src/components/shell/Sidebar.tsx frontend/src/components/ProjectLayout.tsx
  git commit -m "$(cat <<'EOF'
  refactor(frontend): extract shell/Sidebar.tsx from ProjectLayout

  New Sidebar component uses HeroUI v3 primitives (SidebarNav around
  ListBox, WorkspaceSwitcher around Dropdown, TelaiOSLogo, brand
  name from settings). Navigation switches from window.location.href
  reloads to react-router useNavigate. Inline sidebar markup in
  ProjectLayout.tsx is replaced by <Sidebar mode={...} />.

  ProjectView and WsView types are temporarily exported from
  ProjectLayout for Sidebar to consume; they move to AppShell.tsx in
  the final cleanup task of this slice.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 5: Create `shell/Topbar.tsx` and wire it into `ProjectLayout`

**Files:**
- Create: `frontend/src/components/shell/Topbar.tsx`
- Modify: `frontend/src/components/ProjectLayout.tsx` (replace inline topbar markup)

- [ ] **Step 1: Write `frontend/src/components/shell/Topbar.tsx`.**

  ```tsx
  import { Avatar, Button, Chip, Dropdown, Kbd } from "@heroui/react";
  import { useAuth } from "../../context/AuthContext";

  interface TopbarProps {
    breadcrumbTitle: string;
    breadcrumbColor?: string;
    viewLabel: string;
    extraTag?: string;
    onOpenCommandPalette: () => void;
  }

  export function Topbar({
    breadcrumbTitle,
    breadcrumbColor,
    viewLabel,
    extraTag,
    onOpenCommandPalette,
  }: TopbarProps) {
    const { user, logout } = useAuth();
    const initials =
      user?.display_name?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() ?? "U";

    return (
      <header className="col-start-2 flex h-14 items-center gap-2.5 rounded-2xl bg-surface px-4 shadow-surface">
        <div className="flex min-w-0 items-center gap-2 text-[13px] text-muted">
          {breadcrumbColor && (
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: breadcrumbColor }}
            />
          )}
          <b className="truncate font-semibold text-foreground">{breadcrumbTitle}</b>
          <span className="text-muted/60">/</span>
          <span className="truncate">{viewLabel}</span>
          {extraTag && (
            <Chip size="sm" variant="default" className="ms-1">
              {extraTag}
            </Chip>
          )}
        </div>

        <div className="flex-1" />

        <Button
          variant="tertiary"
          size="sm"
          onPress={onOpenCommandPalette}
          className="hidden gap-2 md:inline-flex"
          aria-label="Open command palette"
        >
          <i className="fa-solid fa-magnifying-glass text-muted" aria-hidden />
          <span className="text-muted">Search or ask TEOS…</span>
          <Kbd className="ms-2" variant="light">
            <Kbd.Abbr keyValue="command" />
            <Kbd.Content>K</Kbd.Content>
          </Kbd>
        </Button>

        <Button isIconOnly size="sm" variant="tertiary" aria-label="Notifications">
          <i className="fa-solid fa-bell text-muted" aria-hidden />
        </Button>

        <Dropdown>
          <Button isIconOnly size="sm" variant="tertiary" aria-label="User menu">
            <Avatar size="sm" className="bg-accent text-accent-foreground">
              <Avatar.Fallback>{initials}</Avatar.Fallback>
            </Avatar>
          </Button>
          <Dropdown.Menu
            aria-label="User actions"
            onAction={(key) => {
              if (key === "logout") logout();
            }}
          >
            <Dropdown.Item id="profile" textValue="Profile">
              Profile
            </Dropdown.Item>
            <Dropdown.Item id="logout" textValue="Sign out" variant="danger">
              Sign out
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </header>
    );
  }
  ```

- [ ] **Step 2: Wire the new Topbar into `ProjectLayout.tsx`.** Replace the existing topbar markup (the `<header className="topbar glass">…</header>` block) with:

  ```tsx
  <Topbar
    breadcrumbTitle={projectName}
    breadcrumbColor={projectColor}
    viewLabel={wsView ? WS_VIEW_LABELS[wsView] : VIEW_LABELS[view]}
    extraTag={!wsView ? crumbTag[view] : undefined}
    onOpenCommandPalette={() => setCmdOpen(true)}
  />
  ```

  Add the import:
  ```tsx
  import { Topbar } from "./shell/Topbar";
  ```

- [ ] **Step 3: Type-check.**

  Run: `cd frontend && ./node_modules/.bin/tsc --noEmit 2>&1 | tail -10`
  Expected: clean.

- [ ] **Step 4: Browser smoke.**

  Boot dev server, navigate to `/` and `/projects/<id>`:
  - Topbar renders breadcrumb (workspace name → view label).
  - "Search or ask TEOS…" button with ⌘K kbd hint appears (md+ screens).
  - Bell icon button appears.
  - Avatar dropdown appears; clicking shows "Profile" + "Sign out".
  - Clicking "Sign out" logs out (returns to /login).

- [ ] **Step 5: Commit.**

  ```bash
  git add frontend/src/components/shell/Topbar.tsx frontend/src/components/ProjectLayout.tsx
  git commit -m "$(cat <<'EOF'
  refactor(frontend): extract shell/Topbar.tsx from ProjectLayout

  New Topbar component uses HeroUI v3 primitives: Chip for the
  breadcrumb tag, Button (tertiary) + Kbd for the ⌘K search trigger,
  Button isIconOnly for notifications, Avatar + Dropdown for the
  user menu (Profile, Sign out). Inline topbar markup in
  ProjectLayout is replaced by <Topbar … />.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 6: Rewrite `shell/CommandPalette.tsx` and delete the old one

**Files:**
- Create: `frontend/src/components/shell/CommandPalette.tsx`
- Modify: `frontend/src/components/ProjectLayout.tsx` (swap import)
- Delete: `frontend/src/components/CommandPalette.tsx`

- [ ] **Step 1: Write `frontend/src/components/shell/CommandPalette.tsx`.**

  ```tsx
  import { useEffect, useMemo, useState } from "react";
  import { ListBox, Modal, SearchField } from "@heroui/react";

  interface Command {
    id: string;
    label: string;
    view?: string;
    icon: string;
    category: string;
  }

  const COMMANDS: Command[] = [
    { id: "dashboard",     label: "Go to Dashboard",      view: "dashboard",     icon: "fa-table-cells-large", category: "Navigation" },
    { id: "conversation",  label: "Open Conversation",    view: "conversation",  icon: "fa-comments",          category: "Navigation" },
    { id: "repositories",  label: "Repositories",         view: "repositories",  icon: "fa-code-branch",       category: "Navigation" },
    { id: "documents",     label: "Documents",            view: "documents",     icon: "fa-file-lines",        category: "Navigation" },
    { id: "designs",       label: "Designs",              view: "designs",       icon: "fa-pen-ruler",         category: "Navigation" },
    { id: "agents",        label: "Agents",               view: "agents",        icon: "fa-robot",             category: "Navigation" },
    { id: "inbox",         label: "Inbox",                view: "inbox",         icon: "fa-inbox",             category: "Navigation" },
    { id: "team",          label: "Team",                 view: "team",          icon: "fa-users",             category: "Navigation" },
    { id: "settings",      label: "Settings",             view: "settings",      icon: "fa-gear",              category: "Navigation" },
  ];

  interface CommandPaletteProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onNavigate: (view: string) => void;
    projectName: string;
  }

  export function CommandPalette({ isOpen, onOpenChange, onNavigate, projectName }: CommandPaletteProps) {
    const [query, setQuery] = useState("");

    useEffect(() => {
      if (isOpen) setQuery("");
    }, [isOpen]);

    const filtered = useMemo(
      () => COMMANDS.filter((c) => !query || c.label.toLowerCase().includes(query.toLowerCase())),
      [query],
    );

    return (
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <Modal.Backdrop variant="blur">
          <Modal.Container placement="top">
            <Modal.Dialog className="sm:max-w-[560px]">
              <Modal.Header className="border-b border-separator px-4 py-3">
                <SearchField
                  value={query}
                  onChange={setQuery}
                  autoFocus
                  aria-label={`Search or ask TEOS about ${projectName}`}
                  className="w-full"
                />
              </Modal.Header>
              <Modal.Body className="p-1">
                {filtered.length === 0 ? (
                  <p className="p-5 text-center text-sm text-muted">No commands found</p>
                ) : (
                  <ListBox
                    aria-label="Commands"
                    selectionMode="single"
                    onAction={(key) => {
                      const cmd = COMMANDS.find((c) => c.id === key);
                      if (cmd?.view) onNavigate(cmd.view);
                      onOpenChange(false);
                    }}
                    className="max-h-[50vh] overflow-y-auto"
                  >
                    {filtered.map((cmd) => (
                      <ListBox.Item key={cmd.id} id={cmd.id} textValue={cmd.label}>
                        <i className={`fa-solid ${cmd.icon} w-5 shrink-0 text-center text-muted`} aria-hidden />
                        <span className="flex-1">{cmd.label}</span>
                        <span className="ms-auto text-[11px] text-muted">{cmd.category}</span>
                      </ListBox.Item>
                    ))}
                  </ListBox>
                )}
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    );
  }
  ```

- [ ] **Step 2: Update the import in `ProjectLayout.tsx`.**

  ```diff
  -import CommandPalette from "./CommandPalette";
  +import { CommandPalette } from "./shell/CommandPalette";
  ```

  And update the JSX usage:

  ```diff
  -<CommandPalette
  -  isOpen={cmdOpen}
  -  onClose={() => setCmdOpen(false)}
  -  onNavigate={(v) => setView(v as ProjectView)}
  -  projectName={projectName}
  -/>
  +<CommandPalette
  +  isOpen={cmdOpen}
  +  onOpenChange={setCmdOpen}
  +  onNavigate={(v) => setView(v as ProjectView)}
  +  projectName={projectName}
  +/>
  ```

  The keyboard listener that toggles `cmdOpen` on ⌘K should stay in `ProjectLayout.tsx` (or its replacement `AppShell` later) — confirm via grep that there's a `useEffect` registering `window.addEventListener("keydown", ...)` for `⌘K`.

- [ ] **Step 3: Delete the old `CommandPalette.tsx`.**

  Run: `rm frontend/src/components/CommandPalette.tsx`

- [ ] **Step 4: Type-check.**

  Run: `cd frontend && ./node_modules/.bin/tsc --noEmit 2>&1 | tail -10`
  Expected: clean.

- [ ] **Step 5: Browser smoke.**

  - Press ⌘K — HeroUI Modal opens, SearchField focused.
  - Type "dash" — list filters to "Go to Dashboard".
  - Press ↓/↑ — selection moves.
  - Press Enter — navigates to dashboard view; modal closes.
  - Press Esc on an open modal — closes.
  - Click backdrop — closes.

- [ ] **Step 6: Commit.**

  ```bash
  git add frontend/src/components/shell/CommandPalette.tsx frontend/src/components/ProjectLayout.tsx frontend/src/components/CommandPalette.tsx
  git commit -m "$(cat <<'EOF'
  refactor(frontend): rewrite CommandPalette using HeroUI v3 Modal+ListBox

  - shell/CommandPalette.tsx: HeroUI Modal (controlled isOpen) +
    SearchField + ListBox of filtered commands. Backdrop blur, top
    placement, sm:max-w-[560px]. Replaces the old inline-styled
    glass overlay component with its custom keyboard handler.
  - Old components/CommandPalette.tsx deleted (194 lines of inline
    styles + glass classes + manual keyboard dispatcher).
  - ProjectLayout import updated; isOpen/onOpenChange API matches
    HeroUI's Modal contract.

  Keyboard nav is now provided by ListBox + Modal (built on React
  Aria). The ⌘K global shortcut to OPEN the palette still lives in
  ProjectLayout / AppShell (toggles cmdOpen state).

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 7: Migrate `AiSidebar.tsx` outer wrapper

**Files:**
- Modify: `frontend/src/components/AiSidebar.tsx` (outer `<aside>` only)

- [ ] **Step 1: Locate the outer wrapper in `frontend/src/components/AiSidebar.tsx`.**

  Run: `grep -n 'className="ai-side' frontend/src/components/AiSidebar.tsx`
  Expected: one match, likely on a line like `<aside className="ai-side glass" ...>`.

- [ ] **Step 2: Replace just the outer `<aside>` element.** Before:

  ```tsx
  <aside className="ai-side glass" style={{ display: aiCollapsed ? "none" : "flex" }}>
  ```

  After:

  ```tsx
  <aside
    aria-label="TEOS AI assistant"
    className={`row-span-2 col-start-3 flex flex-col overflow-hidden rounded-2xl bg-surface shadow-surface transition-[width,opacity] duration-300 ${
      aiCollapsed ? "pointer-events-none w-0 opacity-0" : "w-[380px] opacity-100"
    }`}
  >
  ```

  Adjust prop name (`aiCollapsed` / `collapsed`) to match how the parent passes it — keep whatever name AiSidebar currently accepts.

  **Do not change anything inside the `<aside>`** — `.ai-head`, `.ai-thread`, `.ai-msg`, `.ai-input-wrap`, sessions drawer, etc. all stay as today. This is the explicitly-deferred-to-Slice-2.5 part.

- [ ] **Step 3: Verify the `.ai-toggle` (the floating reopen button) still works.** Grep:

  Run: `grep -n 'ai-toggle' frontend/src/components/AiSidebar.tsx`

  If it exists, keep that block as-is — it's the collapsed-state expander.

- [ ] **Step 4: Type-check.**

  Run: `cd frontend && ./node_modules/.bin/tsc --noEmit 2>&1 | tail -10`
  Expected: clean.

- [ ] **Step 5: Browser smoke.**

  - AI sidebar appears at the right edge of the grid, 380px wide.
  - Inner chat thread / sessions still look glass-styled (expected — internals stay this slice).
  - Toggle collapse: width animates to 0, opacity to 0, pointer events disabled.
  - Reopen via the floating toggle button (if still present).
  - On `/projects/<id>` conversation view: AI sidebar auto-collapses (existing behavior).

- [ ] **Step 6: Commit.**

  ```bash
  git add frontend/src/components/AiSidebar.tsx
  git commit -m "$(cat <<'EOF'
  refactor(frontend): swap AiSidebar outer wrapper for HeroUI Surface

  The single outermost <aside className="ai-side glass"> becomes a
  Tailwind/HeroUI Surface (bg-surface, shadow-surface, rounded-2xl)
  positioned via grid utilities (row-span-2, col-start-3). Width
  animates between 0 and 380px on collapse.

  Internals (.ai-head, .ai-thread, .ai-msg, .ai-input-wrap, sessions
  drawer, specialist menu, vis menu) are explicitly NOT migrated in
  this slice — Slice 2.5 will convert them. Visual inconsistency
  between the new HeroUI outer panel and the glass inner content is
  acceptable for the duration of the transition.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 8: Create `AppShell.tsx`, replace `ProjectLayout`, drop MeshBackground

**Files:**
- Create: `frontend/src/components/shell/AppShell.tsx`
- Modify: `frontend/src/main.tsx` (route imports)
- Delete: `frontend/src/components/ProjectLayout.tsx`

- [ ] **Step 1: Write `frontend/src/components/shell/AppShell.tsx`.**

  This consolidates the residual orchestration from ProjectLayout: routing params, state (view, cmdOpen, aiCollapsed), project fetching, TEOS state passthrough to AiSidebar, view dispatch. Most of the existing ProjectLayout body becomes AppShell — the change is the outer JSX (Tailwind grid + no MeshBackground) and that the sidebar/topbar/command-palette/ai-sidebar are now imported components.

  ```tsx
  import { useEffect, useRef, useState } from "react";
  import { useParams } from "react-router-dom";
  import { useAuth } from "../../context/AuthContext";
  import { getProjects, sendConversationMessage } from "../../lib/api";
  import type { Project } from "../../types";
  import AiSidebar from "../AiSidebar";
  import { Sidebar } from "./Sidebar";
  import { Topbar } from "./Topbar";
  import { CommandPalette } from "./CommandPalette";

  // Project view components
  import ProjectDashboard from "../../pages/project/ProjectDashboard";
  import ProjectConversation from "../../pages/project/ProjectConversation";
  import ProjectRepositories from "../../pages/project/ProjectRepositories";
  import ProjectDocuments from "../../pages/project/ProjectDocuments";
  import ProjectDesigns from "../../pages/project/ProjectDesigns";
  import ProjectAgents from "../../pages/project/ProjectAgents";
  import ProjectLibrary from "../../pages/project/ProjectLibrary";
  import ProjectPlans from "../../pages/project/ProjectPlans";
  import ProjectInbox from "../../pages/project/ProjectInbox";
  import ProjectMembers from "../../pages/project/ProjectMembers";

  // Workspace view components
  import WorkspaceOverview  from "../../pages/workspace/WorkspaceOverview";
  import WorkspaceProjects  from "../../pages/workspace/WorkspaceProjects";
  import WorkspaceLibrary   from "../../pages/workspace/WorkspaceLibrary";
  import WorkspaceAnalytics from "../../pages/workspace/WorkspaceAnalytics";
  import WorkspaceAgents    from "../../pages/workspace/WorkspaceAgents";
  import WorkspacePeople    from "../../pages/workspace/WorkspacePeople";
  import WorkspaceSettings  from "../../pages/workspace/WorkspaceSettings";
  import WorkspaceAuditLog  from "../../pages/workspace/WorkspaceAuditLog";
  import WorkspaceBilling   from "../../pages/workspace/WorkspaceBilling";
  import WorkspaceSecurity  from "../../pages/workspace/WorkspaceSecurity";

  export type ProjectView =
    | "dashboard" | "conversation" | "repositories" | "documents"
    | "designs" | "agents" | "library" | "plans"
    | "inbox" | "members" | "settings";

  export type WsView =
    | "overview" | "projects" | "library" | "analytics" | "agents"
    | "people" | "settings" | "audit" | "billing" | "security";

  const WS_VIEW_LABELS: Record<WsView, string> = {
    overview:  "Overview",  projects:  "Projects",  library:   "Library",
    analytics: "Analytics", agents:    "Agents",    people:    "People",
    settings:  "Settings",  audit:     "Audit Log", billing:   "Billing",
    security:  "Security",
  };

  const VIEW_LABELS: Record<ProjectView, string> = {
    dashboard: "Dashboard", conversation: "Conversation", repositories: "Repositories",
    documents: "Documents", designs: "Designs", agents: "Agents", library: "Library",
    plans: "Plans", inbox: "Inbox", members: "Members", settings: "Settings",
  };

  const CRUMB_TAG: Partial<Record<ProjectView, string>> = {
    repositories: "5 sources · 22.4k symbols",
    documents: "10 indexed · 752 pages",
    library: "8 MCP servers · 8 skills",
  };

  export default function AppShell({ wsView }: { wsView?: WsView } = {}) {
    const { projectId } = useParams<{ projectId: string }>();
    const { user } = useAuth();

    const [project, setProject] = useState<Project | null>(null);
    const [sidebarProjects, setSidebarProjects] = useState<{ id: string; name: string; color: string }[]>([]);
    const [view, setView] = useState<ProjectView>("dashboard");
    const [aiCollapsed, setAiCollapsed] = useState(false);
    const [cmdOpen, setCmdOpen] = useState(false);

    // Fetch project list for sidebar (project mode).
    useEffect(() => {
      if (wsView || !user) return;
      const palette = ["#0a84ff", "#bf5af2", "#30d158", "#ff9f0a", "#ff375f", "#5e5ce6"];
      getProjects().then((ps) => {
        setSidebarProjects(ps.map((p, i) => ({ id: p.id, name: p.name, color: palette[i % palette.length] })));
        if (projectId) {
          const p = ps.find((x) => x.id === projectId);
          if (p) setProject(p);
        }
      }).catch(() => {});
    }, [wsView, user, projectId]);

    // Auto-collapse AI sidebar on conversation view.
    useEffect(() => {
      if (view === "conversation") setAiCollapsed(true);
    }, [view]);

    // ⌘K / Ctrl-K opens the command palette.
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
          e.preventDefault();
          setCmdOpen((o) => !o);
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, []);

    const projectName = wsView ? "TelaiOS" : (project?.name ?? "Project");
    const projectColor = wsView ? undefined : (sidebarProjects.find((p) => p.id === projectId)?.color ?? "#0a84ff");
    const viewLabel = wsView ? WS_VIEW_LABELS[wsView] : VIEW_LABELS[view];

    const renderView = () => {
      if (wsView) {
        switch (wsView) {
          case "overview":  return <WorkspaceOverview />;
          case "projects":  return <WorkspaceProjects />;
          case "library":   return <WorkspaceLibrary />;
          case "analytics": return <WorkspaceAnalytics />;
          case "agents":    return <WorkspaceAgents />;
          case "people":    return <WorkspacePeople />;
          case "settings":  return <WorkspaceSettings />;
          case "audit":     return <WorkspaceAuditLog />;
          case "billing":   return <WorkspaceBilling />;
          case "security":  return <WorkspaceSecurity />;
        }
      }
      if (!projectId) return null;
      switch (view) {
        case "dashboard":    return <ProjectDashboard projectId={projectId} onNavigate={(v) => setView(v as ProjectView)} />;
        case "conversation": return <ProjectConversation projectId={projectId} />;
        case "repositories": return <ProjectRepositories projectId={projectId} />;
        case "documents":    return <ProjectDocuments projectId={projectId} />;
        case "designs":      return <ProjectDesigns projectId={projectId} />;
        case "agents":       return <ProjectAgents projectId={projectId} />;
        case "library":      return <ProjectLibrary projectId={projectId} />;
        case "plans":        return <ProjectPlans projectId={projectId} />;
        case "inbox":        return <ProjectInbox projectId={projectId} />;
        case "members":      return <ProjectMembers projectId={projectId} />;
      }
    };

    return (
      <div className="grid h-screen grid-cols-[240px_1fr_auto] grid-rows-[56px_1fr] gap-2.5 bg-background p-2.5 text-foreground xl:grid-cols-[220px_1fr_auto] lg:grid-cols-[200px_1fr_auto]">
        <Sidebar
          mode={
            wsView
              ? { kind: "workspace", wsView }
              : {
                  kind: "project",
                  projectId: projectId!,
                  projectName: project?.name ?? "Project",
                  view,
                  onSelectView: setView,
                  projects: sidebarProjects,
                }
          }
        />
        <Topbar
          breadcrumbTitle={projectName}
          breadcrumbColor={projectColor}
          viewLabel={viewLabel}
          extraTag={!wsView ? CRUMB_TAG[view] : undefined}
          onOpenCommandPalette={() => setCmdOpen(true)}
        />
        <main
          className={`col-start-2 flex flex-col overflow-hidden rounded-2xl bg-surface shadow-surface ${
            view === "conversation" && !wsView ? "p-0" : ""
          }`}
        >
          <div className="flex-1 overflow-y-auto px-7 pt-6 pb-24">{renderView()}</div>
        </main>
        <AiSidebar
          aiCollapsed={wsView ? true : aiCollapsed}
          onToggle={() => setAiCollapsed((c) => !c)}
        />
        <CommandPalette
          isOpen={cmdOpen}
          onOpenChange={setCmdOpen}
          onNavigate={(v) => setView(v as ProjectView)}
          projectName={projectName}
        />
      </div>
    );
  }
  ```

  Note: this captures the **essential** behaviors. Other state from old `ProjectLayout.tsx` (TEOS messages, busy flag, drafts, refs, demo SSE wiring, MOCK_NOTIFICATIONS, SPECIALISTS, COMMANDS suggestion arrays) is concerned with the AI sidebar internals — pass that state down to `<AiSidebar>` via props the same way the old code did. Inspect the old `ProjectLayout.tsx` props passed to `<AiSidebar>` and replicate.

- [ ] **Step 2: Update `frontend/src/main.tsx`.** Change all 11 routes that import `ProjectLayout`:

  ```diff
  -import ProjectLayout from "./components/ProjectLayout";
  +import AppShell from "./components/shell/AppShell";
  ```

  And replace every `<ProjectLayout wsView="..." />` and `<ProjectLayout />` with `<AppShell wsView="..." />` and `<AppShell />`.

- [ ] **Step 3: Update `Sidebar.tsx` type import to point at the new location.**

  ```diff
  -import type { ProjectView, WsView } from "../ProjectLayout";
  +import type { ProjectView, WsView } from "./AppShell";
  ```

- [ ] **Step 4: Delete the old ProjectLayout.**

  Run: `rm frontend/src/components/ProjectLayout.tsx`

- [ ] **Step 5: Type-check.**

  Run: `cd frontend && ./node_modules/.bin/tsc --noEmit 2>&1 | tail -20`
  Expected: clean. If `AiSidebar` complains about missing props, check its signature against what AppShell passes and reconcile.

- [ ] **Step 6: vitest + build.**

  Run: `cd frontend && npm run test:run && ./node_modules/.bin/vite build 2>&1 | tail -10`
  Expected: vitest passes (18/18); build succeeds.

- [ ] **Step 7: Browser smoke.**

  Boot dev server, walk through these routes:
  - `/login` — still HeroUI v3 from Slice 1.
  - `/` — workspace overview in new shell. Sidebar = HeroUI ListBox nav + Admin section + WorkspaceSwitcher at bottom. Topbar = breadcrumb + ⌘K trigger + bell + avatar dropdown. No mesh background.
  - `/projects-list`, `/library`, `/analytics`, `/agents`, `/people`, `/audit`, `/billing`, `/security`, `/settings` — all render with the new shell.
  - `/projects/<id>` — project nav appears in sidebar; AI sidebar appears on the right (glass-y inside, HeroUI Surface outside).
  - ⌘K opens command palette; navigate, close.
  - Avatar dropdown → Sign out → returns to /login.
  - Reduce viewport to 1100px / 900px — sidebar narrows responsively.

- [ ] **Step 8: Commit.**

  ```bash
  git add frontend/src/components/shell/AppShell.tsx frontend/src/components/shell/Sidebar.tsx frontend/src/main.tsx frontend/src/components/ProjectLayout.tsx
  git commit -m "$(cat <<'EOF'
  refactor(frontend): replace ProjectLayout with shell/AppShell

  - shell/AppShell.tsx (~150 lines) replaces ProjectLayout.tsx
    (858 lines). Same routes; same state (view, cmdOpen,
    aiCollapsed, sidebar projects); same view dispatch; ⌘K listener
    moves here. Outer grid uses Tailwind utilities, no MeshBackground.
  - main.tsx routes switch from ProjectLayout to AppShell.
  - shell/Sidebar.tsx updates its ProjectView/WsView import to the
    new AppShell.tsx location.
  - components/ProjectLayout.tsx deleted (its content distributed
    across shell/Sidebar.tsx, shell/Topbar.tsx, shell/CommandPalette.tsx,
    AiSidebar.tsx, and shell/AppShell.tsx in prior commits).

  Dead glass CSS classes (.app, .sidebar, .topbar, .main, .sb-*,
  .tb-*, .cmd-*, etc.) are not yet removed from index.css — Slice 7
  cleans up.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 9: Update e2e specs and final verification

**Files:**
- Modify: any `frontend/e2e/*.spec.ts` that match the Task 1 Step 3 grep.

- [ ] **Step 1: For each spec listed by the Task 1 Step 3 grep, update selectors.** Typical replacements:
  - `.sb-row[data-active="true"]` → `[role="option"][aria-selected="true"]` (ListBox items)
  - `.tb-btn` → `button[aria-label="Notifications"]` or similar role-based locator
  - `.crumb b` → role-based or visible text via Playwright's `getByText`
  - `.cmd-overlay` / `.cmd-panel` → `[role="dialog"][aria-modal="true"]`
  - `.glass` (used as wrapper assertion) → drop; assertion was probably about visual styling, not behavior

  Where no equivalent exists, switch the assertion to a more robust `getByRole(...)` / `getByText(...)` Playwright pattern.

  If the Task 1 Step 3 grep returned no matches, skip this task — no e2e changes needed.

- [ ] **Step 2: Run the full quality gate.**

  Run: `cd frontend && ./node_modules/.bin/tsc --noEmit && npm run test:run && ./node_modules/.bin/vite build`
  Expected: all three exit 0.

- [ ] **Step 3: Run Playwright e2e if the backend is available.**

  Run: `cd frontend && npm run test:e2e 2>&1 | tail -30`

  If the backend isn't running, this will fail with connection errors — that's environmental, not Slice 2's fault. Note the result and move on.

- [ ] **Step 4: Final manual smoke checklist** — walk the routes again:
  - All 10 workspace-view routes render in the new shell.
  - Project routes render with AI sidebar.
  - ⌘K palette works (open, search, navigate, close).
  - Dark mode toggle via `document.documentElement.setAttribute('data-theme', 'dark')` flips the shell to dark surfaces.
  - Brand name + logo from settings still display in the sidebar.

- [ ] **Step 5: Commit (only if e2e specs were touched).**

  ```bash
  git add frontend/e2e/
  git commit -m "$(cat <<'EOF'
  test(frontend): update e2e selectors for new HeroUI shell

  Slice 2 of the HeroUI v3 migration replaced glass-class selectors
  (.sb-row, .tb-btn, .crumb, .cmd-*) in the shell. Switching the e2e
  specs to role/aria-based locators that survive the visual change.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

- [ ] **Step 6: Update project memory.** Append to `~/.claude/projects/-Users-nicocardone-Desktop-DEV-PERSONALI-telaios/memory/project_heroui_v3_migration.md` under the Slice 1 entry, a parallel "Slice 2 landed 2026-06-07" note summarizing what shipped (shell decomposition, AI sidebar outer wrap, CommandPalette rewrite, MeshBackground dropped, ⌘K migrated to AppShell).

---

## Verification checklist (cumulative for the slice)

- [ ] `cd frontend && ./node_modules/.bin/tsc --noEmit` exits 0
- [ ] `cd frontend && npm run test:run` exits 0 (18/18 baseline tests still pass)
- [ ] `cd frontend && ./node_modules/.bin/vite build` exits 0
- [ ] `cd frontend && npm run test:e2e` exits 0 if backend is running
- [ ] Dev server `/` renders new HeroUI sidebar + topbar + AI sidebar (glass internals)
- [ ] All 10 workspace routes render
- [ ] `/projects/<id>` renders with project nav
- [ ] ⌘K palette opens, filters, navigates, closes
- [ ] No `<MeshBackground>` visible anywhere
- [ ] `ProjectLayout.tsx` and `components/CommandPalette.tsx` deleted; new files all under `components/shell/`
- [ ] Memory updated with Slice 2 completion note
