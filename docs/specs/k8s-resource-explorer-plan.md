# Plan: Kubernetes Resource Explorer Redesign + PVC File Browser

Spec: `docs/specs/k8s-resource-explorer.md`

---

## Phase 1 — Backend: PVC file browser

### Task 1 — `KubernetesClient` new methods

**File touched:**
- `data-api/src/services/kubernetes.service.ts`

**New methods to add to `KubernetesClient`:**

1. `getPVCAccessModes(cfg, namespace, pvcName): Promise<string[]>`  
   Reads the PVC object and returns `spec.accessModes`.

2. `getPodsUsingPVC(cfg, namespace, pvcName): Promise<string[]>`  
   Lists all pods in the namespace, filters to those whose `spec.volumes` contain a
   `persistentVolumeClaim.claimName === pvcName` and whose `status.phase === "Running"`.
   Returns an array of pod names.

3. `execInTempPod(cfg, namespace, pvcName, command: string[]): Promise<string>`  
   Core primitive. Steps:
   - Build pod spec: `busybox:latest`, `restartPolicy: Never`, mounts PVC at `/data`,
     container command `["sh", "-c", "sleep 60"]`, name `pvc-browser-<uuidv4>`.
   - Create pod via `coreApi.createNamespacedPod`.
   - Poll `coreApi.readNamespacedPod` every 500 ms until `status.phase === "Running"`,
     or throw `TIMEOUT` after 30 s.
   - Execute `command` via `new k8s.Exec(kc).exec(namespace, podName, "browser", command,
     stdout, stderr, null, false, statusCallback)`.
   - Collect stdout into a `string`, reject on non-zero status.
   - `finally`: `coreApi.deleteNamespacedPod({ name: podName, namespace, gracePeriodSeconds: 0 })`.

4. `listPVCFiles(cfg, namespace, pvcName, path: string): Promise<K8sPVCFileEntry[]>`  
   Calls `execInTempPod` with `["sh", "-c", "ls -la /data/<path>"]`.
   Parses stdout with the existing `parseLsLaOutput` helper (imported or duplicated).
   Maps entries to `K8sPVCFileEntry` (same shape as `DockerVolumeFileEntry`).

5. `getPVCFileContent(cfg, namespace, pvcName, path: string): Promise<{ content: string; encoding: "text" | "binary"; size: number }>`  
   Calls `execInTempPod` with `["sh", "-c", "wc -c < /data/<path>"]` for size check.  
   If `size > MAX_FILE_CONTENT_SIZE (1 MB)` throw an error with code `FILE_TOO_LARGE`.  
   Calls `execInTempPod` with `["base64", "/data/<path>"]`.  
   Tries `Buffer.from(stdout, "base64").toString("utf8")` — if it throws or result contains
   replacement characters → encoding `"binary"`, else `"text"`.

6. `updatePVCFileContent(cfg, namespace, pvcName, path: string, content: string): Promise<void>`  
   Base64-encodes `content`, calls `execInTempPod` with:
   `["sh", "-c", "echo '<b64>' | base64 -d > /data/<path>"]`.

7. `downloadPVCFile(cfg, namespace, pvcName, path: string): Promise<{ stream: PassThrough; fileName: string }>`  
   Creates the temp pod, waits for Running, then uses `k8s.Exec` with stdout piped into a
   `PassThrough` stream using the command `["cat", "/data/<path>"]`.
   Returns the stream + `fileName = path.split("/").filter(Boolean).pop()`.
   Pod cleanup happens when the stream ends or errors.

**New exported interface (at top of file):**
```typescript
export interface K8sPVCFileEntry {
  name: string;
  type: "file" | "directory";
  size: number;
  modified: string;
  path: string;
}
```

**Acceptance:** `cd data-api && bun run build` passes (excluding 4 pre-existing errors).

---

### Task 2 — Controller handlers + new routes

**Files touched:**
- `data-api/src/controllers/environment.controller.ts` — 4 new handler functions appended
- `data-api/src/routes/environmentItem.route.ts` — 4 new routes registered

**New handler functions (appended to `environment.controller.ts`):**

```typescript
// GET /:id/kubernetes/pvcs/:pvcName/files?namespace=&path=
export async function listPVCFiles(req, res)

// GET /:id/kubernetes/pvcs/:pvcName/files/content?namespace=&path=
export async function getPVCFileContent(req, res)

// PUT /:id/kubernetes/pvcs/:pvcName/files/content   body: { namespace, path, content }
export async function updatePVCFileContent(req, res)

// GET /:id/kubernetes/pvcs/:pvcName/files/download?namespace=&path=
export async function downloadPVCFile(req, res)
```

**`listPVCFiles` logic:**
1. Validate `path` query param: required, must start with `/`, no `..`.
2. Call `envService.getEnvironmentWithConfig(id)` to get env + decrypted cfg.
3. Check `KubernetesClient.getPVCAccessModes` + `getPodsUsingPVC`.
4. If RWO and conflicting pods exist → `res.status(409).json({ error: "pvc_conflict", conflicting_pod: pods[0], message: "..." })`.
5. Call `KubernetesClient.listPVCFiles(cfg, namespace, pvcName, path)`.
6. Return `res.json(entries)`.

**`getPVCFileContent` logic:** same conflict check, then `KubernetesClient.getPVCFileContent`.
Return `res.json(result)`. On `FILE_TOO_LARGE` error → `res.status(413).json(...)`.

**`updatePVCFileContent` logic:** validate `{ namespace, path, content }` body via Zod.
Same conflict check, then `KubernetesClient.updatePVCFileContent`.
Return `res.status(204).send()`.

**`downloadPVCFile` logic:** same conflict check, then `KubernetesClient.downloadPVCFile`.
Set `Content-Type: application/octet-stream`, `Content-Disposition: attachment; filename="<fileName>"`.
Pipe `stream` to `res`.

**New routes (appended to `environmentItem.route.ts`):**
```
GET  /:id/kubernetes/pvcs/:pvcName/files            viewer   environmentController.listPVCFiles
GET  /:id/kubernetes/pvcs/:pvcName/files/content    viewer   environmentController.getPVCFileContent
PUT  /:id/kubernetes/pvcs/:pvcName/files/content    editor   environmentController.updatePVCFileContent
GET  /:id/kubernetes/pvcs/:pvcName/files/download   viewer   environmentController.downloadPVCFile
```

Note: `/files/download` and `/files/content` must be registered **before** `/files` to avoid
Express matching `/files` first.

**Acceptance:** `cd data-api && bun run build` passes; `bun run test` — no new failures.

---

## Phase 2 — Frontend: types, API, and components

### Task 3 — New types + API functions

**Files touched:**
- `frontend/src/types/index.ts` — append 2 new interfaces
- `frontend/src/lib/api.ts` — append 4 new functions

**New types:**
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

**New API functions:**
```typescript
export async function listK8sPVCFiles(
  envId: string, pvcName: string, namespace: string, path: string
): Promise<K8sPVCFileEntry[]>

export async function getK8sPVCFileContent(
  envId: string, pvcName: string, namespace: string, path: string
): Promise<K8sPVCFileContent>

export async function updateK8sPVCFileContent(
  envId: string, pvcName: string, namespace: string, path: string, content: string
): Promise<void>

export async function downloadK8sPVCFile(
  envId: string, pvcName: string, namespace: string, path: string, fileName: string
): Promise<void>
```

URL pattern: `/environments/:envId/kubernetes/pvcs/:pvcName/files[/content|/download]`

`downloadK8sPVCFile`: same pattern as `downloadDockerVolumeFile` — `fetch` → `blob` → create
`<a>` element → `click()` → `setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 100)`.

**Acceptance:** `cd frontend && bun run build` passes.

---

### Task 4 — `K8sResourceList` component

**File touched:**
- `frontend/src/components/environments/K8sResourceList.tsx` — NEW

**Purpose:** Shared parameterised list renderer. Accepts `kind`, renders columns appropriate for
that kind, fires row-click to open `ResourceDetailPanel`, fires kind-specific row actions.

**Props:**
```typescript
interface K8sResourceListProps {
  environmentId: string;
  namespace: string;
  kind: string;
  onBrowseFiles?: (resource: K8sResource) => void; // only relevant for PVCs
}
```

**Behaviour:**
- Calls `listEnvironmentResources(environmentId, kind, namespace)` on mount and on `namespace` change.
- Shows `<Spinner>` while loading, empty state if no results.
- Renders a `<Table>` with base columns (Name, Namespace, Age) + kind-specific extra columns
  derived from `resource.raw` (the existing `K8sResource` shape) or inferred from `resource.status`.
- For `"pods"`: Status chip, "Logs" button → `PodLogViewer`.
- For `"persistentvolumeclaims"`: Status chip, access mode, capacity, "Browse Files" button
  → calls `onBrowseFiles(resource)`.
- All kinds: row click → calls `onRowClick(resource)` prop (detail panel handled in parent).

**Column configuration map (internal constant):**
```typescript
const KIND_EXTRA_COLUMNS: Record<string, string[]> = {
  pods: ["status", "logs_action"],
  deployments: ["ready"],
  statefulsets: ["ready"],
  daemonsets: ["desired", "ready"],
  jobs: ["status"],
  cronjobs: ["schedule"],
  services: ["type", "clusterip"],
  ingresses: ["hosts"],
  persistentvolumeclaims: ["status", "accessmode", "capacity", "browse_action"],
  configmaps: ["keys"],
  secrets: ["type", "keys"],
};
```

The component reads extra fields from `resource.labels` or a `resource.extra` bag that the
existing `listEnvironmentResources` API already returns (if it doesn't, the extra columns show
`"—"` gracefully — no backend changes needed for these extras in this task).

**Acceptance:** `cd frontend && bun run build` passes.

---

### Task 5 — `K8sPVCFileBrowserModal` component

**File touched:**
- `frontend/src/components/environments/K8sPVCFileBrowserModal.tsx` — NEW

**Structure:** Direct port of `DockerVolumeFileBrowserModal.tsx` with the following substitutions:

| Docker | K8s |
|---|---|
| `Props.volumeName` | `Props.pvcName` + `Props.namespace` |
| `listDockerVolumeFiles` | `listK8sPVCFiles` |
| `getDockerVolumeFileContent` | `getK8sPVCFileContent` |
| `updateDockerVolumeFileContent` | `updateK8sPVCFileContent` |
| `downloadDockerVolumeFile` | `downloadK8sPVCFile` |
| `DockerVolumeFileEntry` | `K8sPVCFileEntry` |
| `DockerVolumeFileContent` | `K8sPVCFileContent` |

**Additional handling for HTTP 409 conflict:**
- In `loadFiles()`: catch `err.status === 409` separately, extract `conflicting_pod` from the
  error response body, show:
  > `toast.error("PVC conflict", "This PVC is mounted ReadWriteOnce by pod '<name>'. Stop or scale down the pod first, then try again.")`
  Then close the modal.

Everything else (Monaco editor, breadcrumb nav, binary-file fallback, per-file loading state,
`revokeObjectURL` setTimeout) is identical to the Docker implementation.

**Acceptance:** `cd frontend && bun run build` passes.

---

### Task 6 — `K8sResourceExplorer` component

**File touched:**
- `frontend/src/components/environments/K8sResourceExplorer.tsx` — NEW

**Layout:** Two-column flex container.

Left column (fixed `w-48`, `border-r`):
- Namespace `<Select>` + Refresh `<Button>` at the top.
- Vertical menu items grouped under section labels. Clicking an item sets `selectedKind` state.
  Active item highlighted with `bg-primary/10 text-primary font-medium`.

```typescript
const MENU_GROUPS = [
  { label: "Compute",    items: [{ key: "pods",                   label: "Pods" }] },
  { label: "Workloads",  items: [
    { key: "deployments",  label: "Deployments" },
    { key: "statefulsets", label: "StatefulSets" },
    { key: "daemonsets",   label: "DaemonSets" },
    { key: "jobs",         label: "Jobs" },
    { key: "cronjobs",     label: "CronJobs" },
  ]},
  { label: "Networking", items: [
    { key: "services",  label: "Services" },
    { key: "ingresses", label: "Ingresses" },
  ]},
  { label: "Storage",    items: [{ key: "persistentvolumeclaims", label: "PVCs" }] },
  { label: "Config",     items: [
    { key: "configmaps", label: "ConfigMaps" },
    { key: "secrets",    label: "Secrets" },
  ]},
];
```

Right column (`flex-1`, `overflow-y-auto`):
- Renders `<K8sResourceList>` for the selected kind.
- Renders `<ResourceDetailPanel>` as a side panel when a resource row is clicked (same
  `selectedResource` / `resourceDetail` / `detailLoading` state pattern currently in
  `EnvironmentDetail`, now owned here).
- Renders `<K8sPVCFileBrowserModal>` when "Browse Files" is clicked (state: `browsingPVC`).
- Renders `<PodLogViewer>` when "Logs" is clicked (state: `logPod`).

**Props:**
```typescript
interface K8sResourceExplorerProps {
  environmentId: string;
  defaultNamespace?: string;
}
```

**Acceptance:** `cd frontend && bun run build` passes.

---

### Task 7 — Wire up `EnvironmentDetail` + remove `ResourceBrowser`

**Files touched:**
- `frontend/src/pages/EnvironmentDetail.tsx` — swap `ResourceBrowser` for `K8sResourceExplorer`;
  remove `selectedResource`, `resourceDetail`, `detailLoading`, `handleSelectResource`,
  `handleCloseDetail` state (those move into `K8sResourceExplorer`).
- `frontend/src/components/environments/ResourceBrowser.tsx` — **DELETE**

**Changes in `EnvironmentDetail.tsx`:**
1. Replace `import ResourceBrowser from ".../ResourceBrowser"` with
   `import K8sResourceExplorer from ".../K8sResourceExplorer"`.
2. Remove `import ResourceDetailPanel` (it is now used inside `K8sResourceExplorer`).
3. Remove `import { getEnvironmentResource }` from `api` imports (no longer needed at page level).
4. Remove `selectedResource`, `resourceDetail`, `detailLoading` state declarations.
5. Remove `handleSelectResource` and `handleCloseDetail` functions.
6. In the `"resources"` tab section, replace the entire two-column layout div:
   ```tsx
   // BEFORE
   <div className="flex gap-0 h-full -mx-5 -my-5">
     <div className={`overflow-y-auto ...`}>
       <ResourceBrowser ... />
     </div>
     {selectedResource && <div ...><ResourceDetailPanel ... /></div>}
   </div>

   // AFTER
   <K8sResourceExplorer
     environmentId={environment.id}
     defaultNamespace={environment.namespace}
   />
   ```
7. Remove unused `K8sResource` type import if no longer referenced.

**Acceptance:** `cd frontend && bun run build` passes with no new TypeScript errors.

---

## Dependency Order

```
Task 1 ──→ Task 2          (backend, sequential)

Task 3 ──→ Task 5          (types needed by PVC modal)
Task 4                     (list component, no new type deps)

Task 4 ──┐
Task 5 ──┼──→ Task 6 ──→ Task 7
         │
Task 3 ──┘
```

Tasks 3 and 4 can be done in parallel.  
Task 5 requires Task 3.  
Task 6 requires Task 4 and Task 5.  
Task 7 requires Task 6.  
Backend (Tasks 1–2) and frontend (Tasks 3–7) can be done in parallel.
