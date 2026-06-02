# TelaiOS Design Alignment Spec

_Generated: 2026-06-02_

## Overview

Align the TelaiOS frontend to the Agentic OS Platform design handoff (Claude Design export). The design specifies a three-level hierarchy with glassmorphism aesthetics, TEOS AI routing, and full backend wiring.

## Three-Level Hierarchy

```
Operator Portal  (/operator)        → platform super-user (no backend yet → stub)
Admin Console    (/ and /*)          → workspace governance (wired to existing admin APIs)
Project App      (/projects/:id)     → daily work inside a project (already mostly built)
```

The **workspace switcher** acts as the elevator between levels: it shows "Admin" (go to workspace governance) and a list of all projects. From the Admin Console, the same switcher lists projects to drop into.

## Gap Analysis

### Admin Console (workspace-level routes: /, /library, /analytics, /agents, /users, /settings)

| Section | Current | Design | Action |
|---------|---------|--------|--------|
| Overview | ❌ missing | Stats dashboard with at-a-glance, needs-attention cards, activity | **Add** WorkspaceOverview |
| Projects | ✅ grid cards | Table with slide-over drawer (manage members, transfer, archive) | **Enhance** WorkspaceProjects |
| People | ✅ basic list | Tabs (Active/Invited/Deactivated), user drawer with project assignment, invite modal | **Enhance** WorkspaceUsers → WorkspacePeople |
| Library | ✅ partial | MCP servers + Skills at global scope, same UX as project library | **Keep** + minor polish |
| Analytics | ✅ basic | Keep as-is | **Keep** |
| Appearance | ✅ in settings | Appearance controls at workspace scope (wired to AppSettings API) | **Keep** in WorkspaceSettings |
| Audit Log | ❌ missing | Timeline of who did what (stub - no backend API yet) | **Add** stub WorkspaceAuditLog |
| Billing | ❌ missing | Plan card + usage meters (stub) | **Add** stub WorkspaceBilling |
| Security | ❌ missing | SAML/SSO settings + session policy (stub) | **Add** stub WorkspaceSecurity |

### Navigation & UX

| Item | Current | Design | Action |
|------|---------|--------|--------|
| Breadcrumb | "Workspace / View" or "ProjectName / View" | "TelaiOS / Admin / Section" or "TelaiOS / ProjectName / View" | **Fix** breadcrumb format |
| Workspace switcher | Shows project list + no action on workspace name | Shows "Admin" (goes to /) + project list | **Enhance** switcher |
| Project nav label | "Navigation" or "Workspace" | Labeled with project name (e.g. "ATLAS") | **Fix** section label |
| Admin nav | 2 items (users, settings) | 8 items (overview, projects, people, library, analytics, appearance, audit log, billing/security) | **Add** missing nav items |

### Project App (/projects/:id)

Most views already exist. Minor gaps:
- Breadcrumb should include workspace name prefix
- Workspace switcher should show "Admin ↑" option

### Operator Portal (/operator)

No backend APIs for multi-tenancy. Implement as a self-contained frontend shell with:
- Separate route `/operator` with its own layout (no AI sidebar)
- Reads available data from existing APIs (projects list, users list, settings)
- Shows overview stats, workspace/tenant list, basic health indicators
- Dual-mode toggle (SaaS / On-prem labeling) - UI-only
- Accessed via a discreet link on the Login page

## Architecture

### File Changes

**New pages:**
- `src/pages/workspace/WorkspaceOverview.tsx` - Admin overview with stats, projects at a glance, needs attention, recent activity
- `src/pages/workspace/WorkspaceAuditLog.tsx` - Audit log timeline (stub, seeded data)
- `src/pages/workspace/WorkspaceBilling.tsx` - Plan card + usage meters (stub)
- `src/pages/workspace/WorkspaceSecurity.tsx` - SSO/SAML settings (stub)
- `src/pages/operator/OperatorLayout.tsx` - Operator portal shell
- `src/pages/operator/OperatorOverview.tsx` - Platform KPIs + incident strip
- `src/pages/operator/OperatorWorkspaces.tsx` - Tenant list + drill-in drawer
- `src/pages/operator/OperatorSystem.tsx` - Services health + nodes (on-prem)
- `src/pages/operator/OperatorAudit.tsx` - Cross-tenant audit log (stub)
- `src/pages/LoginOperator.tsx` - Staff-only sign-in page

**Modified pages:**
- `src/components/ProjectLayout.tsx` - Fix breadcrumb, workspace switcher, nav section label, add Admin nav items, add overview/audit/billing/security routes
- `src/pages/workspace/WorkspaceProjects.tsx` - Table view + slide-over drawer
- `src/pages/workspace/WorkspaceUsers.tsx` - Rename → WorkspacePeople, add tabs + drawer
- `src/main.tsx` - Add operator routes

**New routes:**
- `/ ` → WorkspaceOverview (was WorkspaceProjects)
- `/projects-list` → WorkspaceProjects (table view)
- `/people` → WorkspacePeople
- `/audit` → WorkspaceAuditLog
- `/billing` → WorkspaceBilling
- `/security` → WorkspaceSecurity
- `/operator` → OperatorLayout > OperatorOverview
- `/operator/workspaces` → OperatorWorkspaces
- `/operator/system` → OperatorSystem
- `/operator/audit` → OperatorAudit
- `/operator/login` → LoginOperator

## Design System

Keep the existing glassmorphism design system unchanged (CSS variables, glass classes, MeshBackground). All new pages use the same `.card`, `.pill-btn`, `.sb-row`, `.stat`, etc. primitives.

## Backend Wiring

| Section | API |
|---------|-----|
| Admin Overview stats | `getProjects()`, `listUsers()`, `getOrgAnalytics()` |
| Admin Projects table | `getProjects()`, `updateProject()`, `deleteProject()` |
| Admin People | `listUsers()`, `patchUser()`, `deleteUser()`, `createUser()`, `listProjectMembers()`, `addProjectMember()`, `removeProjectMember()` |
| Audit Log | Stub (no backend API) |
| Billing | `getSettings()` (brand info only); meter data is stub |
| Security | Stub |
| Operator Overview | `getProjects()`, `listUsers()`, `getSettings()` |
| Operator Workspaces | `getProjects()`, `listUsers()` |

## Error Handling

- All API calls wrapped in try/catch with toast notifications on failure
- Loading states for all async data
- Empty states with helpful CTAs

## Testing

- All existing E2E tests should continue to pass
- New pages are navigable and don't crash on load
