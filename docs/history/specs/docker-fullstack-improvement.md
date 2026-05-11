# Spec: Full-Stack Docker Management Improvement

## Objective

Wire the existing frontend Docker management UI to real backend endpoints and unify the Docker experience into a single tab.

**Problem:** The frontend has 12 Docker API functions calling `/environments/:envId/docker/...` endpoints that don't exist in the backend. Meanwhile, Docker containers are partially accessible via the generic `/environments/:id/resources` endpoint (shared with Kubernetes). This results in two broken/incomplete tabs ("Resources" and "Docker") for Docker environments.

**What we're building:**
1. New backend endpoints for Docker images, volumes, networks, and container actions (start/stop/restart/remove)
2. Update frontend API layer to match the actual backend endpoint paths
3. Merge the "Resources" and "Docker" tabs into a unified "Docker" tab for Docker environments

**Target users:** DevOps engineers managing Docker hosts from the SWE AI platform.

**What success looks like:** A user with a Docker environment sees a single "Docker" tab with sub-tabs (Containers, Images, Volumes, Networks) — all powered by real, working backend endpoints. Container actions (start/stop/restart/remove) work. Image and volume removal works.

## Tech Stack

- **Backend:** Bun + Express + TypeORM + Zod + PostgreSQL, Dockerode
- **Frontend:** React 18.3 + TypeScript 5.9 + HeroUI v2.6 + Tailwind CSS v4.2 + react-router-dom v6.26 + Vite 5.4

## Commands

```
Backend dev:     bun run data:dev
Frontend dev:    bun run frontend:dev
Frontend build:  cd frontend && bun run build
Backend test:    cd data-api && bun run test
```

## Scope

### Backend — New Endpoints (on `environmentItem.route.ts`)

All endpoints are scoped to `/environments/:id/` and guarded by `requireProjectAccess`. The controller validates `env.type === "docker"` before proceeding.

| Method | Path | Action | DockerClient method |
|--------|------|--------|-------------------|
| GET | `/:id/docker/containers` | List containers | `listContainers()` (existing) |
| GET | `/:id/docker/containers/:containerId` | Inspect container | `getContainer()` (existing) |
| GET | `/:id/docker/containers/:containerId/logs` | Get logs | `getContainerLogs()` (existing) |
| POST | `/:id/docker/containers/:containerId/start` | Start container | **NEW** |
| POST | `/:id/docker/containers/:containerId/stop` | Stop container | **NEW** |
| POST | `/:id/docker/containers/:containerId/restart` | Restart container | **NEW** |
| DELETE | `/:id/docker/containers/:containerId` | Remove container | **NEW** |
| GET | `/:id/docker/images` | List images | `listImages()` (existing, unwired) |
| DELETE | `/:id/docker/images/:imageId` | Remove image | **NEW** |
| GET | `/:id/docker/volumes` | List volumes | `listVolumes()` (existing, unwired) |
| DELETE | `/:id/docker/volumes/:volumeName` | Remove volume | **NEW** |
| GET | `/:id/docker/networks` | List networks | `listNetworks()` (existing, unwired) |

**Note:** The existing `/environments/:id/resources` endpoints remain unchanged for backward compatibility (used by Kubernetes environments).

### Backend — New DockerClient Methods

Add to `docker.service.ts`:
- `startContainer(cfg, id)` — `docker.getContainer(id).start()`
- `stopContainer(cfg, id)` — `docker.getContainer(id).stop()`
- `restartContainer(cfg, id)` — `docker.getContainer(id).restart()`
- `removeContainer(cfg, id, force?)` — `docker.getContainer(id).remove({ force })`
- `removeImage(cfg, id, force?)` — `docker.getImage(id).remove({ force })`
- `removeVolume(cfg, name)` — `docker.getVolume(name).remove()`

### Backend — Controller & Service Layer

- Add `docker.controller.ts` with handler functions for each endpoint above
- Add `docker.service.ts` wrapper (or extend `environment.service.ts`) that:
  1. Loads the environment by ID
  2. Validates `env.type === "docker"`
  3. Decrypts `connection_config`
  4. Delegates to `DockerClient`

### Frontend — API Layer Updates (`api.ts`)

The 12 existing Docker API functions already use the `/environments/:envId/docker/...` path pattern — this now **matches** the new backend endpoints. No path changes needed. Only verify response types match.

### Frontend — Tab Merge

For Docker environments in `EnvironmentDetail.tsx`:
- Remove the separate "Resources" tab
- Keep the "Docker" tab as the primary resource management tab
- Docker tab contains sub-tabs: Containers, Images, Volumes, Networks (already implemented in `DockerDashboard.tsx`)

For Kubernetes environments: no changes — "Resources" tab remains as-is.

### Frontend — Remove Graceful Fallback

The "API unavailable" fallback UI (added in bug fix #3) can be removed once the backend endpoints exist. Replace with standard error handling (toast on failure).

## Code Style

Follow existing patterns. Backend example from `environment.controller.ts`:

```typescript
export async function listDockerContainers(req: Request, res: Response) {
  const containers = await dockerService.listContainers(req.params.id);
  res.json(containers);
}
```

Frontend follows existing `api.ts` pattern — one-liner axios wrappers returning typed promises.

## Testing Strategy

- **Backend:** Jest unit tests for new DockerClient methods (mock Dockerode). Integration tests for new endpoints.
- **Frontend:** Build must pass (`cd frontend && bun run build`). Manual verification of Docker tab with a real Docker environment.

## Boundaries

- **Always:** Validate `env.type === "docker"` before calling DockerClient. Use `requireProjectAccess` on all routes.
- **Ask first:** Adding new dependencies, changing entity schema.
- **Never:** Expose raw Docker socket errors to the client. Allow container actions without project access checks.

## Success Criteria

1. All 12 frontend Docker API functions hit working backend endpoints and return correct data
2. Container start/stop/restart/remove actions work end-to-end
3. Image list + remove works end-to-end
4. Volume list + remove works end-to-end
5. Network list works end-to-end
6. Docker environments show a single unified "Docker" tab (no separate "Resources" tab)
7. Kubernetes environments are unaffected
8. `cd frontend && bun run build` passes
9. `cd data-api && bun run test` passes (new tests included)

## Open Questions

None — assumptions were validated by the user.

## Files to Modify/Create

### Backend (data-api)
- `data-api/src/services/docker.service.ts` — Add start/stop/restart/remove methods
- `data-api/src/controllers/docker.controller.ts` — **NEW** Docker-specific controller
- `data-api/src/routes/environmentItem.route.ts` — Add Docker routes
- `data-api/src/services/environment.service.ts` — May need helper to load+decrypt env config

### Frontend
- `frontend/src/lib/api.ts` — Verify paths match (should already match)
- `frontend/src/pages/EnvironmentDetail.tsx` — Merge tabs (hide Resources for Docker, show Docker as primary)
- `frontend/src/components/environments/DockerContainerList.tsx` — Remove "API unavailable" fallback
- `frontend/src/components/environments/DockerImageList.tsx` — Remove "API unavailable" fallback
- `frontend/src/components/environments/DockerVolumeList.tsx` — Remove "API unavailable" fallback
- `frontend/src/components/environments/DockerNetworkList.tsx` — Remove "API unavailable" fallback
