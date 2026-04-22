# Spec: Agent Library

## Objective

Replace the current `AgentProfile` / `ProjectAgent` model with an **Agent Library** — a community-style catalog of reusable agent templates, skills, and MCP server configurations. The library is the single source of truth for all agent configurations, including the six system agents the platform depends on (planner, coder, reviewer, tester, knowledge, infra).

**Core problems being solved:**

1. `AgentProfile` is global but unnamed as a library — no browsing, no search, no versioning, no community sharing
2. `sub_agent_ids: string[]` stores raw UUIDs with no tool metadata — sub-agents cannot be compiled as named tools
3. The planner injects all context (repo trees, all agent configs, project info) into the system prompt on every turn — not idiomatic LangGraph; sessions are in-memory (no checkpointing)
4. MCPs and Skills have no standalone library identity — they are buried inside agent configs
5. `usage_count` is undefined — no signal for popular/trusted agents

**What success looks like:** A developer opens the Library tab, searches for a Python code reviewer, clicks "Add to Project", and gets an independent copy they can customize. The six system agents are pre-seeded via migration and cannot be deleted. The planner uses LangGraph `interrupt()`, `AsyncPostgresSaver`, `ToolNode`, and `MessagesState` — no in-memory session dict, no manual phase machine, no context re-injection every turn.

---

## Tech Stack

### data-api
- TypeScript + Express + TypeORM + PostgreSQL
- Existing entity/migration pattern

### agent-service
- Python + FastAPI + LangGraph 0.3+
- `langgraph-checkpoint-postgres` (`AsyncPostgresSaver`)
- `langgraph.types.interrupt`, `langgraph.prebuilt.ToolNode`, `langgraph.prebuilt.tools_condition`
- `langchain_core.messages.MessagesState` with `add_messages` reducer

### frontend
- React 18.3 + TypeScript + HeroUI v2.6 + Tailwind v4 + react-router-dom v6

---

## Commands

```
Dev:     bun run apps:dev
Build:   bun run apps:build
Install: bun run apps:install
```

---

## Data Model

### New entities (data-api)

**`LibraryAgent`** — replaces `AgentProfile`

```ts
{
  id: uuid (PK)
  name: string
  slug: string (unique)
  description: string
  agent_type: enum('system'|'custom')   // system = seeded, protected from deletion
  role: string                          // 'planner'|'coder'|'reviewer'|'tester'|'knowledge'|'infra'|'custom'
  system_prompt: string
  system_prompt_mode: enum('append'|'override')
  llm_provider: string
  llm_model: string
  llm_temperature: float
  llm_max_tokens: int
  sub_agents: jsonb    // [{agent_id: uuid, tool_name: string, tool_description: string}]
  mcp_servers: jsonb   // [{name, command, args, env, description}]
  skills: jsonb        // [{name, description, content}]
  structured_output: jsonb
  tags: string[]
  published_by: uuid (FK → User, nullable for system agents)
  usage_count: int default 0
  version: string default '1.0.0'
  is_deleted: boolean default false
  created_at, updated_at: timestamps
}
```

**`ProjectAgent`** — replaces old junction table

```ts
{
  id: uuid (PK)
  project_id: uuid (FK → Project)
  library_agent_id: uuid (FK → LibraryAgent, nullable)  // source template (informational only)
  // full independent copy — no live reference to library after cloning
  name: string
  role: string
  system_prompt: string
  system_prompt_mode: enum('append'|'override')
  llm_provider: string
  llm_model: string
  llm_temperature: float
  llm_max_tokens: int
  sub_agents: jsonb
  mcp_servers: jsonb
  skills: jsonb
  structured_output: jsonb
  scope: string
  created_at, updated_at: timestamps
}
```

**`LibraryMCP`** — standalone MCP server configs

```ts
{
  id: uuid (PK)
  name: string
  slug: string (unique)
  description: string
  command: string
  args: string[]
  env: jsonb
  tags: string[]
  published_by: uuid (FK → User, nullable)
  usage_count: int default 0
  version: string
  is_deleted: boolean
  created_at, updated_at: timestamps
}
```

**`LibrarySkill`** — standalone skill definitions

```ts
{
  id: uuid (PK)
  name: string
  slug: string (unique)
  description: string
  content: text          // SKILL.md content
  tags: string[]
  published_by: uuid (FK → User, nullable)
  usage_count: int default 0
  version: string
  is_deleted: boolean
  created_at, updated_at: timestamps
}
```

### `usage_count` increment rule
- `LibraryAgent.usage_count` increments when a task execution uses a `ProjectAgent` cloned from that library agent
- `LibraryMCP.usage_count` / `LibrarySkill.usage_count` increment when actively used in a task execution
- **Not** incremented on "Add to Project" (clone action)

---

## Backend API (data-api)

### New routes: `/library`

| Method | Path | Description |
|---|---|---|
| `GET` | `/library/agents` | List/search (query: `?q=&role=&tags=&page=&limit=`) |
| `GET` | `/library/agents/:id` | Get one |
| `POST` | `/library/agents` | Publish |
| `PUT` | `/library/agents/:id` | Update (system agents: admin only) |
| `DELETE` | `/library/agents/:id` | Soft-delete (system agents: forbidden) |
| `GET` | `/library/mcps` | List/search MCP configs |
| `POST` | `/library/mcps` | Publish MCP config |
| `GET` | `/library/skills` | List/search skills |
| `POST` | `/library/skills` | Publish skill |

### Updated routes: `/projects/:id/agents`

| Method | Path | Description |
|---|---|---|
| `GET` | `/projects/:id/agents` | List project agents (returns full config copy) |
| `POST` | `/projects/:id/agents/from-library/:libraryAgentId` | Clone library agent into project |
| `POST` | `/projects/:id/agents` | Create custom project agent directly |
| `PUT` | `/projects/:id/agents/:agentId` | Update project agent config |
| `DELETE` | `/projects/:id/agents/:agentId` | Remove project agent |

### Internal route (agent-service consumption)

```
GET /internal/project-agents/:projectId
```

Returns `ProjectAgent[]` with **raw (encrypted) LLM key values** — decryption is handled by the agent-service, not the data-api. This is a deliberate architecture decision: the data-api never needs to hold or use the decryption key. Replaces `GET /internal/agent-profiles`.

---

## Planner Rewrite (agent-service)

### Current problems
- `_sessions: Dict[str, Session]` — in-memory, lost on restart
- Manual `phase: 'interview' | 'review'` state machine
- System prompt re-injected with full context on every turn
- Custom `MAX_ROUNDS = 12` tool loop

### Target architecture

```python
# State
class PlannerState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    plan: Optional[PlanSchema]

# Nodes
def interview_node(state: PlannerState) -> Command:
    response = model_with_tools.invoke(state["messages"])
    if needs_human_input(response):
        human_answer = interrupt({"question": extract_question(response)})
        return {"messages": [response, HumanMessage(content=human_answer)]}
    return {"messages": [response]}

def plan_generation_node(state: PlannerState) -> dict:
    plan = model.with_structured_output(PlanSchema).invoke(state["messages"])
    return {"plan": plan}

# Graph
builder = StateGraph(PlannerState)
builder.add_node("interview", interview_node)
builder.add_node("tools", ToolNode(tools))
builder.add_node("generate_plan", plan_generation_node)
builder.add_edge(START, "interview")
builder.add_conditional_edges("interview", tools_condition)
builder.add_edge("tools", "interview")

checkpointer = AsyncPostgresSaver.from_conn_string(POSTGRES_CONNECTION_STRING)
await checkpointer.setup()  # creates LangGraph checkpoint tables on startup
graph = builder.compile(checkpointer=checkpointer, interrupt_before=["generate_plan"])
```

**Thread identity:** `thread_id = plan_id` (UUID). Each planning session maps to one LangGraph thread in PostgreSQL.

**Context injection:** Project context (repo tree, agent configs, project info) is injected exactly **once** as a `SystemMessage` appended to initial `messages` when a session starts (`thread_id` is new). The `add_messages` reducer accumulates history — context is never re-injected.

**`systemPromptMode = 'override'`:** When set, the dynamic project context `SystemMessage` is omitted.

**Dependencies to add:** `langgraph-checkpoint-postgres` to `agent-service/pyproject.toml`.

---

## Sub-agents as Tools

### Schema change

`sub_agents` in both `LibraryAgent` and `ProjectAgent` changes from:
```json
["uuid1", "uuid2"]
```
to:
```json
[
  {
    "agent_id": "uuid1",
    "tool_name": "call_code_reviewer",
    "tool_description": "Delegates a code review task. Input: {code: string, context: string}. Returns structured review with issues and suggestions."
  }
]
```

### Agent-service compilation

```python
def build_sub_agent_tool(sub_agent_config: dict, pool: AgentPool) -> BaseTool:
    driver = pool.get_driver(sub_agent_config["agent_id"])
    sub_graph = driver.compile(checkpointer=None)  # per-invocation, no persistent state

    @tool(sub_agent_config["tool_name"], description=sub_agent_config["tool_description"])
    async def sub_agent_tool(input: str) -> str:
        result = await sub_graph.ainvoke({"messages": [HumanMessage(content=input)]})
        return result["messages"][-1].content

    return sub_agent_tool
```

`checkpointer=None` on the subgraph = each delegation starts fresh, no state leaks between parent and sub-agent.

---

## Frontend (Library Page)

### New routes

```
/library              → LibraryPage (tabbed: Agents | MCPs | Skills)
/library/agents/:id   → LibraryAgentDetail
```

### Project agent assignment

`ProjectDetail.tsx` — "Agents" tab:
- "Add from Library" button → `LibraryBrowserModal` (searchable `LibraryAgent` list)
- "Add" clones library agent into project as independent `ProjectAgent`
- Project agents table shows local copy with inline edit

### New/modified files

```
frontend/src/
├── pages/
│   ├── LibraryPage.tsx                    → NEW: tabbed library browser
│   ├── LibraryAgentDetail.tsx             → NEW: agent detail + "Add to Project" CTA
│   └── ProjectDetail.tsx                  → Modified: agents tab uses library clone flow
├── components/library/
│   ├── LibraryAgentCard.tsx               → NEW
│   ├── LibraryAgentForm.tsx               → NEW: publish/edit form
│   ├── LibraryBrowserModal.tsx            → NEW: project agent assignment modal
│   ├── SubAgentEditor.tsx                 → NEW: [{agent_id, tool_name, tool_description}] editor
│   ├── McpServerEditor.tsx                → NEW (or extract from existing)
│   └── SkillEditor.tsx                    → NEW (or extract from existing)
├── types/index.ts                         → Modified: add Library* types, update ProjectAgent
└── lib/api.ts                             → Modified: add /library/* endpoints
```

---

## Migration Plan (data-api)

All changes are delivered as TypeORM migrations. No data preservation required (prototype).

1. Drop `agent_profiles`, drop old `project_agents`
2. Create `library_agents`, `library_mcps`, `library_skills`
3. Create `project_agents` (new schema with full config columns)
4. **Seed system agents** — single migration with `INSERT ... ON CONFLICT (slug) DO NOTHING` for the six system agents. System prompt values come from the current Python constants. Updating a system agent prompt in the future = new migration.
5. LangGraph checkpoint tables are created at agent-service startup via `await checkpointer.setup()` — no manual migration needed for those.

**Agent-service startup changes:**
- `AgentPool.initialize()` → calls `GET /internal/project-agents/:projectId`, receives encrypted keys, decrypts in `data_client.py`
- `await checkpointer.setup()` called once on FastAPI startup event

---

## Out of Scope (this iteration)

- Agent versioning / diff UI
- Fork / PR workflow for library agents
- Rating / review system
- Visibility controls (public vs. org-private)
- Live sync between library and cloned project agents
