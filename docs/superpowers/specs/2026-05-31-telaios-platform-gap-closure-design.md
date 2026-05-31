---
title: TelaiOS Platform Gap Closure
date: 2026-05-31
status: approved
---

# TelaiOS Platform Gap Closure Design

## Context

The TelaiOS platform is an agentic-first SDLC management tool. The following are fully implemented and working:

- Project, User CRUD
- Library: LibraryAgent, LibraryMCP, LibrarySkill (global)
- Documents (PDF/Word/Excel/Markdown), folder tree, versioning
- Git repositories (GitHub, GitLab, Bitbucket, S3)
- Team members with roles (ProjectMember)
- Project-scoped agent customization (ProjectAgent)
- Plans → Tasks lifecycle, Execution Dashboard
- Design sessions (DesignSession / DesignChat)
- Knowledge pipeline: Qdrant vector store + FalkorDB graph store
- Glassmorphism UI shell with all 9 project views

## Gaps to Close

### 1. Project Conversation Backend

**Problem:** `Message` model has no participant identity. The `chat` router is scoped to `plan_id`, not `project_id`. The frontend specialist routing is purely client-side with no server AI loop.

**Solution:**

#### DB Changes (migration)
Add columns to `messages` table:
- `sender_type VARCHAR NOT NULL DEFAULT 'user'` — `'user'` or `'agent'`
- `specialist VARCHAR NULL` — e.g. `'qa'`, `'planner'`, `'coder'`, `'designer'`, `'reviewer'`, `'explorer'`, `'reverse'`
- `user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL`

#### New API Endpoints
- `POST /projects/{project_id}/conversation/message` — authenticated; creates a user Message (sender_type=user, user_id=caller); dispatches async agentic turn
- `GET /projects/{project_id}/conversation/stream` — SSE stream for real-time message delivery
- `GET /projects/{project_id}/conversation/messages` — paginated message history

#### ConversationAgent (server-side)
A lightweight router layer that:
1. Receives user message text
2. Detects intent → selects specialist (same keyword rules as the existing frontend `detectSpecialist`)
3. Dispatches to the appropriate agent:
   - `qa` / `explorer` / `reverse` → `RetrievalAgent` with project Qdrant collection + FalkorDB namespace
   - `planner` → `PlannerAgent` (existing)
   - `coder` / `reviewer` / `designer` → `BaseAgent` with specialist system prompt prefix
4. Streams response tokens via SSE
5. Persists completed AI response as Message (sender_type=agent, specialist=detected)

#### Frontend Changes
- `ProjectConversation.tsx`: replace the `queryKnowledge` direct call with a call to the new conversation SSE endpoint
- Messages now show user identity (display_name avatar) for human messages and specialist badge for AI messages
- Add manual specialist override chip strip above the input (user can force a specific specialist)

---

### 2. Project-Scoped Skills and MCPs

**Problem:** `ProjectAgent.skills` and `ProjectAgent.mcp_servers` are JSONB arrays — no standalone project-level entities exist for creating skills/MCPs scoped to a single project.

**Solution:**

#### New DB Tables

`project_skills`:
- `id UUID PK`
- `project_id UUID FK projects.id`
- `name VARCHAR`
- `slug VARCHAR`
- `description TEXT NULL`
- `content TEXT` — the skill markdown/content
- `cloned_from_library_skill_id UUID NULL` — optional provenance
- soft-delete + audit mixin

`project_mcps`:
- `id UUID PK`
- `project_id UUID FK projects.id`
- `name VARCHAR`
- `slug VARCHAR`
- `description TEXT NULL`
- `transport VARCHAR` — stdio | sse | http
- `command VARCHAR NULL`
- `args JSONB DEFAULT []`
- `env JSONB DEFAULT {}`
- `url VARCHAR NULL`
- `headers JSONB DEFAULT {}`
- `cloned_from_library_mcp_id UUID NULL`
- soft-delete + audit mixin

#### New Modules
- `modules/projects/skills/` — router, service, repository, schemas (full CRUD: list, get, create, update, delete, clone-from-library)
- `modules/projects/mcps/` — same pattern

#### Frontend Changes
- `ProjectAgents.tsx`: add "Project Resources" section with two sub-tabs: "Skills" and "MCPs"
- Each sub-tab shows project-scoped items with create/edit/delete; "Add from library" button opens `LibraryBrowserModal` to clone
- When editing a `ProjectAgent`, skill/MCP pickers now include both library items and project-scoped items

---

### 3. Design Layer Types

**Problem:** All `DesignSession` records are undifferentiated — no way to organize or prime by layer type.

**Solution:**

#### DB Changes (migration)
Add `layer_type VARCHAR NOT NULL DEFAULT 'general'` to `design_sessions`.

Values: `er_diagram | ui_interface | system_architecture | data_flow | api_spec | sequence_diagram | general`

#### Agent System Prompt Prefixes per Layer
- `er_diagram` — "You are an expert database designer. Output ER diagrams using Mermaid erDiagram notation..."
- `ui_interface` — "You are a senior UI/UX designer. Describe wireframes and components using Tailwind class names..."
- `system_architecture` — "You are a systems architect. Output architecture diagrams using Mermaid C4 or flowchart notation..."
- `data_flow` — "You are a data engineer. Describe data flows using Mermaid flowchart notation..."
- `api_spec` — "You are an API designer. Output OpenAPI 3.1 YAML fragments..."
- `sequence_diagram` — "You are a software engineer. Output sequence diagrams using Mermaid sequenceDiagram notation..."
- `general` — no prefix (current behavior)

#### Frontend Changes
- `ProjectDesigns.tsx`: when creating a new session, show a layer type picker (grid of cards with icons)
- Sessions are grouped by layer type with distinct color-coded section headers
- `DesignChat.tsx`: the session header shows the layer type badge

---

### 4. Knowledge Pipeline Wiring

**Problem:** The knowledge pipeline (Qdrant + FalkorDB) is functional but not connected to the project conversation agent on the server side.

**Solution:**

#### Server-Side Wiring
- `ConversationAgent` (from Gap 1) imports `RetrievalAgent` and passes:
  - `collection_name = f"project_{project_id}"` (Qdrant)
  - `graph_name = f"project_{project_id}"` (FalkorDB)
- No changes to the knowledge pipeline itself

#### New Endpoint
- `GET /projects/{project_id}/knowledge/status` → returns `{ document_count, repo_count, last_indexed_at, vector_count }`
- Used by `ProjectDashboard` to show KB health widget

#### Frontend Changes
- `ProjectDashboard.tsx`: add "Knowledge Base" card showing doc count, repo count, vector count, last indexed
- `ProjectConversation.tsx`: show a "KB indexed" chip in the header indicating knowledge is available

---

## Data Model Summary

```
messages
  + sender_type VARCHAR NOT NULL DEFAULT 'user'
  + specialist VARCHAR NULL
  + user_id UUID NULL REFERENCES users(id)

design_sessions
  + layer_type VARCHAR NOT NULL DEFAULT 'general'

project_skills (NEW TABLE)
  id, project_id, name, slug, description, content,
  cloned_from_library_skill_id, soft-delete + audit

project_mcps (NEW TABLE)
  id, project_id, name, slug, description, transport,
  command, args, env, url, headers,
  cloned_from_library_mcp_id, soft-delete + audit
```

## Migration Plan

1. Alembic migration: add `sender_type`, `specialist`, `user_id` to `messages`; add `layer_type` to `design_sessions`; create `project_skills` and `project_mcps` tables
2. Backend modules: `projects/conversation`, `projects/skills`, `projects/mcps` + `ConversationAgent`
3. Frontend: update `ProjectConversation`, `ProjectDesigns`, `ProjectAgents`, `ProjectDashboard`

## Out of Scope

- Changes to the Plans/Tasks/Execution pipeline (already working)
- Changes to the Qdrant/FalkorDB knowledge pipeline internals
- Changes to the global Library (already working)
- Docker/K8s environments (already working)

## Risks

- `ConversationAgent` agent dispatch adds latency — mitigated by streaming SSE
- Alembic migration touches `messages` which may be large — safe (only adding nullable/defaulted columns)
