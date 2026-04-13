# Changelog

All notable changes to the AgentScope IDE are documented in this file.

## Phase 4 — Editor Groups, Test Foundation, Search & Replace, Terminal Tabs

### Phase 4A: Editor Evolution
- **Editor Groups — Store & Model**: Refactored `editorStore` from a flat tab list to a multi-group model with `EditorGroup`/`EditorSplit` recursive tree. Added `splitGroup`, `closeGroup`, `moveTab`, `setActiveGroup` actions. Backward-compatible `tabs` and `activeTabId` mirrors preserved.
- **Editor Groups — UI Split Rendering**: Recursive split pane renderer using `react-resizable-panels`. `EditorArea` walks the `rootSplit` tree, rendering `PanelGroup`/`Panel`/`ResizeHandle` for splits and `EditorGroupView` for leaf groups.
- **Breadcrumb Symbol Navigation**: Enhanced `EditorBreadcrumb` with file path segments + symbol hierarchy (classes, functions, variables). Cursor position tracking updates the active symbol. Click any segment to navigate; dropdown for sibling symbols.
- **Editor Settings Integration**: Wired 8 Monaco editor settings (minimap, word wrap, font size, tab size, whitespace, line numbers, cursor blinking, bracket colorization) to the Settings panel with live updates.

### Phase 4B: Developer Experience
- **Vitest Test Foundation**: Set up Vitest + @testing-library/react + jsdom. 103 tests across 6 suites covering core stores (`editorStore`, `layoutStore`, `notificationStore`), modules (`commands`, `keybindings`, `context-keys`), and component rendering.
- **Notification System**: Added `notificationStore` with `notify()` helper that bridges to `@heroui/toast` for transient toasts and maintains a persistent notification history (max 100, FIFO). Status bar bell icon with unread badge. Notification center panel.
- **Search & Replace**: Enhanced `SearchPanel` with replace input, regex toggle, case sensitivity, whole word matching, and file pattern filters (include/exclude glob patterns). Inline replace-one and replace-all actions.
- **Terminal Multiplexing**: `terminalStore` manages multiple terminal session tabs. Each tab is an independent PTY/WebSocket connection. Tab bar with add/close/rename functionality. Sessions persist across panel hide/show.

### Phase 4C: Workflow & Polish
- **Run Configurations Panel**: Task runner panel (`Alt+8`) to define and execute project tasks (build, test, lint, custom). Configurations stored in `runConfigStore` with localStorage persistence per workspace. Execution output routed to dedicated terminal sessions.
- **dock-unpinned View Mode**: Tool windows can be unpinned via the "More Actions" menu. Unpinned windows auto-hide when the editor gains focus and reappear as slide-in overlays on gutter icon hover (300ms auto-dismiss on mouse leave). Dashed bottom border on gutter icons indicates unpinned state.
- **Tab Drag-and-Drop**: Tabs are draggable between editor groups. Dropping on a tab bar moves the tab to that group. Dropping on group edges (top/bottom/left/right 20% zone) creates a new split via `splitWithTab`. Visual indicators: violet vertical line for tab bar insertion point, semi-transparent violet overlay for edge drop zones.
- **README & Documentation**: Comprehensive IDE README covering all Phase 1-4 features, architecture (stores, plugin system, editor groups model), keyboard shortcuts, editor settings, environment variables, tech stack, and roadmap. Added this CHANGELOG.

## Phase 3 — Plugin Pipelines, Quick Open, Agent Actions & Theming

### Phase 3A: Core IDE Features
- **File Commands**: Wired `file.save`, `file.saveAll`, `file.closeTab` commands to real `editorStore` actions with `Ctrl+S`, `Ctrl+Shift+S`, `Ctrl+W` keybindings.
- **Quick Open**: Fuzzy file finder dialog (`Ctrl+P`) with keyboard navigation (arrow keys, Enter), recently-opened files prioritized, real-time filtering.
- **File Outline Panel**: Symbol tree panel (`Alt+7`) showing classes, functions, variables from Monaco document symbols. Click to navigate to symbol location.

### Phase 3B: Plugin Contribution Pipelines
- **Lazy Activation Events**: Plugins can declare activation events (`onWorkspaceOpen`, `onView:*`, `onCommand:*`, `onLanguage:*`) and are activated lazily when the event fires.
- **Context Key System**: `contextKeyService` singleton managing boolean/string keys (`workspaceOpen`, `editorFocused`, `editorHasSelection`, `editorLangId`, `activeToolWindow`). Supports `when` clause evaluation for menus, commands, and status bar items.
- **Menu Contributions**: Plugins can contribute items to `editor.context`, `explorer.context`, and `commandPalette` menus. Items filtered by `when` clause evaluation.
- **Settings UI**: Settings panel (`Ctrl+,`) auto-rendered from `SettingContribution` declarations. Supports boolean, number, string, and enum types. Values persisted to localStorage with cross-tab synchronization.
- **Theme Contributions & Switcher**: Theme registration system with CSS custom properties and Monaco token rules. Built-in dark, light, and high-contrast themes. Theme switcher command in palette.

### Phase 3C: Agent Actions + Float Mode
- **Agent File References**: Clickable file path links in agent chat messages. Clicking opens the file in the editor and scrolls to the referenced line.
- **Agent Inline Diff Preview**: When the agent proposes file edits, a Monaco DiffEditor shows the changes with Accept/Reject buttons.
- **Agent Shell Command Approval**: Confirmation dialog before executing agent-proposed shell commands, showing the command and working directory.
- **Float View Mode**: Tool windows can be detached into draggable floating overlays via the "More Actions" menu. Float windows are freely positionable and resizable.

## Phase 2 — Agent Panel & Plugin Migration

- **Agent panel**: Bundled plugin (`Alt+6`) with session list, chat UI, SSE streaming messages, markdown rendering with syntax-highlighted code blocks, and session metrics.
- **Database panel**: Bundled plugin (`Alt+4`) with table browser and SQL query runner.
- **Integrated terminal**: xterm.js terminal connected to workspace container via WebSocket (`Alt+5`).
- **Git panel**: Diff viewer, staging/unstaging, commit, branch operations (`Alt+3`).
- **Search panel**: Workspace-wide text search with file results (`Alt+2`).
- **Tool window system**: Panels can be moved between left/right/bottom positions via "More actions" menu.
- **About dialog**: IDE version and tech stack information.
- **Settings onChange**: Cross-tab settings synchronization for plugins via `StorageEvent`.

## Phase 1 — Core IDE

- **Monaco editor**: Syntax highlighting for 70+ languages, multi-tab editing with dirty state tracking.
- **File explorer**: Create, rename, delete, move files and folders. Virtual list rendering for large trees.
- **Git workspace**: Open any Git repository via URL. Clone into isolated workspace directory.
- **Container isolation**: Each workspace runs in its own Docker container via Dockerode.
- **DevContainer support**: Reads `.devcontainer/devcontainer.json` for custom images and features.
- **Auto-sleep**: Idle containers pause after configurable timeout (default 30 minutes) and resume on reconnect.
- **JetBrains New UI layout**: Gutter-based tool window icons, resizable panels, glassmorphism header with workspace controls.
- **Plugin architecture**: `PluginHost` with install/activate/deactivate lifecycle. Scoped `PluginContext` per plugin with contribution APIs (tool windows, commands, keybindings, settings, menus, status bar, editor actions, themes).
- **Command palette**: Search-everywhere style dialog (`Ctrl+Shift+P`) listing all registered commands with fuzzy filtering.
- **Keyboard shortcuts dialog**: View all registered keybindings in a searchable table (`Ctrl+K Ctrl+S`).
- **Mobile shell**: Phone-first responsive layout designed for 320px+ screens.
