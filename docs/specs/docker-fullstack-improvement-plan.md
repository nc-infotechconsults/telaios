# Implementation Plan: Full-Stack Docker Management Improvement

## Overview

Wire the existing frontend Docker management UI to real backend endpoints and unify the Docker experience into a single tab. The work spans three phases: backend foundation (new DockerClient methods + service layer), backend routes (new controller + route registration), and frontend cleanup (tab merge + remove graceful fallback).

## Architecture Decisions

- **New `docker.controller.ts`** — Docker actions go in their own controller, not in the already-large `environment.controller.ts`. Routes are registered in `environmentItem.route.ts` (same file as other `/environments/:id/...` routes).
- **New `docker.service.ts` wrapper** — A thin service layer that loads+decrypts the environment, validates it is `type === "docker"`, and delegates to `DockerClient`. Mirrors how `environment.service.ts` already delegates for the existing resource endpoints.
- **Frontend paths are already correct** — All 12 Docker API functions in `api.ts` call `/environments/:envId/docker/...`. The backend will now implement exactly those paths. No frontend URL changes required.
- **Tab merge is a visibility change** — `EnvironmentDetail.tsx` line 150 currently shows "Resources" for ALL env types. Change it to `visible: environment.type === "kubernetes"` only. Docker environments already have a working "Docker" tab.

## Dependency Graph

```
DockerClient new methods (docker.service.ts)
        │
        ▼
Docker service wrapper (new docker.service layer in environment.service.ts or separate file)
        │
        ▼
Docker controller (new docker.controller.ts)
        │
        ▼
Route registration (environmentItem.route.ts)
        │
        ▼
Frontend tab merge (EnvironmentDetail.tsx)
        │
        ▼
Frontend fallback cleanup (Docker list components)
```

---

## Phase 1: Backend — DockerClient New Methods

### Task 1: Add container action and resource removal methods to DockerClient

**Description:** `docker.service.ts` already has `listContainers`, `getContainer`, `getContainerLogs`, `listImages`, `listNetworks`, `listVolumes`. Add the missing mutating methods: start, stop, restart, remove container; remove image; remove volume.

**Acceptance criteria:**
- [ ] `DockerClient.startContainer(cfg, id)` calls `docker.getContainer(id).start()`
- [ ] `DockerClient.stopContainer(cfg, id)` calls `docker.getContainer(id).stop()`
- [ ] `DockerClient.restartContainer(cfg, id)` calls `docker.getContainer(id).restart()`
- [ ] `DockerClient.removeContainer(cfg, id, force?)` calls `docker.getContainer(id).remove({ force })`
- [ ] `DockerClient.removeImage(cfg, id, force?)` calls `docker.getImage(id).remove({ force })`
- [ ] `DockerClient.removeVolume(cfg, name)` calls `docker.getVolume(name).remove()`
- [ ] All methods are typed with `Promise<void>` return (actions) or typed return (reads)
- [ ] Existing methods are unchanged

**Verification:**
- [ ] `cd data-api && bun run build` (or TypeScript check) passes

**Dependencies:** None

**Files touched:**
- `data-api/src/services/docker.service.ts`

**Estimated scope:** S (1 file)

---

## Phase 2: Backend — Service Layer

### Task 2: Create Docker service wrapper

**Description:** Create a `data-api/src/services/docker-actions.service.ts` that encapsulates the environment-lookup → decrypt → validate-type → delegate pattern for all Docker endpoints. This keeps `environment.service.ts` clean and mirrors its existing pattern.

Functions to expose:
- `listDockerContainers(envId)`
- `getDockerContainer(envId, containerId)`
- `getDockerContainerLogs(envId, containerId, tail?)`
- `startDockerContainer(envId, containerId)`
- `stopDockerContainer(envId, containerId)`
- `restartDockerContainer(envId, containerId)`
- `removeDockerContainer(envId, containerId, force?)`
- `listDockerImages(envId)`
- `removeDockerImage(envId, imageId, force?)`
- `listDockerVolumes(envId)`
- `removeDockerVolume(envId, volumeName)`
- `listDockerNetworks(envId)`

Each function:
1. Loads env via `envRepo().findOneBy({ id: envId })`
2. Throws/returns 404 if not found
3. Validates `env.type === "docker"` (throw 400 if not)
4. Parses and decrypts `connection_config` using the same `parseConnectionConfig` helper pattern from `environment.service.ts`
5. Delegates to `DockerClient`

**Acceptance criteria:**
- [ ] All 12 functions above are exported from `docker-actions.service.ts`
- [ ] Each function validates env exists and is `type === "docker"`
- [ ] Each function decrypts and parses `connection_config` before calling DockerClient
- [ ] TypeScript compiles without errors

**Verification:**
- [ ] `cd data-api && bun run build` passes

**Dependencies:** Task 1

**Files touched:**
- `data-api/src/services/docker-actions.service.ts` (new)

**Estimated scope:** M (1 new file, references existing patterns)

---

## Phase 3: Backend — Controller

### Task 3: Create Docker controller

**Description:** Create `data-api/src/controllers/docker.controller.ts` with one handler per endpoint. Each handler calls the corresponding service function, handles 404/400/500 responses, and follows the same pattern as `environment.controller.ts`.

Handlers:
- `listContainers` → `GET /:id/docker/containers` → 200 JSON array
- `getContainer` → `GET /:id/docker/containers/:containerId` → 200 JSON or 404
- `getContainerLogs` → `GET /:id/docker/containers/:containerId/logs` → 200 text/plain
- `startContainer` → `POST /:id/docker/containers/:containerId/start` → 204
- `stopContainer` → `POST /:id/docker/containers/:containerId/stop` → 204
- `restartContainer` → `POST /:id/docker/containers/:containerId/restart` → 204
- `removeContainer` → `DELETE /:id/docker/containers/:containerId` → 204
- `listImages` → `GET /:id/docker/images` → 200 JSON array
- `removeImage` → `DELETE /:id/docker/images/:imageId` → 204
- `listVolumes` → `GET /:id/docker/volumes` → 200 JSON array
- `removeVolume` → `DELETE /:id/docker/volumes/:volumeName` → 204
- `listNetworks` → `GET /:id/docker/networks` → 200 JSON array

Error handling: catch errors from service layer and return `500` with `{ error: message }`.

**Acceptance criteria:**
- [ ] All 12 handlers exist and are exported
- [ ] Action endpoints (start/stop/restart/remove) return 204
- [ ] Read endpoints return 200 with typed data
- [ ] Errors are caught and return 500
- [ ] TypeScript compiles without errors

**Verification:**
- [ ] `cd data-api && bun run build` passes

**Dependencies:** Task 2

**Files touched:**
- `data-api/src/controllers/docker.controller.ts` (new)

**Estimated scope:** M (1 new file, ~80 lines)

---

## Phase 4: Backend — Routes

### Task 4: Register Docker routes in environmentItem.route.ts

**Description:** Add the Docker routes to the existing `environmentItem.route.ts` file, importing from the new `docker.controller.ts`. Use the same `requireProjectAccess` middleware already in use:
- Read operations: `"viewer"`
- Mutating actions (start/stop/restart/remove image/volume/container): `"editor"`

**Acceptance criteria:**
- [ ] All 12 routes are registered under the `/environments/:id/docker/...` path prefix
- [ ] Access control levels are correct (viewer for reads, editor for mutations)
- [ ] `bun run data:dev` starts without errors
- [ ] `GET /environments/:id/docker/containers` returns data (manual test with curl or browser)

**Verification:**
- [ ] `cd data-api && bun run build` passes
- [ ] `curl http://localhost:<port>/environments/<id>/docker/containers` returns JSON (with a real Docker env)

**Dependencies:** Task 3

**Files touched:**
- `data-api/src/routes/environmentItem.route.ts`

**Estimated scope:** S (1 file, ~15 lines added)

---

### Checkpoint: Backend Complete

- [ ] `cd data-api && bun run build` passes
- [ ] All 12 Docker endpoints respond correctly
- [ ] Kubernetes environment routes still work (no regression)

---

## Phase 5: Frontend — Tab Merge

### Task 5: Hide Resources tab for Docker environments

**Description:** In `EnvironmentDetail.tsx`, change the "Resources" tab visibility from `true` to `environment.type === "kubernetes"`. This means Docker environments only see: Overview, Docker. Kubernetes environments see: Overview, Resources, Helm Releases. Also update the overflow CSS wrapper (line 217) to treat the `"docker"` tab the same as `"resources"` (i.e., `overflow-hidden` to allow the full-height Docker dashboard layout).

**Acceptance criteria:**
- [ ] Docker environments show tabs: Overview, Docker
- [ ] Kubernetes environments show tabs: Overview, Resources, Helm Releases
- [ ] The Docker tab renders `DockerDashboard` correctly with full height
- [ ] No TypeScript errors

**Verification:**
- [ ] `cd frontend && bun run build` passes
- [ ] Manual: Navigate to a Docker environment — Resources tab is gone, Docker tab is visible
- [ ] Manual: Navigate to a Kubernetes environment — Resources and Helm tabs are visible, Docker tab is gone

**Dependencies:** Task 4 (backend must be live for Docker tab to show data)

**Files touched:**
- `frontend/src/pages/EnvironmentDetail.tsx`

**Estimated scope:** S (1 file, ~5 lines changed)

---

## Phase 6: Frontend — Remove API Unavailable Fallbacks

### Task 6: Remove graceful "API unavailable" fallback from Docker list components

**Description:** All four Docker list components (`DockerContainerList`, `DockerImageList`, `DockerVolumeList`, `DockerNetworkList`) have an `apiUnavailable` state that shows a "Docker API unavailable" placeholder instead of an error toast. Now that the backend exists, replace this with standard error handling: show a toast on failure and keep the empty table state. Remove `apiUnavailable` state, the `setApiUnavailable(true)` branch, and the conditional render that returns the unavailable UI.

**Acceptance criteria:**
- [ ] `apiUnavailable` state removed from all 4 components
- [ ] Failed API calls show a toast error instead of the fallback UI
- [ ] Components still handle the loading state correctly
- [ ] No TypeScript errors

**Verification:**
- [ ] `cd frontend && bun run build` passes
- [ ] Manual: With backend running, Docker tab loads containers/images/volumes/networks

**Dependencies:** Task 5

**Files touched:**
- `frontend/src/components/environments/DockerContainerList.tsx`
- `frontend/src/components/environments/DockerImageList.tsx`
- `frontend/src/components/environments/DockerVolumeList.tsx`
- `frontend/src/components/environments/DockerNetworkList.tsx`

**Estimated scope:** M (4 files, ~15 lines removed per file)

---

### Checkpoint: Frontend Complete

- [ ] `cd frontend && bun run build` passes with no errors
- [ ] Docker environments: single Docker tab with working Containers/Images/Volumes/Networks sub-tabs
- [ ] Kubernetes environments: unchanged behavior

---

## Phase 7: Tests

### Task 7: Add backend unit tests for new DockerClient methods

**Description:** Add Jest unit tests for the 6 new DockerClient methods (startContainer, stopContainer, restartContainer, removeContainer, removeImage, removeVolume). Mock Dockerode. Validate the correct Dockerode methods are called with the right arguments.

**Acceptance criteria:**
- [ ] Unit tests for all 6 new DockerClient methods
- [ ] Tests mock Dockerode (no real Docker connection required)
- [ ] All tests pass

**Verification:**
- [ ] `cd data-api && bun run test` passes

**Dependencies:** Task 1

**Files touched:**
- `data-api/src/services/docker.service.test.ts` (new or extend existing)

**Estimated scope:** M (1 test file)

---

### Final Checkpoint

- [ ] `cd data-api && bun run test` passes
- [ ] `cd frontend && bun run build` passes
- [ ] All success criteria from the spec are met

---

## Task Order Summary

| # | Task | Phase | Depends on | Size |
|---|------|-------|-----------|------|
| 1 | Add DockerClient mutating methods | Backend | — | S |
| 2 | Create docker-actions.service.ts | Backend | 1 | M |
| 3 | Create docker.controller.ts | Backend | 2 | M |
| 4 | Register Docker routes | Backend | 3 | S |
| 5 | Hide Resources tab for Docker envs | Frontend | 4 | S |
| 6 | Remove API unavailable fallbacks | Frontend | 5 | M |
| 7 | Unit tests for new DockerClient methods | Tests | 1 | M |

Task 7 can run in parallel with Tasks 2–6 since it only depends on Task 1.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Dockerode type definitions missing for `.start()`, `.stop()`, etc. | Low | Dockerode types are in `@types/dockerode` — already a dev dependency |
| `parseConnectionConfig` helper is private to `environment.service.ts` | Low | Copy the 8-line helper into `docker-actions.service.ts` (it's a pure utility) |
| Container remove while running | Low | Pass `force: true` from frontend by default, or expose as query param |
| Frontend build fails due to removed `apiUnavailable` state | Low | Run `bun run build` after each component edit |
