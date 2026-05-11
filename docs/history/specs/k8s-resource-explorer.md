# Spec: Kubernetes Resource Explorer Redesign + PVC File Browser

## Objective

Replace the current generic `ResourceBrowser` (single dropdown for all resource kinds) with
dedicated per-resource-type views, and add a PVC file browser — mirroring the Docker volume file
browser already in production.

### Target user
Project editors / admins who work with Kubernetes environments inside the platform.

### Acceptance criteria (top-level)
- The "Resources" tab shows a secondary sub-navigation with five groups: Pods, Workloads, Networking, Storage, Config
- Each group renders a purpose-built list component with kind-appropriate columns and actions
- Clicking a row in any list opens a raw-JSON detail side panel (existing `ResourceDetailPanel` behaviour preserved)
- Pods list: "Logs" button per row (existing `PodLogViewer`, unchanged)
- Storage (PVCs) list: "Browse Files" button per row that opens the PVC file browser modal
- PVC file browser: list files/directories, view text files in Monaco Editor, download any file, edit and save text files
- If a PVC is RWO and already mounted by a running Pod, the backend returns HTTP 409 and the frontend shows a clear toast explaining the conflict with guidance
- The generic `ResourceBrowser` component is removed and replaced by the new dedicated views
- No existing routes, tests, or Docker functionality is broken

---

## Tech Stack

- **Backend**: TypeScript · Bun · Express · `@kubernetes/client-node` · Zod · pino
- **Frontend**: React 18 · TypeScript · HeroUI v2 · Tailwind v4 · `@monaco-editor/react` (already installed)

## Commands

```
Frontend build:  cd frontend && bun run build
Backend build:   cd data-api && bun run build
Backend tests:   cd data-api && bun run test
```

---

## Project Structure

```
data-api/src/
  services/
    kubernetes.service.ts        ← add execInTempPod, listPVCFiles, getPVCFileContent,
                                    updatePVCFileContent, downloadPVCFile
  controllers/
    environment.controller.ts    ← add listPVCFiles, downloadPVCFile, getPVCFileContent,
                                    updatePVCFileContent handlers
  routes/
    environmentItem.route.ts     ← register 4 new K8s PVC file routes

frontend/src/
  components/environments/
    ResourceBrowser.tsx              ← DELETED (replaced by the components below)
    K8sResourceExplorer.tsx          ← NEW: two-column layout (vertical menu + right pane)
    K8sResourceList.tsx              ← NEW: shared parameterised list renderer (all kinds)
    K8sPVCFileBrowserModal.tsx       ← NEW: file browser modal (mirrors DockerVolumeFileBrowserModal)
  lib/api.ts                         ← add 4 new K8s PVC file API functions
  types/index.ts                     ← add K8sPVCFileEntry, K8sPVCFileContent
  pages/EnvironmentDetail.tsx        ← replace <ResourceBrowser> with <K8sResourceExplorer>
```

---

## API Routes (new)

All routes are mounted under the existing `/:id/` environment-item router.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/:id/kubernetes/pvcs/:pvcName/files` | viewer | List files/directories at a path (query: `?namespace=&path=`) |
| `GET` | `/:id/kubernetes/pvcs/:pvcName/files/content` | viewer | Get file content (query: `?namespace=&path=`) |
| `PUT` | `/:id/kubernetes/pvcs/:pvcName/files/content` | editor | Update file content (body: `{ namespace, path, content }`) |
| `GET` | `/:id/kubernetes/pvcs/:pvcName/files/download` | viewer | Download file as octet-stream (query: `?namespace=&path=`) |

---

## Backend: PVC File Access Mechanism

The Kubernetes API has no native "read a file from a PVC" endpoint. The same pattern used on the
Docker side (temporary busybox container) is replicated with a temporary Kubernetes Pod.

### Flow

1. Check if the PVC is currently mounted by a running Pod in the namespace.
   - `listNamespacedPod` → filter for pods whose `spec.volumes` reference the PVC by claim name,
     and whose `status.phase === "Running"`.
   - If PVC `accessModes` contains only `ReadWriteOnce` **and** such a pod exists → return **HTTP 409**
     with `{ error: "pvc_conflict", message: "...", conflicting_pod: "<name>" }`.

2. Create a temporary Pod spec:
   ```yaml
   metadata:
     name: pvc-browser-<uuid>     # deterministic, cleaned up in finally
     namespace: <namespace>
   spec:
     restartPolicy: Never
     containers:
       - name: browser
         image: busybox:latest
         command: ["sh", "-c", "sleep 60"]
         volumeMounts:
           - name: data
             mountPath: /data
     volumes:
       - name: data
         persistentVolumeClaim:
           claimName: <pvcName>
   ```

3. Wait for Pod to reach `Running` phase (poll every 500 ms, timeout 30 s).

4. Execute commands inside the Pod via the Kubernetes exec API
   (`k8s.Exec` from `@kubernetes/client-node`):
   - **List**: `ls -la /data/<path>`  → parsed by `parseLsLaOutput` (same helper as Docker side)
   - **Read**: `base64 /data/<path>`  → decode on backend, detect binary vs text
   - **Write**: `sh -c "echo '<base64>' | base64 -d > /data/<path>"`
   - **Download**: pipe raw bytes via exec stdout stream

5. Delete the Pod in a `finally` block regardless of success/failure.
   Use `deleteNamespacedPod` with `gracePeriodSeconds: 0`.

### `KubernetesClient` new methods

```typescript
// Returns PVC access modes from the cluster
async getPVCAccessModes(cfg, namespace, pvcName): Promise<string[]>

// Returns running pods that mount this PVC
async getPodsUsingPVC(cfg, namespace, pvcName): Promise<string[]>

// Runs a command in a temporary pod with the PVC mounted; returns stdout
async execInTempPod(cfg, namespace, pvcName, command: string[]): Promise<string>

// High-level file-browser methods (wrap execInTempPod)
async listPVCFiles(cfg, namespace, pvcName, path): Promise<K8sPVCFileEntry[]>
async getPVCFileContent(cfg, namespace, pvcName, path): Promise<{ content: string; encoding: "text" | "binary"; size: number }>
async updatePVCFileContent(cfg, namespace, pvcName, path, content: string): Promise<void>
// For download: returns a Node.js Readable that the controller pipes to res
async downloadPVCFile(cfg, namespace, pvcName, path): Promise<{ stream: Readable; fileName: string }>
```

### Constraints (same as Docker side)
- `MAX_FILE_CONTENT_SIZE = 1 MB` — files larger than this are download-only
- Directory listing capped at 500 entries
- Binary files detected by UTF-8 decode failure → download-only

---

## Frontend: K8s Resource Explorer

### `K8sResourceExplorer` (replaces `ResourceBrowser`)

Renders a **two-column layout**: a fixed-width vertical menu on the left lists every resource kind;
the right pane renders the list for whichever kind is selected. The namespace selector and Refresh
button sit above the vertical menu.

```
┌──────────────────────────────────────────────────────────────────┐
│  Namespace: [default ▾]                          [Refresh]        │
├──────────────────┬───────────────────────────────────────────────┤
│ Pods             │                                               │
│ ─────────────    │   <selected kind list>                        │
│ Deployments      │                                               │
│ StatefulSets     │                                               │
│ DaemonSets       │                                               │
│ Jobs             │                                               │
│ CronJobs         │                                               │
│ ─────────────    │                                               │
│ Services         │                                               │
│ Ingresses        │                                               │
│ ─────────────    │                                               │
│ PersistentVolume │                                               │
│ Claims           │                                               │
│ ─────────────    │                                               │
│ ConfigMaps       │                                               │
│ Secrets          │                                               │
└──────────────────┴───────────────────────────────────────────────┘
```

The menu items are grouped with a faint section label (not a clickable item):
- **Compute** — Pods
- **Workloads** — Deployments, StatefulSets, DaemonSets, Jobs, CronJobs
- **Networking** — Services, Ingresses
- **Storage** — PersistentVolumeClaims
- **Config** — ConfigMaps, Secrets

The active item is highlighted. Selecting a menu item replaces the right-pane content immediately
(no page reload). Default selected item: **Pods**.

Each item in the vertical menu renders a single `K8sResourceList` component with a per-kind column
configuration (see below). There are no sub-kind selectors — each kind is its own menu entry.

### `K8sResourceList` (shared list renderer)

A single parameterised component replaces the five separate group components. It accepts a `kind`
prop and a `columnConfig` prop that drives which columns are shown.

```typescript
interface K8sResourceListProps {
  environmentId: string;
  namespace: string;
  kind: K8sResourceKind;
  columns: ColumnDef[];          // see below
  rowActions?: RowActionDef[];   // buttons rendered in the Actions column
  onRowClick?: (resource: K8sResource) => void;
}
```

### Per-kind column configuration

| Kind | Extra columns beyond Name · Namespace · Age | Row actions |
|---|---|---|
| Pods | Status (Chip) | Logs |
| Deployments | Ready (e.g. `2/2`) | — |
| StatefulSets | Ready | — |
| DaemonSets | Desired · Ready | — |
| Jobs | Status | — |
| CronJobs | Schedule · Last run | — |
| Services | Type · ClusterIP | — |
| Ingresses | Hosts | — |
| PersistentVolumeClaims | Status (Chip) · Access Mode · Capacity | Browse Files |
| ConfigMaps | Keys count | — |
| Secrets | Type · Keys count | — |

All kinds: row click → `ResourceDetailPanel` (side panel, existing behaviour).

**Browse Files** error state: if the backend returns HTTP 409, show toast:
> "This PVC is mounted ReadWriteOnce by pod `<name>`. Stop or scale down the pod first, then try again."

### No sub-kind selectors

Every resource kind appears as its own item in the vertical menu. There are no dropdowns or
secondary kind selectors anywhere in the explorer.

---

## Frontend: `K8sPVCFileBrowserModal`

Mirrors `DockerVolumeFileBrowserModal` exactly. Key shared behaviours:

- Two views: `"browser"` (file list) and `"editor"` (Monaco Editor)
- Breadcrumb navigation for path drilling
- Per-row action buttons: **View** (text) · **Edit** (text) · **Download** (any)
- Per-file loading state (`openingFilePath: string | null`) — no shared spinner
- Binary files: download-only, no View/Edit buttons
- `URL.revokeObjectURL` wrapped in `setTimeout(..., 100)` for download (same fix as Docker side)
- File size limit display (files > 1 MB show "File too large — download only")

Props:
```typescript
interface K8sPVCFileBrowserModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  environmentId: string;
  pvcName: string;
  namespace: string;
}
```

---

## New Types (`frontend/src/types/index.ts`)

```typescript
export interface K8sPVCFileEntry {
  name: string;
  type: "file" | "directory";
  size: number;
  modified: string;
  path: string;
}

export interface K8sPVCFileContent {
  content: string;
  encoding: "text" | "binary";
  size: number;
  path: string;
}
```

---

## New API Functions (`frontend/src/lib/api.ts`)

```typescript
listK8sPVCFiles(envId, pvcName, namespace, path): Promise<K8sPVCFileEntry[]>
getK8sPVCFileContent(envId, pvcName, namespace, path): Promise<K8sPVCFileContent>
updateK8sPVCFileContent(envId, pvcName, namespace, path, content): Promise<void>
downloadK8sPVCFile(envId, pvcName, namespace, path, fileName): Promise<void>
```

---

## `EnvironmentDetail.tsx` changes

- Import `K8sResourceExplorer` instead of `ResourceBrowser`
- Replace `<ResourceBrowser ... />` with `<K8sResourceExplorer environmentId={...} defaultNamespace={...} />`
- Remove `selectedResource`, `resourceDetail`, `detailLoading`, `handleSelectResource`,
  `handleCloseDetail` state from `EnvironmentDetail` — the resource detail panel is now owned
  by `K8sResourceExplorer`
- Remove `listEnvironmentResources` from the import at the top of `EnvironmentDetail.tsx`
  (it is now called inside the list components, not in the page)
- Keep the `listEnvironmentResources` call in `OverviewTab` as-is (used for resource count cards)

---

## Boundaries

- **Always:** run `tsc && vite build` before marking frontend tasks done; run `tsc` on backend
- **Ask first:** adding new npm packages; changing existing routes or tests
- **Never:** break existing Docker functionality; break existing K8s routes (`listResources`, `getResource`, `getPodLogs`, `listNamespaces`)

## Pre-existing issues (not regressions)
- 4 TypeScript errors in `document.controller.ts` and `kubernetes.service.ts` — ignore
- 1 failing test in `project.service.test.ts` — ignore
