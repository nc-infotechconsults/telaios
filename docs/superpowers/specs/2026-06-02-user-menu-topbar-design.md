# User Menu & Topbar Redesign

**Date:** 2026-06-02  
**Status:** Approved

## Goal

Move user identity and user actions (theme toggle, logout) out of the sidebar bottom row and into a topbar dropdown. Relocate the workspace chip from the top of the sidebar to the bottom.

## Changes

### 1. Topbar — user identity button

**Files:** `frontend/src/components/ProjectLayout.tsx`, `frontend/src/pages/operator/OperatorLayout.tsx`

Replace the static `<div className="tb-avatar">` in both layouts with a clickable button showing:

```
[avatar initials circle] [Full Name] [role] [▾]
```

- Avatar: 22px circle, gradient `#0a84ff → #5e5ce6` (ProjectLayout) / `#ff9f0a → #ff375f` (OperatorLayout), initials from `display_name`
- Name: `user.display_name`
- Role: `user.system_role` (e.g. "admin")
- Chevron: indicates interactivity

New state: `userMenuOpen: boolean` in each layout component.

#### Dropdown panel

Positioned `absolute`, `right: 0`, `top: calc(100% + 6px)`. Uses existing `glass` + `hairline` styling. Closed by a `vis-backdrop` div on outside click.

Contents (top to bottom):

| Section | Content |
|---|---|
| Header | 36px avatar + `display_name` bold + `email` secondary |
| Account settings | Icon + label, navigates to `/settings` |
| Divider | `hairline` border |
| Theme | "Theme" label + Light / Dark segmented toggle (calls `toggleTheme`) |
| Divider | `hairline` border |
| Log out | Icon + "Log out", red (`#ff375f`), calls `logout()` |

#### Wrapper element

Wrap the button + dropdown in a `div style={{ position: "relative" }}` so the dropdown positions relative to the button.

---

### 2. Sidebar — workspace chip relocated to bottom

**Files:** `frontend/src/components/ProjectLayout.tsx`

The `position: relative` wrapper containing the `workspace-switch` button and `switcherOpen` dropdown currently sits right below the brand row. Move it to the bottom of the sidebar, after the bottom nav items (inbox / members / settings), in the same slot previously occupied by the user row.

**Behavior is unchanged:** same button markup, same `setSwitcherOpen` toggle, same dropdown listing Admin Console + project list.

---

### 3. Sidebar — user row removed

**Files:** `frontend/src/components/ProjectLayout.tsx`, `frontend/src/pages/operator/OperatorLayout.tsx`

Delete the `div` at the bottom of each sidebar that contains:
- Avatar circle
- `display_name` / `email` text
- Theme toggle button (emoji)
- Logout arrow button

All of these actions are now in the topbar dropdown.

---

## Scope

- **Touched files:** `ProjectLayout.tsx`, `OperatorLayout.tsx`
- **New files:** none
- **New components:** none — all changes are inline additions to existing layout components
- **No routing changes** — "Account settings" links to existing `/settings`
- **No context changes** — `AuthContext` and `ThemeContext` are already available in both layouts

## Out of scope

- A dedicated "My Account" / user profile page
- Avatar image upload (initials only)
- Notification bell changes
