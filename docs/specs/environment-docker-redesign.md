# Spec: Environment & Docker Engine Management Redesign

## Objective

Redesign the environment management and Docker engine management UI from the current inline card-list + raw JSON display into a full-featured, dedicated sub-page experience. The current UX has three core problems:

1. **Resource detail is raw JSON** — `ResourceBrowser` dumps `JSON.stringify(detail, null, 2)` in a `<pre>` tag, forcing users to visually parse unstructured data
2. **No dedicated Docker dashboard** — Docker is treated as a field toggle in the K8s-centric create/edit flow, with no container/image/volume/network management
3. **Cramped inline expansion** — Environment detail (resources, helm) is rendered inside an accordion-style expanded row within the project tab, limiting screen real estate

**Target users:** DevOps engineers and developers managing deployment environments (K8s clusters, Docker hosts) from within the SWE AI platform.

**What success looks like:** A user can click an environment from the project tab, land on a dedicated detail page, and manage all resources (K8s or Docker) through structured, interactive UI panels — without ever needing to read raw JSON.

## Tech Stack

- React 18.3 + TypeScript 5.9
- HeroUI v2.6 (`@heroui/react`)
- Tailwind CSS v4.2
- react-router-dom v6.26
- Vite 5.4
- Existing backend API (unchanged)

## Commands

```
Dev:   bun run frontend:dev
Build: bun run frontend:build
Install: bun run frontend:install
```

## Project Structure (new/modified files)

```
frontend/src/
├── pages/
│   ├── ProjectDetail.tsx                    → Modified: env row click navigates to sub-route
│   └── EnvironmentDetail.tsx                → NEW: dedicated environment detail page
├── components/environments/
│   ├── EnvironmentTab.tsx                   → Modified: add navigation to detail page
│   ├── EnvironmentCreateModal.tsx           → Modified: stepper UX for create flow
│   ├── EnvironmentEditModal.tsx             → Modified: match create stepper
│   ├── ResourceBrowser.tsx                  → REWRITE: table-based with structured detail panel
│   ├── ResourceDetailPanel.tsx              → NEW: structured key-value detail view
│   ├── ResourceDetailSections.tsx           → NEW: section renderers (metadata, conditions, containers, etc.)
│   ├── DockerDashboard.tsx                  → NEW: container/image/volume/network management
│   ├── DockerContainerList.tsx              → NEW: container table with actions
│   ├── DockerImageList.tsx                  → NEW: image table with actions
│   ├── DockerVolumeList.tsx                 → NEW: volume table
│   ├── DockerNetworkList.tsx                → NEW: network table
│   ├── HelmReleasesPanel.tsx                → Modified: adopt table pattern
│   ├── HelmInstallModal.tsx                 → Unchanged
│   └── PodLogViewer.tsx                     → Unchanged
├── types/index.ts                           → Modified: add Docker resource types
└── lib/api.ts                               → Modified: add Docker-specific API calls
```

## Code Style

Follow existing patterns in the codebase. Example of target component style:

```tsx
// Table-based resource list (matches ProjectList.tsx / AgentProfiles.tsx pattern)
<Table aria-label="Pods" removeWrapper>
  <TableHeader>
    <TableColumn>NAME</TableColumn>
    <TableColumn>NAMESPACE</TableColumn>
    <TableColumn>STATUS</TableColumn>
    <TableColumn>AGE</TableColumn>
    <TableColumn>{""}</TableColumn>
  </TableHeader>
  <TableBody>
    {resources.map((res) => (
      <TableRow
        key={res.name}
        className="cursor-pointer hover:bg-default-50 transition-colors"
        onClick={() => onSelect(res)}
      >
        <TableCell>
          <p className="font-medium text-sm">{res.name}</p>
        </TableCell>
        <TableCell>{res.namespace}</TableCell>
        <TableCell>
          <Chip size="sm" variant="flat" color={statusColor(res.status)}>
            {res.status}
          </Chip>
        </TableCell>
        <TableCell className="text-default-400 text-xs">{res.age}</TableCell>
        <TableCell>
          {res.kind === "pods" && (
            <Button size="sm" variant="flat" onPress={() => onViewLogs(res)}>
              Logs
            </Button>
          )}
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

**Conventions:**
- Named exports for page components, default exports for feature components
- HeroUI `Table` with `removeWrapper` for all data lists
- `Chip` for status badges everywhere
- `useDisclosure` for modal state
- All API calls in `lib/api.ts`
- Types in `types/index.ts`

## Design: Page Layout

### Environment Detail Page (`/projects/:projectId/environments/:envId`)

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to Project    Environment Name    [Status Chip]         │
│                        type · namespace    [Test] [Edit] [Del]  │
├─────────────────────────────────────────────────────────────────┤
│  [Overview] [Resources] [Helm] [Docker*]                        │
├──────────────────────────────────┬──────────────────────────────┤
│                                  │                              │
│   Resource Table                 │   Resource Detail Panel      │
│   (left ~60%)                    │   (right ~40%)               │
│                                  │                              │
│   ┌──────────────────────────┐   │   ┌────────────────────────┐ │
│   │ NAME  NS  STATUS  AGE   │   │   │ Metadata               │ │
│   │ pod-1  ✓  Running  2d   │   │   │  name: pod-1           │ │
│   │ pod-2  ✓  Running  1d   │   │   │  namespace: default    │ │
│   │ pod-3  !  Pending  5m   │   │   │  uid: abc-123          │ │
│   └──────────────────────────┘   │   │  created: 2024-01-15   │ │
│                                  │   ├────────────────────────┤ │
│                                  │   │ Labels                 │ │
│                                  │   │  app: nginx            │ │
│                                  │   │  env: prod             │ │
│                                  │   ├────────────────────────┤ │
│                                  │   │ Containers             │ │
│                                  │   │  nginx (Running)       │ │
│                                  │   │  sidecar (Running)     │ │
│                                  │   ├────────────────────────┤ │
│                                  │   │ Conditions             │ │
│                                  │   │  Ready: True           │ │
│                                  │   │  Scheduled: True       │ │
│                                  │   ├────────────────────────┤ │
│                                  │   │ [View Raw YAML]        │ │
│                                  │   └────────────────────────┘ │
└──────────────────────────────────┴──────────────────────────────┘
```

*Docker tab only visible when `environment.type === "docker"`*

### Docker Dashboard Tab

```
┌─────────────────────────────────────────────────────────────────┐
│  [Containers] [Images] [Volumes] [Networks]                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Containers Table                                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ NAME     IMAGE        STATUS    PORTS     ACTIONS        │   │
│  │ web-1    nginx:1.25   Running   80:8080   ▶ ■ ↻ 🗑 📋   │   │
│  │ db-1     postgres:16  Running   5432      ▶ ■ ↻ 🗑 📋   │   │
│  │ cache    redis:7      Exited    —         ▶ 🗑            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Actions: Start, Stop, Restart, Remove, View Logs               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Overview Tab (new)

Shows an at-a-glance summary card for the environment:
- Connection info (type, status, host/cluster URL — masked secrets)
- Resource counts (pods/containers running, services, deployments)
- Recent events/activity
- Quick actions (test connection, refresh)

### Structured Resource Detail Sections

For a Kubernetes resource, the detail panel renders these collapsible sections based on what data exists:

| Section | Fields | Applies To |
|---|---|---|
| **Metadata** | name, namespace, uid, creationTimestamp, resourceVersion | All |
| **Labels** | key-value table | All |
| **Annotations** | key-value table (truncated values) | All |
| **Spec** | Parsed spec fields (replicas, selector, template for deployments; ports, type for services) | Deployments, Services, StatefulSets |
| **Status / Conditions** | Table of condition type, status, reason, message, lastTransitionTime | Pods, Deployments, Nodes |
| **Containers** | name, image, ports, resources (CPU/mem), status, restartCount | Pods |
| **Volumes** | name, type, source | Pods |
| **Events** | type, reason, message, count, firstTimestamp, lastTimestamp | All (if available) |
| **Raw** | Collapsible syntax-highlighted JSON/YAML with copy button | All |

For a Docker container detail:

| Section | Fields |
|---|---|
| **Info** | ID, name, image, command, created, status, platform |
| **Networking** | IP address, ports, networks |
| **Mounts** | source, destination, mode |
| **Resource Usage** | CPU %, memory usage/limit, network I/O, block I/O |
| **Environment** | key-value table of env vars |
| **Raw** | Full inspect JSON |

## Testing Strategy

- Manual visual verification (no unit tests for UI layout changes)
- `bun run frontend:build` must pass without TypeScript errors
- Verify all existing API integrations still work
- Test both K8s and Docker environment flows end-to-end in browser

## Boundaries

- **Always:**
  - Use HeroUI `Table` component for all data lists (consistency with rest of app)
  - Keep all API calls in `lib/api.ts`
  - Keep all types in `types/index.ts`
  - Use existing `toast` utility for notifications
  - Maintain responsive layout (min 1024px viewport)

- **Ask first:**
  - Adding new npm dependencies
  - Changing the router configuration beyond adding sub-routes
  - Modifying any backend API endpoints

- **Never:**
  - Remove existing API functions (backward compat)
  - Change the data-api or agent-service code
  - Break other tabs in ProjectDetail

## Success Criteria

1. **No raw JSON anywhere** — All resource details render as structured, labeled UI sections
2. **Dedicated detail page** — Clicking an environment navigates to `/projects/:projectId/environments/:envId`
3. **Back navigation works** — Browser back button returns to project environments tab
4. **K8s resources in Table** — Resource browser uses HeroUI `Table` with proper columns
5. **Docker dashboard exists** — Containers, images, volumes, networks each have their own table view with relevant actions
6. **Container actions work** — Start, stop, restart, remove, view logs for Docker containers
7. **Resource detail panel** — Master-detail layout: table on left, structured detail on right
8. **Overview tab** — Shows connection status, resource counts, quick actions
9. **Build passes** — `bun run frontend:build` completes without errors
10. **Existing environment CRUD works** — Create, edit, delete, test connection all functional

## Open Questions

1. Should the Docker dashboard support `docker exec` (interactive terminal in container)? — Deferred for now, can add later
2. Should resource detail support live/auto-refresh? — Start with manual refresh, add polling later
3. Does the backend API already support Docker container actions (start/stop/restart/remove) and Docker image/volume/network listing? — Need to verify; may need backend additions

## New Types Needed

```typescript
// Docker-specific resource types
export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: "running" | "exited" | "paused" | "created" | "restarting" | "dead";
  ports: Array<{ host: number; container: number; protocol: string }>;
  created: string;
  command?: string;
}

export interface DockerImage {
  id: string;
  tags: string[];
  size: number;
  created: string;
  repository?: string;
}

export interface DockerVolume {
  name: string;
  driver: string;
  mountpoint: string;
  created: string;
  scope: string;
  labels: Record<string, string>;
}

export interface DockerNetwork {
  id: string;
  name: string;
  driver: string;
  scope: string;
  ipam?: { subnet: string; gateway: string };
  containers: number;
  created: string;
}
```

## New API Endpoints Needed

```typescript
// Docker container operations
listDockerContainers(envId: string): Promise<DockerContainer[]>
getDockerContainer(envId: string, containerId: string): Promise<unknown>
startDockerContainer(envId: string, containerId: string): Promise<void>
stopDockerContainer(envId: string, containerId: string): Promise<void>
restartDockerContainer(envId: string, containerId: string): Promise<void>
removeDockerContainer(envId: string, containerId: string): Promise<void>
getDockerContainerLogs(envId: string, containerId: string): Promise<string>

// Docker image operations
listDockerImages(envId: string): Promise<DockerImage[]>
removeDockerImage(envId: string, imageId: string): Promise<void>

// Docker volume operations
listDockerVolumes(envId: string): Promise<DockerVolume[]>
removeDockerVolume(envId: string, volumeName: string): Promise<void>

// Docker network operations
listDockerNetworks(envId: string): Promise<DockerNetwork[]>
```
