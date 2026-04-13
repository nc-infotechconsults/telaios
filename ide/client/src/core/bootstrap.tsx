// ─── Core Tool Windows Bootstrap ───────────────────────────────────────────────
//
// Registers all built-in tool windows, commands, and keybindings.
// Called once at IDE startup (from IDEShell or App root).
//
// This module bridges the gap between existing panel components
// (which take `workspaceId` as a prop) and the tool window system
// (which expects ComponentType with no props) by using a React context.
//
// Phase 1: All 5 existing panels (explorer, search, git, db, terminal)
// Phase 2: Database + AI migrate to bundled plugins
// ──────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, type ComponentType, type FC } from "react";
import {
  Files,
  Search,
  GitBranch,
  Terminal as TerminalIcon,
  List,
  Settings as SettingsIcon,
  Palette,
  Play,
} from "lucide-react";
import {
  toolWindowRegistry,
  type ToolWindowRegistration,
} from "@/core/tool-window-registry";
import { useLayoutStore } from "@/stores/layoutStore";
import { useEditorStore } from "@/stores/editorStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { commandRegistry } from "@/core/commands";
import { keybindingService } from "@/core/keybindings";
import { contextKeyService } from "@/core/context-keys";
import type { ToolWindowPlacement, Disposable } from "@/types/plugin";
import { toggleCommandPalette } from "@/components/ui/CommandPalette";
import { openShortcutsDialog } from "@/components/ui/KeyboardShortcutsDialog";
import { openAboutDialog } from "@/components/ui/AboutDialog";
import { openQuickOpen } from "@/components/ui/QuickOpen";
import { registerTheme, getActiveTheme, useThemeStore } from "@/stores/themeStore";
import {
  BUILTIN_DARK_THEME,
  BUILTIN_LIGHT_THEME,
  BUILTIN_HIGH_CONTRAST_THEME,
  applyTheme,
} from "@/core/theme-manager";
import { openThemeSwitcher } from "@/components/ui/ThemeSwitcher";
import { useStatusBarStore } from "@/stores/statusBarStore";
import { registerSetting } from "@/stores/settingsStore";
import { NotificationCenter } from "@/components/layout/NotificationCenter";
import { notify } from "@/stores/notificationStore";

// Lazy imports to avoid circular deps and keep the bundle efficient.
// These are only resolved when the tool window is actually rendered.
import { FileExplorer } from "@/components/explorer/FileExplorer";
import { SearchPanel, signalSearchShowReplace } from "@/components/panels/SearchPanel";
import { GitPanel } from "@/components/panels/GitPanel";
import { Terminal } from "@/components/terminal/Terminal";
import { TerminalTabs } from "@/components/terminal/TerminalTabs";
import { useTerminalStore } from "@/stores/terminalStore";
import { FileOutlinePanel } from "@/components/panels/FileOutlinePanel";
import { SettingsPanel } from "@/components/panels/SettingsPanel";
import { RunConfigPanel } from "@/components/panels/RunConfigPanel";
import { useRunConfigStore } from "@/stores/runConfigStore";

// ─── Workspace Context ────────────────────────────────────────────────────────
// Bridges `workspaceId` prop to context so registry components can consume it.

const WorkspaceIdContext = createContext<string>("");

export const WorkspaceIdProvider: FC<{
  workspaceId: string;
  children: React.ReactNode;
}> = ({ workspaceId, children }) => (
  <WorkspaceIdContext.Provider value={workspaceId}>
    {children}
  </WorkspaceIdContext.Provider>
);

export function useWorkspaceId(): string {
  return useContext(WorkspaceIdContext);
}

// ─── Wrapper Components ───────────────────────────────────────────────────────
// Each wrapper reads workspaceId from context and passes it as a prop.

function ExplorerWrapper() {
  const wid = useWorkspaceId();
  return <FileExplorer workspaceId={wid} />;
}

function SearchWrapper() {
  const wid = useWorkspaceId();
  return <SearchPanel workspaceId={wid} />;
}

function GitWrapper() {
  const wid = useWorkspaceId();
  return <GitPanel workspaceId={wid} />;
}

function TerminalWrapper() {
  const wid = useWorkspaceId();
  const sessions = useTerminalStore((s) => s.sessions);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const createSession = useTerminalStore((s) => s.createSession);
  const sessionIds = sessions.map((s) => s.id);

  // Auto-create a first session when the terminal panel opens with none
  useEffect(() => {
    if (wid && sessions.length === 0) {
      createSession(wid);
    }
  }, [wid, sessions.length, createSession]);

  return (
    <div className="flex flex-col h-full">
      <TerminalTabs workspaceId={wid} />
      <Terminal
        workspaceId={wid}
        activeSessionId={activeSessionId}
        sessionIds={sessionIds}
      />
    </div>
  );
}

function OutlineWrapper() {
  return <FileOutlinePanel />;
}

function SettingsPanelWrapper() {
  return <SettingsPanel />;
}

function RunConfigWrapper() {
  const wid = useWorkspaceId();
  return <RunConfigPanel workspaceId={wid} />;
}

// ─── Tool Window Definitions ──────────────────────────────────────────────────

interface CoreToolWindowDef {
  id: string;
  label: string;
  icon: typeof Files;
  component: ComponentType;
  defaultPlacement: ToolWindowPlacement;
  /**
   * Override where the gutter icon appears (vs where the panel renders).
   * Only needed when icon and panel live in different regions (e.g., terminal).
   */
  gutterSection?: ToolWindowPlacement;
  shortcut?: string;
  order: number;
  defaultVisible: boolean;
}

const CORE_TOOL_WINDOWS: CoreToolWindowDef[] = [
  {
    id: "explorer",
    label: "Explorer",
    icon: Files,
    component: ExplorerWrapper,
    defaultPlacement: "left-top",
    shortcut: "Alt+1",
    order: 0,
    defaultVisible: false,       // collapsed on fresh load
  },
  {
    id: "search",
    label: "Search",
    icon: Search,
    component: SearchWrapper,
    defaultPlacement: "left-top",
    shortcut: "Alt+2",
    order: 1,
    defaultVisible: false,
  },
  {
    id: "git",
    label: "Source Control",
    icon: GitBranch,
    component: GitWrapper,
    defaultPlacement: "left-top", // icon + panel both in left-top
    shortcut: "Alt+3",
    order: 2,
    defaultVisible: false,
  },
  {
    id: "terminal",
    label: "Terminal",
    icon: TerminalIcon,
    component: TerminalWrapper,
    defaultPlacement: "bottom",          // panel renders as wide bottom panel
    gutterSection: "left-bottom",        // icon appears at bottom of left gutter
    shortcut: "Alt+5",
    order: 4,
    defaultVisible: false,
  },
  {
    id: "outline",
    label: "Outline",
    icon: List,
    component: OutlineWrapper,
    defaultPlacement: "left-top",
    shortcut: "Alt+7",
    order: 3,
    defaultVisible: false,
  },
  {
    id: "settings",
    label: "Settings",
    icon: SettingsIcon,
    component: SettingsPanelWrapper,
    defaultPlacement: "left-top",
    shortcut: "Ctrl+,",
    order: 5,
    defaultVisible: false,
  },
  {
    id: "runConfigs",
    label: "Run",
    icon: Play,
    component: RunConfigWrapper,
    defaultPlacement: "bottom",
    gutterSection: "left-bottom",
    shortcut: "Alt+8",
    order: 6,
    defaultVisible: false,
  },
];

// ─── Bootstrap ────────────────────────────────────────────────────────────────

/** Track whether bootstrap has already been called. */
let bootstrapped = false;

/**
 * Register all core tool windows, commands, and keybindings.
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * Returns a Disposable that tears down all registrations.
 */
export function bootstrapCoreToolWindows(): Disposable {
  if (bootstrapped) {
    return { dispose: () => {} };
  }
  bootstrapped = true;

  const disposables: Disposable[] = [];

  // ── Register tool windows ───────────────────────────────────────────────────

  for (const def of CORE_TOOL_WINDOWS) {
    // Register in the component registry (static mapping)
    const regDisposable = toolWindowRegistry.register({
      id: def.id,
      label: def.label,
      icon: def.icon,
      component: def.component,
      defaultPlacement: def.defaultPlacement,
      gutterSection: def.gutterSection,
      shortcut: def.shortcut,
      order: def.order,
      defaultVisible: def.defaultVisible,
      source: "core",
    } satisfies ToolWindowRegistration);
    disposables.push(regDisposable);

    // Register in the layout store (runtime state)
    useLayoutStore.getState().registerToolWindow({
      id: def.id,
      placement: def.defaultPlacement,
      order: def.order,
      visible: def.defaultVisible,
    });

    // Register toggle command for each tool window
    const cmdDisposable = commandRegistry.register(
      {
        id: `toolWindow.toggle.${def.id}`,
        label: `Toggle ${def.label}`,
        category: "View",
        icon: def.icon,
        handler: () => {
          useLayoutStore.getState().toggleToolWindow(def.id);
        },
      },
      "core"
    );
    disposables.push(cmdDisposable);

    // Register keybinding for the toggle command
    if (def.shortcut) {
      const kbDisposable = keybindingService.register({
        commandId: `toolWindow.toggle.${def.id}`,
        key: def.shortcut,
        when: "always",
      });
      disposables.push(kbDisposable);
    }
  }

  // ── Register core commands ──────────────────────────────────────────────────
  // These are the commands referenced by HeaderToolbar menus.
  // Handlers that need workspace context will be wired in Task 9 (THE CUTOVER).

  const coreCommands = commandRegistry.registerMany(
    [
      // File commands
      {
        id: "file.save",
        label: "Save",
        category: "File",
        handler: () => {
          const { activeTabId } = useEditorStore.getState();
          const ws = useWorkspaceStore.getState().activeWorkspace;
          if (activeTabId && ws) {
            useEditorStore.getState().saveTab(ws.id, activeTabId);
          }
        },
      },
      {
        id: "file.saveAll",
        label: "Save All",
        category: "File",
        handler: () => {
          const ws = useWorkspaceStore.getState().activeWorkspace;
          if (!ws) return;
          const { getAllTabs, saveTab } = useEditorStore.getState();
          getAllTabs().filter((t) => t.isDirty).forEach((t) => saveTab(ws.id, t.id));
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
      {
        id: "file.newFile",
        label: "New File",
        category: "File",
        handler: () => {
          // Overridden by IDEShell with InputDialog-based implementation
        },
      },
      {
        id: "file.newFolder",
        label: "New Folder",
        category: "File",
        handler: () => {
          // Overridden by IDEShell with InputDialog-based implementation
        },
      },

      // View commands
      {
        id: "view.toggleSidebar",
        label: "Toggle Sidebar",
        category: "View",
        handler: () => {
          useLayoutStore.getState().toggleRegionCollapse("left");
        },
      },
      {
        id: "view.toggleTerminal",
        label: "Toggle Terminal",
        category: "View",
        handler: () => {
          useLayoutStore.getState().toggleToolWindow("terminal");
        },
      },
      {
        id: "view.zoomIn",
        label: "Zoom In",
        category: "View",
        handler: () => {
          document.body.style.zoom = `${(parseFloat(document.body.style.zoom || "1") + 0.1)}`;
        },
      },
      {
        id: "view.zoomOut",
        label: "Zoom Out",
        category: "View",
        handler: () => {
          document.body.style.zoom = `${Math.max(0.5, parseFloat(document.body.style.zoom || "1") - 0.1)}`;
        },
      },
      {
        id: "view.resetZoom",
        label: "Reset Zoom",
        category: "View",
        handler: () => {
          document.body.style.zoom = "1";
        },
      },
      {
        id: "view.floatToolWindow",
        label: "Float Active Tool Window",
        category: "View",
        handler: () => {
          const { activeToolWindowId, floatToolWindow } = useLayoutStore.getState();
          if (activeToolWindowId) floatToolWindow(activeToolWindowId);
        },
      },
      {
        id: "view.dockToolWindow",
        label: "Dock Active Tool Window",
        category: "View",
        handler: () => {
          const { activeToolWindowId, dockToolWindow } = useLayoutStore.getState();
          if (activeToolWindowId) dockToolWindow(activeToolWindowId);
        },
      },

      // Command palette
      {
        id: "commandPalette.open",
        label: "Command Palette",
        category: "View",
        handler: () => {
          toggleCommandPalette();
        },
      },

      // Quick open (go to file)
      {
        id: "quickOpen.show",
        label: "Go to File",
        category: "View",
        handler: () => {
          openQuickOpen();
        },
      },

      // Edit commands (pass through to browser / Monaco)
      {
        id: "edit.undo",
        label: "Undo",
        category: "Edit",
        handler: () => document.execCommand("undo"),
      },
      {
        id: "edit.redo",
        label: "Redo",
        category: "Edit",
        handler: () => document.execCommand("redo"),
      },
      {
        id: "edit.cut",
        label: "Cut",
        category: "Edit",
        handler: () => document.execCommand("cut"),
      },
      {
        id: "edit.copy",
        label: "Copy",
        category: "Edit",
        handler: () => document.execCommand("copy"),
      },
      {
        id: "edit.paste",
        label: "Paste",
        category: "Edit",
        handler: async () => {
          try {
            const text = await navigator.clipboard.readText();
            document.execCommand("insertText", false, text);
          } catch {
            document.execCommand("paste");
          }
        },
      },
      {
        id: "edit.find",
        label: "Find",
        category: "Edit",
        handler: () => {
          // Monaco handles Ctrl+F natively
          console.debug("[commands] edit.find — Monaco native");
        },
      },
      {
        id: "edit.replace",
        label: "Find and Replace",
        category: "Edit",
        handler: () => {
          console.debug("[commands] edit.replace — Monaco native");
        },
      },

      // Help commands
      {
        id: "help.shortcuts",
        label: "Keyboard Shortcuts",
        category: "Help",
        handler: () => {
          openShortcutsDialog();
        },
      },
      {
        id: "help.docs",
        label: "Documentation",
        category: "Help",
        handler: () => {
          window.open("https://github.com/agentscope/ide", "_blank");
        },
      },
      {
        id: "help.about",
        label: "About AgentScope IDE",
        category: "Help",
        handler: () => {
          openAboutDialog();
        },
      },

      // Settings command
      {
        id: "preferences.openSettings",
        label: "Open Settings",
        category: "Preferences",
        icon: SettingsIcon,
        handler: () => {
          useLayoutStore.getState().showToolWindow("settings");
        },
      },

      // Theme switcher
      {
        id: "view.switchTheme",
        label: "Color Theme",
        category: "Preferences",
        icon: Palette,
        handler: () => {
          openThemeSwitcher();
        },
      },

      // Search commands (project-wide search panel, not Monaco in-file find)
      {
        id: "search.show",
        label: "Search in Files",
        category: "View",
        icon: Search,
        handler: () => {
          useLayoutStore.getState().showToolWindow("search");
        },
      },
      {
        id: "search.showReplace",
        label: "Search and Replace in Files",
        category: "View",
        icon: Search,
        handler: () => {
          useLayoutStore.getState().showToolWindow("search");
          signalSearchShowReplace();
        },
      },

      // Terminal session commands
      {
        id: "terminal.new",
        label: "New Terminal",
        category: "Terminal",
        icon: TerminalIcon,
        handler: () => {
          const ws = useWorkspaceStore.getState().activeWorkspace;
          if (!ws) return;
          useTerminalStore.getState().createSession(ws.id);
          useLayoutStore.getState().showToolWindow("terminal");
        },
      },
      {
        id: "terminal.close",
        label: "Close Terminal",
        category: "Terminal",
        icon: TerminalIcon,
        handler: () => {
          const { activeSessionId, closeSession } = useTerminalStore.getState();
          if (activeSessionId) closeSession(activeSessionId);
        },
      },

      // Run configuration commands
      {
        id: "runConfig.showPanel",
        label: "Show Run Configurations",
        category: "Run",
        icon: Play,
        handler: () => {
          useLayoutStore.getState().showToolWindow("runConfigs");
        },
      },
    ],
    "core"
  );
  disposables.push(coreCommands);

  // ── Editor split / group commands ─────────────────────────────────────────
  const editorGroupCommands = commandRegistry.registerMany(
    [
      {
        id: "editor.splitRight",
        label: "Split Editor Right",
        category: "View",
        handler: () => {
          const { activeGroupId, splitGroup } = useEditorStore.getState();
          splitGroup(activeGroupId, "horizontal");
        },
      },
      {
        id: "editor.splitDown",
        label: "Split Editor Down",
        category: "View",
        handler: () => {
          const { activeGroupId, splitGroup } = useEditorStore.getState();
          splitGroup(activeGroupId, "vertical");
        },
      },
      {
        id: "editor.closeGroup",
        label: "Close Editor Group",
        category: "View",
        handler: () => {
          const { activeGroupId, closeGroup } = useEditorStore.getState();
          closeGroup(activeGroupId);
        },
      },
      {
        id: "editor.focusNextGroup",
        label: "Focus Next Editor Group",
        category: "View",
        handler: () => {
          const s = useEditorStore.getState();
          const ids = Object.keys(s.groups);
          if (ids.length <= 1) return;
          const idx = ids.indexOf(s.activeGroupId);
          const next = ids[(idx + 1) % ids.length];
          s.setActiveGroup(next);
        },
      },
      {
        id: "editor.focusPrevGroup",
        label: "Focus Previous Editor Group",
        category: "View",
        handler: () => {
          const s = useEditorStore.getState();
          const ids = Object.keys(s.groups);
          if (ids.length <= 1) return;
          const idx = ids.indexOf(s.activeGroupId);
          const prev = ids[(idx - 1 + ids.length) % ids.length];
          s.setActiveGroup(prev);
        },
      },
    ],
    "core",
  );
  disposables.push(editorGroupCommands);

  // ── Register built-in themes ───────────────────────────────────────────────

  disposables.push(registerTheme(BUILTIN_DARK_THEME));
  disposables.push(registerTheme(BUILTIN_LIGHT_THEME));
  disposables.push(registerTheme(BUILTIN_HIGH_CONTRAST_THEME));

  // Apply persisted theme on startup
  const activeTheme = getActiveTheme();
  if (activeTheme) {
    applyTheme(activeTheme);
  }

  // ── Theme status bar item ──────────────────────────────────────────────────

  const initialThemeName =
    activeTheme?.label ?? BUILTIN_DARK_THEME.label;
  useStatusBarStore.getState().addItem({
    id: "core.theme",
    content: initialThemeName,
    alignment: "right",
    priority: 10,
    commandId: "view.switchTheme",
    tooltip: "Switch Color Theme",
    visible: true,
  });
  disposables.push({
    dispose: () => useStatusBarStore.getState().removeItem("core.theme"),
  });

  // Keep status bar label in sync with active theme
  const unsubTheme = useThemeStore.subscribe((s) => {
    const theme = s.themes.find((t) => t.id === s.activeThemeId);
    if (theme) {
      useStatusBarStore.getState().updateItem("core.theme", {
        content: theme.label,
      });
    }
  });
  disposables.push({ dispose: unsubTheme });

  // ── Notification center ─────────────────────────────────────────────────────

  const notifCmd = commandRegistry.register(
    {
      id: "notifications.toggle",
      label: "Toggle Notifications",
      category: "View",
      handler: () => {
        // NotificationCenter manages its own open/close state
      },
    },
    "core",
  );
  disposables.push(notifCmd);

  // Status bar item — renders the NotificationCenter component (bell icon + dropdown)
  useStatusBarStore.getState().addItem({
    id: "core.notifications",
    content: NotificationCenter,
    alignment: "right",
    priority: 5,   // lower = closer to edge, before theme item (priority 10)
    tooltip: "Notifications",
    visible: true,
  });
  disposables.push({
    dispose: () => useStatusBarStore.getState().removeItem("core.notifications"),
  });

  // ── Wire file.save notification ────────────────────────────────────────────
  // Show a subtle success notification after saving
  {
    const orig = commandRegistry.get("file.save");
    if (orig) {
      const origHandler = orig.handler;
      commandRegistry.register(
        {
          ...orig,
          handler: (...args) => {
            origHandler(...args);
            const { activeTabId, tabs } = useEditorStore.getState();
            const tab = tabs.find((t) => t.id === activeTabId);
            if (tab) {
              notify({ title: "File saved", description: tab.name, type: "success" });
            }
          },
        },
        "core",
      );
    }
  }

  // ── Register editor settings ──────────────────────────────────────────────

  const EDITOR_SETTINGS = [
    { key: "editor.minimap.enabled", label: "Minimap", type: "boolean" as const, default: true, category: "Editor" },
    { key: "editor.wordWrap", label: "Word Wrap", type: "enum" as const, default: "off", enum: ["off", "on", "wordWrapColumn", "bounded"], category: "Editor" },
    { key: "editor.fontSize", label: "Font Size", type: "number" as const, default: 14, category: "Editor" },
    { key: "editor.tabSize", label: "Tab Size", type: "number" as const, default: 2, category: "Editor" },
    { key: "editor.renderWhitespace", label: "Render Whitespace", type: "enum" as const, default: "selection", enum: ["none", "boundary", "selection", "trailing", "all"], category: "Editor" },
    { key: "editor.lineNumbers", label: "Line Numbers", type: "enum" as const, default: "on", enum: ["on", "off", "relative", "interval"], category: "Editor" },
    { key: "editor.cursorBlinking", label: "Cursor Blinking", type: "enum" as const, default: "blink", enum: ["blink", "smooth", "phase", "expand", "solid"], category: "Editor" },
    { key: "editor.bracketPairColorization", label: "Bracket Pair Colorization", type: "boolean" as const, default: true, category: "Editor" },
  ];

  for (const setting of EDITOR_SETTINGS) {
    disposables.push(registerSetting(setting, "core"));
  }

  // ── Register core keybindings ───────────────────────────────────────────────

  const coreKeybindings = keybindingService.registerMany([
    { commandId: "file.save",           key: "Ctrl+S"        },
    { commandId: "file.saveAll",        key: "Ctrl+Shift+S"  },
    { commandId: "file.closeTab",       key: "Ctrl+W"        },
    { commandId: "file.newFile",        key: "Ctrl+N"        },
    { commandId: "file.newFolder",      key: "Ctrl+Shift+N"  },
    { commandId: "view.toggleSidebar",  key: "Ctrl+B"        },
    { commandId: "view.toggleTerminal", key: "Ctrl+`"        },
    { commandId: "commandPalette.open", key: "Ctrl+Shift+P"  },
    { commandId: "quickOpen.show",      key: "Ctrl+P"         },
    { commandId: "help.shortcuts",      key: "Ctrl+K Ctrl+S" },
    { commandId: "search.show",         key: "Ctrl+Shift+F"  },
    { commandId: "search.showReplace",  key: "Ctrl+Shift+H"  },
    { commandId: "editor.splitRight",      key: "Ctrl+\\"        },
    { commandId: "editor.splitDown",       key: "Ctrl+Shift+\\"  },
    { commandId: "editor.focusNextGroup",  key: "Ctrl+K Ctrl+ArrowRight" },
    { commandId: "editor.focusPrevGroup",  key: "Ctrl+K Ctrl+ArrowLeft"  },
  ]);
  disposables.push(coreKeybindings);

  // ── Attach keybinding listener ──────────────────────────────────────────────

  keybindingService.attach();

  // ── Wire built-in context keys ──────────────────────────────────────────────
  // Subscribe to Zustand stores and update contextKeyService so that
  // `when` clause expressions on keybindings, menus, and status bar items
  // evaluate correctly.

  const contextKeyUnsubs: (() => void)[] = [];

  // workspaceOpen — true when a workspace is active
  contextKeyService.set("workspaceOpen", !!useWorkspaceStore.getState().activeWorkspace);
  contextKeyUnsubs.push(
    useWorkspaceStore.subscribe((s) => {
      contextKeyService.set("workspaceOpen", !!s.activeWorkspace);
    }),
  );

  // editorLangId — language ID of the active tab
  // editorFocused / editorHasSelection — set to false; Monaco events wire these in CodeEditor
  {
    const es = useEditorStore.getState();
    const activeTab = es.tabs.find((t) => t.id === es.activeTabId);
    contextKeyService.set("editorLangId", activeTab?.language ?? "");
    contextKeyService.set("editorFocused", false);
    contextKeyService.set("editorHasSelection", false);
  }
  contextKeyUnsubs.push(
    useEditorStore.subscribe((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      contextKeyService.set("editorLangId", tab?.language ?? "");
    }),
  );

  // activeToolWindow — ID of the focused tool window
  contextKeyService.set(
    "activeToolWindow",
    useLayoutStore.getState().activeToolWindowId ?? "",
  );
  contextKeyUnsubs.push(
    useLayoutStore.subscribe((s) => {
      contextKeyService.set("activeToolWindow", s.activeToolWindowId ?? "");

      // terminalOpen — true when the terminal tool window is visible
      contextKeyService.set("terminalOpen", s.toolWindows["terminal"]?.isVisible ?? false);
    }),
  );

  // dock-unpinned auto-hide: when the editor gains focus, hide all unpinned windows
  {
    let prevEditorFocused = contextKeyService.get("editorFocused");
    const unpinDisposable = contextKeyService.onChange(() => {
      const cur = contextKeyService.get("editorFocused");
      if (cur === true && prevEditorFocused !== true) {
        useLayoutStore.getState().hideAllUnpinned();
      }
      prevEditorFocused = cur;
    });
    disposables.push(unpinDisposable);
  }

  return {
    dispose: () => {
      keybindingService.detach();
      contextKeyUnsubs.forEach((unsub) => unsub());
      disposables.forEach((d) => d.dispose());
      bootstrapped = false;
    },
  };
}
