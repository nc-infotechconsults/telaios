// ─── Plugin System Types ──────────────────────────────────────────────────────
//
// Defines the complete plugin type system for the AgentScope IDE.
// Plugins declare capabilities via manifests and contribute tool windows,
// commands, menus, keybindings, status bar items, and themes.
//
// Phase 1: Infrastructure only — no plugins are loaded yet.
// Phase 2: Database and AI panels migrate to bundled plugins.
// ──────────────────────────────────────────────────────────────────────────────

import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";

// ─── Plugin Lifecycle ─────────────────────────────────────────────────────────

export type PluginState =
  | "installed"    // Registered but not activated
  | "activating"   // Activation in progress
  | "active"       // Running
  | "deactivating" // Teardown in progress
  | "inactive"     // Deactivated cleanly
  | "error";       // Activation or runtime failure

/**
 * Events that trigger plugin activation.
 * Plugins remain dormant until one of their declared events fires.
 */
export type ActivationEvent =
  | "onStartup"                 // Activate when IDE starts
  | "onWorkspaceOpen"           // Activate when any workspace opens
  | `onView:${string}`          // Activate when a specific tool window opens
  | `onCommand:${string}`       // Activate when a specific command executes
  | `onLanguage:${string}`;     // Activate when a file of this language opens

// ─── Plugin Manifest ──────────────────────────────────────────────────────────

export interface PluginManifest {
  /** Unique plugin ID (reverse-domain style: "agentscope.database") */
  id: string;
  /** Human-readable name */
  name: string;
  /** SemVer version string */
  version: string;
  /** One-line description */
  description?: string;
  /** Author name or organization */
  author?: string;
  /** Minimum IDE version required (SemVer) */
  ideVersion?: string;
  /** Events that trigger this plugin's activation */
  activationEvents: ActivationEvent[];
  /** What the plugin contributes to the IDE */
  contributions?: PluginContributions;
  /** Plugin categories for discovery/filtering */
  categories?: PluginCategory[];
}

export type PluginCategory =
  | "languages"
  | "themes"
  | "debuggers"
  | "formatters"
  | "linters"
  | "scm"
  | "visualization"
  | "ai"
  | "database"
  | "other";

// ─── Contribution Points ──────────────────────────────────────────────────────
//
// Each contribution point describes what the plugin adds to the IDE.
// The IDE reads these declarations to register UI, commands, keybindings, etc.
// ──────────────────────────────────────────────────────────────────────────────

export interface PluginContributions {
  toolWindows?: ToolWindowContribution[];
  commands?: CommandContribution[];
  menus?: MenuContribution[];
  keybindings?: KeybindingContribution[];
  statusBarItems?: StatusBarContribution[];
  themes?: ThemeContribution[];
  settings?: SettingContribution[];
}

// ─── Tool Window ──────────────────────────────────────────────────────────────

/**
 * Where a tool window can be placed in the IDE layout.
 *
 * left-top / left-bottom:   Left sidebar, stacked vertically
 * right-top / right-bottom: Right sidebar, stacked vertically
 * bottom:                   Full-width bottom strip
 */
export type ToolWindowPlacement =
  | "left-top"
  | "left-bottom"
  | "right-top"
  | "right-bottom"
  | "bottom";

/**
 * JetBrains-style view modes for tool windows.
 *
 * dock-pinned:   Stays visible, occupies layout space
 * dock-unpinned: Auto-hides when editor gains focus
 * float:         Detached floating window (future)
 * window:        Separate browser window (future)
 */
export type ToolWindowViewMode =
  | "dock-pinned"
  | "dock-unpinned"
  | "float"
  | "window";

export interface ToolWindowContribution {
  /** Unique tool window ID (e.g., "explorer", "terminal", "agentscope.database") */
  id: string;
  /** Display label in the gutter and header */
  label: string;
  /** Icon component from lucide-react */
  icon: LucideIcon;
  /** Default placement in the layout */
  defaultPlacement: ToolWindowPlacement;
  /** Default view mode */
  defaultViewMode?: ToolWindowViewMode;
  /** Keyboard shortcut to toggle (e.g., "Alt+1") */
  shortcut?: string;
  /** Sort order within the gutter (lower = higher) */
  order?: number;
  /** React component to render as the tool window content */
  component: ComponentType;
  /** Condition for showing this tool window (e.g., "workspaceOpen") */
  when?: string;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

export interface CommandContribution {
  /** Unique command ID (e.g., "file.save", "editor.formatDocument") */
  id: string;
  /** Human-readable label shown in command palette */
  label: string;
  /** Category for grouping in the command palette */
  category?: string;
  /** Icon for menus and toolbars */
  icon?: LucideIcon;
  /** Command handler — called when the command is executed */
  handler: (...args: unknown[]) => void | Promise<void>;
  /** Condition for when this command is available */
  when?: string;
}

// ─── Menus ────────────────────────────────────────────────────────────────────

/**
 * Where a menu item appears.
 *
 * commandPalette: Global command palette (Ctrl+Shift+P)
 * editor.context: Right-click menu in the code editor
 * explorer.context: Right-click menu in file explorer
 * toolWindow.title: Tool window header action bar
 * headerToolbar: Top header toolbar area
 */
export type MenuLocation =
  | "commandPalette"
  | "editor.context"
  | "explorer.context"
  | "toolWindow.title"
  | "headerToolbar";

export interface MenuContribution {
  /** Command ID this menu item triggers */
  commandId: string;
  /** Where the item appears */
  location: MenuLocation;
  /** Group for separators (items in different groups get a divider) */
  group?: string;
  /** Sort order within group */
  order?: number;
  /** Condition for showing this item */
  when?: string;
}

// ─── Keybindings ──────────────────────────────────────────────────────────────

export interface KeybindingContribution {
  /** Command ID to execute */
  commandId: string;
  /**
   * Key combination string.
   * Format: "Modifier+Key" where Modifier is Ctrl, Shift, Alt, Meta (Cmd on Mac).
   * Examples: "Ctrl+S", "Ctrl+Shift+P", "Alt+1", "Meta+K Meta+S" (chords)
   */
  key: string;
  /** macOS-specific override (uses Cmd instead of Ctrl, etc.) */
  mac?: string;
  /** Condition for when this keybinding is active */
  when?: string;
}

// ─── Status Bar ───────────────────────────────────────────────────────────────

export type StatusBarAlignment = "left" | "right";

export interface StatusBarContribution {
  /** Unique item ID */
  id: string;
  /** Display text or React component */
  content: string | ComponentType;
  /** Left or right alignment */
  alignment: StatusBarAlignment;
  /** Sort priority (lower = closer to edge) */
  priority?: number;
  /** Command to execute on click */
  commandId?: string;
  /** Tooltip text */
  tooltip?: string;
  /** Condition for showing this item */
  when?: string;
}

// ─── Themes ───────────────────────────────────────────────────────────────────

export type ThemeType = "dark" | "light" | "high-contrast";

export interface ThemeContribution {
  /** Unique theme ID */
  id: string;
  /** Display name */
  label: string;
  /** Theme type */
  type: ThemeType;
  /** CSS custom properties to override */
  colors: Record<string, string>;
  /** Monaco editor theme name */
  editorTheme?: string;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export type SettingType = "string" | "number" | "boolean" | "enum" | "object";

export interface SettingContribution {
  /** Setting key (e.g., "agentscope.database.autoConnect") */
  key: string;
  /** Display label */
  label: string;
  /** Description */
  description?: string;
  /** Value type */
  type: SettingType;
  /** Default value */
  default: unknown;
  /** For enum type: allowed values */
  enum?: string[];
  /** For enum type: labels for each value */
  enumLabels?: string[];
  /** Category for grouping in settings UI */
  category?: string;
}

// ─── Plugin Runtime Types ─────────────────────────────────────────────────────
//
// These types are used by the Plugin Host at runtime, not in manifests.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * The activate() function a plugin module must export.
 * Receives a PluginContext with scoped access to IDE APIs.
 */
export type PluginActivateFunction = (context: PluginContext) => void | Promise<void>;

/**
 * Scoped API surface provided to each plugin.
 * Plugins interact with the IDE exclusively through this context.
 */
export interface PluginContext {
  /** Plugin's own manifest */
  readonly manifest: PluginManifest;

  /** Register and execute commands */
  readonly commands: {
    register(id: string, handler: (...args: unknown[]) => void | Promise<void>): Disposable;
    execute(id: string, ...args: unknown[]): Promise<void>;
  };

  /** Register tool windows */
  readonly toolWindows: {
    register(contribution: ToolWindowContribution): Disposable;
    show(id: string): void;
    hide(id: string): void;
    toggle(id: string): void;
  };

  /** Add items to the status bar */
  readonly statusBar: {
    addItem(contribution: StatusBarContribution): Disposable;
    updateItem(id: string, updates: Partial<Pick<StatusBarContribution, "content" | "tooltip">>): void;
  };

  /** Register menu contributions */
  readonly menus: {
    register(contribution: MenuContribution): Disposable;
  };

  /** Read/write plugin settings */
  readonly settings: {
    get<T = unknown>(key: string): T | undefined;
    set(key: string, value: unknown): void;
    onChange(key: string, handler: (value: unknown) => void): Disposable;
  };

  /** Editor operations (read-only access to editor state) */
  readonly editor: {
    /** Currently active file path, or null */
    readonly activeFilePath: string | null;
    /** Currently active file language ID */
    readonly activeLanguage: string | null;
    /** Register an editor action (shown in editor context menu) */
    registerAction(action: EditorAction): Disposable;
  };

  /** Workspace operations */
  readonly workspace: {
    /** Active workspace ID */
    readonly id: string | null;
    /** Active workspace name */
    readonly name: string | null;
    /** Make HTTP requests (proxied through IDE server) */
    fetch(path: string, init?: RequestInit): Promise<Response>;
  };

  /** Lifecycle management */
  readonly subscriptions: Disposable[];

  /** Register a callback to run when the plugin is deactivated */
  onDispose(callback: () => void): void;
}

/**
 * Disposable pattern — call dispose() to clean up a registration.
 */
export interface Disposable {
  dispose(): void;
}

/**
 * Editor action shown in editor context menu and accessible via command palette.
 */
export interface EditorAction {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Keyboard shortcut */
  keybinding?: string;
  /** Context: which languages this action applies to (empty = all) */
  languages?: string[];
  handler: (context: { filePath: string; language: string; selectedText?: string }) => void | Promise<void>;
}

// ─── Tool Window State (for Layout Store) ─────────────────────────────────────

/**
 * Runtime state of a single tool window in the layout.
 * Managed by layoutStore, not by individual plugins.
 */
export interface ToolWindowState {
  /** Tool window ID (matches ToolWindowContribution.id) */
  id: string;
  /** Current placement in the layout */
  placement: ToolWindowPlacement;
  /** Current view mode */
  viewMode: ToolWindowViewMode;
  /** Whether the tool window is currently visible */
  isVisible: boolean;
  /** Order within the gutter */
  order: number;
  /** Width in pixels (for left/right placements) */
  width?: number;
  /** Height in pixels (for bottom placement) */
  height?: number;
  /** Timestamp when last opened (for MRU ordering) */
  lastOpenedAt?: number;
  /** Position when floating (pixels from top-left of IDE shell) */
  floatPosition?: { x: number; y: number };
  /** Size when floating (pixels) */
  floatSize?: { width: number; height: number };
}

/**
 * Layout state for a gutter section (left or right).
 */
export interface GutterSection {
  /** Tool window IDs in display order */
  topIds: string[];
  /** Tool window IDs in the bottom section */
  bottomIds: string[];
}
