# Spec: Docker Panel — Extended Actions

## Objective

Add a comprehensive set of management actions to the Docker environment view, covering containers,
images, volumes, and networks. After this work engineers can manage the full lifecycle of Docker
resources directly from the UI without reaching for the CLI.

### Target user
Project editors / admins who work with Docker environments inside the platform.

### Acceptance criteria (top-level)
- Can create and immediately start a container via a modal form
- Can run a one-shot exec command inside a running container and see output
- Can get an interactive shell inside a running container (xterm.js terminal)
- Can see a live CPU / memory / network stats snapshot for any container
- Can pull an image by name:tag from a registry
- Can prune unused images / volumes / networks in a single click
- Can tag an existing image with a new name:tag
- Can create a named volume
- Can create a custom network with driver / subnet / gateway options
- Can remove a network from the UI

---

## Tech Stack

- **Backend**: TypeScript · Bun · Express · Dockerode ^4.0.10 · ws (new dep) · Zod · pino
- **Frontend**: React 18 · TypeScript · HeroUI v2 · Tailwind v4 · @xterm/xterm (new dep) · @xterm/addon-fit

## Commands

```
Frontend build:  cd frontend && bun run build
Backend build:   cd data-api && bun run build
Backend tests:   cd data-api && bun run test
```

## Project Structure

```
data-api/src/
  services/
    docker.service.ts          ← DockerClient — new methods added here
    docker-actions.service.ts  ← thin wrappers per resource — new functions added here
  controllers/
    docker.controller.ts       ← new handler functions
  routes/
    environmentItem.route.ts   ← new routes registered here
  websocket/
    dockerShell.ws.ts          ← NEW: WebSocket handler for interactive shell

frontend/src/
  components/environments/
    DockerContainerDetail.tsx  ← add Exec + Stats + Shell buttons
    DockerContainerList.tsx    ← add Create button in header
    DockerCreateContainerModal.tsx  ← NEW
    DockerExecModal.tsx             ← NEW
    DockerStatsModal.tsx            ← NEW
    DockerShellModal.tsx            ← NEW (xterm.js terminal)
    DockerImageList.tsx        ← add Pull + Prune buttons in header
    DockerImageDetail.tsx      ← add Tag button
    DockerPullImageModal.tsx        ← NEW
    DockerTagImageModal.tsx         ← NEW
    DockerVolumeList.tsx       ← add Create + Prune buttons in header
    DockerCreateVolumeModal.tsx     ← NEW
    DockerNetworkList.tsx      ← add Create + Prune + Remove buttons
    DockerCreateNetworkModal.tsx    ← NEW
  lib/api.ts                   ← new API call functions
  types/index.ts               ← new types if needed
```

## Implementation Phases

### Phase 1 — HTTP-only actions (no WebSocket)

These require no new infrastructure, just additional Dockerode calls, routes, and UI modals.

| Action | Trigger | Backend endpoint | Method |
|---|---|---|---|
| Create + run container | "Create" button in container list header | `POST /:id/docker/containers` | editor |
| Exec command (one-shot) | "Exec" button in ContainerDetail | `POST /:id/docker/containers/:cid/exec` | editor |
| Resource stats (snapshot) | "Stats" button in ContainerDetail | `GET /:id/docker/containers/:cid/stats` | viewer |
| Pull image | "Pull" button in image list header | `POST /:id/docker/images/pull` | editor |
| Tag image | "Tag" button in ImageDetail | `POST /:id/docker/images/:imageId/tag` | editor |
| Prune images | "Prune" button in image list header | `POST /:id/docker/images/prune` | editor |
| Create volume | "Create" button in volume list header | `POST /:id/docker/volumes` | editor |
| Prune volumes | "Prune" button in volume list header | `POST /:id/docker/volumes/prune` | editor |
| Create network | "Create" button in network list header | `POST /:id/docker/networks` | editor |
| Remove network | "Remove" button in network list row | `DELETE /:id/docker/networks/:networkId` | editor |
| Prune networks | "Prune" button in network list header | `POST /:id/docker/networks/prune` | editor |

### Phase 2 — Interactive shell (WebSocket)

Requires `ws` npm package on backend + `@xterm/xterm` + `@xterm/addon-fit` on frontend.

| Action | Trigger | Backend endpoint | Transport |
|---|---|---|---|
| Interactive shell | "Shell" button in ContainerDetail (running containers only) | `GET /:id/docker/containers/:cid/shell` (HTTP Upgrade) | WebSocket |

The backend upgrades the HTTP connection to a WebSocket and proxies the Docker exec PTY stream
(via `container.exec({ AttachStdin, AttachStdout, AttachStderr, Tty: true })`).
The frontend renders an xterm.js terminal inside a modal.

---

## Code Style

### Backend: new DockerClient method example
```typescript
async createContainer(
  cfg: DockerConnectionConfig,
  opts: CreateContainerOptions,
): Promise<{ id: string }> {
  const docker = makeDockerode(cfg);
  const container = await docker.createContainer({
    name: opts.name,
    Image: opts.image,
    Cmd: opts.command ? opts.command.split(" ") : undefined,
    Env: opts.env,
    ExposedPorts: ...,
    HostConfig: { PortBindings: ..., Binds: ... },
  });
  if (opts.start) await container.start();
  return { id: container.id };
}
```

### Frontend: new modal pattern (consistent with existing modals)
```tsx
<Modal isOpen={isOpen} onOpenChange={onOpenChange} size="md">
  <ModalContent>
    {(onClose) => (
      <>
        <ModalHeader>Create Container</ModalHeader>
        <ModalBody>
          {/* form fields */}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>Cancel</Button>
          <Button color="primary" isLoading={loading} onPress={handleSubmit}>Create</Button>
        </ModalFooter>
      </>
    )}
  </ModalContent>
</Modal>
```

All API calls live in `frontend/src/lib/api.ts`.
All types live in `frontend/src/types/index.ts`.
Reuse `toast.success` / `toast.error` for feedback.

## Create Container — Form Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| Image | text | yes | Shown as autocomplete from existing images list |
| Container name | text | no | Optional custom name |
| Command override | text | no | Space-separated, overrides CMD |
| Environment vars | key-value list | no | + button to add rows |
| Port mappings | `hostPort:containerPort` list | no | + button to add rows |
| Volume mounts | `source:destination` list | no | source can be a volume name or host path |
| Network | select from existing | no | defaults to none |
| Auto-remove | checkbox | no | `--rm` equivalent |
| Start immediately | checkbox | yes (default on) | creates + starts |

## Exec Command — Form Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| Command | text | yes | e.g. `ls -la /tmp` |
| Working directory | text | no | Defaults to container working dir |
| Run as user | text | no | Defaults to container user |

Output shown in a `<pre>` block inside the modal after execution.

## Resource Stats — Display Fields

Single snapshot (non-streaming): `docker stats --no-stream` equivalent.

| Field | Source |
|---|---|
| CPU % | calculated from `cpu_stats` delta |
| Memory usage / limit | `memory_stats.usage` / `memory_stats.limit` |
| Memory % | usage / limit * 100 |
| Net I/O | `networks` sum of rx_bytes / tx_bytes |
| Block I/O | `blkio_stats` sum read / write |
| PIDs | `pids_stats.current` |

## Boundaries

- **Always:** run `tsc && vite build` before marking frontend tasks done; run `tsc` on backend
- **Ask first:** adding new npm dependencies beyond `ws`, `@xterm/xterm`, `@xterm/addon-fit`; changing existing routes
- **Never:** break existing routes or tests; store registry credentials unencrypted

## Final Decisions

1. **Registry auth**: Private registries supported — username/password fields in Pull modal (optional).
2. **Shell UX**: Each "Shell" click opens a **new browser tab** pointing to a dedicated React route
   `/environments/:envId/docker/shell/:containerId`. Multiple containers = multiple tabs.
3. **Shell auth**: JWT token read from `localStorage` on the shell page, passed as `?token=` query
   param during WebSocket handshake.
4. **Exec timeout**: Default 30 s, exposed as a numeric input field in the Exec modal (user-editable).

## Pre-existing issues (not regressions)
- 4 TypeScript errors in `document.controller.ts` and `kubernetes.service.ts` — ignore
- 1 failing test in `project.service.test.ts` — ignore
