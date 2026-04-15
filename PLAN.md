# SWE AI Platform — Implementation Plan

## Problem Statement

Build a web-based platform where users plan software projects through a conversation with an AI Planning Agent. The agent interviews the user, and — knowing the pool of available **specialized agent profiles** (each configured with specific LLM, MCP tools, and skills) — produces a dependency-ordered execution plan that assigns each task to the most suitable agent profile. After user confirmation, a coordinator dispatches tasks to coding agent instances pre-configured with the matching profile.

---

## Chosen Stack

| Layer | Technology |
|---|---|
| Frontend | Vite + React (CSR), TypeScript, HeroUI, React Flow (`@xyflow/react`), React Context + useReducer |
| Data API | TypeScript + Express + TypeORM + PostgreSQL |
| Agent Service | TypeScript + Express + LangGraph.js (`@langchain/langgraph`) |
| LLM Abstraction | LangChain.js — `@langchain/openai`, `@langchain/anthropic`; OpenAI-compatible base URL for on-prem |
| Real-time | WebSockets (express-ws) |
| Cache / Pub-Sub | Redis (ioredis) |
| Coding Agents | Abstract `CodingAgentDriver` — LangGraph, OpenCode SDK, GitHub Copilot SDK |
| Infra | Docker Compose |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│              FRONTEND (Vite + React CSR, :5173)                  │
│  ProjectList  │  PlanningChat  │  ExecutionDashboard  │  Config  │
└────────┬───────────────────────────────────────────────┬─────────┘
         │ WebSocket /ws/:projectId                      │ REST /api
         │                                               │
┌────────▼─────────────────────┐    ┌───────────────────▼──────────┐
│ Agent Service (Express, :8000)│    │ Data API (Express, :3000)    │
│  WebSocket Gateway            │◄───│  /projects /plans /tasks     │
│  Planning Agent (LangGraph)   │    │  /messages /settings         │
│  Agent Pool Coordinator       │    │  /agent-profiles             │
│  LangGraph / OpenCode /       │    │  /projects/:id/repositories  │
│  GitHub Copilot Drivers       │    │  TypeORM → PostgreSQL        │
└──────────────┬────────────────┘    └──────────────────────────────┘
               │ Redis pub/sub
          PostgreSQL + Redis
```

---

## Project Structure

```
swe-ai-platform/
├── frontend/src/
│   ├── pages/
│   │   ├── ProjectList.tsx        # "/" — list + create projects
│   │   ├── PlanningChat.tsx       # "/projects/:id" — chat + plan sidebar + repos tab
│   │   ├── ExecutionDashboard.tsx # "/projects/:id/execute" — DAG + agent pool
│   │   ├── AgentProfiles.tsx      # "/agents" — CRUD for agent profiles
│   │   └── Settings.tsx           # "/settings" — Planning Agent LLM config
│   ├── components/
│   │   ├── chat/                  # ChatWindow, MessageBubble, ChatInput
│   │   ├── plan/                  # PlanDAG, TaskCard, PlanConfirmModal, PlanSidebar,
│   │   │                          # PlanDraftCard, RepositorySetup
│   │   ├── agents/                # AgentPoolPanel, AgentStatusBadge, AgentProfileForm
│   │   └── settings/              # ProviderForm
│   ├── lib/api.ts                 # REST client → Data API (via Vite proxy)
│   ├── lib/ws.ts                  # useProjectWebSocket hook
│   ├── stores/appStore.tsx        # React Context + useReducer
│   └── types/index.ts             # Shared TypeScript types
│
├── data-api/src/
│   ├── entities/                  # Project, Repository, Plan, Task, TaskDependency,
│   │                              # TaskRepository, Message, Settings, AgentProfile
│   ├── routes/                    # projects, repositories, plans, tasks, messages,
│   │                              # settings, agentProfiles
│   ├── middleware/crypto.ts       # AES-256-CBC encryption (API keys, tokens)
│   └── data-source.ts             # TypeORM DataSource
│
├── agent-service/src/
│   ├── agents/planning/           # graph.ts, nodes.ts, state.ts (LangGraph)
│   ├── agents/coordinator/
│   │   ├── drivers/               # base.ts, langgraph.ts, opencode.ts, githubCopilot.ts
│   │   ├── pool.ts                # AgentPool (instantiates drivers per profile)
│   │   └── scheduler.ts           # Topological dispatch, git clone, Redis pub/sub
│   ├── services/                  # dataClient, planningService, executionService, wsManager
│   └── core/                      # config (zod), redis, llm factory, crypto, types
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Data Models (TypeORM Entities — owned by `data-api`)

### Project
```
id (uuid), name, description, status (planning|executing|done), created_at
```

### Repository
```
id (uuid), project_id FK, name, remote_url, branch,
auth_type (none|token|ssh), credentials (encrypted),
local_clone_path, status (unconfigured|cloning|ready|error),
error_message, updated_at
```

Multiple repositories per project (many-to-one). Different services in a distributed architecture can live in separate repos. Each repository is given a short **name label** (e.g. `"api-service"`, `"frontend"`) used as the key in the per-task workspace dict.

### Plan
```
id (uuid), project_id FK, status (draft|confirmed|executing|completed),
created_at, confirmed_at
```

### Task
```
id (uuid), plan_id FK, title, description, type (code|test|review|general),
status (pending|ready|in_progress|done|failed),
execution_order (int), agent_profile_id FK, assigned_instance_id,
result (text), created_at, updated_at
```

### TaskRepository (many-to-many join)
```
task_id FK, repository_id FK  — PRIMARY KEY (task_id, repository_id)
```

A task can reference multiple repositories — e.g. "write a gRPC client in service-A that calls service-B" needs both repos cloned. The coordinator passes all referenced repos as `{ repo_name → local_clone_path }` to the driver.

### TaskDependency
```
task_id FK, depends_on_task_id FK
```

### Message
```
id (uuid), project_id FK, role (user|assistant|system), content, created_at
```

### Settings (singleton — id=1)
```
llm_provider, llm_model, llm_api_key (encrypted), llm_base_url (optional), updated_at
```

Fetched by the agent-service at the start of each planning session — UI changes take effect immediately without restarting.

### AgentProfile
```
id (uuid), name, description,
agent_type enum: "langgraph" | "opencode" | "github-copilot",

# LLM config (langgraph + opencode + copilot BYOK mode):
llm_provider, llm_model, llm_api_key (encrypted), llm_base_url (optional),

# GitHub Copilot SDK:
github_token (encrypted),  -- GitHub token with Copilot access (subscription auth)
                            -- Leave blank to use BYOK mode (own API keys above)

# MCP Servers (langgraph + opencode):
mcp_servers jsonb: [{ name, transport: "sse"|"stdio", url?, command?, args?, env? }]

# Claude Skills (all drivers):
skills jsonb: [{ name, description, parameters, outputs?, instructions }]
  -- instructions = markdown step-by-step body (SKILL.md format)

created_at, updated_at
```

**Three agent driver types:**

- **`langgraph`** *(default)*: Pure TypeScript LangGraph.js agent with file/shell/git tools. No external binary. Full programmatic control. Works with any LLM.
- **`opencode`**: OpenCode TypeScript SDK. Skills materialized as `.skills/<name>/SKILL.md` in workspace. MCP servers configured via SDK profile API.
- **`github-copilot`**: `@github/copilot-sdk` — embeds Copilot's agentic engine via JSON-RPC. Supports GitHub subscription auth (token) or BYOK (own API keys — no subscription required).

---

## Planning Agent — LangGraph Graph

```
START → greet → interview → draft_plan → review
           ↑                               │
           │    (user requests changes)    ↓
           └──────────────────────── refine
                                          │ (user confirms)
                                          ↓
                                       confirm → END
```

- **greet**: Introduce the agent and set context
- **interview**: Multi-turn Q&A — gather what to build, constraints, tech stack, scope; tracks structured `InterviewContext`
- **draft_plan**: Fetch agent profiles (name, type, skills summary) + project repositories from Data API. LLM produces a structured JSON plan: list of tasks with `title`, `description`, `type`, `depends_on_task_ids[]`, `agent_profile_id` (best match by type + skills), `repository_ids[]` (repos the task needs access to)
- **review**: Present the plan to the user showing profile + driver assignments per task; ask for confirmation or change requests
- **refine**: Apply user feedback and re-generate/patch the draft
- **confirm**: Persist plan + tasks to DB via `dataClient`; emit `plan_confirmed` WebSocket event

---

## Agent Pool Coordinator — Three-Driver Architecture

```typescript
interface CodingAgentDriver {
  execute(task: AgentTask, workspaces: Record<string, string>): Promise<AgentResult>;
  getStatus(): Promise<AgentStatus>;
}
```

**Coordinator flow:**

1. On `plan_confirmed`: load tasks, agent profiles, and all project repositories from Data API
2. **Clone all repositories** referenced across the plan into sandboxed workspaces (`<WORKSPACES_ROOT>/<project_id>/<repo_name>`); emit `repo_status` events per repo
3. Instantiate the appropriate driver for each unique `AgentProfile` referenced by tasks
4. Build task DAG; topological sort; mark no-dependency tasks `ready`
5. **Dispatch loop:**
   - Find `ready` tasks (all dependencies `done`)
   - Invoke `driver.execute(task, workspaces)` where `workspaces = { repo_name → local_clone_path }` for repos the task references
   - Stream `task_status` / `agent_status` events via Redis pub/sub → WebSocket frontend
   - On task `done`: PATCH task status via Data API; mark dependents `ready`
   - Repeat until all tasks `done` or any `failed`
   - Optionally push commits to the remote repository

---

## LLM Provider Abstraction (Planning Agent & LangGraph Driver)

Supports: `openai`, `anthropic`, `ollama`, `vllm`, `lmstudio`

On-prem providers (`ollama`, `vllm`, `lmstudio`) expose an OpenAI-compatible REST API. All use `ChatOpenAI` from `@langchain/openai` with a custom `baseURL` — no additional SDK needed.

```typescript
// agent-service/src/core/llm.ts
export function buildChatModel(settings: LLMSettings): BaseChatModel
```

Config stored in the `Settings` DB table (singleton). Fetched at session start from the Data API — UI changes apply to the next planning session without a service restart.

---

## Frontend Pages & Key Components

| Page | Route | Description |
|---|---|---|
| Project List | `/` | Create/list projects; each card shows linked repo status chips |
| Planning Chat | `/projects/:id` | Streaming chat; inline plan cards; right sidebar with task list; Repositories tab |
| Execution Dashboard | `/projects/:id/execute` | React Flow DAG with profile badges; agent pool panel; repo clone status banners; progress bar |
| Agent Profiles | `/agents` | CRUD for agent profiles (all driver types, LLM, MCP servers, Claude Skills) |
| Settings | `/settings` | Planning Agent LLM config + Test Connection |

**Component breakdown:**

| Component | Description |
|---|---|
| `chat/ChatWindow` | Renders `Message` and `PlanChatItem` (inline plan draft cards); auto-scrolls |
| `chat/MessageBubble` | Role-aware bubble: user (primary color), assistant (default), system (centered italic) |
| `chat/ChatInput` | Textarea, Enter-to-send, Shift+Enter for newline |
| `plan/PlanDraftCard` | Inline plan card in the chat stream; shows ordered task list with profile/repo/dep badges; Confirm & Request Changes CTAs |
| `plan/PlanSidebar` | Right panel showing ordered task list with status, type, driver, profile, repo badges |
| `plan/PlanDAG` | React Flow DAG; task nodes are status-colored with profile/driver/repo badges; dependency edges |
| `plan/TaskCard` | Title, description, type, status, profile+driver badges, repo badges, result snippet |
| `plan/PlanConfirmModal` | Full plan review in a modal: summary stats + ordered task list via `TaskCard`; Confirm/Request Changes |
| `plan/RepositorySetup` | Add/remove repos per project: name label, git URL, branch, auth type, credentials |
| `agents/AgentPoolPanel` | Agent instances grouped by profile; per-instance: idle/busy dot + current task title |
| `agents/AgentStatusBadge` | Animated dot indicator — green (idle), yellow (busy) |
| `agents/AgentProfileForm` | Full form: driver type selector, LLM section (provider/model/key/baseURL), GitHub Copilot section (token or BYOK), MCP Servers list, Claude Skills editor |
| `settings/ProviderForm` | Provider dropdown, model, API key, base URL, Test Connection button |

---

## Real-time Events (WebSocket `/ws/:projectId`)

| Event | Direction | Payload |
|---|---|---|
| `chat_token` | server → client | `{ token: string }` |
| `plan_draft` | server → client | `{ plan: Plan }` (with embedded tasks) |
| `plan_confirmed` | server → client | `{ plan_id: string }` |
| `repo_status` | server → client | `{ repo_id, repo_name, status: "cloning"\|"ready"\|"error", message? }` |
| `task_status` | server → client | `{ task_id, status, agent_instance_id?, agent_profile_id? }` |
| `agent_status` | server → client | `{ instance_id, profile_id, status, task_id? }` |
| `user_message` | client → server | plain text or `{ content: string }` |

---

## Implementation Phases

| # | Phase | Description |
|---|---|---|
| 1 | `infra-setup` | Docker Compose: postgres, redis, data-api, agent-service, frontend; `.env.example` |
| 2 | `data-api-core` | TypeORM entities (all 9), DataSource, health endpoint, `synchronize` for dev |
| 3 | `data-api-routes` | All 7 route files + CORS + standalone `PATCH /repositories/:id` for agent-service |
| 4 | `agent-service-core` | Express + express-ws; zod config; ioredis; LLM factory; AES-256-CBC crypto |
| 5 | `planning-agent` | LangGraph.js StateGraph; all 6 nodes; fetches profiles + repos at session start; assigns per-task |
| 6 | `planning-api` | WebSocket `/ws/:projectId`; wsManager; dataClient (axios); `/test-llm` endpoint |
| 7 | `coordinator` | Three drivers; AgentPool; Scheduler (topological sort, git clone, multi-repo workspaces, SKILL.md materialization, Redis pub/sub) |
| 8 | `frontend-scaffold` | Vite + React; HeroUI; React Router; Vite proxy config; types; api/ws clients; store |
| 9 | `frontend-planning` | PlanningChat: ChatWindow, PlanDraftCard inline, PlanSidebar, RepositorySetup tab, PlanConfirmModal |
| 10 | `frontend-execution` | ExecutionDashboard: PlanDAG (profile badges on nodes), AgentPoolPanel, repo banners, progress bar |
| 11 | `frontend-agents` | AgentProfiles CRUD; AgentProfileForm with all sections |
| 12 | `frontend-settings` | Settings page: ProviderForm + Test Connection + save |
| 13 | `integration-tests` | Smoke test suite covering all REST endpoints, task dependencies, WebSocket connectivity |

---

## Compliance Analysis

> Last updated: 2026-04-15

### ✅ Fully Compliant

**Infrastructure & Data API**
- All 9 TypeORM entities match spec (Project, Repository, Plan, Task, TaskDependency, TaskRepository, Message, Settings, AgentProfile)
- All 7 route files with correct HTTP methods
- `agent_type` enum: `langgraph | opencode | github-copilot`
- Multi-repo per project (many-to-one) and per task (TaskRepository join table)
- Claude Skills spec (structured jsonb) and OpenCode MCP servers format
- AES-256-CBC encryption for API keys and tokens — identical implementation in both services
- Settings singleton with runtime LLM config swap (no restart needed)
- `express-async-errors` + global error middleware

**Agent Service**
- LangGraph.js StateGraph with all 6 nodes
- Planning Agent fetches agent profiles + repos at session start; assigns `agent_profile_id` and `repository_ids[]` per task
- All 3 driver implementations (LangGraph, OpenCode, GitHub Copilot)
- Topological sort + parallel task dispatch
- Git clone for all repos; per-task `workspaces` dict
- `repo_status`, `task_status`, `agent_status` events via Redis pub/sub + WebSocket
- SKILL.md materialization in OpenCodeDriver
- GitHub Copilot: subscription auth (token) OR BYOK (own LLM keys)
- LLM factory: openai, anthropic, ollama, vllm, lmstudio
- **Git push after task completion** — `pushWorkspaces` stages uncommitted changes, commits, and pushes to the authenticated remote URL (best-effort, non-fatal); called from `dispatchTask` on success

**Frontend**
- All 5 pages implemented at correct routes
- Component folder structure (`chat/`, `plan/`, `agents/`, `settings/`)
- `ChatWindow`, `MessageBubble`, `ChatInput`
- `PlanSidebar` with profile + driver + repo badges
- `PlanDAG` (React Flow) with agent profile badges on task nodes
- `TaskCard` with all planned badges (type, status, profile, driver, repos)
- `PlanConfirmModal` with task→profile assignments
- `RepositorySetup` with name, git URL, branch, auth type, credentials
- `AgentPoolPanel` grouped by profile with idle/busy per-instance status
- `AgentStatusBadge` animated dot
- `AgentProfileForm`: driver type, LLM, GitHub section, MCP servers (with `args[]` space-separated input and `env{}` key-value editor), Claude Skills (with `inputSchema` and `outputSchema` property editors)
- `ProviderForm` with Test Connection button
- All 6 WebSocket events handled in frontend
- ProjectList cards show repository status chips
- Execution Dashboard has a progress bar

---

### ⚠️ Known Gaps

None — all planned features are implemented.

- **Smoke / Integration tests** — `tests/smoke.test.js` covers all REST endpoints, SSE connectivity, and the full execution lifecycle (happy path, failure+cascade-skip, cancel) via the internal API — no real coding agents required

### ➕ Extras (Beyond Plan)

- **`PlanDraftCard`**: Inline plan card rendered directly in the chat message stream — better UX than the modal-only approach originally specified
- **Demo mode**: Fallback demo data in `PlanningChat.tsx` allows the UI to be explored without a running backend
- **Progress bar** on Execution Dashboard — not in original plan, added during usability pass
- **Loading spinners and empty states** with CTAs across all pages — not explicitly specified but consistent with plan intent
