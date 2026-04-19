# Implementation Plan: Docker Resource Detail Panels + Volume File Browser

## Overview

Add right-side detail panels for all Docker sub-tabs (Containers, Images, Volumes,
Networks) and a volume file browser with download support. Backend adds inspect
endpoints for images, networks, and volumes, plus two volume file endpoints that use
ephemeral busybox containers to read volume contents.

## Architecture Decisions

- **Side-panel split layout** — consistent with existing `ResourceBrowser` + `ResourceDetailPanel` K8s pattern.
- **Temp containers for volume browsing** — works for both local (unix socket) and remote (TCP) Docker hosts.
- **Vertical slicing** — each task delivers one fully working resource type end-to-end (backend + frontend together).
- **Container inspect already wired** — `GET /:id/docker/containers/:containerId` exists; only the frontend panel is new for containers.

---

## Task List

### Phase 1: Backend — Inspect Endpoints

---

#### Task 1: Image + Network + Volume inspect endpoints (backend)

**Description:** Add `inspectImage`, `inspectNetwork`, and `inspectVolume` methods to
`DockerClient`, thin wrappers in `docker-actions.service`, handlers in
`docker.controller`, and routes in `environmentItem.route`.

**Acceptance criteria:**
- [ ] `GET /:id/docker/images/:imageId/inspect` returns full Dockerode image inspect JSON
- [ ] `GET /:id/docker/networks/:networkId/inspect` returns full Dockerode network inspect JSON
- [ ] `GET /:id/docker/volumes/:volumeName/inspect` returns full Dockerode volume inspect JSON
- [ ] All 3 return 404 when the resource does not exist
- [ ] Routes use `requireProjectAccess("viewer")`

**Verification:**
- [ ] `cd data-api && bun run build` passes (zero new TS errors)
- [ ] `cd data-api && bun run test` — docker.service tests for the 3 new methods pass

**Dependencies:** None

**Files touched:**
- `data-api/src/services/docker.service.ts`
- `data-api/src/services/docker-actions.service.ts`
- `data-api/src/controllers/docker.controller.ts`
- `data-api/src/routes/environmentItem.route.ts`
- `data-api/src/__tests__/unit/services/docker.service.test.ts`

**Estimated scope:** Medium

---

#### Task 2: Volume file listing + download endpoints (backend)

**Description:** Add `listVolumeFiles(cfg, volumeName, path)` and
`downloadVolumeFile(cfg, volumeName, filePath)` to `DockerClient`. Both spin up an
ephemeral `busybox` container with the volume mounted at `/vol`, run the operation,
then remove the container in a `finally` block.

`listVolumeFiles` runs `ls -la /vol/{path}`, parses the output into
`DockerVolumeFileEntry[]`, and returns JSON.

`downloadVolumeFile` uses `container.getArchive({ path: '/vol/{filePath}' })` and
pipes the tar stream to the HTTP response with `Content-Type: application/x-tar` and
a `Content-Disposition` header.

**Acceptance criteria:**
- [ ] `GET /:id/docker/volumes/:volumeName/files?path=/` returns a JSON array of `DockerVolumeFileEntry`
- [ ] `GET /:id/docker/volumes/:volumeName/files/download?path=/file.txt` responds with a tar stream download
- [ ] Temp container is always removed even if the operation fails
- [ ] Returns 400 if `path` query param is missing or unsafe (path traversal: `..`)
- [ ] Routes use `requireProjectAccess("viewer")`

**Verification:**
- [ ] `cd data-api && bun run build` passes
- [ ] `cd data-api && bun run test` — new unit tests for `listVolumeFiles` (mocked temp container lifecycle) pass

**Dependencies:** None (independent of Task 1)

**Files touched:**
- `data-api/src/services/docker.service.ts`
- `data-api/src/services/docker-actions.service.ts`
- `data-api/src/controllers/docker.controller.ts`
- `data-api/src/routes/environmentItem.route.ts`
- `data-api/src/__tests__/unit/services/docker.service.test.ts`
- `frontend/src/types/index.ts` (add `DockerVolumeFileEntry`)

**Estimated scope:** Medium–Large

---

### Checkpoint: After Phase 1

- [ ] `cd data-api && bun run build` — clean
- [ ] `cd data-api && bun run test` — 449 existing + new tests pass (1 pre-existing failure still ignored)

---

### Phase 2: Frontend — API client + shared panel shell

---

#### Task 3: Frontend API functions + types

**Description:** Add 5 new functions to `api.ts` and the `DockerVolumeFileEntry`
type to `types/index.ts`.

**New functions:**
- `inspectDockerImage(envId, imageId)` → `Promise<unknown>`
- `inspectDockerNetwork(envId, networkId)` → `Promise<unknown>`
- `inspectDockerVolume(envId, volumeName)` → `Promise<unknown>`
- `listDockerVolumeFiles(envId, volumeName, path)` → `Promise<DockerVolumeFileEntry[]>`
- `downloadDockerVolumeFile(envId, volumeName, path): void` — calls `window.open` or
  creates an `<a>` with the API URL so the browser handles the download natively.

**Acceptance criteria:**
- [ ] All 5 functions are exported from `api.ts`
- [ ] `DockerVolumeFileEntry` is exported from `types/index.ts`
- [ ] `cd frontend && bun run build` passes

**Dependencies:** Tasks 1 and 2 (endpoints must exist)

**Files touched:**
- `frontend/src/lib/api.ts`
- `frontend/src/types/index.ts`

**Estimated scope:** Small

---

### Phase 3: Frontend — Detail panels

#### Task 4: Container detail panel

**Description:** Create `DockerContainerDetail.tsx`. The list switches to a
left-table / right-panel split layout when a container is selected. The panel renders
structured sections from the raw `container.inspect()` response.

Sections: Summary, Command/Entrypoint, Environment Variables, Port Bindings, Mounts,
Network Settings, Raw JSON.

**Acceptance criteria:**
- [ ] Clicking a container row opens the detail panel on the right
- [ ] The table narrows to share space with the panel (flex layout)
- [ ] Clicking the selected row (or pressing Close) closes the panel
- [ ] Summary shows: id (12-char), name, image, state chip, created date
- [ ] "Env vars" section lists all env vars sorted alphabetically, collapsible
- [ ] "Port bindings" section shows host→container mappings
- [ ] "Mounts" section lists volume mounts
- [ ] "Raw JSON" section has Copy and toggle, collapsed by default
- [ ] `cd frontend && bun run build` passes

**Dependencies:** Task 3

**Files touched:**
- `frontend/src/components/environments/DockerContainerDetail.tsx` (NEW)
- `frontend/src/components/environments/DockerContainerList.tsx` (MODIFY: add selected state + panel)

**Estimated scope:** Medium

---

#### Task 5: Image detail panel

**Description:** Create `DockerImageDetail.tsx` using `inspectDockerImage`.

Sections: Summary, Entrypoint & Cmd, Environment Variables, Exposed Ports, Labels,
Layers, Raw JSON.

**Acceptance criteria:**
- [ ] Clicking an image row opens the detail panel
- [ ] Summary shows: id (12-char), tags, size (formatted), created date, OS, architecture
- [ ] Layers section shows count + digest list, collapsed by default
- [ ] `cd frontend && bun run build` passes

**Dependencies:** Task 3

**Files touched:**
- `frontend/src/components/environments/DockerImageDetail.tsx` (NEW)
- `frontend/src/components/environments/DockerImageList.tsx` (MODIFY)

**Estimated scope:** Medium

---

#### Task 6: Network detail panel

**Description:** Create `DockerNetworkDetail.tsx` using `inspectDockerNetwork`.

Sections: Summary, IPAM Config, Connected Containers, Options/Labels, Raw JSON.

**Acceptance criteria:**
- [ ] Clicking a network row opens the detail panel
- [ ] Summary shows: id (12-char), name, driver, scope, created date
- [ ] Connected containers section lists container names + IPv4 addresses
- [ ] `cd frontend && bun run build` passes

**Dependencies:** Task 3

**Files touched:**
- `frontend/src/components/environments/DockerNetworkDetail.tsx` (NEW)
- `frontend/src/components/environments/DockerNetworkList.tsx` (MODIFY)

**Estimated scope:** Medium

---

#### Task 7: Volume detail panel + file browser

**Description:** Create `DockerVolumeDetail.tsx` using `inspectDockerVolume` and
`listDockerVolumeFiles`. This is the most complex panel.

**Panel sections:**
1. **Summary** — name, driver, scope, mountpoint, created
2. **Labels** — collapsible if any
3. **File Browser** — breadcrumb + file table
4. **Raw JSON** — collapsible

**File browser behavior:**
- Starts at path `/`
- Shows a loading spinner while `listDockerVolumeFiles` is in flight
- Each row: icon (📁/📄), name, size (formatted), modified date, and a "Download" button for files
- Clicking a directory row navigates into it (updates path, re-fetches)
- Breadcrumb segments are clickable to navigate back up
- "Download" triggers `downloadDockerVolumeFile` (opens a download via `<a>` with auth header or token in URL; see note below)

**Note on download auth:** Since the download is a streaming response (not JSON), we
cannot use the axios interceptor. Instead, append the JWT token as a query param
`?token=<jwt>` and have the backend accept `?token=` as an alternative to the
`Authorization` header for this specific endpoint only. OR use a blob-fetching
approach: `axios.get(..., { responseType: 'blob' })` then `URL.createObjectURL`.

The blob approach is simpler and doesn't require backend changes. Use that.

**Acceptance criteria:**
- [ ] Clicking a volume row opens the detail panel
- [ ] File browser loads root directory on panel open
- [ ] Directories are navigable
- [ ] Breadcrumb reflects current path and allows navigation up
- [ ] Clicking Download on a file starts a browser download of a `.tar` file
- [ ] Error state shown if busybox container fails to start or volume is empty
- [ ] `cd frontend && bun run build` passes

**Dependencies:** Task 3

**Files touched:**
- `frontend/src/components/environments/DockerVolumeDetail.tsx` (NEW)
- `frontend/src/components/environments/DockerVolumeList.tsx` (MODIFY)

**Estimated scope:** Large

---

### Checkpoint: Final

- [ ] `cd data-api && bun run build` — clean
- [ ] `cd data-api && bun run test` — all expected tests pass
- [ ] `cd frontend && bun run build` — clean (zero TS errors)
- [ ] Manual: all 4 detail panels open and display data
- [ ] Manual: volume file browser navigates directories and downloads files

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `busybox` image not available on target Docker host | High | Catch error, show a clear UI message: "busybox image required for file browsing" |
| `ls -la` output parsing is brittle | Medium | Use a well-tested regex; fall back gracefully on parse failure |
| Large volumes with thousands of files | Medium | Client-side limit: only show first 500 entries; add a note |
| Temp container not cleaned up on crash | High | Always use `try/finally`; add a unique label (e.g., `swe-temp=true`) so orphans can be identified |
| File download streaming memory | Low | Use `container.getArchive()` piped directly — never buffer full file in memory |

---

## Implementation Order

```
Task 1 (backend inspect)
Task 2 (backend volume files)      ← can run in parallel with Task 1
          ↓
Task 3 (frontend types + API)
          ↓
Tasks 4, 5, 6, 7                   ← can run in parallel (independent panels)
```
