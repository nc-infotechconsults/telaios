# Endpoint Parity: Legacy TS (data-api) → Python FastAPI (server)

**Status as of Phase 8 (Slices 8.1–8.8)**

Audit compares every route registered in `data-api/src/app.ts` (Express) against the routes
registered in `server/src/telaios/main.py` (FastAPI).

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Ported, same path and method |
| ⚠️ | Ported, but path or method changed (breaking for frontend/clients) |
| ❌ | Not yet ported — gap |
| ➕ | New Python-only endpoint (no TS equivalent) |

---

## 1. Auth

| TS path | Method | Python path | Status |
|---------|--------|-------------|--------|
| `/auth/register` | POST | `/auth/register` | ✅ |
| `/auth/login` | POST | `/auth/login` | ✅ |
| `/auth/me` | GET | `/auth/me` | ✅ |

---

## 2. Users

| TS path | Method | Python path | Status |
|---------|--------|-------------|--------|
| `/users` | GET | `/users` | ✅ |
| `/users/:id` | GET | `/users/{user_id}` | ✅ |
| `/users/:id` | PATCH | `/users/{user_id}` | ✅ |
| `/users/:id` | DELETE | `/users/{user_id}` | ✅ |

---

## 3. Projects

| TS path | Method | Python path | Status |
|---------|--------|-------------|--------|
| `/projects` | GET | `/projects` | ✅ |
| `/projects` | POST | `/projects` | ✅ |
| `/projects/:id` | GET | `/projects/{project_id}` | ✅ |
| `/projects/:id` | PATCH | `/projects/{project_id}` | ✅ |
| `/projects/:id` | DELETE | `/projects/{project_id}` | ✅ |

---

## 4. Repositories

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/projects/:projectId/repositories` | GET | `/projects/{project_id}/repositories` | ✅ | |
| `/projects/:projectId/repositories` | POST | `/projects/{project_id}/repositories` | ✅ | |
| `/projects/:projectId/repositories/:id` | GET | `/projects/{project_id}/repositories/{repo_id}` | ✅ | |
| `/projects/:projectId/repositories/:id` | PATCH | `/projects/{project_id}/repositories/{repo_id}` | ✅ | |
| `/projects/:projectId/repositories/:id` | DELETE | `/projects/{project_id}/repositories/{repo_id}` | ✅ | |
| `/projects/:projectId/repositories/test` | POST | `/repositories/test` | ⚠️ | Project prefix dropped |
| `/repositories/:id` | PATCH | — | ❌ | Standalone repo PATCH used by agent-service (no project context) |

---

## 5. Project Members

| TS path | Method | Python path | Status |
|---------|--------|-------------|--------|
| `/projects/:projectId/members` | GET | `/projects/{project_id}/members` | ✅ |
| `/projects/:projectId/members` | POST | `/projects/{project_id}/members` | ✅ |
| `/projects/:projectId/members/:userId` | PATCH | `/projects/{project_id}/members/{user_id}` | ✅ |
| `/projects/:projectId/members/:userId` | DELETE | `/projects/{project_id}/members/{user_id}` | ✅ |

---

## 6. Project Agents

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/projects/:projectId/agents` | GET | `/projects/{project_id}/agents` | ✅ | |
| `/projects/:projectId/agents` | POST | `/projects/{project_id}/agents` | ✅ | |
| `/projects/:projectId/agents/from-library/:libraryAgentId` | POST | `/projects/{project_id}/agents/clone` | ⚠️ | Path changed; `libraryAgentId` moved to request body |
| `/projects/:projectId/agents/:agentId` | PUT | `/projects/{project_id}/agents/{agent_id}` | ⚠️ | Method PUT → PATCH |
| `/projects/:projectId/agents/:agentId` | DELETE | `/projects/{project_id}/agents/{agent_id}` | ✅ | |
| — | — | `/projects/{project_id}/agents/{agent_id}` | ➕ | GET single agent (new) |

---

## 7. Documents (core)

> **Design change**: Python dropped the `/projects/{project_id}` prefix for *item-scoped* document
> operations. Access control is still enforced by looking up `document.project_id` at the
> dependency level.

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/projects/:projectId/documents` | GET | `/projects/{project_id}/documents` | ✅ | |
| `/projects/:projectId/documents/search` | GET | — | ❌ | Full-text document search not ported |
| `/projects/:projectId/documents/trash` | GET | — | ❌ | Trash list endpoint not ported |
| `/projects/:projectId/documents` | POST | `/projects/{project_id}/documents/upload` | ⚠️ | `/upload` suffix added |
| `/projects/:projectId/documents/:id` | GET | `/documents/{document_id}` | ⚠️ | Project prefix dropped |
| `/projects/:projectId/documents/:id` | PATCH | `/documents/{document_id}` | ⚠️ | Project prefix dropped |
| `/projects/:projectId/documents/:id` | DELETE | `/documents/{document_id}` | ⚠️ | Project prefix dropped |
| `/projects/:projectId/documents/:id/download` | GET | `/documents/{document_id}/download` | ⚠️ | Project prefix dropped |
| `/projects/:projectId/documents/:id/content` | PUT | — | ❌ | Wiki-style content update not ported |
| `/projects/:projectId/documents/:id/restore` | POST | `/documents/{document_id}/restore` | ⚠️ | Project prefix dropped |
| — | — | `/documents/{document_id}/trash` | ➕ | Move-to-trash action (new) |

---

## 8. Document Folders

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/projects/:projectId/folders` | GET | `/projects/{project_id}/folders` | ✅ | |
| `/projects/:projectId/folders/all` | GET | — | ❌ | Flat "list all folders" endpoint not ported |
| `/projects/:projectId/folders` | POST | `/projects/{project_id}/folders` | ✅ | |
| `/projects/:projectId/folders/:id` | GET | `/projects/{project_id}/folders/{folder_id}` | ✅ | |
| `/projects/:projectId/folders/:id` | PATCH | `/projects/{project_id}/folders/{folder_id}` | ✅ | |
| `/projects/:projectId/folders/:id` | DELETE | `/projects/{project_id}/folders/{folder_id}` | ✅ | |

---

## 9. Document Tags

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/projects/:projectId/tags` | GET | `/projects/{project_id}/tags` | ✅ | |
| `/projects/:projectId/tags` | POST | `/projects/{project_id}/tags` | ✅ | |
| `/projects/:projectId/tags/:tagId` | PATCH | `/projects/{project_id}/tags/{tag_id}` | ✅ | |
| `/projects/:projectId/tags/:tagId` | DELETE | `/projects/{project_id}/tags/{tag_id}` | ✅ | |
| `/projects/:projectId/documents/:documentId/tags` | GET | — | ❌ | Get document's assigned tags not ported |
| `/projects/:projectId/documents/:documentId/tags/:tagId` | POST | `/documents/{document_id}/tags/{tag_id}` | ⚠️ | Project prefix dropped |
| `/projects/:projectId/documents/:documentId/tags/:tagId` | DELETE | `/documents/{document_id}/tags/{tag_id}` | ⚠️ | Project prefix dropped |

---

## 10. Document Versions

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/projects/:projectId/documents/:documentId/versions` | GET | `/documents/{document_id}/versions` | ⚠️ | Project prefix dropped |
| `/projects/:projectId/documents/:documentId/versions` | POST | `/documents/{document_id}/versions` | ⚠️ | Project prefix dropped |
| `/projects/:projectId/documents/:documentId/versions/:versionId/download` | GET | `/documents/{document_id}/versions/{version_id}` | ⚠️ | `/download` suffix dropped; endpoint returns metadata + presigned URL |

---

## 11. Document Comments

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/projects/:projectId/documents/:documentId/comments` | GET | `/documents/{document_id}/comments` | ⚠️ | Project prefix dropped |
| `/projects/:projectId/documents/:documentId/comments` | POST | `/documents/{document_id}/comments` | ⚠️ | Project prefix dropped |
| `/projects/:projectId/documents/:documentId/comments/:commentId` | PATCH | `/documents/{document_id}/comments/{comment_id}` | ⚠️ | Project prefix dropped |
| `/projects/:projectId/documents/:documentId/comments/:commentId` | DELETE | `/documents/{document_id}/comments/{comment_id}` | ⚠️ | Project prefix dropped |

---

## 12. Document Activities

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/projects/:projectId/documents/:documentId/activity` | GET | `/documents/{document_id}/activity` | ⚠️ | Project prefix dropped |
| `/projects/:projectId/activity/documents` | GET | `/projects/{project_id}/activity/documents` | ✅ | |

---

## 13. Document Favorites

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/projects/:projectId/favorites` | GET | `/projects/{project_id}/favorites` | ✅ | |
| `/projects/:projectId/documents/:documentId/favorite` | GET | — | ❌ | Check-favorite endpoint not ported |
| `/projects/:projectId/documents/:documentId/favorite` | POST | `/documents/{document_id}/favorite` | ⚠️ | Project prefix dropped |
| `/projects/:projectId/documents/:documentId/favorite` | DELETE | `/documents/{document_id}/favorite` | ⚠️ | Project prefix dropped |
| — | — | `/documents/favorites` | ➕ | User's favorites (cross-project, new) |

---

## 14. Document Templates

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/templates` | GET | `/templates` | ✅ | |
| `/templates/:templateId` | GET | — | ❌ | Get single global template not ported |
| `/templates/:templateId` | PATCH | `/templates/{template_id}` | ✅ | |
| `/templates/:templateId` | DELETE | `/templates/{template_id}` | ✅ | |
| `/projects/:projectId/templates` | GET | `/projects/{project_id}/templates` | ✅ | |
| `/projects/:projectId/templates` | POST | `/projects/{project_id}/templates` | ✅ | |

---

## 15. Document Copilot

> **Design change**: Python dropped the `/projects/{project_id}` prefix; added `/chat` endpoint.

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/projects/:projectId/documents/:id/copilot/summarize` | POST | `/documents/{document_id}/copilot/summarize` | ⚠️ | Project prefix dropped |
| `/projects/:projectId/documents/:id/copilot/ask` | POST | `/documents/{document_id}/copilot/ask` | ⚠️ | Project prefix dropped |
| `/projects/:projectId/documents/:id/copilot/extract` | POST | `/documents/{document_id}/copilot/extract` | ⚠️ | Project prefix dropped |
| — | — | `/documents/{document_id}/copilot/chat` | ➕ | Multi-turn copilot chat (new) |

---

## 16. Workspaces

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/projects/:projectId/workspaces` | GET | `/projects/{project_id}/workspaces` | ✅ | |
| `/projects/:projectId/workspaces` | POST | `/projects/{project_id}/workspaces` | ✅ | |
| `/workspaces/:id` | GET | `/workspaces/{workspace_id}` | ✅ | |
| `/workspaces/:id` | PATCH | `/workspaces/{workspace_id}` | ✅ | |
| `/workspaces/:id` | DELETE | `/workspaces/{workspace_id}` | ✅ | |
| `/workspaces/:id/launch` | POST | — | ❌ | Workspace launch not ported |

---

## 17. Environments

> **Design change**: Python merged the two-segment TS layout (`/projects/:projectId/environments` +
> `/environments/:id`) into a single fully-nested path
> `/projects/{project_id}/environments/{env_id}`. Helm/resource/kubernetes operations follow the
> same prefix. Docker container/image/volume/network operations remain at
> `/environments/{env_id}/docker/...` (matching the TS `/environments/:id/docker/...` prefix).

### 17a. Environment CRUD & Helm

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/projects/:projectId/environments` | GET | `/projects/{project_id}/environments` | ✅ | |
| `/projects/:projectId/environments` | POST | `/projects/{project_id}/environments` | ✅ | |
| `/environments/:id` | GET | `/projects/{project_id}/environments/{env_id}` | ⚠️ | Path restructured |
| `/environments/:id` | PATCH | `/projects/{project_id}/environments/{env_id}` | ⚠️ | Path restructured |
| `/environments/:id` | DELETE | `/projects/{project_id}/environments/{env_id}` | ⚠️ | Path restructured |
| `/environments/:id/test` | POST | `/projects/{project_id}/environments/{env_id}/test` | ⚠️ | Path restructured |
| `/environments/:id/resources` | GET | `/projects/{project_id}/environments/{env_id}/resources` | ⚠️ | Path restructured |
| `/environments/:id/resources/:kind/:name` | GET | `/projects/{project_id}/environments/{env_id}/resources/{kind}/{name}` | ⚠️ | Path restructured |
| `/environments/:id/resources/:kind/:name/logs` | GET | `/projects/{project_id}/environments/{env_id}/resources/{kind}/{name}/logs` | ⚠️ | Path restructured |
| `/environments/:id/helm/install` | POST | `/projects/{project_id}/environments/{env_id}/helm/install` | ⚠️ | Path restructured |
| `/environments/:id/helm/releases` | GET | `/projects/{project_id}/environments/{env_id}/helm/releases` | ⚠️ | Path restructured |
| `/environments/:id/helm/releases/:releaseName` | PUT | `/projects/{project_id}/environments/{env_id}/helm/releases/{release_name}` | ⚠️ | Path restructured |
| `/environments/:id/helm/releases/:releaseName` | DELETE | `/projects/{project_id}/environments/{env_id}/helm/releases/{release_name}` | ⚠️ | Path restructured |
| `/environments/:id/helm/charts/scan` | GET | `/projects/{project_id}/environments/{env_id}/helm/charts/scan` | ⚠️ | Path restructured |

### 17b. Kubernetes PVC (missing)

| TS path | Method | Python path | Status |
|---------|--------|-------------|--------|
| `/environments/:id/kubernetes/pvcs/:pvcName/files` | GET | — | ❌ |
| `/environments/:id/kubernetes/pvcs/:pvcName/files/content` | GET | — | ❌ |
| `/environments/:id/kubernetes/pvcs/:pvcName/files/content` | PUT | — | ❌ |
| `/environments/:id/kubernetes/pvcs/:pvcName/files/download` | GET | — | ❌ |

### 17c. Docker Containers

| TS path | Method | Python path | Status |
|---------|--------|-------------|--------|
| `/environments/:id/docker/containers` | GET | `/environments/{env_id}/docker/containers` | ✅ |
| `/environments/:id/docker/containers` | POST | `/environments/{env_id}/docker/containers` | ✅ |
| `/environments/:id/docker/containers/:containerId` | GET | `/environments/{env_id}/docker/containers/{container_id}` | ✅ |
| `/environments/:id/docker/containers/:containerId/logs` | GET | `/environments/{env_id}/docker/containers/{container_id}/logs` | ✅ |
| `/environments/:id/docker/containers/:containerId/stats` | GET | `/environments/{env_id}/docker/containers/{container_id}/stats` | ✅ |
| `/environments/:id/docker/containers/:containerId/start` | POST | `/environments/{env_id}/docker/containers/{container_id}/start` | ✅ |
| `/environments/:id/docker/containers/:containerId/stop` | POST | `/environments/{env_id}/docker/containers/{container_id}/stop` | ✅ |
| `/environments/:id/docker/containers/:containerId/restart` | POST | `/environments/{env_id}/docker/containers/{container_id}/restart` | ✅ |
| `/environments/:id/docker/containers/:containerId/exec` | POST | `/environments/{env_id}/docker/containers/{container_id}/exec` | ✅ |
| `/environments/:id/docker/containers/:containerId` | DELETE | `/environments/{env_id}/docker/containers/{container_id}` | ✅ |

### 17d. Docker Images

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/environments/:id/docker/images` | GET | `/environments/{env_id}/docker/images` | ✅ | |
| `/environments/:id/docker/images/:imageId/inspect` | GET | `/environments/{env_id}/docker/images/{image_id}` | ⚠️ | `/inspect` suffix dropped |
| `/environments/:id/docker/images/pull` | POST | — | ❌ | Docker image pull not ported |
| `/environments/:id/docker/images/prune` | POST | `/environments/{env_id}/docker/images/prune` | ✅ | |
| `/environments/:id/docker/images/:imageId/tag` | POST | `/environments/{env_id}/docker/images/{image_id}/tag` | ✅ | |
| `/environments/:id/docker/images/:imageId` | DELETE | `/environments/{env_id}/docker/images/{image_id}` | ✅ | |

### 17e. Docker Volumes

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/environments/:id/docker/volumes` | GET | `/environments/{env_id}/docker/volumes` | ✅ | |
| `/environments/:id/docker/volumes` | POST | `/environments/{env_id}/docker/volumes` | ✅ | |
| `/environments/:id/docker/volumes/:volumeName/inspect` | GET | — | ❌ | Volume inspect not ported |
| `/environments/:id/docker/volumes/:volumeName/files` | GET | `/environments/{env_id}/docker/volumes/{name}/files` | ✅ | |
| `/environments/:id/docker/volumes/:volumeName/files/content` | GET | `/environments/{env_id}/docker/volumes/{name}/files/content` | ✅ | |
| `/environments/:id/docker/volumes/:volumeName/files/content` | PUT | `/environments/{env_id}/docker/volumes/{name}/files/content` | ✅ | |
| `/environments/:id/docker/volumes/:volumeName/files/download` | GET | `/environments/{env_id}/docker/volumes/{name}/files` | ✅ | |
| `/environments/:id/docker/volumes/:volumeName` | DELETE | `/environments/{env_id}/docker/volumes/{name}` | ✅ | |
| `/environments/:id/docker/volumes/prune` | POST | `/environments/{env_id}/docker/volumes/prune` | ✅ | |

### 17f. Docker Networks

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/environments/:id/docker/networks` | GET | `/environments/{env_id}/docker/networks` | ✅ | |
| `/environments/:id/docker/networks/:networkId/inspect` | GET | `/environments/{env_id}/docker/networks/{network_id}` | ⚠️ | `/inspect` suffix dropped |
| `/environments/:id/docker/networks` | POST | `/environments/{env_id}/docker/networks` | ✅ | |
| `/environments/:id/docker/networks/prune` | POST | `/environments/{env_id}/docker/networks/prune` | ✅ | |
| `/environments/:id/docker/networks/:networkId` | DELETE | `/environments/{env_id}/docker/networks/{network_id}` | ✅ | |

### 17g. Docker Shell (WebSocket)

| TS path | Method | Python path | Status |
|---------|--------|-------------|--------|
| (N/A in data-api — was in agent-service) | WS | `/ws/environments/{env_id}/docker/shell/{container_id}` | ➕ |

---

## 18. Plans

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/plans` | GET | `/plans` | ✅ | |
| `/plans` | POST | `/plans` | ✅ | |
| `/plans/:id` | GET | `/plans/{plan_id}` | ✅ | |
| `/plans/:id` | PATCH | `/plans/{plan_id}` | ✅ | |
| `/plans/:id` | DELETE | `/plans/{plan_id}` | ✅ | |
| `/plans/:id/tasks` | DELETE | `/plans/{plan_id}/tasks` | ✅ | |
| `/plans/:id/cancel` | POST | `/plans/{plan_id}/cancel` | ✅ | |
| `/plans/:id/messages` | GET | `/plans/{plan_id}/messages` | ✅ | |
| — | — | `/projects/{project_id}/plans` | ➕ | Project-scoped plan list/create (new) |
| — | — | `/plans/{plan_id}/tasks` | ➕ | List/create tasks on plan (new) |
| — | — | `/plans/{plan_id}/resume` | ➕ | Resume a paused plan (new) |

---

## 19. Tasks

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/tasks` | GET | `/tasks` | ✅ | |
| `/tasks` | POST | `/tasks` | ✅ | |
| `/tasks/:id` | GET | `/tasks/{task_id}` | ✅ | |
| `/tasks/:id` | PATCH | `/tasks/{task_id}` | ✅ | |
| `/tasks/:id/retry` | POST | `/tasks/{task_id}/retry` | ✅ | |
| `/tasks/:id/cancel` | POST | `/tasks/{task_id}/cancel` | ✅ | |
| `/tasks/:id/artifacts` | GET | `/tasks/{task_id}/artifacts` | ✅ | |
| — | — | `/tasks/{task_id}/artifacts/bulk` | ➕ | Bulk artifact create (new) |

---

## 20. Messages

> **Design change**: TS mounted messages at flat `/messages` with `project_id` inferred from query/body.
> Python uses explicit path nesting: `/projects/{project_id}/messages`.

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/messages` | GET | `/projects/{project_id}/messages` | ⚠️ | Path restructured |
| `/messages` | POST | `/projects/{project_id}/messages` | ⚠️ | Path restructured |
| — | — | `/chat/{plan_id}/stream` | ➕ | SSE streaming chat (new) |
| — | — | `/chat/{plan_id}/message` | ➕ | Send chat message (new) |

---

## 21. Settings

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/settings` | GET | `/settings` | ✅ | |
| `/settings` | PATCH | `/settings` | ✅ | |
| `/settings/raw` | GET | — | ❌ | Admin raw settings dump not ported |

---

## 22. Library

> **Design change**: `/library/mcps` → `/library/mcp` (singular). Library update methods changed
> from PUT → PATCH.

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/library/agents` | GET | `/library/agents` | ✅ | |
| `/library/agents` | POST | `/library/agents` | ✅ | |
| `/library/agents/:id` | GET | `/library/agents/{agent_id}` | ✅ | |
| `/library/agents/:id` | PUT | `/library/agents/{agent_id}` | ⚠️ | Method PUT → PATCH |
| `/library/agents/:id` | DELETE | `/library/agents/{agent_id}` | ✅ | |
| `/library/mcps` | GET | `/library/mcp` | ⚠️ | Path `/mcps` → `/mcp` |
| `/library/mcps` | POST | `/library/mcp` | ⚠️ | Path `/mcps` → `/mcp` |
| `/library/mcps/:id` | GET | `/library/mcp/{mcp_id}` | ⚠️ | Path `/mcps` → `/mcp` |
| `/library/mcps/:id` | PUT | `/library/mcp/{mcp_id}` | ⚠️ | Path `/mcps` → `/mcp`; PUT → PATCH |
| `/library/mcps/:id` | DELETE | `/library/mcp/{mcp_id}` | ⚠️ | Path `/mcps` → `/mcp` |
| `/library/skills` | GET | `/library/skills` | ✅ | |
| `/library/skills` | POST | `/library/skills` | ✅ | |
| `/library/skills/:id` | GET | `/library/skills/{skill_id}` | ✅ | |
| `/library/skills/:id/export` | GET | `/library/skills/{skill_id}/download` | ⚠️ | `/export` → `/download` |
| `/library/skills/:id` | PUT | `/library/skills/{skill_id}` | ⚠️ | Method PUT → PATCH |
| `/library/skills/:id` | DELETE | `/library/skills/{skill_id}` | ✅ | |
| — | — | `/library/agents/by-slug/{slug}` | ➕ | Slug-based agent lookup (new) |
| — | — | `/library/agents/{agent_id}/usage` | ➕ | Public usage increment (new) |

---

## 23. Agent Profiles

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/agent-profiles` | GET | `/agent-profiles` | ✅ | |
| `/agent-profiles` | POST | `/agent-profiles` | ✅ | |
| `/agent-profiles/:id` | GET | `/agent-profiles/{profile_id}` | ✅ | |
| `/agent-profiles/:id` | PATCH | `/agent-profiles/{profile_id}` | ✅ | |
| `/agent-profiles/:id` | DELETE | `/agent-profiles/{profile_id}` | ✅ | |
| `/agent-profiles/mcp-discover` | POST | — | ❌ | MCP tool discovery not ported |

---

## 24. LLM

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/llm/providers` | GET | — | ❌ | LLM provider list not ported |

---

## 25. Analytics

> **Design change**: Analytics paths reorganised under `/analytics/*`.

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/projects/:projectId/analytics` | GET | `/analytics/projects/{project_id}` | ⚠️ | Path reorganised |
| `/projects/:projectId/analytics/documents` | GET | `/analytics/projects/{project_id}/docs` | ⚠️ | Path reorganised; `/documents` → `/docs` |
| `/analytics` | GET | `/analytics/org` | ⚠️ | Path reorganised |
| — | — | `/analytics/org/all` | ➕ | Admin: all-orgs analytics (new) |

---

## 26. Internal (service-to-service)

> **Design change**: Some internal paths were restructured for clarity.

| TS path | Method | Python path | Status | Note |
|---------|--------|-------------|--------|------|
| `/internal/documents/:id/status` | PATCH | `/internal/documents/{document_id}/status` | ✅ | |
| `/internal/documents/:id/chunks` | POST | `/internal/documents/{document_id}/chunks` | ✅ | |
| `/internal/documents/search` | POST | `/internal/documents/chunks/search` | ⚠️ | `/search` → `/chunks/search` |
| `/internal/plans/:id/status` | PATCH | `/internal/plans/{plan_id}/status` | ✅ | |
| `/internal/tasks/:id/skip-dependents` | POST | `/internal/tasks/{task_id}/skip-dependents` | ✅ | |
| `/internal/plans/:id/cancel-tasks` | POST | `/internal/plans/{plan_id}/cancel-tasks` | ✅ | |
| `/internal/tasks/:id/artifacts` | POST | `/internal/tasks/{task_id}/artifacts/bulk` | ⚠️ | `/artifacts` → `/artifacts/bulk` |
| `/internal/project-agents/:projectId` | GET | `/internal/projects/{project_id}/agents/raw` | ⚠️ | Path restructured |
| `/internal/library-agents/:id/usage-count` | PATCH | `/internal/library/agents/{agent_id}/increment-usage` | ⚠️ | Path restructured; PATCH → POST |

---

## 27. Health (Python-only)

| Python path | Method | Note |
|-------------|--------|------|
| `/health` | GET | ➕ |
| `/ready` | GET | ➕ |
| `/version` | GET | ➕ |

---

## 28. Document Extraction & Jobs (Python-only)

| Python path | Method | Note |
|-------------|--------|------|
| `/documents/{document_id}/analyze` | POST | ➕ |
| `/documents/{document_id}/convert` | POST | ➕ |
| `/documents/{document_id}/extract` | POST | ➕ |
| `/documents/{document_id}/summarize` | POST | ➕ |
| `/documents/{document_id}/compare` | POST | ➕ |
| `/documents/{document_id}/analyze/async` | POST | ➕ |
| `/documents/{document_id}/convert/async` | POST | ➕ |
| `/documents/{document_id}/extract/async` | POST | ➕ |
| `/documents/{document_id}/summarize/async` | POST | ➕ |
| `/document-jobs/{job_id}` | GET | ➕ |
| `/document-jobs` | GET | ➕ |

---

## 29. Skills (Python-only)

| Python path | Method | Note |
|-------------|--------|------|
| `/skills` | GET | ➕ |
| `/skills/search` | GET | ➕ |
| `/skills/{name}` | GET | ➕ |
| `/skills/{name}/scripts` | GET | ➕ |
| `/skills/reload` | POST | ➕ |
| `/skills/install` | POST | ➕ |

---

## Summary

| Category | ✅ Ported | ⚠️ Path/method changed | ❌ Gap |
|----------|-----------|----------------------|-------|
| Auth | 3 | 0 | 0 |
| Users | 4 | 0 | 0 |
| Projects | 5 | 0 | 0 |
| Repositories | 5 | 1 | 1 |
| Project Members | 4 | 0 | 0 |
| Project Agents | 4 | 2 | 0 |
| Documents (core) | 1 | 6 | 3 |
| Document Folders | 5 | 0 | 1 |
| Document Tags | 4 | 2 | 1 |
| Document Versions | 0 | 3 | 0 |
| Document Comments | 0 | 4 | 0 |
| Document Activities | 1 | 1 | 0 |
| Document Favorites | 1 | 2 | 1 |
| Document Templates | 3 | 0 | 1 |
| Document Copilot | 0 | 3 | 0 |
| Workspaces | 5 | 0 | 1 |
| Environments (CRUD+Helm) | 2 | 13 | 0 |
| Environments (K8s PVC) | 0 | 0 | 4 |
| Docker Containers | 10 | 0 | 0 |
| Docker Images | 4 | 1 | 1 |
| Docker Volumes | 6 | 0 | 1 |
| Docker Networks | 4 | 1 | 0 |
| Plans | 7 | 0 | 0 |
| Tasks | 7 | 0 | 0 |
| Messages | 0 | 2 | 0 |
| Settings | 2 | 0 | 1 |
| Library | 8 | 7 | 0 |
| Agent Profiles | 5 | 0 | 1 |
| LLM | 0 | 0 | 1 |
| Analytics | 1 | 3 | 0 |
| Internal | 5 | 4 | 0 |
| **Total** | **106** | **55** | **17** |

### Gaps requiring future phases

The 17 missing endpoints are:

1. `PATCH /repositories/:id` — Standalone repo status update (used by agent-service, no project context)
2. `GET /projects/:projectId/documents/search` — Full-text document search
3. `GET /projects/:projectId/documents/trash` — List trashed documents
4. `PUT /projects/:projectId/documents/:id/content` — Wiki-style content update
5. `GET /projects/:projectId/folders/all` — Flat list all folders
6. `GET /projects/:projectId/documents/:documentId/tags` — Get document's tag list
7. `GET /projects/:projectId/documents/:documentId/favorite` — Check if document is favorited
8. `GET /templates/:templateId` — Get single global template
9. `POST /workspaces/:id/launch` — Launch workspace
10. `GET /environments/:id/kubernetes/pvcs/:pvcName/files` — List PVC files
11. `GET /environments/:id/kubernetes/pvcs/:pvcName/files/content` — Read PVC file
12. `PUT /environments/:id/kubernetes/pvcs/:pvcName/files/content` — Write PVC file
13. `GET /environments/:id/kubernetes/pvcs/:pvcName/files/download` — Download PVC file
14. `POST /environments/:id/docker/images/pull` — Pull Docker image
15. `GET /environments/:id/docker/volumes/:volumeName/inspect` — Inspect Docker volume
16. `GET /settings/raw` — Admin raw settings dump
17. `GET /llm/providers` — LLM provider list
18. `POST /agent-profiles/mcp-discover` — Discover MCP tools

> **Note:** Items 2–4 relate to document wiki-mode (content editing + search + trash recovery).
> Items 10–14 are Kubernetes/Docker infra operations. These can be deferred to a Phase 9 cleanup sprint.
