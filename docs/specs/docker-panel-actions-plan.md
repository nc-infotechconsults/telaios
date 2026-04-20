# Plan: Docker Panel — Extended Actions

Spec: `docs/specs/docker-panel-actions.md`

---

## Phase 1 — HTTP Actions (11 new endpoints + modals)

### Task 1 — Backend: 11 new routes + DockerClient methods + controller handlers

**Files touched:**
- `data-api/src/services/docker.service.ts` — 10 new DockerClient methods
- `data-api/src/services/docker-actions.service.ts` — 11 new thin wrappers
- `data-api/src/controllers/docker.controller.ts` — 11 new handlers
- `data-api/src/routes/environmentItem.route.ts` — 11 new routes

**New DockerClient methods:**
1. `createContainer(cfg, opts)` → `{ id: string }` — create + optionally start
2. `execContainer(cfg, id, cmd, workDir, user, timeoutMs)` → `{ stdout: string; stderr: string; exitCode: number }`
3. `containerStats(cfg, id)` → `DockerContainerStats` (one-shot, non-streaming)
4. `pullImage(cfg, image, auth?)` → `void` (waits for completion)
5. `tagImage(cfg, imageId, repo, tag)` → `void`
6. `pruneImages(cfg)` → `{ removed: number; reclaimedBytes: number }`
7. `createVolume(cfg, name, driver, driverOpts)` → `{ name: string }`
8. `pruneVolumes(cfg)` → `{ removed: number }`
9. `createNetwork(cfg, opts)` → `{ id: string }`
10. `removeNetwork(cfg, id)` → `void`
11. `pruneNetworks(cfg)` → `{ removed: number }`

**New routes:**
```
POST   /:id/docker/containers                         editor  createContainer
POST   /:id/docker/containers/:containerId/exec       editor  execContainer
GET    /:id/docker/containers/:containerId/stats      viewer  containerStats
POST   /:id/docker/images/pull                        editor  pullImage
POST   /:id/docker/images/:imageId/tag                editor  tagImage
POST   /:id/docker/images/prune                       editor  pruneImages
POST   /:id/docker/volumes                            editor  createVolume
POST   /:id/docker/volumes/prune                      editor  pruneVolumes
POST   /:id/docker/networks                           editor  createNetwork
DELETE /:id/docker/networks/:networkId                editor  removeNetwork
POST   /:id/docker/networks/prune                     editor  pruneNetworks
```

**Acceptance:** `cd data-api && bun run build` passes (excluding 4 pre-existing errors)
**Verify:** `cd data-api && bun run test` — no new failures

---

### Task 2 — Frontend: types + API functions

**Files touched:**
- `frontend/src/types/index.ts` — add `DockerContainerStats`, `DockerExecResult`
- `frontend/src/lib/api.ts` — 11 new API functions

**New types:**
```typescript
interface DockerContainerStats {
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  netRx: number;
  netTx: number;
  blockRead: number;
  blockWrite: number;
  pids: number;
}

interface DockerExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
```

**Acceptance:** `cd frontend && bun run build` passes

---

### Task 3 — Container modals: Create, Exec, Stats

**Files touched:**
- `frontend/src/components/environments/DockerCreateContainerModal.tsx` — NEW
- `frontend/src/components/environments/DockerExecModal.tsx` — NEW
- `frontend/src/components/environments/DockerStatsModal.tsx` — NEW
- `frontend/src/components/environments/DockerContainerList.tsx` — add "Create" button in header
- `frontend/src/components/environments/DockerContainerDetail.tsx` — add "Exec" + "Stats" buttons

**Create container modal fields:**
Image (text), Name (text), Command (text), Env vars (k-v list), Port mappings (list),
Volume mounts (list), Network (select), Auto-remove (checkbox), Start immediately (checkbox, default on)

**Exec modal fields:**
Command (text, required), Working dir (text), User (text), Timeout (number, default 30)
→ output shown in `<pre>` after execution

**Stats modal:** fetches once on open, shows CPU%, Memory usage/limit/%, Net I/O, Block I/O, PIDs + Refresh button

**Acceptance:** `cd frontend && bun run build` passes

---

### Task 4 — Image modals: Pull, Tag, Prune

**Files touched:**
- `frontend/src/components/environments/DockerPullImageModal.tsx` — NEW
- `frontend/src/components/environments/DockerTagImageModal.tsx` — NEW
- `frontend/src/components/environments/DockerImageList.tsx` — add "Pull" + "Prune" buttons in header
- `frontend/src/components/environments/DockerImageDetail.tsx` — add "Tag" button

**Pull modal fields:** Image name:tag (text), Username (text, optional), Password (password, optional)
**Tag modal fields:** Repository (text, prefilled with existing tag if any), Tag (text)

**Acceptance:** `cd frontend && bun run build` passes

---

### Task 5 — Volume + Network modals: Create, Prune, Remove

**Files touched:**
- `frontend/src/components/environments/DockerCreateVolumeModal.tsx` — NEW
- `frontend/src/components/environments/DockerCreateNetworkModal.tsx` — NEW
- `frontend/src/components/environments/DockerVolumeList.tsx` — add "Create" + "Prune" buttons in header
- `frontend/src/components/environments/DockerNetworkList.tsx` — add "Create" + "Prune" buttons in header; add "Remove" button on each row + delete confirmation modal

**Create volume fields:** Name (text, required), Driver (text, default "local"), Driver options (k-v list, optional)
**Create network fields:** Name (text, required), Driver (select: bridge/overlay/macvlan/host/none, default bridge), Subnet (text, optional), Gateway (text, optional), Internal (checkbox)

**Acceptance:** `cd frontend && bun run build` passes

---

## Phase 2 — Interactive Shell (WebSocket + xterm.js)

### Task 6 — Backend: WebSocket shell handler

**Files touched:**
- `data-api/package.json` — add `ws` + `@types/ws`
- `data-api/src/websocket/dockerShell.ws.ts` — NEW
- `data-api/src/index.ts` — register HTTP upgrade handler

**Behaviour:**
1. Client sends GET upgrade to `GET /environments/:id/docker/containers/:containerId/shell?token=<jwt>`
2. Backend verifies JWT from query param, looks up environment, verifies editor role
3. Backend creates Docker exec (`AttachStdin, AttachStdout, AttachStderr, Tty: true`)
4. Backend pipes WebSocket frames ↔ exec stream bidirectionally
5. On WebSocket close or exec exit, cleanup exec and close WS

**Acceptance:** `cd data-api && bun run build` passes

---

### Task 7 — Frontend: Shell page + routing

**Files touched:**
- `frontend/package.json` — add `@xterm/xterm`, `@xterm/addon-fit`
- `frontend/src/pages/DockerShellPage.tsx` — NEW (full-screen terminal)
- `frontend/src/App.tsx` (or router file) — add route `/environments/:envId/docker/shell/:containerId`
- `frontend/src/components/environments/DockerContainerDetail.tsx` — add "Shell" button (opens new tab, only shown for running containers)

**Shell page behaviour:**
- Reads `?token` from localStorage (`swe_auth_token`) on mount
- Constructs WS URL: `ws(s)://<api-host>/environments/:envId/docker/containers/:containerId/shell?token=...`
- Renders xterm.js `Terminal` with `FitAddon`, handles resize
- Shows container name in the browser tab title
- On WS close / error shows a reconnect button

**Acceptance:** `cd frontend && bun run build` passes

---

## Dependency Order

```
Task 1 → Task 2 → Tasks 3, 4, 5 (parallel) → Tasks 6, 7 (parallel)
```

Tasks 3, 4, 5 can be implemented in any order (each is self-contained by resource type).
Tasks 6 and 7 can be implemented in parallel once Tasks 1–5 are done.
