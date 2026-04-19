# Implementation Plan: Environment & Docker Management Redesign

## Overview

Transform the environment management from an inline accordion within ProjectDetail into a dedicated sub-page with structured resource views and a full Docker dashboard. The work is organized in 4 phases with 12 tasks.

## Architecture Decisions

1. **New route `/projects/:projectId/environments/:envId`** — Added to `main.tsx` inside the existing protected Layout route
2. **Master-detail layout** — Table on left (60%), detail panel on right (40%) using flex layout, not a split-pane library
3. **Docker API calls are optimistic** — We add the frontend API functions now; if the backend doesn't support them yet, the UI will show error toasts gracefully
4. **Resource detail sections are data-driven** — A single `ResourceDetailPanel` component inspects the raw API response and renders available sections dynamically (no hardcoded assumptions about which fields exist)

## Task List

### Phase 1: Foundation (Types, API, Route, Page Shell)

- [ ] Task 1: Add Docker types and API functions
- [ ] Task 2: Add route and create EnvironmentDetail page shell
- [ ] Task 3: Wire EnvironmentTab row click to navigate to detail page

### Checkpoint: Foundation
- [ ] `bun run frontend:build` passes
- [ ] Clicking an environment row navigates to `/projects/:projectId/environments/:envId`
- [ ] Back button returns to project environments tab

### Phase 2: Resource Browser Rewrite + Detail Panel

- [ ] Task 4: Rewrite ResourceBrowser with HeroUI Table
- [ ] Task 5: Build ResourceDetailPanel with structured sections
- [ ] Task 6: Integrate master-detail layout in EnvironmentDetail Resources tab

### Checkpoint: K8s Resources
- [ ] K8s resource list shows in a table
- [ ] Clicking a resource shows structured detail (not JSON)
- [ ] Pod logs still work

### Phase 3: Docker Dashboard

- [ ] Task 7: Build DockerContainerList with actions
- [ ] Task 8: Build DockerImageList, DockerVolumeList, DockerNetworkList
- [ ] Task 9: Build DockerDashboard shell with sub-tabs, integrate into EnvironmentDetail

### Checkpoint: Docker Dashboard
- [ ] Docker environments show Containers/Images/Volumes/Networks tabs
- [ ] Container actions (start/stop/restart/remove/logs) trigger API calls
- [ ] Build passes

### Phase 4: Overview Tab + Polish

- [ ] Task 10: Build Overview tab for EnvironmentDetail
- [ ] Task 11: Upgrade HelmReleasesPanel to use Table
- [ ] Task 12: Polish create/edit modals with stepper sections + final cleanup

### Checkpoint: Complete
- [ ] All 10 success criteria from spec met
- [ ] Build passes
- [ ] No raw JSON anywhere

---

## Detailed Tasks

### Task 1: Add Docker types and API functions
**Description:** Add Docker resource types to `types/index.ts` and Docker API functions to `lib/api.ts`.
**Acceptance criteria:**
- [ ] `DockerContainer`, `DockerImage`, `DockerVolume`, `DockerNetwork` types exist
- [ ] All Docker API functions from spec exist in `lib/api.ts`
- [ ] Build passes
**Verification:** `bun run frontend:build`
**Dependencies:** None
**Files:** `types/index.ts`, `lib/api.ts`
**Scope:** S

### Task 2: Add route and create EnvironmentDetail page shell
**Description:** Create a new `EnvironmentDetail.tsx` page with header (back nav, env name, status, actions) and tab bar (Overview, Resources, Helm, Docker). Add route to `main.tsx`.
**Acceptance criteria:**
- [ ] Route `/projects/:projectId/environments/:envId` renders the page
- [ ] Page fetches environment by ID and shows name, type, status
- [ ] Tab bar renders with correct tabs (Docker tab only for docker type)
- [ ] Back button navigates to `/projects/:projectId` with environments tab active
**Verification:** `bun run frontend:build` + manual nav test
**Dependencies:** Task 1
**Files:** `pages/EnvironmentDetail.tsx`, `main.tsx`
**Scope:** M

### Task 3: Wire EnvironmentTab row click to navigate
**Description:** Modify `EnvironmentTab.tsx` so clicking an environment row navigates to the detail page instead of expanding inline. Remove the inline expansion code.
**Acceptance criteria:**
- [ ] Click on env row navigates to `/projects/:projectId/environments/:envId`
- [ ] Inline expansion code removed
- [ ] Create/edit/delete modals still work from the list
**Verification:** `bun run frontend:build` + manual test
**Dependencies:** Task 2
**Files:** `components/environments/EnvironmentTab.tsx`
**Scope:** S

### Task 4: Rewrite ResourceBrowser with HeroUI Table
**Description:** Replace the card-list resource browser with a HeroUI `Table`. Keep kind/namespace selectors. Remove the inline JSON detail panel (that moves to Task 5).
**Acceptance criteria:**
- [ ] Resources render in `Table` with columns: Name, Namespace, Status, Age, Actions
- [ ] Kind and namespace selectors work
- [ ] Refresh button works
- [ ] Row click calls `onSelect(resource)` callback (for parent to handle detail)
- [ ] Pod "Logs" button still opens PodLogViewer
**Verification:** `bun run frontend:build`
**Dependencies:** None (can be done in parallel with Task 2-3)
**Files:** `components/environments/ResourceBrowser.tsx`
**Scope:** M

### Task 5: Build ResourceDetailPanel with structured sections
**Description:** Create `ResourceDetailPanel.tsx` that receives raw resource detail (the API response) and renders structured collapsible sections: Metadata, Labels, Annotations, Containers, Conditions, Volumes, Spec summary, and a collapsible Raw JSON/YAML view.
**Acceptance criteria:**
- [ ] Metadata section shows name, namespace, uid, creationTimestamp
- [ ] Labels and annotations render as key-value tables
- [ ] Containers section shows name, image, status, ports, restartCount (if present)
- [ ] Conditions table shows type, status, reason, message (if present)
- [ ] Raw section is collapsible with copy button
- [ ] Missing sections are not rendered (data-driven)
- [ ] Close button dismisses the panel
**Verification:** `bun run frontend:build`
**Dependencies:** None
**Files:** `components/environments/ResourceDetailPanel.tsx`
**Scope:** M

### Task 6: Integrate master-detail in EnvironmentDetail Resources tab
**Description:** Wire ResourceBrowser and ResourceDetailPanel together in the Resources tab of EnvironmentDetail. Left panel (60%) shows the table, right panel (40%) shows detail when a resource is selected.
**Acceptance criteria:**
- [ ] Split layout renders correctly
- [ ] Selecting a resource loads detail via API and shows in right panel
- [ ] Closing detail panel expands table to full width
- [ ] Works for all K8s resource kinds
**Verification:** `bun run frontend:build` + manual test
**Dependencies:** Tasks 2, 4, 5
**Files:** `pages/EnvironmentDetail.tsx`
**Scope:** S

### Task 7: Build DockerContainerList with actions
**Description:** Create `DockerContainerList.tsx` with a HeroUI Table showing containers. Each row has action buttons: Start, Stop, Restart, Remove, Logs.
**Acceptance criteria:**
- [ ] Table with columns: Name, Image, Status, Ports, Actions
- [ ] Status chip with correct colors (running=green, exited=default, paused=warning)
- [ ] Action buttons call corresponding API functions
- [ ] Logs button opens PodLogViewer (reused) with container logs
- [ ] Remove shows confirmation modal
- [ ] Loading and empty states handled
**Verification:** `bun run frontend:build`
**Dependencies:** Task 1
**Files:** `components/environments/DockerContainerList.tsx`
**Scope:** M

### Task 8: Build DockerImageList, DockerVolumeList, DockerNetworkList
**Description:** Three table components for Docker images, volumes, and networks.
**Acceptance criteria:**
- [ ] DockerImageList: Table with Tag, Size, Created, Actions (Remove)
- [ ] DockerVolumeList: Table with Name, Driver, Mountpoint, Created
- [ ] DockerNetworkList: Table with Name, Driver, Scope, Containers count
- [ ] Each has loading/empty states
- [ ] Remove actions have confirmation modals
**Verification:** `bun run frontend:build`
**Dependencies:** Task 1
**Files:** `DockerImageList.tsx`, `DockerVolumeList.tsx`, `DockerNetworkList.tsx`
**Scope:** M

### Task 9: Build DockerDashboard and integrate into EnvironmentDetail
**Description:** Create `DockerDashboard.tsx` with sub-tabs (Containers, Images, Volumes, Networks) rendering the corresponding list components. Wire it into the Docker tab of EnvironmentDetail.
**Acceptance criteria:**
- [ ] Sub-tab bar switches between 4 views
- [ ] Docker tab only visible when `environment.type === "docker"`
- [ ] Each sub-tab renders correctly
**Verification:** `bun run frontend:build`
**Dependencies:** Tasks 7, 8, 2
**Files:** `DockerDashboard.tsx`, `pages/EnvironmentDetail.tsx`
**Scope:** S

### Task 10: Build Overview tab
**Description:** Create the Overview tab content for EnvironmentDetail showing connection info card, resource summary counts, and quick action buttons.
**Acceptance criteria:**
- [ ] Shows environment type, status, namespace, created date
- [ ] Test connection button works
- [ ] For K8s: shows counts of pods, services, deployments (fetched on load)
- [ ] For Docker: shows counts of containers (running/total), images, volumes
- [ ] Quick action: Edit, Delete with confirmation
**Verification:** `bun run frontend:build`
**Dependencies:** Tasks 1, 2
**Files:** `pages/EnvironmentDetail.tsx` (or extracted component)
**Scope:** M

### Task 11: Upgrade HelmReleasesPanel to Table
**Description:** Replace the card-list in HelmReleasesPanel with HeroUI Table for consistency.
**Acceptance criteria:**
- [ ] Table with columns: Name, Chart, Version, Namespace, Status, Deployed, Actions
- [ ] Install and uninstall flows unchanged
- [ ] Refresh works
**Verification:** `bun run frontend:build`
**Dependencies:** None
**Files:** `components/environments/HelmReleasesPanel.tsx`
**Scope:** S

### Task 12: Polish create/edit modals + final cleanup
**Description:** Add section headers and visual grouping to create/edit modals. Remove dead code from old inline expansion. Final build verification.
**Acceptance criteria:**
- [ ] Create modal has clear section dividers (General, Connection)
- [ ] Edit modal matches create structure
- [ ] No unused imports or dead code from old inline expansion
- [ ] All files pass build
**Verification:** `bun run frontend:build`
**Dependencies:** All previous tasks
**Files:** `EnvironmentCreateModal.tsx`, `EnvironmentEditModal.tsx`, cleanup across files
**Scope:** S

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Backend doesn't support Docker endpoints | High | API functions return errors gracefully; UI shows toast. Add TODO comments for backend team. |
| Resource detail API returns inconsistent shapes | Med | Detail panel is fully data-driven — renders sections only if keys exist |
| Large resource lists slow table rendering | Low | HeroUI Table handles virtualization; add pagination if needed later |

## Parallelization

Tasks that can be done in parallel:
- Tasks 4, 5 (ResourceBrowser rewrite + ResourceDetailPanel) — independent components
- Tasks 7, 8 (Docker containers + Docker images/volumes/networks) — independent components  
- Task 11 (Helm table upgrade) — independent of everything
