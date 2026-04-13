# Spec: Phase 3 — Plugin Pipelines, Quick Open, Agent Actions & Theming

## Objective

Phase 2 delivered the Agent panel, Database plugin migration, and all contribution type definitions in `types/plugin.ts`. However, several contribution pipelines were defined but never wired at runtime — `MenuContribution`, `ThemeContribution`, `SettingContribution`, `when` clauses, and lazy activation events (`onWorkspaceOpen`, `onView:*`, `onCommand:*`, `onLanguage:*`) are all inert.

Phase 3 **completes every contribution pipeline**, adds the two most-requested IDE navigation features (Quick Open and File Outline), and makes the Agent panel a true IDE citizen by letting the agent open files, propose diffs, and request terminal approval.

### Success looks like:

- User presses `Cmd+P` (or `Ctrl+P`) — a Quick Open dialog appears with fuzzy file search; selecting a file opens it in the editor
- User presses `Ctrl+S` / `Cmd+S` — the current file saves to disk (no more stub)
- File Outline panel in the left gutter shows symbols extracted from Monaco's language service for the active file
- Plugins can contribute context menu items (`editor.context`, `explorer.context`) and they appear in the right-click menu
- Plugins can declare `when` clauses and contributions appear/disappear based on context (e.g., `editorHasSelection`, `workspaceOpen`)
- Plugins can declare `SettingContribution`s — a Settings panel renders a form for all registered settings with persistence
- Plugins can contribute `ThemeContribution`s — a theme switcher lets the user choose between themes; both IDE CSS custom properties and Monaco editor theme update
- Lazy activation events work: a plugin with `onView:agentscope.agent` only activates when the Agent panel first opens
- Agent messages referencing file paths render as clickable links that open the file in the editor
- Agent-proposed code edits show an inline diff preview with Accept / Reject buttons
- Agent shell commands display a confirmation dialog before execution
- Tool windows can be detached into a floating overlay (float view mode)

### Users

- Developers using AgentScope IDE for AI-assisted coding
- Plugin authors building third-party extensions (Phase 3 validates the full contribution API surface)

---

## Assumptions

1. **No new server dependencies** — all Phase 3 work is client-side except minor adjustments to agent routes for diff payloads
2. **Monaco's document symbols API** (`getDocumentSymbols`) provides the data for File Outline — no external LSP server needed
3. **Theme switching applies CSS custom properties** at the `:root` level — not a full CSS-in-JS rewrite
4. **`when` clauses are simple boolean expressions** evaluated against a flat context-key map (e.g., `editorHasSelection && workspaceOpen`) — not a full expression language
5. **Agent-initiated diffs use the existing `message.part` data** from OpenCode SDK — no new server endpoints needed for diff content
6. **Float view mode** renders as an absolute-positioned draggable overlay inside the IDE shell, not a real OS window
7. **No plugin marketplace UI** — that's Phase 4. Themes and settings are only from bundled plugins for now.
8. **File Outline is a core tool window** (registered in `bootstrap.tsx`), not a plugin — it depends on Monaco internals

---

## Tech Stack

Unchanged from Phase 2. Key additions:

- **`fuse.js`** (or similar) — lightweight fuzzy search for Quick Open file matching (alternative: implement simple fuzzy match inline)
- No other new dependencies expected

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

# Individual
bun run client:dev       # Vite :5174
bun run server:dev       # Hono :4000
```

---

## Project Structure (new/modified files)

```
ide/client/src/
├── components/
│   ├── ui/
│   │   ├── QuickOpen.tsx               # NEW — Cmd+P fuzzy file finder dialog
│   │   ├── SettingsPanel.tsx            # NEW — Settings UI rendered from SettingContributions
│   │   └── ThemeSwitcher.tsx            # NEW — Theme selection dropdown/dialog
│   ├── layout/
│   │   ├── IDEShell.tsx                # MODIFIED — mount QuickOpen, wire file commands
│   │   └── ToolWindow.tsx              # MODIFIED — add float view mode support
│   ├── panels/
│   │   └── FileOutlinePanel.tsx         # NEW — Symbol outline from Monaco
│   ├── editor/
│   │   ├── CodeEditor.tsx              # MODIFIED — expose document symbols, register context menu contributions
│   │   └── InlineDiffPreview.tsx        # NEW — Agent-proposed diff with Accept/Reject
│   └── explorer/
│       └── ExplorerPanel.tsx           # MODIFIED — wire context menu contributions
│
├── core/
│   ├── bootstrap.tsx                   # MODIFIED — wire file.save/saveAll/closeTab, register File Outline, Quick Open command
│   ├── plugin-host.ts                 # MODIFIED — wire menu contributions, activation events, when-clause evaluation
│   ├── context-keys.ts                 # NEW — Context key registry + evaluator
│   └── theme-manager.ts               # NEW — Theme application (CSS vars + Monaco theme)
│
├── plugins/
│   └── agent/
│       ├── AgentConversation.tsx       # MODIFIED — clickable file references
│       ├── ToolCallCard.tsx            # MODIFIED — inline diff preview for file edits
│       └── AgentApprovalDialog.tsx      # NEW — Shell command approval dialog
│
├── stores/
│   ├── settingsStore.ts                # NEW — Settings values + SettingContribution registry
│   └── themeStore.ts                   # NEW — Active theme state
│
└── hooks/
    └── useDocumentSymbols.ts           # NEW — Hook to extract symbols from Monaco editor
```

---

## Code Style

Unchanged from Phase 2:

- TypeScript strict, no `any`
- Zustand stores: one per domain, shallow selectors, **never call derived methods inside Zustand selectors**
- Components: functional, `memo` where beneficial
- Files with JSX use `.tsx`
- Path alias `@/*` → `src/*`
- Plugin IDs use reverse-domain style

---

## Testing Strategy

- **Typecheck**: `bunx tsc --noEmit --pretty` on both client and server — must pass after every task
- **Manual QA per sub-phase**:
  - Quick Open: `Cmd+P` opens, type filename → fuzzy matches appear → Enter opens file → Escape closes
  - File Save: `Ctrl+S` saves active tab, dirty indicator clears
  - File Outline: open a `.ts` file → Outline panel shows classes, functions, variables; clicking a symbol scrolls editor
  - Context menus: right-click in editor → see plugin-contributed items; right-click in explorer → see plugin items
  - Settings: open settings panel → see all plugin settings → change a value → persists on reload
  - Themes: switch theme → IDE colors change + Monaco theme updates; persists on reload
  - Agent file links: agent response mentions `src/index.ts` → renders as clickable link → opens file
  - Agent diffs: agent edits a file → diff preview appears with green/red lines → Accept applies edit → Reject dismisses
  - Agent approval: agent runs shell command → confirmation dialog shows command → Approve runs it → Deny blocks
  - Float mode: click "Float" in tool window More Actions → panel detaches to draggable overlay → close returns to docked
- **Regression**: All Phase 1-2 features still work — panels, commands, mobile shell, agent streaming, database plugin

---

## Boundaries

### Always
- Run typecheck before considering a task complete
- Use the plugin host API for contribution pipelines — contributions flow through `plugin-host.ts`, not ad-hoc wiring
- Preserve all existing keyboard shortcuts
- Context keys are strings (`"editorHasSelection"`, `"workspaceOpen"`) — keep the system simple and extensible
- Theme switching is instantaneous — no page reload

### Ask First
- Adding new npm dependencies beyond `fuse.js`
- Changing the `PluginManifest` or `PluginContributions` type shapes
- Changing the layout store state shape
- Any server-side changes beyond agent route adjustments

### Never
- Commit API keys or secrets
- Break existing panel functionality
- Call LLM APIs directly — always through OpenCode SDK
- Make themes require a page reload
- Remove `when` clause fields from existing types (they're the extension point)

---

## Detailed Feature Specifications

### Feature 1: Wire File Commands (file.save, file.saveAll, file.closeTab)

Three commands in `bootstrap.tsx` are stubs that log to console. Wire them to real `editorStore` actions.

**Implementation:**

In `bootstrap.tsx`, replace the stub handlers:

```typescript
{
  id: "file.save",
  label: "Save",
  category: "File",
  handler: () => {
    const { activeTabId } = useEditorStore.getState();
    const workspaceId = useWorkspaceStore.getState().active?.id;
    if (activeTabId && workspaceId) {
      useEditorStore.getState().saveTab(workspaceId, activeTabId);
    }
  },
},
{
  id: "file.saveAll",
  label: "Save All",
  category: "File",
  handler: () => {
    const workspaceId = useWorkspaceStore.getState().active?.id;
    const { tabs, saveTab } = useEditorStore.getState();
    if (workspaceId) {
      tabs.filter(t => t.isDirty).forEach(t => saveTab(workspaceId, t.id));
    }
  },
},
{
  id: "file.closeTab",
  label: "Close Tab",
  category: "File",
  handler: () => {
    const { activeTabId, closeTab } = useEditorStore.getState();
    if (activeTabId) closeTab(activeTabId);
  },
},
```

**Keybindings** (already registered in Phase 1):
- `Ctrl+S` → `file.save`
- `Ctrl+W` → `file.closeTab`

---

### Feature 2: Quick Open (Cmd+P)

A fast fuzzy file finder. Press `Cmd+P` / `Ctrl+P` → type filename → results filter in real-time → Enter opens file → Escape closes.

**Implementation:**

1. Create `QuickOpen.tsx` — modal overlay similar to `CommandPalette.tsx`:
   - Input field at top with autofocus
   - Fuzzy-matched file list below (max ~20 results)
   - Keyboard navigation: `ArrowUp`/`ArrowDown` to select, `Enter` to open, `Escape` to close
   - Shows relative file path + icon based on file extension
   - File list sourced from `useFileTreeStore.getState()` — flatten the tree into paths

2. Fuzzy matching: implement a simple `fuzzyMatch(query, path)` function inline (match characters in order, score by contiguity). If results feel insufficient, add `fuse.js` later.

3. Register command `quickOpen.show` in `bootstrap.tsx` with keybinding `Ctrl+P` / `Meta+P`.

4. Mount `<QuickOpen />` in `IDEShell.tsx`.

5. On file selection: call `editorStore.openTab(workspaceId, filePath)`.

**Visual design:**
- Same glassmorphic style as CommandPalette
- File icons: use lucide-react `File`, `FileCode`, `FileJson`, etc. based on extension
- Selected item: subtle violet highlight
- Recently opened files appear first when query is empty

---

### Feature 3: File Outline Panel

Shows the symbol structure (classes, functions, variables, interfaces) of the active file. Clicking a symbol scrolls the editor to that location.

**Implementation:**

1. Create `useDocumentSymbols.ts` hook:
   - Subscribes to `editorStore.activeTabId` changes
   - When active file changes, calls Monaco's `monaco.editor.getModel(uri)` → `monaco.languages.getDocumentSymbols(model)`
   - Returns `DocumentSymbol[]` (name, kind, range, children) as state
   - Debounce: re-query symbols 500ms after the last edit

2. Create `FileOutlinePanel.tsx`:
   - Tree view rendering `DocumentSymbol[]` with expand/collapse for nested symbols
   - Icons per symbol kind (class, function, variable, interface, enum, etc.)
   - Click handler: scroll editor to `symbol.range.startLineNumber`
   - Empty state: "No symbols found" or "Open a file to see its outline"

3. Register as a core tool window in `bootstrap.tsx`:
   - ID: `outline`
   - Label: `"Outline"`
   - Icon: `List` from lucide-react
   - Default placement: `left-top`
   - Shortcut: `Alt+7`
   - Order: 35 (after Git at 30, before Terminal)

---

### Feature 4: Lazy Activation Events

Currently only `onStartup` is implemented in `plugin-host.ts`. Wire the remaining activation events so plugins can lazily load.

**Implementation in `plugin-host.ts`:**

1. **`onWorkspaceOpen`**: Subscribe to `useWorkspaceStore` — when `active` changes from null to a workspace, fire `fireActivationEvent("onWorkspaceOpen")`.

2. **`onView:${id}`**: In the `toolWindows.register` method, when a tool window becomes visible for the first time, fire `fireActivationEvent("onView:${id}")`.

3. **`onCommand:${id}`**: In the `commands.register` method, wrap the handler — before executing, fire `fireActivationEvent("onCommand:${id}")` and await any newly-activated plugins, then execute.

4. **`onLanguage:${lang}`**: Subscribe to `useEditorStore` — when `activeTabId` changes, check the file extension / language ID. If a new language is encountered, fire `fireActivationEvent("onLanguage:${lang}")`.

**`fireActivationEvent(event: ActivationEvent)`:**
- Iterate all installed-but-not-active plugins
- If `manifest.activationEvents.includes(event)`, activate the plugin
- Track which events have been fired to avoid re-firing

---

### Feature 5: Menu Contributions

Wire `MenuContribution` so plugins can add items to context menus and the command palette.

**Implementation:**

1. Add a `menuStore.ts` (or extend `commandRegistry`):
   - `registerMenuContribution(contribution: MenuContribution): Disposable`
   - `getMenuItems(location: MenuLocation): MenuContribution[]` — returns items sorted by group + order, filtered by `when` clause

2. In `plugin-host.ts`, during `processContributions`, register each `MenuContribution` declared in the manifest.

3. **`editor.context`**: In `CodeEditor.tsx`, configure Monaco's context menu to include plugin-contributed items. Use `editor.addAction()` for each menu contribution targeting `editor.context`.

4. **`explorer.context`**: In `ExplorerPanel.tsx`, when rendering the right-click context menu, append items from `getMenuItems("explorer.context")`.

5. **`commandPalette`**: In `CommandPalette.tsx`, include items from `getMenuItems("commandPalette")` alongside the command list.

6. **`when` clause filtering**: Use the context-key system (Feature 6) to evaluate `when` expressions before showing items.

---

### Feature 6: Context Key System (`when` Clauses)

A simple context-key registry that evaluates `when` expressions on contributions (menus, commands, keybindings, status bar items).

**Implementation:**

1. Create `context-keys.ts`:

```typescript
class ContextKeyService {
  private keys = new Map<string, boolean | string>();
  private listeners = new Set<() => void>();

  set(key: string, value: boolean | string): void;
  get(key: string): boolean | string | undefined;
  evaluate(expression: string): boolean;
  onChange(listener: () => void): Disposable;
}
```

2. **Expression syntax** (simple, not a full parser):
   - Single key: `"workspaceOpen"` → truthy check
   - Negation: `"!editorHasSelection"` → falsy check
   - AND: `"workspaceOpen && editorFocused"` → split on `&&`, all must be truthy
   - OR: `"workspaceOpen || editorFocused"` → split on `||`, any must be truthy
   - No nesting, no parentheses (keep it simple)

3. **Built-in context keys** (set automatically):
   - `workspaceOpen` — `true` when a workspace is active
   - `editorFocused` — `true` when Monaco has focus
   - `editorHasSelection` — `true` when there's a text selection
   - `editorLangId` — current language ID (e.g., `"typescript"`)
   - `activeToolWindow` — ID of the currently visible tool window

4. Wire context keys to Zustand store subscriptions in `bootstrap.tsx`:
   - `useWorkspaceStore.subscribe` → update `workspaceOpen`
   - `useEditorStore.subscribe` → update `editorFocused`, `editorHasSelection`, `editorLangId`
   - `useLayoutStore.subscribe` → update `activeToolWindow`

5. Use `contextKeyService.evaluate(when)` wherever `when` clauses appear: menu items, commands, keybindings, status bar items.

---

### Feature 7: Settings UI

A Settings panel that reads `SettingContribution` from all active plugins and renders a form with persistence.

**Implementation:**

1. Create `settingsStore.ts`:
   - `contributions: SettingContribution[]` — all registered settings
   - `values: Record<string, unknown>` — current values (loaded from `localStorage`)
   - `registerSetting(contribution: SettingContribution): Disposable`
   - `getValue(key: string): unknown` — returns stored value or `contribution.default`
   - `setValue(key: string, value: unknown): void` — persists to `localStorage`, notifies plugin `settings.onChange`

2. Create `SettingsPanel.tsx`:
   - Register as core tool window in `bootstrap.tsx` (ID: `settings`, shortcut: `Ctrl+,` / `Meta+,`)
   - Renders all `SettingContribution`s grouped by `category`
   - Field types:
     - `string` → text input
     - `number` → number input
     - `boolean` → toggle switch
     - `enum` → dropdown select
     - `object` → JSON text area (advanced)
   - Each field shows label, description, and current value
   - Changes are persisted immediately (auto-save, no "Save" button)

3. In `plugin-host.ts`, during `processContributions`, register each `SettingContribution` in `settingsStore`. Wire `context.settings.get/set` to use `settingsStore` instead of raw `localStorage`.

---

### Feature 8: Theme Contributions & Switcher

Wire `ThemeContribution` to let plugins provide themes and let users switch between them.

**Implementation:**

1. Create `themeStore.ts`:
   - `themes: ThemeContribution[]` — all registered themes
   - `activeThemeId: string` — persisted to localStorage
   - `registerTheme(theme: ThemeContribution): Disposable`
   - `setTheme(id: string): void`

2. Create `theme-manager.ts`:
   - `applyTheme(theme: ThemeContribution): void`
     - Set CSS custom properties on `document.documentElement.style` from `theme.colors`
     - If `theme.editorTheme` is set, call `monaco.editor.setTheme(theme.editorTheme)`
   - Provide a **built-in dark theme** (the current hardcoded colors) and a **built-in light theme** as defaults

3. Create `ThemeSwitcher.tsx`:
   - Dropdown/dialog accessed from the command palette (`view.switchTheme` command) or a status bar item
   - Lists all registered themes with a preview indicator (dark/light/high-contrast badge)
   - Selecting a theme applies it immediately

4. In `plugin-host.ts`, during `processContributions`, register each `ThemeContribution` in `themeStore`.

5. Register built-in themes in `bootstrap.tsx`:
   ```typescript
   themeStore.registerTheme({
     id: "agentscope-dark",
     label: "AgentScope Dark",
     type: "dark",
     colors: { /* current CSS vars */ },
     editorTheme: "vs-dark",
   });
   themeStore.registerTheme({
     id: "agentscope-light",
     label: "AgentScope Light",
     type: "light",
     colors: { /* light variants */ },
     editorTheme: "vs",
   });
   ```

---

### Feature 9: Agent File References (Clickable Links)

Agent messages often reference file paths (e.g., `src/index.ts:42`). Make them clickable to open the file in the editor.

**Implementation:**

1. In `AgentConversation.tsx` (or a sub-component like `MessageContent`), add a post-processing step to the rendered markdown:
   - Regex to detect file path patterns: `/(?:^|\s)((?:\.\/|src\/|[a-zA-Z][\w-]*\/)\S+\.\w+(?::\d+)?)/g`
   - Replace matches with a clickable `<button>` or `<a>` that calls `editorStore.openTab(workspaceId, filePath)` and optionally scrolls to the line number

2. Code blocks with filenames (` ```typescript src/index.ts `) should have a clickable header that opens the file.

3. The click handler should:
   - Open the file in a new editor tab (or focus existing tab)
   - If a line number is present (`:42`), scroll to that line and highlight it briefly

---

### Feature 10: Agent Inline Diff Preview

When the agent edits a file, show a side-by-side or inline diff preview with Accept/Reject controls.

**Implementation:**

1. Create `InlineDiffPreview.tsx`:
   - Uses Monaco's `DiffEditor` component to show before/after
   - "Accept" button: applies the edit (writes file via workspace API, updates editor buffer)
   - "Reject" button: dismisses the diff preview
   - "Copy" button: copies the new content to clipboard
   - Renders inside `ToolCallCard.tsx` when the tool call is a file write/edit

2. In `ToolCallCard.tsx`, detect file-edit tool calls (tool name contains `write`, `edit`, `patch`, or similar):
   - Extract the file path and new content from the tool call arguments
   - Fetch current file content from the editor or workspace API for the "before" side
   - Render `<InlineDiffPreview before={...} after={...} filePath={...} />`

3. Acceptance flow:
   - On Accept: `POST /api/workspaces/{id}/files` with the new content + refresh editor buffer
   - On Reject: collapse the card, mark as dismissed in local state (not persisted)
   - Visual: green border for pending-accept, grey for rejected

---

### Feature 11: Agent Shell Command Approval

When the agent wants to execute a shell command, show a confirmation dialog.

**Implementation:**

1. Create `AgentApprovalDialog.tsx`:
   - Modal showing the command to be executed
   - "Approve" button: sends approval to the agent/OpenCode (or executes the command)
   - "Deny" button: blocks execution, sends denial
   - Shows the command in a monospace code block
   - Optional "Always approve commands from this session" checkbox

2. In `ToolCallCard.tsx`, detect shell/terminal tool calls:
   - If the tool call is pending (awaiting user input), show the approval dialog
   - If already executed, show the result (stdout/stderr) as before

3. OpenCode SDK integration:
   - Check if OpenCode SSE events include a "pending approval" state for tool calls
   - If not available, implement client-side interception: before rendering the tool result, show the dialog
   - Store approval preferences in `agentStore` per session

---

### Feature 12: Float View Mode for Tool Windows

Allow users to detach a tool window into a floating, draggable overlay.

**Implementation:**

1. In `layoutStore.ts`:
   - Add support for `viewMode: "float"` on `ToolWindowState`
   - Add `floatToolWindow(id: string): void` action — sets `viewMode` to `"float"` and `isVisible` to `true`
   - Add `dockToolWindow(id: string): void` action — returns to `"dock-pinned"` at the last `placement`
   - Float state includes `floatPosition: { x: number; y: number }` and `floatSize: { width: number; height: number }`

2. Create a `FloatingToolWindow` wrapper component:
   - Absolute-positioned within `IDEShell`
   - Draggable title bar (implement with `mousedown` → `mousemove` → `mouseup` or use framer-motion's `drag`)
   - Resizable edges (optional, can defer to later)
   - Close button returns to docked mode
   - Z-index management: clicking a floating window brings it to front

3. In `ToolWindow.tsx`'s "More Actions" menu, add a "Float" option (only for `dock-pinned` / `dock-unpinned` windows). When already floating, show "Dock" instead.

4. In `IDEShell.tsx`, render all floating tool windows:
   ```tsx
   {floatingWindows.map(tw => (
     <FloatingToolWindow key={tw.id} toolWindow={tw} />
   ))}
   ```

---

## Sub-phases & Task Order

### Phase 3A: Core IDE Features (Tasks 1-3)
1. Wire `file.save`, `file.saveAll`, `file.closeTab` commands to editorStore
2. Quick Open (`Cmd+P`) — fuzzy file finder dialog
3. File Outline panel — Monaco document symbols

### Phase 3B: Plugin Contribution Pipelines (Tasks 4-8)
4. Lazy activation events (`onWorkspaceOpen`, `onView:*`, `onCommand:*`, `onLanguage:*`)
5. Context key system — `when` clause evaluation
6. Menu contributions — wire to editor context menu, explorer context menu, command palette
7. Settings UI — settings panel with auto-rendered form from SettingContributions
8. Theme contributions & theme switcher

### Phase 3C: Agent Actions + Float Mode (Tasks 9-12)
9. Agent file references — clickable file paths in agent messages
10. Agent inline diff preview — Accept/Reject for file edits
11. Agent shell command approval dialog
12. Float view mode for tool windows

---

## Future (Phase 4+ — out of scope)

- **ACP (Agent Client Protocol)**: Standardized protocol for alternative coding agents
- **Plugin marketplace**: Third-party plugin discovery, installation, and updates
- **Collaborative editing**: CRDT-based real-time collaboration with presence indicators
- **Run configurations**: Task runner with customizable run/debug profiles
- **PWA support**: Installable progressive web app with offline capabilities
- **`window` view mode**: Tool windows in separate browser windows (requires `window.open` + cross-window state sync)
