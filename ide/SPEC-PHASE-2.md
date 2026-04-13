# Spec: Phase 2 — OpenCode Agent Panel, Plugin Migration & Polish

## Objective

Phase 1 delivered the JetBrains-inspired layout system, plugin infrastructure (types, host, registries), mobile shell, and command palette. Phase 2 builds the **AI Agent panel as the IDE's primary actor** powered by the OpenCode SDK, proves the plugin architecture by migrating Database to a bundled plugin, and completes the contribution pipelines.

The Agent panel is NOT a simple chat sidebar — it is a **first-class citizen** of the IDE: an autonomous coding agent with session management, tool-use visibility, usage metrics, file-edit tracking, and an engaging, information-rich interface. Future phases will add ACP (Agent Client Protocol) support for plugging in alternative agents.

### Success looks like:
- User opens the IDE — **the shell is clean**: gutter icons are visible but no panel content is expanded. Left gutter top shows Explorer, Search, Git icons. Left gutter bottom shows Terminal. Right gutter shows Agent and Database icons.
- User clicks the Agent gutter icon (or `Alt+6`) — the Agent panel opens with a polished onboarding state showing connection status to OpenCode
- User sends a prompt — OpenCode streams a response with real-time tool-use visibility (file reads, shell commands, file edits), rendered as an engaging conversation with collapsible tool-call cards
- An **Agent Metrics bar** in the panel header shows: tokens used, cost estimate, session duration, messages exchanged
- User can create/switch between multiple agent sessions
- "Explain Selection", "Refactor", "Generate Tests" actions in the editor context menu open the Agent panel with pre-filled context
- Database panel works identically to before but loads through the plugin host lifecycle
- `Ctrl+N` / `Ctrl+Shift+N` create files/folders (no longer stubs)
- StatusBar shows agent status (idle/busy/tokens) contributed by the agent plugin

### Users
- Developers using AgentScope IDE for workspace-based coding with an AI agent as co-pilot
- The IDE as a platform — Phase 2 validates that third-party plugins (and future ACP agents) are viable

---

## Assumptions

1. **OpenCode SDK (`@opencode-ai/sdk`)** is the AI backend — the IDE server manages an OpenCode server instance and proxies the SDK API to the client
2. **No direct LLM API calls** — all AI goes through OpenCode, which handles provider selection, tool use, MCP servers, etc.
3. **The IDE server starts/manages an OpenCode server** via `createOpencode()` from the SDK, or connects to an existing one via `createOpencodeClient()`
4. **OpenCode provides**: streaming events (SSE), session management, tool calling (file read/write, shell), multi-provider support — we don't re-implement any of this
5. **ACP support is Phase 3** — this phase uses the OpenCode JS SDK directly
6. **All panels start collapsed on fresh load** — gutter icons are always visible; no panel content is expanded by default. Positions: left-top (Explorer, Search, Git), left-bottom (Terminal), right (Agent, Database).
7. **Database plugin migration preserves 100% of existing functionality**
8. **No plugin marketplace/discovery UI** in Phase 2
9. **Float/window view modes** and **Theme contributions** deferred to Phase 3

---

## Tech Stack

- **Client**: React 18 + Vite + Monaco + xterm.js + Zustand + HeroUI + Tailwind v4 + react-resizable-panels + framer-motion + lucide-react
- **Server**: Hono + Bun, Dockerode, simple-git, chokidar, bun-pty
- **New server dep**: `@opencode-ai/sdk` — OpenCode programmatic SDK
- **New client deps**: `react-markdown` + `remark-gfm` + `rehype-highlight` — for rendering agent markdown responses with syntax-highlighted code blocks

---

## Commands

```bash
# Install
cd ide && bun install

# Dev
bun run dev              # client + server concurrently

# Typecheck
cd ide/client && bunx tsc --noEmit --pretty
cd ide/server && bunx tsc --noEmit --pretty

# Individual
bun run client:dev       # Vite :5174
bun run server:dev       # Hono :4000
```

---

## Project Structure (new/modified files)

```
ide/
├── server/src/
│   ├── routes/agent.ts                  # NEW — Agent proxy routes (sessions, messages, events)
│   ├── services/agent.service.ts        # NEW — OpenCode SDK lifecycle + session management
│   ├── core/config.ts                   # MODIFIED — add OPENCODE_* env vars
│   └── index.ts                         # MODIFIED — mount agent routes + init agent service
│
├── client/src/
│   ├── plugins/                         # NEW — bundled plugins directory
│   │   ├── database/                    # NEW — Database bundled plugin
│   │   │   ├── index.ts                #   Plugin manifest + activate function
│   │   │   └── DatabasePanel.tsx        #   MOVED from components/panels/
│   │   └── agent/                       # NEW — Agent bundled plugin
│   │       ├── index.ts                #   Plugin manifest + activate function
│   │       ├── AgentPanel.tsx           #   Main panel: sessions + conversation + metrics
│   │       ├── AgentConversation.tsx    #   Message list with tool-call cards
│   │       ├── AgentMetrics.tsx         #   Token/cost/duration metrics bar
│   │       ├── AgentInput.tsx           #   Prompt input with context controls
│   │       ├── AgentSessionList.tsx     #   Session switcher sidebar/dropdown
│   │       ├── AgentOnboarding.tsx      #   Empty state / connection setup
│   │       ├── ToolCallCard.tsx         #   Collapsible tool-use visualization
│   │       └── agentStore.ts            #   Zustand store for agent state
│   │
│   ├── core/
│   │   ├── bootstrap.tsx               # MODIFIED — explorer defaultVisible: false, remove database
│   │   ├── plugin-host.ts             # MODIFIED — implement StatusBar + EditorAction stubs
│   │   └── bundled-plugins.ts          # NEW — loads all bundled plugins
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   └── StatusBar.tsx           # MODIFIED — render plugin-contributed items
│   │   └── editor/
│   │       └── CodeEditor.tsx          # MODIFIED — register context menu actions
│   │
│   ├── stores/
│   │   └── statusBarStore.ts           # NEW — StatusBar contributions state
│   │
│   └── lib/
│       └── api.ts                      # MODIFIED — add agent namespace
```

---

## Code Style

Unchanged from Phase 1. Key conventions:
- TypeScript strict, no `any`
- Zustand stores: one per domain, shallow selectors, **never call derived methods inside Zustand selectors** (see Phase 1 discoveries)
- Components: functional, `memo` where beneficial, hooks for side effects
- Files with JSX use `.tsx`
- Path alias `@/*` → `src/*`
- Plugin IDs use reverse-domain style: `agentscope.database`, `agentscope.agent`

---

## Testing Strategy

- **Typecheck**: `bunx tsc --noEmit --pretty` must pass on both client and server
- **Manual QA**: Browser testing after each sub-phase
  - Agent panel: open, send prompt, see streaming response, tool-call cards expand/collapse, metrics update, session switching works
  - Database plugin: toggle on/off, connect, browse schema, run query — must match pre-migration behavior
  - New File/Folder: `Ctrl+N` opens a prompt, file appears in explorer
  - StatusBar: agent status item renders (idle/busy indicator + token count)
  - No panels visible on fresh load (empty localStorage)
- **Regression**: All existing tool windows (explorer, search, git, terminal) still work
- **Mobile**: Agent panel and Database accessible via mobile nav

---

## Boundaries

### Always
- Run typecheck before considering a task complete
- Use the plugin host API for new panels — never register directly in bootstrap
- Preserve existing keyboard shortcuts
- All agent communication is streaming (SSE events from OpenCode)
- Handle OpenCode connection errors gracefully (not running, auth failure, network)

### Ask First
- Adding new npm dependencies beyond those listed
- Changing the plugin manifest schema
- Modifying the layout store state shape
- Changes to the server's env var contract

### Never
- Commit API keys or secrets
- Break existing panel functionality during migration
- Call LLM APIs directly — always go through OpenCode SDK
- Remove the direct-import fallback for core panels (explorer, search, git, terminal stay in bootstrap)

---

## Detailed Feature Specifications

### Feature 1: All Panels Collapsed on Fresh Load (Gutter Icons Always Visible)

Gutter icons are always visible. The change is purely that **no panel content is expanded** on a fresh load.

**Gutter layout:**

| Position | Panels |
|----------|--------|
| Left gutter — top | Explorer (`Alt+1`), Search (`Alt+2`), Git (`Alt+5`) |
| Left gutter — bottom | Terminal (`Alt+3`) |
| Right gutter | Agent (`Alt+6`), Database (`Alt+4`) |

**Implementation:**

Set `defaultVisible: false` on all entries in `CORE_TOOL_WINDOWS` in `bootstrap.tsx` (Explorer is currently `true` — set it to `false`). `layoutStore.registerToolWindow` already respects persisted state, so returning users who had panels open will see them restored.

No changes needed to `ToolWindowGutter` — it already renders icons regardless of panel visibility.

### Feature 2: Wire Remaining Stub Commands

Wire `file.newFile` and `file.newFolder` in `IDEShell.tsx`:
- `file.newFile` (`Ctrl+N`): Show a small inline input dialog. Call `api.workspaces.createFile(wid, currentDirPath, filename)`, then `editorStore.openFile(wid, path)`.
- `file.newFolder` (`Ctrl+Shift+N`): Show a small inline input dialog. Call `api.workspaces.createFolder(wid, currentDirPath, foldername)`, refresh file tree.
- Register `Ctrl+Shift+N` keybinding for `file.newFolder` in bootstrap.

### Feature 3: StatusBar Contribution Pipeline

Complete the StatusBar contribution flow:
- **`statusBarStore.ts`**: Zustand store holding `Record<string, StatusBarItem>` with `{ id, content: string | ComponentType, alignment, priority, commandId?, tooltip?, visible? }`
- **`plugin-host.ts`**: `statusBar.addItem()` writes to the store and returns a `Disposable`. `statusBar.updateItem()` patches existing entries. Dispose removes from store.
- **`StatusBar.tsx`**: Read from `statusBarStore` alongside existing hard-coded items. Render contributed items in correct alignment/priority order. Left items go left, right items go right.

### Feature 4: EditorAction Contribution Pipeline

Complete the `editor.registerAction()` stub in `plugin-host.ts`:
- **New `editorActionStore.ts`** (or inline in plugin-host): Registry of `EditorAction` entries
- **`CodeEditor.tsx`**: Subscribe to registered actions and add them to Monaco's context menu via `editor.addAction()`. Group under an "Agent" submenu.
- Actions receive `{ filePath, language, selectedText? }` when invoked.

### Feature 5: Bundled Plugin Loader + Database Plugin Migration

**`bundled-plugins.ts`**: 
- Imports all bundled plugins, calls `pluginHost.install(manifest, activate)` for each
- Called from `IDEShell.tsx` after `bootstrapCoreToolWindows()`
- `pluginHost.fireActivationEvent("onStartup")` triggers activation

**Database plugin (`plugins/database/index.ts`)**:
- `PluginManifest`: `id: "agentscope.database"`, category `"database"`, activation `["onStartup"]`
- `activate(context)`: Registers tool window at **right gutter** (alongside Agent), toggle command, keybinding (`Alt+4`)
- `DatabasePanel.tsx`: Moved from `components/panels/`, updated to read workspace ID from `useWorkspaceId()` context instead of props
- Remove database registration from `bootstrap.tsx` and `DatabaseWrapper`

### Feature 6: OpenCode Agent Service (Server)

**`services/agent.service.ts`**:
```typescript
class AgentService {
  // Manages OpenCode SDK lifecycle
  private client: OpencodeClient | null;
  
  async initialize(): Promise<void>        // Start or connect to OpenCode server
  async createSession(title?: string): Promise<Session>
  async listSessions(): Promise<Session[]>
  async getSession(id: string): Promise<Session>
  async deleteSession(id: string): Promise<void>
  async prompt(sessionId: string, parts: Part[], options?: PromptOptions): Promise<void>
  async abort(sessionId: string): Promise<void>
  subscribeEvents(sessionId: string): AsyncIterable<Event>
  async getHealth(): Promise<HealthStatus>
}
```

- On server startup, `agentService.initialize()` attempts to connect
- If `OPENCODE_SERVER_URL` is set, connects to existing server via `createOpencodeClient()`
- If not, starts embedded OpenCode server via `createOpencode()` with config from env vars
- Graceful fallback: if OpenCode is unavailable, agent routes return 503 with helpful error

**New env vars** (`.env.example`):
```
# OpenCode Agent — choose ONE mode:
# Mode A: Connect to existing OpenCode server
# OPENCODE_SERVER_URL=http://localhost:4096
# OPENCODE_SERVER_PASSWORD=

# Mode B: Let IDE start its own OpenCode instance (requires opencode-ai installed)
# OPENCODE_MODEL=anthropic/claude-sonnet-4-20250514
```

**`routes/agent.ts`**:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agent/health` | OpenCode connection status |
| `GET` | `/api/agent/sessions` | List all sessions |
| `POST` | `/api/agent/sessions` | Create new session. Body: `{ title? }` |
| `GET` | `/api/agent/sessions/:id` | Get session details + messages |
| `DELETE` | `/api/agent/sessions/:id` | Delete session |
| `POST` | `/api/agent/sessions/:id/prompt` | Send prompt. Body: `{ parts: Part[] }`. Returns 202. |
| `POST` | `/api/agent/sessions/:id/abort` | Abort in-progress generation |
| `GET` | `/api/agent/sessions/:id/events` | **SSE stream** — real-time events for this session |
| `GET` | `/api/agent/config` | Available providers + models |

### Feature 7: Agent Panel Plugin (Client)

The Agent panel is the IDE's marquee feature. It needs to feel like a **premium, integrated experience**, not a bolted-on chatbot.

**`plugins/agent/index.ts`**:
- `PluginManifest`: `id: "agentscope.agent"`, category `"ai"`, activation `["onStartup"]`
- Registers tool window at `right-top`, icon `Bot` (lucide), shortcut `Alt+6`, order 5
- Registers commands: `agent.open`, `agent.newSession`, `agent.explainSelection`, `agent.refactorSelection`, `agent.generateTests`
- Registers StatusBar item: agent status (idle/busy spinner + session token count)
- Registers editor actions: Explain, Refactor, Generate Tests

**`agentStore.ts`** (Zustand):
```typescript
interface AgentState {
  // Connection
  connectionStatus: "connecting" | "connected" | "disconnected" | "error";
  
  // Sessions
  sessions: AgentSession[];
  activeSessionId: string | null;
  
  // Current conversation
  messages: AgentMessage[];
  isStreaming: boolean;
  
  // Metrics (per session)
  metrics: {
    tokensIn: number;
    tokensOut: number;
    estimatedCost: number;
    sessionDuration: number;  // seconds
    messagesCount: number;
    toolCallsCount: number;
    filesEdited: string[];
  };
  
  // Actions
  connect(): Promise<void>;
  createSession(title?: string): Promise<void>;
  switchSession(id: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
  sendPrompt(text: string, context?: AgentContext): Promise<void>;
  abort(): void;
}

interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  parts: AgentPart[];      // text, tool-call, tool-result, file-edit, etc.
  timestamp: number;
}

interface AgentPart {
  type: "text" | "tool-call" | "tool-result" | "thinking" | "error";
  content: string;
  toolName?: string;        // for tool-call/result
  toolArgs?: unknown;       // for tool-call
  isCollapsed?: boolean;    // UI state for tool-call cards
  duration?: number;        // ms, for tool-call
}

interface AgentContext {
  filePath?: string;
  language?: string;
  selectedText?: string;
  instruction?: "explain" | "refactor" | "generate-tests";
}
```

**`AgentPanel.tsx`** — Main panel layout:
```
┌──────────────────────────────────────────────┐
│ ┌─ Agent Metrics Bar ──────────────────────┐ │
│ │ ⚡ 1.2k tokens  💰 $0.003  ⏱ 2m 15s     │ │
│ │ 📝 4 msgs  🔧 3 tool calls  📁 2 files  │ │
│ └──────────────────────────────────────────┘ │
│ ┌─ Session Tabs ───────────────────────────┐ │
│ │ [Session 1] [Session 2] [+ New]          │ │
│ └──────────────────────────────────────────┘ │
│ ┌─ Conversation ───────────────────────────┐ │
│ │                                           │ │
│ │  🧑 "Refactor the auth module to..."     │ │
│ │                                           │ │
│ │  🤖 "I'll help you refactor..."          │ │
│ │  ┌─ 📂 Read file ──────────────────┐     │ │
│ │  │ src/auth/middleware.ts           │     │ │
│ │  │ ▶ Expand to see content         │     │ │
│ │  └────────────────────────────────┘     │ │
│ │  ┌─ ✏️ Edit file ──────────────────┐     │ │
│ │  │ src/auth/middleware.ts           │     │ │
│ │  │ +3 -5 lines changed             │     │ │
│ │  │ ▶ Expand to see diff            │     │ │
│ │  └────────────────────────────────┘     │ │
│ │  "The auth module has been..."           │ │
│ │                                           │ │
│ └──────────────────────────────────────────┘ │
│ ┌─ Input ──────────────────────────────────┐ │
│ │ [📎 Context] Ask the agent...     [Send] │ │
│ │ [Include: auth/middleware.ts]   [⏹ Stop] │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

**Component breakdown**:

- **`AgentMetrics.tsx`**: Compact metrics bar showing real-time stats. Updates on every SSE event. Animated number transitions. Collapsible on click.
- **`AgentSessionList.tsx`**: Horizontal tab bar for sessions. `+ New` button. Right-click to delete/rename. Shows active indicator.
- **`AgentConversation.tsx`**: Scrollable message list. Auto-scrolls to bottom on new content. User messages are compact; assistant messages support markdown with syntax-highlighted code blocks.
- **`ToolCallCard.tsx`**: Collapsible card for each tool invocation. Shows: tool icon + name, args summary, duration badge, expand to see full input/output. Different styles for: read_file (blue), write_file/edit (green), shell (amber), error (red).
- **`AgentInput.tsx`**: Multi-line textarea with `Ctrl+Enter` to send (or `Enter` with empty shift). Context chips showing attached file/selection. "Stop" button during streaming. Model indicator.
- **`AgentOnboarding.tsx`**: Shown when OpenCode is not connected. Explains setup, shows env var configuration help, "Retry connection" button.

**Visual design notes** (JetBrains AI Assistant reference):
- Dark theme consistent with IDE (#111113 backgrounds, zinc text)
- Agent messages use a subtle left-border accent (violet gradient)
- Tool-call cards use glassmorphic style (bg-white/[0.02], backdrop-blur)
- Metrics bar uses small, high-contrast pill badges
- Streaming text has a blinking cursor indicator
- Smooth framer-motion transitions for message/card appearance

### Feature 8: Mobile Agent Experience

The Agent panel on mobile gets the full-screen treatment (via MobileShell):
- Bottom nav gets an "Agent" tab (Bot icon)
- Full-screen conversation view with swipe-back to editor
- Simplified metrics (single-line summary)
- Input at bottom with system keyboard handling

---

## Sub-phases & Task Order

### Phase 2A: Foundation (Tasks 1-5)
1. Set all panels `defaultVisible: false` (no panels on fresh load)
2. Wire `file.newFile` / `file.newFolder` commands
3. Implement StatusBar contribution store + rendering
4. Implement EditorAction contribution pipeline  
5. Create `bundled-plugins.ts` loader + migrate Database panel to plugin

### Phase 2B: Agent Infrastructure (Tasks 6-8)
6. OpenCode agent service on IDE server (`@opencode-ai/sdk`)
7. Agent API routes + client API helpers
8. Agent Zustand store + SSE event handling

### Phase 2C: Agent Panel UI (Tasks 9-12)
9. Agent plugin scaffold + AgentPanel layout + AgentOnboarding
10. AgentConversation + ToolCallCard + markdown rendering
11. AgentInput + context attachment + streaming UX
12. AgentMetrics + AgentSessionList + StatusBar integration

### Phase 2D: Editor Integration + Polish (Tasks 13-15)
13. Editor context menu actions (Explain, Refactor, Generate Tests)
14. Mobile shell: Agent + Database in mobile nav
15. Final QA: all tool windows, commands, mobile, regression

---

## Future (Phase 3 — out of scope)

- **ACP (Agent Client Protocol)**: Standardized protocol for connecting alternative coding agents (Cursor, Windsurf, etc.)
- **Agent marketplace**: Browse/install community agent configurations
- **Plugin marketplace**: Third-party plugin discovery and installation
- **Float/window view modes** for tool windows
- **Theme contributions** from plugins
- **Collaborative editing** (CRDT-based)
- **Agent-initiated actions**: Let the agent open files, run terminal commands with user approval
