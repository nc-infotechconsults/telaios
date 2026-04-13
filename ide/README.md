# AgentScope IDE

A standalone, container-native web IDE built from scratch. Open any Git repository or S3 bucket in an isolated workspace container and develop directly in your browser — on desktop or mobile. Features a JetBrains-inspired layout, AI-native agent panel, and a plugin architecture.

## Features

### Phase 1 — Core IDE

- **Monaco editor** — syntax highlighting for 70+ languages, multi-tab editing
- **File explorer** — create, rename, delete, move files and folders
- **Git workspace** — open any Git repository via URL
- **Container isolation** — each workspace runs in its own Docker container
- **DevContainer support** — respects `.devcontainer/devcontainer.json`
- **Auto-sleep** — idle containers pause automatically and resume on reconnect
- **JetBrains New UI layout** — gutter-based tool windows, resizable panels, glassmorphism header
- **Plugin architecture** — `PluginHost` with install/activate/deactivate lifecycle, scoped `PluginContext`
- **Command palette** — search-everywhere (`Ctrl+Shift+P`)
- **Keyboard shortcuts dialog** — view all registered keybindings
- **Mobile shell** — phone-first responsive layout (320px+)

### Phase 2 — Agent Panel & Plugin Migration

- **Agent panel** (bundled plugin, right gutter `Alt+6`) — session list, chat UI, SSE streaming, markdown, code blocks, metrics
- **Database panel** (bundled plugin, right gutter `Alt+4`) — table browser, query runner
- **Integrated terminal** — xterm.js + WebSocket to container (`Alt+5`)
- **Git panel** — diff viewer, commit, branch operations (`Alt+3`)
- **Search panel** — workspace-wide text search (`Alt+2`)
- **Tool window system** — move panels between left/right/bottom, hide via "More actions" menu
- **About dialog** — IDE version and tech stack info
- **Settings onChange** — cross-tab settings synchronization via `StorageEvent`

### Phase 3 — Plugin Pipelines, Quick Open, Agent Actions & Theming

- **File commands** — `Ctrl+S` save, `Ctrl+W` close tab, wired to real store actions
- **Quick Open** (`Ctrl+P`) — fuzzy file finder with keyboard navigation, recently-opened files first
- **File outline panel** (`Alt+7`) — symbol tree from Monaco document symbols, click to navigate
- **Lazy activation events** — `onWorkspaceOpen`, `onView:*`, `onCommand:*`, `onLanguage:*`
- **Context key system** — `when` clause evaluation with built-in keys (`workspaceOpen`, `editorFocused`, etc.)
- **Menu contributions** — plugin items in editor context, explorer context, and command palette with when-clause filtering
- **Settings UI** — auto-rendered from `SettingContribution`s with localStorage persistence
- **Theme contributions & switcher** — CSS custom properties + Monaco theme switching, built-in dark/light/high-contrast themes
- **Agent file references** — clickable file path links in agent messages
- **Agent inline diff preview** — Monaco DiffEditor with Accept/Reject for proposed edits
- **Agent shell command approval** — confirmation dialog before executing agent shell commands
- **Float view mode** — detach tool windows into draggable floating overlays

### Phase 4 — Editor Groups, Test Foundation, Search & Replace, Terminal Tabs

- **Editor groups** — split the editor into multiple resizable panes (horizontal/vertical), each with independent tabs
- **Breadcrumb symbol navigation** — file path + symbol hierarchy segments with cursor tracking and dropdown navigation
- **Editor settings** — minimap, word wrap, font size, tab size, whitespace rendering, line numbers, cursor blinking, bracket colorization — all live-updated via Settings panel
- **Vitest test foundation** — 103 automated tests across 6 suites (stores, modules, components)
- **Notification system** — toast bridge via `@heroui/toast` + persistent notification history center + status bar bell icon with unread badge
- **Search & Replace** — regex, case sensitivity, whole word, file pattern filters (include/exclude), inline replace
- **Terminal multiplexing** — multiple terminal session tabs, each with an independent PTY/WebSocket; add/close/rename tabs
- **Run configurations** — task runner panel to define and execute project tasks (build, test, lint) with output routed to terminal sessions
- **dock-unpinned view mode** — auto-hide tool windows on editor focus, reappear on gutter hover with slide-in animation
- **Tab drag-and-drop** — drag tabs between editor groups or to edges to create new splits; visual drop zone indicators

---

## Quick Start

### Local development (no Docker required)

```bash
cp .env.example .env
# Set DISABLE_CONTAINERS=true in .env for local dev without Docker
bun install
bun run dev
```

Open http://localhost:5174

### Docker

```bash
cp .env.example .env
# Edit WORKSPACES_HOST_PATH to an absolute path on your host
docker compose up -d
```

Open http://localhost:5174

### Running tests

```bash
cd ide/client
bun run test
```

---

## Architecture

```
Browser → ide-client (:5174) → /api/* proxy → ide-server (:4000)
                                             → /ws/*  proxy → ide-server (:4000)

ide-server → Docker socket → Workspace container (one per workspace)
           → WORKSPACES_ROOT/{id}/ → git clone + file ops
```

### Zustand Stores

The client manages state through 15 domain-specific Zustand stores:

| Store | Purpose |
|---|---|
| `workspaceStore` | Workspace list, active workspace, fetch/open/create/delete, heartbeat |
| `editorStore` | Multi-group editor: tabs, splits, cursor positions, virtual tabs (diffs, query console) |
| `fileTreeStore` | File tree entries, expand/collapse, flat row computation, CRUD, WebSocket file watcher |
| `gitStore` | Git status, log, branches, stash, stage/unstage, commit, push/pull, checkout |
| `dbStore` | Database connections, schema cache, query execution |
| `layoutStore` | Tool window visibility, placement, view mode (dock-pinned/dock-unpinned/float), sidebar widths |
| `terminalStore` | Terminal session multiplexing: multiple PTY session tabs |
| `runConfigStore` | Run/task configurations: CRUD, localStorage persistence, execution via terminal |
| `notificationStore` | Notification history (max 100), unread count, toast bridge |
| `settingsStore` | Settings registry, persisted values (localStorage), change listeners |
| `themeStore` | Theme registry, active theme (persisted to localStorage) |
| `statusBarStore` | Status bar items with alignment, priority, command binding, when-clause visibility |
| `menuStore` | Menu contributions with location and when-clause filtering |
| `editorActionStore` | Editor action registry (Agent: Explain, Refactor, Generate Tests) |
| `monacoInstanceStore` | Monaco editor/namespace refs, reactive revision counter for symbol updates |

### Plugin System

Plugins follow a JetBrains-inspired lifecycle:

1. **Install** — register the plugin manifest with `PluginHost`
2. **Activate** — triggered by activation events (`onStartup`, `onView:*`, `onCommand:*`, etc.)
3. **Deactivate** — cleanup on unload

Each plugin receives a scoped `PluginContext` with access to:

- **Tool windows** — register panels with placement, icon, shortcut
- **Commands** — register executable actions
- **Keybindings** — bind shortcuts to commands
- **Settings** — declare settings with type/default/category
- **Menus** — contribute items to context menus and command palette
- **Status bar** — add items with alignment and priority
- **Editor actions** — add actions to the Monaco editor context menu
- **Themes** — register color themes with CSS custom properties and Monaco token rules

#### Bundled Plugins

| Plugin ID | Panel | Shortcut | Description |
|---|---|---|---|
| `agentscope.agent` | Agent | `Alt+6` | AI chat sessions, streaming responses, inline diff, file references, shell command approval |
| `agentscope.database` | Database | `Alt+4` | Table browser, SQL query runner |

### Editor Groups Model

The editor area supports split panes via a recursive tree structure:

```
EditorSplit (root)
├── EditorGroup (tabs + Monaco instance)
└── EditorSplit (nested)
    ├── EditorGroup
    └── EditorGroup
```

Key operations:
- `splitGroup(groupId, direction)` — split an existing group, duplicating the active tab
- `splitWithTab(tabId, fromGroupId, direction)` — move a tab into a new split
- `moveTab(tabId, fromGroupId, toGroupId)` — move a tab between existing groups
- `closeGroup(groupId)` — close a group and collapse the parent split

---

## Keyboard Shortcuts

### Core

| Shortcut | Action |
|---|---|
| `Ctrl+S` | Save active file |
| `Ctrl+Shift+S` | Save all dirty files |
| `Ctrl+W` | Close active tab |
| `Ctrl+N` | New file |
| `Ctrl+Shift+N` | New folder |
| `Ctrl+P` | Quick Open (Go to File) |
| `Ctrl+Shift+P` | Command Palette |
| `Ctrl+Shift+F` | Search in Files |
| `Ctrl+Shift+H` | Search and Replace in Files |
| `Ctrl+K Ctrl+S` | Show Keyboard Shortcuts |
| `Ctrl+B` | Toggle left sidebar |
| `` Ctrl+` `` | Toggle terminal |

### Editor Groups

| Shortcut | Action |
|---|---|
| `Ctrl+\` | Split editor right |
| `Ctrl+Shift+\` | Split editor down |
| `Ctrl+K Ctrl+ArrowRight` | Focus next editor group |
| `Ctrl+K Ctrl+ArrowLeft` | Focus previous editor group |

### Tool Windows

| Shortcut | Panel |
|---|---|
| `Alt+1` | Explorer |
| `Alt+2` | Search |
| `Alt+3` | Source Control (Git) |
| `Alt+4` | Database |
| `Alt+5` | Terminal |
| `Alt+6` | Agent (AI) |
| `Alt+7` | Outline |
| `Alt+8` | Run Configurations |
| `Ctrl+,` | Settings |

### Gutter Layout

| Position | Panels |
|---|---|
| Left gutter (top) | Explorer, Search, Git |
| Left gutter (bottom) | Terminal, Run — icons in gutter, panels render at bottom |
| Right gutter | Agent, Database |

All panels start collapsed on fresh load. Gutter icons are always visible.

---

## Editor Settings

Configurable via the Settings panel (`Ctrl+,`), persisted to localStorage:

| Setting | Type | Default | Options |
|---|---|---|---|
| Minimap | boolean | `true` | — |
| Word Wrap | enum | `off` | `off`, `on`, `wordWrapColumn`, `bounded` |
| Font Size | number | `14` | — |
| Tab Size | number | `2` | — |
| Render Whitespace | enum | `selection` | `none`, `boundary`, `selection`, `trailing`, `all` |
| Line Numbers | enum | `on` | `on`, `off`, `relative`, `interval` |
| Cursor Blinking | enum | `blink` | `blink`, `smooth`, `phase`, `expand`, `solid` |
| Bracket Pair Colorization | boolean | `true` | — |

---

## Configuration

### Server environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | IDE server port |
| `WORKSPACES_ROOT` | `/tmp/ide-workspaces` | Where repos are cloned |
| `WORKSPACES_HOST_PATH` | same as ROOT | Host path for Docker bind mounts |
| `DISABLE_CONTAINERS` | `false` | Skip Docker container creation (local dev) |
| `DEFAULT_CONTAINER_IMAGE` | `ghcr.io/devcontainers/base:ubuntu` | Fallback workspace image |
| `SLEEP_TIMEOUT_MINUTES` | `30` | Idle minutes before container auto-sleeps |

### Client environment variables

| Variable | Default | Description |
|---|---|---|
| `VITE_IDE_SERVER_URL` | `http://localhost:4000` | IDE server URL for the Vite client |

### Optional platform integration

When running alongside the full `swe-ai-platform`:

```env
PLATFORM_API_URL=http://localhost:3000
AGENT_SERVICE_URL=http://localhost:8000
PLATFORM_JWT_SECRET=<same as platform>
```

### OpenCode AI integration

```env
# Mode A: connect to an existing OpenCode server
OPENCODE_SERVER_URL=http://localhost:...

# Mode B: embedded OpenCode instance
OPENCODE_MODEL=<model-name>
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI components | HeroUI + Tailwind CSS v4 |
| Editor | Monaco Editor (`@monaco-editor/react`) |
| State management | Zustand 5 |
| Panel layout | `react-resizable-panels` |
| Animations | Framer Motion |
| Virtual lists | `react-virtuoso` |
| Markdown | `react-markdown` + `remark-gfm` |
| Backend | Hono + Bun |
| AI backend | OpenCode SDK (`@opencode-ai/sdk`) |
| Container management | Dockerode |
| Git operations | simple-git |
| File watching | chokidar |
| Testing | Vitest + @testing-library/react + jsdom |

---

## Roadmap

### Completed

- **Phase 1** — Core IDE (Monaco, file explorer, containers, plugin arch, mobile shell)
- **Phase 2** — Agent panel, database panel, terminal, git panel, search, tool window system
- **Phase 3** — Plugin pipelines, Quick Open, agent actions, theming, float view mode
- **Phase 4** — Editor groups, test foundation, notifications, search & replace, terminal tabs, run configs, dock-unpinned, tab DnD

### Planned

- **Phase 5** — ACP (Agent Client Protocol) for alternative coding agents, plugin marketplace, PWA support
