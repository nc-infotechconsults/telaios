# Spec: Docker Resource Detail Panels + Volume File Browser

## Objective

Every row in the Docker sub-tabs (Containers, Images, Volumes, Networks) opens a
right-side detail panel showing full inspect data. Volumes additionally include an
interactive file browser that lets users navigate the volume's directory tree and
download individual files.

**Users:** platform engineers browsing their Docker environment through the SWE AI
Platform UI.

**Success criteria:**
- Clicking any row in Containers/Images/Volumes/Networks opens a detail panel on the
  right without navigating away.
- The panel shows the full Docker `inspect` payload, structured into labelled sections
  (not a raw JSON blob by default, but with a "Raw JSON" section for power users).
- The Volumes panel additionally renders a file tree.  Users can navigate directories
  and download individual files (as tar archive, since that is what the Docker API
  returns).
- The feature works for both **local** (unix socket) and **remote** (TCP) Docker hosts.
- No existing functionality is broken.

---

## Tech Stack

- **Backend:** TypeScript, Bun, Express, Dockerode, existing `DockerClient` /
  `docker-actions.service` / `docker.controller` pattern.
- **Frontend:** React 18, TypeScript, HeroUI v2, Tailwind CSS v4, existing component
  conventions.

---

## Commands

```
Build frontend:   cd frontend && bun run build
Build backend TS: cd data-api && bun run build
Backend tests:    cd data-api && bun run test
Frontend dev:     bun run frontend:dev
```

---

## Project Structure

```
data-api/src/
  services/
    docker.service.ts          ← add: inspectImage, inspectNetwork, listVolumeFiles, downloadVolumeFile
  services/
    docker-actions.service.ts  ← add: thin wrappers for the above
  controllers/
    docker.controller.ts       ← add: 5 new handlers
  routes/
    environmentItem.route.ts   ← add: 5 new routes

frontend/src/
  components/environments/
    DockerContainerDetail.tsx  ← NEW: container inspect side panel
    DockerImageDetail.tsx      ← NEW: image inspect side panel
    DockerVolumeDetail.tsx     ← NEW: volume inspect + file browser side panel
    DockerNetworkDetail.tsx    ← NEW: network inspect side panel
    DockerContainerList.tsx    ← MODIFY: clickable rows, render detail panel
    DockerImageList.tsx        ← MODIFY: clickable rows, render detail panel
    DockerVolumeList.tsx       ← MODIFY: clickable rows, render detail panel
    DockerNetworkList.tsx      ← MODIFY: clickable rows, render detail panel
  lib/
    api.ts                     ← add: 5 new API functions
  types/
    index.ts                   ← add: DockerVolumeFileEntry, typed inspect interfaces
```

---

## New Backend Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/:id/docker/images/:imageId/inspect` | Full image inspect |
| `GET` | `/:id/docker/networks/:networkId/inspect` | Full network inspect |
| `GET` | `/:id/docker/volumes/:volumeName/inspect` | Full volume inspect |
| `GET` | `/:id/docker/volumes/:volumeName/files` | List files at `?path=/` |
| `GET` | `/:id/docker/volumes/:volumeName/files/download` | Download file at `?path=/some/file` as `application/x-tar` |

Container inspect (`GET /:id/docker/containers/:containerId`) already exists.

---

## Volume File Browser — Backend Mechanism

Browsing volume contents requires running a temporary container with the volume
mounted, because Docker exposes no direct file-system API for volumes.

### List files (`listVolumeFiles`)

```
1. docker.createContainer({
     Image: 'busybox:latest',
     Cmd: ['sh', '-c', 'ls -la /vol/{path}'],
     HostConfig: { Mounts: [{ Type: 'volume', Source: volumeName, Target: '/vol' }] }
   })
2. container.start()
3. container.exec({ Cmd: [...], AttachStdout: true, AttachStderr: true })
4. exec.start() → collect stdout
5. container.stop() + container.remove({ force: true }) in finally block
6. Parse ls -la output → DockerVolumeFileEntry[]
```

### Download file (`downloadVolumeFile`)

```
1. Same temp container lifecycle
2. container.getArchive({ path: '/vol/{filePath}' }) → readable tar stream
3. Pipe stream directly to HTTP response with Content-Type: application/x-tar
   and Content-Disposition: attachment; filename="<filename>.tar"
4. Cleanup in finally block (or stream end/error event)
```

The temp container is removed via `{ force: true }` in a `finally` block so it is
always cleaned up even on error.

---

## New Frontend Types

```typescript
export interface DockerVolumeFileEntry {
  name: string;
  type: 'file' | 'dir' | 'link';
  size: number;       // bytes; 0 for dirs
  modified: string;   // ISO 8601
  path: string;       // full path inside volume, e.g. "/data/config.json"
}
```

Inspect payloads for containers, images, networks, and volumes are typed as
`Record<string, unknown>` on the frontend — the full Dockerode types are large and
we render fields by key access, not by full type coverage.

---

## UI Design

### Detail panel layout

The list component switches from a single-column layout to a two-column split when
a row is selected:

```
┌─────────────────────────────────────┬───────────────────────────────┐
│  Table (left, scrollable)           │  Detail panel (right, fixed)  │
│  ← narrower when panel is open      │  ← 400px wide                 │
└─────────────────────────────────────┴───────────────────────────────┘
```

This matches the pattern already used by `ResourceBrowser` + `ResourceDetailPanel`
for Kubernetes resources.

Selected row is highlighted. Clicking the selected row again (or pressing "Close" in
the panel) collapses the panel.

### Detail panel sections (per resource)

**Container:**
- Summary (id, name, image, state, status, created, restart count)
- Command & Entrypoint
- Environment Variables (sorted, collapsible)
- Port Bindings
- Volume Mounts
- Network Settings (IP, gateway, networks attached)
- Raw JSON (collapsible, copy button)

**Image:**
- Summary (id, tags, size, created, OS, architecture)
- Entrypoint & Cmd
- Environment Variables (sorted, collapsible)
- Exposed Ports
- Labels (collapsible)
- Layers (count + list of digests, collapsible)
- Raw JSON (collapsible, copy button)

**Volume:**
- Summary (name, driver, scope, mountpoint, created)
- Labels (if any)
- File Browser (see below)
- Raw JSON (collapsible, copy button)

**Network:**
- Summary (id, name, driver, scope, created)
- IPAM Config (subnets, gateways)
- Connected Containers (name, IPv4, MAC, collapsible)
- Options / Labels (collapsible)
- Raw JSON (collapsible, copy button)

### Volume file browser

```
/  (breadcrumb)
┌──────────────────────────────────────────────┐
│ 📁 data/           <size>   <date>          │
│ 📄 config.json     1.2 KB   2024-01-15      Download│
│ 📄 README.md       4 KB     2024-01-10      Download│
└──────────────────────────────────────────────┘
```

- Breadcrumb shows current path; each segment is clickable to navigate up.
- Clicking a directory navigates into it (fetches listing for new path).
- Clicking "Download" on a file triggers a browser file download (the response is a
  `.tar` archive; browsers download it directly).
- Loading spinner while fetch is in flight.
- Error message if the volume has no content or the temp container cannot start
  (e.g., `busybox` image not available).

---

## Code Style

Follow existing patterns:

```typescript
// docker.service.ts — new method
async inspectImage(cfg: DockerConnectionConfig): Promise<unknown> {
  const docker = buildDockerClient(cfg);
  return docker.getImage(id).inspect();
}

// docker-actions.service.ts — thin wrapper
export async function inspectDockerImage(envId: string, imageId: string): Promise<unknown> {
  const { cfg } = await resolveDockerEnv(envId);
  return DockerClient.inspectImage(cfg, imageId);
}

// docker.controller.ts — handler
export async function inspectImage(req: Request, res: Response) {
  try {
    const data = await dockerService.inspectDockerImage(req.params.id, req.params.imageId);
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
}
```

Frontend components follow the HeroUI + Tailwind patterns already in the codebase.

---

## Testing Strategy

- **Backend unit tests:** Add to `docker.service.test.ts` for `inspectImage`,
  `inspectNetwork`, and `listVolumeFiles` (mock the temp-container lifecycle).
- **No new integration or e2e tests** — existing test infrastructure doesn't cover
  Docker endpoints end-to-end.
- **Frontend:** No new tests (no test infra for React components exists in the project).
- **Manual verification:** Run `bun run frontend:dev` + `bun run agent:dev` and click
  through the detail panels against a live Docker environment.

---

## Boundaries

- **Always:** Follow Controller → Service → DockerClient layering. Clean up temp
  containers in `finally` blocks. Use `requireProjectAccess("viewer")` for read
  endpoints, `"editor"` for mutations.
- **Ask first:** Adding new npm/bun packages.
- **Never:** Leave orphaned temp containers on error. Store volume file content in
  memory for large files — stream directly to the response.

---

## Open Questions / Resolved Assumptions

| Assumption | Decision |
|---|---|
| Detail panel UX | Right-side panel (same as K8s resources) |
| Remote Docker hosts | Use temp busybox containers for volume browsing |
| File download format | `.tar` archive (native Docker API) |
| All 4 resource types | Yes, all in this iteration |
| Inline file preview | Out of scope — download only |
| Multi-file / whole-volume download | Out of scope |

---

## Task Breakdown

See `docker-detail-panels-plan.md`.
