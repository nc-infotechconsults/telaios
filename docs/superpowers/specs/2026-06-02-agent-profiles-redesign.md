# Agent Profiles Redesign — Predefined Roles with Layered Overrides

**Date:** 2026-06-02
**Status:** Approved

## Problem

The current "Agent Profiles" page is a free-form CRUD interface: users can create, edit, and delete arbitrary profiles. This conflicts with TelaiOS's core philosophy of minimal configuration and real agentic power. TEOS orchestrates a fixed set of role-based agents; users should tune them, not invent new ones. The existing model also has no concept of platform-managed defaults that evolve over time — any default baked into the frontend goes stale the moment the platform improves.

## Goals

- Show only the predefined profiles TEOS can engage (one per `AgentRole`)
- Remove the ability to create new profiles
- Allow users to override specific fields (model, system prompt, MCP servers, skills) per workspace or per project
- Platform-managed defaults evolve independently; non-overridden fields pick up improvements automatically
- Structured output remains platform-managed — never user-editable

## Non-Goals

- Operator-level overrides (out of scope for now)
- Per-user overrides
- Changing agent orchestration logic or dispatch rules

---

## Architecture

### Three-layer resolution

```
Platform    →  AgentBaseProfile    (global, fixture-seeded, one per AgentRole)
                      ↓
Workspace   →  AgentOverride       (workspace_id + base_profile_id, sparse)
                      ↓
Project     →  AgentOverride       (project_id + base_profile_id, sparse)
                      ↓
            ResolvedAgentProfile   (base → workspace override → project override)
```

For each field, the first non-null value in the cascade wins. TEOS always consumes a `ResolvedAgentProfile`.

---

## Data Model

### `AgentBaseProfile`

Platform-owned. A single global set (not per-workspace) — all workspaces share the same base profiles. Seeded from Python fixtures at deploy time and updated via migrations when platform defaults improve. Never directly user-editable.

The GET endpoint is workspace-scoped only for authentication purposes; the underlying records are the same for every workspace.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `role` | `AgentRole` | unique, the natural key |
| `name` | str | display name |
| `description` | str | what this agent does |
| `dispatch` | enum `direct \| workflow` | how TEOS engages it |
| `system_prompt` | str? | default prompt |
| `system_prompt_mode` | `override \| extend` | |
| `llm_provider` | str? | |
| `llm_model` | str? | |
| `llm_temperature` | float? | |
| `llm_max_tokens` | int? | |
| `llm_top_p` | float? | |
| `llm_frequency_penalty` | float? | |
| `llm_presence_penalty` | float? | |
| `mcp_servers` | JSONB | default MCP server list |
| `skills` | JSONB | default skill list |
| `structured_output` | JSONB | platform-managed, never overridable |

### `AgentOverride`

User-managed sparse delta. Exactly one of `workspace_id` / `project_id` must be set (DB constraint).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `base_profile_id` | UUID | FK → `AgentBaseProfile` |
| `workspace_id` | UUID? | FK → `Workspace` |
| `project_id` | UUID? | FK → `Project` |
| `system_prompt` | str? | NULL = use layer below |
| `system_prompt_mode` | enum? | |
| `llm_provider` | str? | |
| `llm_model` | str? | |
| `llm_temperature` | float? | |
| `llm_max_tokens` | int? | |
| `llm_top_p` | float? | |
| `llm_frequency_penalty` | float? | |
| `llm_presence_penalty` | float? | |
| `mcp_servers` | JSONB? | |
| `skills` | JSONB? | |

No `role` column — role is on the base profile. Unique constraints: `(base_profile_id, workspace_id)` and `(base_profile_id, project_id)`.

---

## API

### Base profiles (read-only for workspace/project users)

```
GET /workspaces/{workspace_id}/agent-base-profiles
→ AgentBaseProfile[]   (all roles, always 8 records)
```

### Workspace-level overrides

```
GET    /workspaces/{workspace_id}/agent-overrides
PUT    /workspaces/{workspace_id}/agent-overrides/{base_profile_id}
DELETE /workspaces/{workspace_id}/agent-overrides/{base_profile_id}
```

`PUT` is an upsert — creates or updates the override row. Body contains only the fields being overridden (all nullable).

`DELETE` resets the workspace override entirely (removes the row). Falls back to base profile.

### Project-level overrides

```
GET    /projects/{project_id}/agent-overrides
PUT    /projects/{project_id}/agent-overrides/{base_profile_id}
DELETE /projects/{project_id}/agent-overrides/{base_profile_id}
```

Same shape, scoped to project.

### Resolved profiles (consumed by TEOS)

```
GET /projects/{project_id}/agent-profiles/resolved
→ ResolvedAgentProfile[]   (always 8, fully merged)
```

### Response shapes

**`AgentBaseProfile`**
```json
{
  "id": "...",
  "role": "planner",
  "name": "Planner",
  "description": "Turns a user request into a cross-repo implementation plan.",
  "dispatch": "direct",
  "llm_provider": "anthropic",
  "llm_model": "claude-opus-4-7",
  "llm_temperature": 0.7,
  "system_prompt": "You are a senior engineering planner...",
  "system_prompt_mode": "override",
  "mcp_servers": [],
  "skills": []
}
```

**`AgentOverride`** (sparse)
```json
{
  "id": "...",
  "base_profile_id": "...",
  "workspace_id": "...",
  "llm_model": "claude-sonnet-4-6",
  "system_prompt": null
}
```

**`ResolvedAgentProfile`** (merged, always complete)
```json
{
  "role": "planner",
  "name": "Planner",
  "llm_model": "claude-sonnet-4-6",
  "overridden_fields": ["llm_model"],
  "override_scope": "workspace",
  "override_id": "..."
}
```

`overridden_fields` lists the fields the user has explicitly set. `override_scope` is `"base"` (no override), `"workspace"`, or `"project"`.

---

## Frontend

### `WorkspaceAgents.tsx` — redesigned

- Always shows all 8 role cards in a grid (no empty state, no create button)
- Each card displays:
  - Role icon + gradient (existing `ROLE_BG` / `ROLE_ICON` maps)
  - Name + description (from `AgentBaseProfile`)
  - Badge: **"Default"** (grey) if no override, **"Customized"** (blue) if override exists
  - Tag: **"Direct dispatch"** or **"Workflow"** (from `dispatch` field)
- Click → opens customization modal
- No delete button; "Reset to defaults" lives inside the edit form

### Override-aware customization form

Adapted from `AgentProfileForm`:

**Removed:**
- Agent Type selector (fixed by role, shown as read-only text)
- Sub-agents tab (TEOS manages orchestration)
- Structured Output tab (platform-managed, never user-editable)

**Remaining tabs:** General · Prompt · MCP Servers · Skills

**Override indicators:**
- Each field shows the base value as a greyed placeholder (e.g. `claude-opus-4-7 (platform default)`)
- Fields the user has overridden get a blue dot + per-field `×` reset button that nulls that specific override
- "Reset all overrides" button at the bottom calls `DELETE /agent-overrides/{base_profile_id}`

### Project-level overrides

Same page pattern in project settings. The form shows the resolved workspace value as placeholder when no project override exists, with a note: *"Project overrides take precedence over workspace settings for this project only."*

### New frontend types

```ts
interface AgentBaseProfile {
  id: string;
  role: AgentRole;
  name: string;
  description: string;
  dispatch: "direct" | "workflow";
  llm_provider?: string;
  llm_model?: string;
  llm_temperature?: number;
  llm_max_tokens?: number;
  llm_top_p?: number;
  llm_frequency_penalty?: number;
  llm_presence_penalty?: number;
  system_prompt?: string | null;
  system_prompt_mode?: "override" | "extend";
  mcp_servers: McpServer[];
  skills: Skill[];
}

interface AgentOverride {
  id: string;
  base_profile_id: string;
  workspace_id?: string;
  project_id?: string;
  llm_provider?: string | null;
  llm_model?: string | null;
  llm_temperature?: number | null;
  llm_max_tokens?: number | null;
  llm_top_p?: number | null;
  llm_frequency_penalty?: number | null;
  llm_presence_penalty?: number | null;
  system_prompt?: string | null;
  system_prompt_mode?: "override" | "extend" | null;
  mcp_servers?: McpServer[] | null;
  skills?: Skill[] | null;
}

interface ResolvedAgentProfile extends AgentBaseProfile {
  overridden_fields: string[];
  override_scope: "base" | "workspace" | "project";
  override_id?: string;
}
```

---

## Migration Strategy

1. New `agent_base_profiles` table seeded from Python fixtures (one row per `AgentRole`)
2. New `agent_overrides` table with workspace/project scope columns and DB constraint
3. Existing `agent_profiles` records migrated as workspace-scoped overrides linked to matching base profile by role; records with `role = custom` are dropped
4. `AgentProfile` entity and existing CRUD endpoints deprecated but kept temporarily for backward compatibility
5. Frontend switches to new endpoints; old endpoints removed in a follow-up

---

## Dispatch Classification

| Role | Dispatch |
|---|---|
| `planner` | direct |
| `knowledge` | direct |
| `designer` | direct |
| `coder` | workflow |
| `reviewer` | workflow |
| `tester` | workflow |
| `infra` | workflow |
| `document-copilot` | workflow |
