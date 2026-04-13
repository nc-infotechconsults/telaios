# Spec: Phase 4 — Editor Groups, Test Foundation, Search & Replace, Terminal Tabs

## Objective

Phase 3 completed every plugin contribution pipeline, Quick Open, File Outline, theme switcher, context keys, and agent actions (clickable file refs, inline diffs, shell approval, float mode). The IDE is now a fully-functional single-editor web IDE with a mature plugin architecture.

Phase 4 **evolves the editor into a multi-group split-pane system**, establishes the first automated test foundation, and polishes the developer workflow with search & replace, terminal multiplexing, and run configurations.

### Success looks like:

- User can split the editor horizontally or vertically — each group has its own tab bar, active file, and Monaco instance
- User can drag tabs between editor groups or to a new split
- Breadcrumbs show file path + symbol hierarchy from Monaco document symbols; clicking navigates
- Monaco editor behavior (minimap, word wrap, font size, tab size) is configurable through the Settings panel
- `bun run test` executes Vitest and passes — core stores and modules have automated test coverage
- Notification toasts appear for save, errors, and agent events; a notification center shows history
- Search panel supports find & replace across files with regex, case sensitivity, and file pattern filters
- Terminal panel supports multiple tabs — each tab is an independent PTY session with add/close/rename
- A Run Configurations panel lets users define and execute tasks (build, test, lint) with output in a terminal
- `dock-unpinned` view mode auto-hides tool windows when the editor gains focus
- IDE README documents all Phase 1-4 features

### Users

- Developers using AgentScope IDE for AI-assisted coding
- Contributors who need automated tests to validate changes
- Plugin authors who want to extend the editor groups or terminal

---

## Assumptions

1. **Editor groups use `react-resizable-panels`** — already installed, used for layout panels; extend to editor splits
2. **Each editor group has its own Monaco instance** — no shared model, but models are shared via Monaco's internal URI-based model registry
3. **Terminal multiplexing is client-side tab management** — each tab opens a separate WebSocket/PTY session; no server-side mux daemon
4. **Run configurations are stored in `localStorage`** (per workspace) — no new server endpoints for config storage
5. **Vitest is the test framework** — lightweight, Vite-native, already compatible with the build toolchain
6. **No server-side changes except** minor additions for search/replace API endpoint
7. **Notification system uses `@heroui/toast`** (already installed v2.0.0) + a custom notification store for history
8. **`dock-unpinned` auto-hide** triggers on Monaco `onDidFocusEditorWidget` — same event already used for `editorFocused` context key

---

## Tech Stack

Unchanged from Phase 3. Key additions:

- **`vitest`** + **`@testing-library/react`** + **`jsdom`** — test framework and DOM testing utilities
- No other new runtime dependencies expected

---

## Commands

```bash
# Install
cd ide && bun install

# Dev
bun run dev              # client + server concurrently

# Typecheck (must pass before any task is complete)
cd ide/client && bunx tsc --noEmit --pretty
cd ide/server && bunx tsc --noEmit --pretty

# Test (NEW in Phase 4)
cd ide/client && bun run test        # Vitest unit tests
cd ide/client && bun run test:watch  # Vitest watch mode

# Individual
bun run client:dev       # Vite :5174
bun run server:dev       # Hono :4000
```

---

## Project Structure (new/modified files)

```
ide/client/
├── vitest.config.ts                     # NEW — Vitest configuration
├── src/
│   ├── components/
│   │   ├── editor/
│   │   │   ├── EditorArea.tsx           # NEW — Multi-group editor container with split panes
│   │   │   ├── EditorGroup.tsx          # NEW — Single editor group: tab bar + Monaco + breadcrumb
│   │   │   ├── EditorBreadcrumb.tsx     # MODIFIED — Add symbol segments from document symbols
│   │   │   ├── EditorTabBar.tsx         # MODIFIED — Support group-scoped tabs, drag-and-drop
│   │   │   └── CodeEditor.tsx           # MODIFIED — Accept groupId prop, register per-group
│   │   ├── panels/
│   │   │   ├── SearchPanel.tsx          # MODIFIED — Add replace, regex, case, file filters
│   │   │   └── RunConfigPanel.tsx       # NEW — Run configuration management & execution
│   │   ├── terminal/
│   │   │   ├── Terminal.tsx             # MODIFIED — Accept sessionId, support multiple instances
│   │   │   └── TerminalTabs.tsx         # NEW — Tab bar for terminal sessions
│   │   ├── layout/
│   │   │   ├── IDEShell.tsx             # MODIFIED — Render EditorArea instead of single CodeEditor
│   │   │   └── ToolWindow.tsx           # MODIFIED — dock-unpinned behavior
│   │   └── ui/
│   │       └── NotificationCenter.tsx   # NEW — Notification history panel
│   │
│   ├── stores/
│   │   ├── editorStore.ts              # MODIFIED — EditorGroup model, split/close/move actions
│   │   ├── layoutStore.ts              # MODIFIED — dock-unpinned auto-hide logic
│   │   ├── terminalStore.ts            # NEW — Terminal session management (tabs)
│   │   ├── notificationStore.ts        # NEW — Notification history + toast bridge
│   │   └── runConfigStore.ts           # NEW — Run configuration definitions & execution
│   │
│   ├── core/
│   │   └── bootstrap.tsx               # MODIFIED — Register new commands, terminal & run config tool windows
│   │
│   └── __tests__/                      # NEW — Test directory
│       ├── stores/
│       │   ├── editorStore.test.ts     # NEW — Editor store unit tests
│       │   ├── layoutStore.test.ts     # NEW — Layout store unit tests
│       │   └── workspaceStore.test.ts  # NEW — Workspace store unit tests
│       ├── core/
│       │   ├── commands.test.ts        # NEW — Command registry tests
│       │   ├── keybindings.test.ts     # NEW — Keybinding service tests
│       │   └── context-keys.test.ts    # NEW — Context key evaluation tests
│       └── setup.ts                    # NEW — Test setup (jsdom, mocks)
```

---

## Code Style

Unchanged from Phase 3:

- TypeScript strict, no `any`
- Zustand stores: one per domain, shallow selectors, **never call derived methods inside Zustand selectors**
- Components: functional, `memo` where beneficial
- Files with JSX use `.tsx`
- Path alias `@/*` → `src/*`
- Plugin IDs use reverse-domain style
- **Tests**: colocated under `src/__tests__/` mirroring source structure, suffix `.test.ts` / `.test.tsx`

---

## Testing Strategy

### Automated Testing (NEW in Phase 4)

- **Framework**: Vitest + `@testing-library/react` + `jsdom`
- **Location**: `ide/client/src/__tests__/`
- **Coverage targets**: Core stores (editorStore, layoutStore, workspaceStore) and core modules (commands, keybindings, context-keys)
- **Minimum**: All public actions in tested stores have at least one test
- **Run**: `cd ide/client && bun run test`

### Manual QA (continued from Phase 3)

- Editor groups: split right → two editors side by side → open different files → close one group → editor collapses back
- Drag tab: drag tab from group A to group B → tab moves, file stays open
- Breadcrumb: open a TypeScript file → breadcrumb shows path + symbols → click symbol → editor scrolls
- Search & Replace: search for text → see matches highlighted → replace one / replace all → files update
- Terminal tabs: click "+" → new terminal tab → independent shell session → close tab → session ends
- Run configurations: create "Build" task → run → output appears in terminal → success/failure indicator
- Notifications: save file → toast appears "Saved" → click notification icon → history shows past notifications
- dock-unpinned: set a panel to unpinned → click in editor → panel auto-hides → hover gutter → panel shows

### Regression

- All Phase 1-3 features still work — panels, commands, mobile shell, agent streaming, database plugin, Quick Open, themes, settings, float mode

---

## Boundaries

### Always
- Run typecheck before considering a task complete
- Run `bun run test` and ensure no regressions before considering a task complete (after Task 5)
- Editor groups must not break single-editor behavior — default state is one group
- Terminal tabs must maintain backward compatibility with the existing single-terminal WebSocket protocol
- Notifications must not block user interaction (non-modal toasts)

### Ask First
- Adding new npm dependencies beyond vitest/testing-library
- Changing the `PluginManifest` or `PluginContributions` type shapes
- Changing the server's WebSocket terminal protocol
- Adding new server API endpoints

### Never
- Commit API keys or secrets
- Break existing panel functionality
- Call LLM APIs directly — always through OpenCode SDK
- Remove existing keybindings or commands
- Ship tests that rely on network calls (mock all API interactions)

---

## Detailed Feature Specifications

### Feature 1: Editor Groups — Store & Model

Refactor `editorStore` from a flat tab list to a multi-group model. Each group has its own tabs, activeTabId, and can be split.

**New types:**

```typescript
interface EditorGroup {
  id: string;                    // uuid
  tabs: EditorTab[];
  activeTabId: string | null;
  // Split direction only applies to the container holding this group
}

type SplitDirection = "horizontal" | "vertical";

interface EditorSplit {
  id: string;
  direction: SplitDirection;
  children: (EditorGroup | EditorSplit)[];  // recursive tree
  sizes: number[];                          // percentage per child
}
```

**State changes to `editorStore`:**

```typescript
interface EditorState {
  // OLD (remove):
  // tabs: EditorTab[];
  // activeTabId: string | null;

  // NEW:
  rootSplit: EditorSplit | EditorGroup;  // tree of groups & splits
  activeGroupId: string;                  // which group has focus
  groups: Record<string, EditorGroup>;    // flat lookup

  // NEW actions:
  splitGroup(groupId: string, direction: SplitDirection): void;
  closeGroup(groupId: string): void;
  moveTab(tabId: string, fromGroupId: string, toGroupId: string): void;
  setActiveGroup(groupId: string): void;

  // MIGRATED (now group-scoped):
  openFile(workspaceId: string, filePath: string, groupId?: string): Promise<void>;
  openTab(workspaceId: string, filePath: string, groupId?: string): void;
  closeTab(tabId: string, groupId?: string): void;
  setActiveTab(tabId: string, groupId?: string): void;
  // ... other tab actions gain optional groupId, defaulting to activeGroupId
}
```

**Migration strategy:**
- Default state: single group (backward compatible)
- All existing `useEditorStore` selectors that read `tabs` / `activeTabId` are updated to read from the active group
- Provide convenience getters: `getActiveGroup()`, `getActiveTab()`, `getActiveTabs()` that delegate to `groups[activeGroupId]`

---

### Feature 2: Editor Groups — UI Split Rendering

Render the editor area as a tree of resizable split panes, each leaf containing an `EditorGroup` component.

**Implementation:**

1. Create `EditorArea.tsx`:
   - Reads `rootSplit` from editorStore
   - Recursively renders `react-resizable-panels` `PanelGroup` / `Panel` / `PanelResizeHandle` for splits
   - Leaf nodes render `<EditorGroup groupId={id} />`
   - Empty state (no groups) shows a centered "Open a file to start editing"

2. Create `EditorGroup.tsx`:
   - Self-contained: own `EditorTabBar` + `EditorBreadcrumb` + `CodeEditor`
   - Receives `groupId` prop
   - Subscribes to `editorStore.groups[groupId]`
   - Click anywhere in the group sets it as `activeGroupId` (focus ring: subtle border highlight)

3. Modify `EditorTabBar.tsx`:
   - Accept `groupId` prop — reads tabs from the specific group
   - Add split buttons in the tab bar: "Split Right" (`Ctrl+\`), "Split Down" (`Ctrl+Shift+\`)
   - Drop zone for drag-and-drop (Phase 4 Task 11)

4. Modify `CodeEditor.tsx`:
   - Accept `groupId` prop
   - Uses that group's `activeTabId` for the model
   - On focus, calls `setActiveGroup(groupId)`

5. Modify `IDEShell.tsx`:
   - Replace the current `<EditorTabBar>` + `<EditorBreadcrumb>` + `<CodeEditor>` block with `<EditorArea />`

**Commands:**
- `editor.splitRight` — `Ctrl+\` — splits active group horizontally
- `editor.splitDown` — `Ctrl+Shift+\` — splits active group vertically
- `editor.closeGroup` — closes the active group (if more than one exists)
- `editor.focusNextGroup` — `Ctrl+K Ctrl+Right` — focus the next group
- `editor.focusPrevGroup` — `Ctrl+K Ctrl+Left` — focus the previous group

---

### Feature 3: Breadcrumb Symbol Navigation

Enhance `EditorBreadcrumb` to show both file path segments and symbol hierarchy. Clicking a segment navigates.

**Implementation:**

1. Modify `EditorBreadcrumb.tsx`:
   - Accept `groupId` prop
   - Read active file path from the group
   - Use `useDocumentSymbols` hook to get current symbols
   - Determine which symbol contains the cursor position (walk the symbol tree by range)
   - Render: `folder > folder > filename > Class > method`
   - Path segments are clickable:
     - Directory segments: open that folder in the Explorer panel (toggle Explorer, expand path)
     - Filename segment: no-op (already there)
     - Symbol segments: scroll editor to that symbol's range start

2. Symbol cursor tracking:
   - Subscribe to Monaco `onDidChangeCursorPosition`
   - On cursor change, walk the document symbols tree to find the deepest symbol whose range contains the cursor
   - Update breadcrumb segments reactively (debounced 150ms)

3. Dropdown on click:
   - Clicking a symbol breadcrumb segment opens a small dropdown listing sibling symbols at that level
   - Selecting a sibling navigates to it

---

### Feature 4: Editor Settings Integration

Wire Monaco editor behavior settings to the Settings store so users can configure them through the Settings panel.

**Implementation:**

1. Register editor settings in `bootstrap.tsx`:

```typescript
const editorSettings = [
  { key: "editor.minimap.enabled", label: "Minimap", type: "boolean", default: true, category: "Editor" },
  { key: "editor.wordWrap", label: "Word Wrap", type: "enum", default: "off", enum: ["off", "on", "wordWrapColumn", "bounded"], category: "Editor" },
  { key: "editor.fontSize", label: "Font Size", type: "number", default: 14, category: "Editor" },
  { key: "editor.tabSize", label: "Tab Size", type: "number", default: 2, category: "Editor" },
  { key: "editor.renderWhitespace", label: "Render Whitespace", type: "enum", default: "selection", enum: ["none", "boundary", "selection", "trailing", "all"], category: "Editor" },
  { key: "editor.lineNumbers", label: "Line Numbers", type: "enum", default: "on", enum: ["on", "off", "relative", "interval"], category: "Editor" },
  { key: "editor.cursorBlinking", label: "Cursor Blinking", type: "enum", default: "blink", enum: ["blink", "smooth", "phase", "expand", "solid"], category: "Editor" },
  { key: "editor.bracketPairColorization", label: "Bracket Pair Colorization", type: "boolean", default: true, category: "Editor" },
];
```

2. In `CodeEditor.tsx`, read editor settings from `settingsStore` and apply them as Monaco `options`:
   - Subscribe to setting changes via `onSettingChange()` from `settingsStore`
   - On change, call `editor.updateOptions({ ... })` with the new values
   - Initial load: read all `editor.*` settings and pass as Monaco `options`

3. The Settings panel (already built) will automatically render these since they follow the `SettingContribution` format.

---

### Feature 5: Vitest Test Foundation

Set up Vitest and write the first automated tests for core stores and modules.

**Implementation:**

1. Install dev dependencies:
   ```bash
   cd ide/client && bun add -d vitest @testing-library/react @testing-library/jest-dom jsdom
   ```

2. Create `vitest.config.ts`:
   ```typescript
   import { defineConfig } from "vitest/config";
   import path from "path";

   export default defineConfig({
     test: {
       environment: "jsdom",
       globals: true,
       setupFiles: ["./src/__tests__/setup.ts"],
       include: ["src/__tests__/**/*.test.{ts,tsx}"],
     },
     resolve: {
       alias: { "@": path.resolve(__dirname, "src") },
     },
   });
   ```

3. Create `src/__tests__/setup.ts`:
   - Import `@testing-library/jest-dom`
   - Mock `localStorage` if needed (jsdom provides it)
   - Mock `window.matchMedia` for responsive hooks

4. Add scripts to `package.json`:
   ```json
   "test": "vitest run",
   "test:watch": "vitest"
   ```

5. Write tests:

   **`editorStore.test.ts`** (~15 tests):
   - Initial state: empty tabs, null activeTabId
   - `openTab`: creates tab, sets active
   - `openTab` same file: focuses existing tab, doesn't duplicate
   - `closeTab`: removes tab, adjusts activeTabId
   - `closeTab` last tab: activeTabId becomes null
   - `setActiveTab`: changes activeTabId
   - Virtual tabs: openQueryConsole, openDiff, openCommitDetail
   - `updateTabContent`: marks tab dirty
   - `saveTab`: marks tab not dirty (mock API)
   - `renameTab`: updates tab path and id
   - `setCursor`: stores cursor position

   **`layoutStore.test.ts`** (~12 tests):
   - Initial state: empty toolWindows
   - `registerToolWindow`: adds to state
   - `toggleToolWindow`: toggles visibility
   - `setToolWindowPlacement`: changes placement
   - `hasVisibleIn`: returns correct boolean
   - `floatToolWindow` / `dockToolWindow`: changes viewMode
   - `setFloatPosition` / `setFloatSize`: updates float state
   - Collapsed regions: `toggleRegionCollapse`
   - Sidebar width: `setLeftSidebarWidth`, `setRightSidebarWidth`

   **`commands.test.ts`** (~8 tests):
   - `register`: adds command
   - `execute`: calls handler
   - `execute` unknown: throws/returns false
   - `getAll`: returns all commands
   - `when` clause: command filtered by condition
   - Disposable: unregister works

   **`keybindings.test.ts`** (~6 tests):
   - `register`: adds keybinding
   - `handle`: matches key event to command
   - `when` clause: keybinding skipped when condition false
   - Conflict detection: last registered wins

   **`context-keys.test.ts`** (~10 tests):
   - `set` / `get`: stores and retrieves values
   - `evaluate` single key: truthy check
   - `evaluate` negation: `!key`
   - `evaluate` AND: `a && b`
   - `evaluate` OR: `a || b`
   - `evaluate` equality: `key == value`
   - `evaluate` undefined key: falsy
   - `onChange`: listener fires on change

---

### Feature 6: Notification System

Wire `@heroui/toast` for transient notifications and add a persistent notification history.

**Implementation:**

1. Create `notificationStore.ts`:
   ```typescript
   interface Notification {
     id: string;
     title: string;
     description?: string;
     type: "info" | "success" | "warning" | "error";
     timestamp: number;
     read: boolean;
   }

   interface NotificationState {
     notifications: Notification[];
     unreadCount: number;
     notify(opts: Omit<Notification, "id" | "timestamp" | "read">): void;
     markRead(id: string): void;
     markAllRead(): void;
     clear(): void;
   }
   ```

2. `notify()` action:
   - Appends to `notifications` array (max 100, FIFO eviction)
   - Increments `unreadCount`
   - Calls `addToast()` from `@heroui/toast` with matching `color` (`info` → `default`, `success` → `success`, `warning` → `warning`, `error` → `danger`)

3. Create `NotificationCenter.tsx`:
   - Dropdown panel triggered from a status bar bell icon
   - Shows notification history with timestamps
   - "Mark all read" button
   - "Clear all" button
   - Unread items have a subtle left-border accent

4. Wire notifications to existing actions:
   - `file.save` → `notify({ title: "File saved", type: "success" })`
   - Agent errors → `notify({ title: "Agent error", description: msg, type: "error" })`
   - Search failures (already use `addToast`) → route through `notify()` instead

5. Status bar integration:
   - Register a status bar item showing a bell icon + unread count badge
   - Click opens `NotificationCenter` dropdown

---

### Feature 7: Search & Replace

Enhance the SearchPanel with replace functionality, regex support, case sensitivity toggle, and file pattern filters.

**Implementation:**

1. Modify `SearchPanel.tsx`:
   - Add a "Replace" input field (collapsible, toggled by a button)
   - Add toggle buttons: **Case Sensitive** (Aa), **Regex** (.*)  , **Whole Word** (ab|)
   - Add a "Files to include" input (glob pattern, e.g., `*.ts`, `src/**`)
   - Add a "Files to exclude" input (glob pattern, e.g., `node_modules/**`)

2. Search API enhancement:
   - Current: `api.workspaces.search(workspaceId, query)` — plain text search
   - New parameters: `{ query, replace?, regex?, caseSensitive?, wholeWord?, include?, exclude? }`
   - Server-side: add optional `replace`, `regex`, `caseSensitive`, `include`, `exclude` query params to the search endpoint

3. Replace actions:
   - **Replace in file**: replace all occurrences in one file → `PATCH /api/workspaces/{id}/files/{path}` with search/replace params
   - **Replace all**: replace across all matched files
   - Show a confirmation count before replacing: "Replace 42 occurrences in 8 files?"

4. Results display:
   - Group results by file (collapsible)
   - Show match count per file
   - Highlight matched text in preview
   - Each result has individual "Replace" button (when replace input is active)
   - File-level "Replace All in File" button

5. Register keybindings:
   - `Ctrl+Shift+H` — focus Search panel with replace input open
   - `Ctrl+Shift+F` — focus Search panel (already exists as `Alt+2`; add this alias)

---

### Feature 8: Terminal Multiplexing

Support multiple terminal sessions with tabs in the terminal panel.

**Implementation:**

1. Create `terminalStore.ts`:
   ```typescript
   interface TerminalSession {
     id: string;
     label: string;         // "Terminal 1", "Terminal 2", or custom name
     workspaceId: string;
     createdAt: number;
   }

   interface TerminalState {
     sessions: TerminalSession[];
     activeSessionId: string | null;
     nextIndex: number;      // auto-increment for default labels

     createSession(workspaceId: string, label?: string): string;  // returns session id
     closeSession(id: string): void;
     setActiveSession(id: string): void;
     renameSession(id: string, label: string): void;
   }
   ```

2. Create `TerminalTabs.tsx`:
   - Horizontal tab bar at the top of the terminal area
   - Each tab: label + close button
   - "+" button to create new session
   - Double-click tab to rename
   - Active tab highlighted

3. Modify `Terminal.tsx`:
   - Accept `sessionId` prop instead of creating its own session
   - WebSocket URL includes session ID: `/ws/{workspaceId}/terminal/{sessionId}`
   - When `sessionId` changes, close old WebSocket, open new one
   - Keep xterm instances alive when switching tabs (mount/unmount or show/hide)

4. Server-side (minor):
   - Terminal WebSocket route already supports independent connections
   - Each new WebSocket connection spawns a new PTY — no server changes needed if sessions are identified by separate connections
   - If the server uses a session registry, add session ID to the route

5. Bootstrap:
   - Modify the terminal tool window wrapper to render `TerminalTabs` + `Terminal`
   - Register commands: `terminal.new` (create new terminal), `terminal.close` (close active terminal)
   - Default: one terminal session created when the terminal panel first opens

---

### Feature 9: Run Configurations Panel

A panel to define and execute project tasks (build, test, lint) with output piped to a terminal.

**Implementation:**

1. Create `runConfigStore.ts`:
   ```typescript
   interface RunConfig {
     id: string;
     name: string;          // "Build", "Test", "Lint"
     command: string;        // "bun run build", "bun test"
     cwd?: string;           // relative to workspace root
     env?: Record<string, string>;
     color?: string;         // terminal tab color accent
   }

   interface RunConfigState {
     configs: RunConfig[];
     runningConfigs: Set<string>;  // config IDs currently executing

     addConfig(config: Omit<RunConfig, "id">): void;
     updateConfig(id: string, updates: Partial<RunConfig>): void;
     removeConfig(id: string): void;
     runConfig(workspaceId: string, configId: string): void;  // creates terminal session + executes
     stopConfig(configId: string): void;
   }
   ```

2. Create `RunConfigPanel.tsx`:
   - Register as core tool window (ID: `runConfigs`, label: "Run", icon: `Play`, placement: `bottom`, shortcut: `Alt+8`)
   - Lists all configurations with play/stop buttons
   - "Add Configuration" button opens inline form
   - Edit/delete for each configuration
   - Running configs show a spinner + output preview

3. Run execution:
   - `runConfig()` creates a new terminal session via `terminalStore.createSession()`
   - Sends the command string to the terminal via WebSocket
   - Marks config as running
   - When terminal session closes (WebSocket close event), marks config as stopped

4. Persistence:
   - Configs stored in `localStorage` under `ide:runConfigs:${workspaceId}`

5. Default configurations:
   - On first workspace load, auto-detect from `package.json` scripts: create configs for `build`, `test`, `lint`, `dev` if they exist

---

### Feature 10: dock-unpinned View Mode

Implement the `dock-unpinned` view mode: tool windows auto-hide when the editor gains focus, and reappear when the user hovers over the gutter.

**Implementation:**

1. Modify `layoutStore.ts`:
   - `dock-unpinned` is already defined in `ToolWindowViewMode`
   - Add action: `unpinToolWindow(id: string)` — sets `viewMode` to `"dock-unpinned"`
   - Add action: `pinToolWindow(id: string)` — sets `viewMode` to `"dock-pinned"`
   - When `dock-unpinned`: `isVisible` is managed dynamically (true when hovered, false when editor focused)

2. Add auto-hide logic:
   - Subscribe to `editorFocused` context key changes
   - When `editorFocused` becomes `true`: for all `dock-unpinned` windows, set `isVisible = false`
   - Track `_unpinnedHovered` state (not in Zustand — module-level or in a separate ephemeral store)

3. Modify `ToolWindowGutter.tsx`:
   - On gutter icon hover for `dock-unpinned` windows: set `isVisible = true` temporarily
   - On mouse leave from the tool window area: set `isVisible = false` after a 300ms delay (cancel if re-entered)

4. Modify `ToolWindow.tsx`:
   - In "More Actions" menu, add "Unpin" option (when `dock-pinned`) and "Pin" option (when `dock-unpinned`)
   - Visual indicator: unpinned windows have a subtle pushpin icon in the title bar (crossed out)

5. Modify `ToolWindowManager.tsx`:
   - `dock-unpinned` windows render with an absolute overlay style (slide in from the side) rather than pushing content
   - Transition: slide-in animation (200ms ease-out)

---

### Feature 11: Tab Drag-and-Drop Between Groups

Allow users to drag tabs between editor groups or to create new splits by dropping on edges.

**Implementation:**

1. Modify `EditorTabBar.tsx`:
   - Make tabs draggable: `draggable="true"`, `onDragStart` sets `dataTransfer` with `{ tabId, fromGroupId }`
   - Tab bar is a drop zone: `onDragOver`, `onDrop`
   - Drop indicator: vertical line between tabs showing insertion point

2. Drop targets in `EditorGroup.tsx`:
   - Edge drop zones: top, bottom, left, right edges of the editor area
   - Dropping on an edge creates a new split in that direction with the dropped tab
   - Center drop zone: drops tab into this group's tab bar

3. Wire to `editorStore`:
   - `moveTab(tabId, fromGroupId, toGroupId, index?)` — moves tab between groups
   - `splitWithTab(tabId, fromGroupId, direction)` — creates new group from split + moves tab

4. Visual feedback:
   - During drag: semi-transparent ghost of the tab
   - Drop zones highlight with a blue accent border when a tab is dragged over them
   - Invalid drop targets (same position) show no highlight

---

### Feature 12: README & Documentation Update

Update the IDE README with comprehensive documentation of all Phase 1-4 features.

**Implementation:**

1. Update `ide/README.md`:
   - **Overview**: What AgentScope IDE is and its architecture
   - **Features list**: Organized by phase with descriptions
   - **Setup & Development**: Commands for install, dev, build, test
   - **Architecture**: Store diagram, plugin system overview, editor groups model
   - **Keyboard Shortcuts**: Full table of all registered keybindings
   - **Plugin API**: Brief guide for plugin authors (contributions, activation events, lifecycle)
   - **Configuration**: Environment variables, settings system
   - **Phase roadmap**: What's complete (1-4), what's planned (5+)

2. Add a `CHANGELOG.md` for the IDE:
   - Phase 1 summary
   - Phase 2 summary
   - Phase 3 summary
   - Phase 4 summary (as tasks complete)

---

## Sub-phases & Task Order

### Phase 4A: Editor Evolution (Tasks 1-4)
1. Editor Groups — store & model refactor
2. Editor Groups — UI split rendering
3. Breadcrumb symbol navigation enhancement
4. Editor settings integration (minimap, word wrap, font size, etc.)

### Phase 4B: Developer Experience (Tasks 5-8)
5. Vitest test foundation + core store/module tests
6. Notification system (toast bridge + notification center + status bar)
7. Search & Replace (enhance SearchPanel with replace, regex, file filters)
8. Terminal multiplexing (tabs, multiple PTY sessions)

### Phase 4C: Workflow & Polish (Tasks 9-12)
9. Run configurations panel (task runner)
10. dock-unpinned view mode (auto-hide tool windows)
11. Tab drag-and-drop between editor groups
12. README & documentation update

---

## Future (Phase 5+ — out of scope)

- **ACP (Agent Client Protocol)**: Standardized protocol for alternative coding agents
- **Plugin marketplace**: Third-party plugin discovery, installation, and updates
- **Collaborative editing**: CRDT-based real-time collaboration with presence indicators
- **`window` view mode**: Tool windows in separate browser windows (requires `window.open` + cross-window state sync)
- **PWA support**: Service worker, installable app, offline capabilities
- **Workspace templates**: Pre-configured workspace setups for common project types
- **Integrated debugging**: DAP (Debug Adapter Protocol) integration for breakpoint debugging
- **Platform integration**: Connect IDE to the data-api/agent-service for project-aware agent sessions
