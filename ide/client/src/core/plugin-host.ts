// ─── Plugin Host ───────────────────────────────────────────────────────────────
//
// Manages the lifecycle of all plugins in the AgentScope IDE.
//
// Responsibilities:
//   - Load plugin manifests
//   - Create scoped PluginContext for each plugin
//   - Activate plugins based on ActivationEvents
//   - Deactivate and clean up plugins
//   - Provide plugin state inspection
//
// Phase 1: Infrastructure + API surface.
// Phase 2: Bundled plugins (Database, AI) are activated here.
// ──────────────────────────────────────────────────────────────────────────────

import type {
  PluginManifest,
  PluginContext,
  PluginActivateFunction,
  PluginState,
  PluginContributions,
  ToolWindowContribution,
  StatusBarContribution,
  MenuContribution,
  EditorAction,
  ActivationEvent,
  Disposable,
} from "@/types/plugin";
import { commandRegistry } from "@/core/commands";
import { keybindingService } from "@/core/keybindings";
import {
  toolWindowRegistry,
  type ToolWindowRegistration,
} from "@/core/tool-window-registry";
import { useLayoutStore } from "@/stores/layoutStore";
import { useEditorStore } from "@/stores/editorStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useStatusBarStore } from "@/stores/statusBarStore";
import { useEditorActionStore } from "@/stores/editorActionStore";
import { registerMenuContribution } from "@/stores/menuStore";
import {
  registerSetting,
  getSettingValue,
  setSettingValue,
  onSettingChange,
} from "@/stores/settingsStore";
import { registerTheme } from "@/stores/themeStore";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PluginEntry {
  manifest: PluginManifest;
  state: PluginState;
  activate: PluginActivateFunction;
  context: PluginContext | null;
  subscriptions: Disposable[];
  disposeCallbacks: (() => void)[];
  error?: Error;
}

type PluginHostListener = (pluginId: string, state: PluginState) => void;

// ─── Plugin Context Factory ───────────────────────────────────────────────────

function createPluginContext(
  entry: PluginEntry,
  subscriptions: Disposable[],
  disposeCallbacks: (() => void)[]
): PluginContext {
  const pluginId = entry.manifest.id;

  return {
    manifest: Object.freeze({ ...entry.manifest }),

    // ── Commands ──────────────────────────────────────────────────────────────
    commands: {
      register(id, handler) {
        const fullId = id.startsWith(pluginId) ? id : `${pluginId}.${id}`;
        const d = commandRegistry.register(
          { id: fullId, label: id, handler },
          pluginId
        );
        subscriptions.push(d);
        return d;
      },
      execute(id, ...args) {
        return commandRegistry.execute(id, ...args);
      },
    },

    // ── Tool Windows ─────────────────────────────────────────────────────────
    toolWindows: {
      register(contribution: ToolWindowContribution) {
        const fullId = contribution.id.startsWith(pluginId)
          ? contribution.id
          : `${pluginId}.${contribution.id}`;

        const reg: ToolWindowRegistration = {
          id: fullId,
          label: contribution.label,
          icon: contribution.icon,
          component: contribution.component,
          defaultPlacement: contribution.defaultPlacement,
          shortcut: contribution.shortcut,
          order: contribution.order ?? 100,
          defaultVisible: false,
          source: pluginId,
        };

        const d = toolWindowRegistry.register(reg);
        subscriptions.push(d);

        // Register in layout store
        useLayoutStore.getState().registerToolWindow({
          id: fullId,
          placement: contribution.defaultPlacement,
          order: contribution.order ?? 100,
          visible: false,
        });

        // Auto-register toggle command so command palette + gutter button work
        const toggleCmdId = `toolWindow.toggle.${fullId}`;
        const toggleCmd = commandRegistry.register(
          {
            id: toggleCmdId,
            label: `Toggle ${contribution.label}`,
            category: "View",
            icon: contribution.icon,
            handler: () => useLayoutStore.getState().toggleToolWindow(fullId),
          },
          pluginId
        );
        subscriptions.push(toggleCmd);

        // Auto-register keybinding if a shortcut is declared
        if (contribution.shortcut) {
          const kb = keybindingService.register({
            commandId: toggleCmdId,
            key: contribution.shortcut,
            when: "always",
          });
          subscriptions.push(kb);
        }

        return d;
      },
      show(id) {
        useLayoutStore.getState().showToolWindow(id);
      },
      hide(id) {
        useLayoutStore.getState().hideToolWindow(id);
      },
      toggle(id) {
        useLayoutStore.getState().toggleToolWindow(id);
      },
    },

    // ── Status Bar ───────────────────────────────────────────────────────────
    statusBar: {
      addItem(contribution: StatusBarContribution) {
        const fullId = contribution.id.startsWith(pluginId)
          ? contribution.id
          : `${pluginId}.${contribution.id}`;

        const item = {
          id: fullId,
          content: contribution.content,
          alignment: contribution.alignment ?? "right",
          priority: contribution.priority ?? 50,
          commandId: contribution.commandId,
          tooltip: contribution.tooltip,
          visible: true,
          when: contribution.when,
        };

        useStatusBarStore.getState().addItem(item);

        const d: Disposable = {
          dispose: () => useStatusBarStore.getState().removeItem(fullId),
        };
        subscriptions.push(d);
        return d;
      },
      updateItem(id: string, updates) {
        const fullId = id.startsWith(pluginId) ? id : `${pluginId}.${id}`;
        useStatusBarStore.getState().updateItem(fullId, updates);
      },
    },

    // ── Menus ─────────────────────────────────────────────────────────────────
    menus: {
      register(contribution: MenuContribution) {
        const d = registerMenuContribution(contribution, pluginId);
        subscriptions.push(d);
        return d;
      },
    },

    // ── Settings ──────────────────────────────────────────────────────────────
    settings: {
      get<T = unknown>(key: string): T | undefined {
        // Settings key is scoped to plugin: "pluginId.key"
        const scopedKey = key.startsWith(pluginId) ? key : `${pluginId}.${key}`;
        return getSettingValue<T>(scopedKey);
      },
      set(key: string, value: unknown) {
        const scopedKey = key.startsWith(pluginId) ? key : `${pluginId}.${key}`;
        setSettingValue(scopedKey, value);
      },
      onChange(key: string, handler: (value: unknown) => void) {
        const scopedKey = key.startsWith(pluginId) ? key : `${pluginId}.${key}`;
        const d = onSettingChange(scopedKey, handler);
        subscriptions.push(d);
        return d;
      },
    },

    // ── Editor ────────────────────────────────────────────────────────────────
    editor: {
      get activeFilePath() {
        const { activeTabId, tabs } = useEditorStore.getState();
        const tab = tabs.find((t) => t.id === activeTabId);
        return tab?.path ?? null;
      },
      get activeLanguage() {
        const { activeTabId, tabs } = useEditorStore.getState();
        const tab = tabs.find((t) => t.id === activeTabId);
        return tab?.language ?? null;
      },
      registerAction(action: EditorAction) {
        const unregister = useEditorActionStore.getState().register(action);
        const d: Disposable = { dispose: unregister };
        subscriptions.push(d);
        return d;
      },
    },

    // ── Workspace ─────────────────────────────────────────────────────────────
    workspace: {
      get id() {
        return useWorkspaceStore.getState().activeWorkspace?.id ?? null;
      },
      get name() {
        return useWorkspaceStore.getState().activeWorkspace?.name ?? null;
      },
      async fetch(path: string, init?: RequestInit) {
        const workspaceId = useWorkspaceStore.getState().activeWorkspace?.id;
        if (!workspaceId) throw new Error("No active workspace");
        return fetch(`/api/workspaces/${workspaceId}${path}`, init);
      },
    },

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    subscriptions,

    onDispose(callback: () => void) {
      disposeCallbacks.push(callback);
    },
  };
}

// ─── Plugin Host ──────────────────────────────────────────────────────────────

class PluginHostImpl {
  private plugins = new Map<string, PluginEntry>();
  private listeners = new Set<PluginHostListener>();
  /** Tracks which activation events have already been fired (to avoid re-firing). */
  private firedEvents = new Set<ActivationEvent>();
  /** Disposables for store subscriptions set up by startEventWatchers. */
  private watcherDisposables: Disposable[] = [];

  /**
   * Install a plugin from its manifest and activate function.
   * Does NOT activate it yet — call `activatePlugin` or wait for activation events.
   */
  install(manifest: PluginManifest, activate: PluginActivateFunction): void {
    if (this.plugins.has(manifest.id)) {
      console.warn(`[PluginHost] Plugin "${manifest.id}" is already installed`);
      return;
    }

    const entry: PluginEntry = {
      manifest,
      state: "installed",
      activate,
      context: null,
      subscriptions: [],
      disposeCallbacks: [],
    };

    this.plugins.set(manifest.id, entry);
    this.notifyListeners(manifest.id, "installed");

    // Auto-activate if "onStartup" is in activation events
    if (manifest.activationEvents.includes("onStartup")) {
      this.activatePlugin(manifest.id).catch((err) => {
        console.error(`[PluginHost] Failed to auto-activate "${manifest.id}":`, err);
      });
    }
  }

  /**
   * Activate a plugin by ID.
   */
  async activatePlugin(id: string): Promise<void> {
    const entry = this.plugins.get(id);
    if (!entry) {
      console.warn(`[PluginHost] Plugin "${id}" not found`);
      return;
    }

    if (entry.state === "active" || entry.state === "activating") return;

    entry.state = "activating";
    this.notifyListeners(id, "activating");

    try {
      // Create scoped context
      entry.subscriptions = [];
      entry.disposeCallbacks = [];
      entry.context = createPluginContext(
        entry,
        entry.subscriptions,
        entry.disposeCallbacks
      );

      // Auto-register setting contributions declared in the manifest
      if (entry.manifest.contributions?.settings) {
        for (const setting of entry.manifest.contributions.settings) {
          // Scope key to plugin if not already scoped
          const scopedKey = setting.key.startsWith(id)
            ? setting.key
            : `${id}.${setting.key}`;
          const d = registerSetting(
            { ...setting, key: scopedKey },
            id,
          );
          entry.subscriptions.push(d);
        }
      }

      // Auto-register theme contributions declared in the manifest
      if (entry.manifest.contributions?.themes) {
        for (const theme of entry.manifest.contributions.themes) {
          const d = registerTheme(theme);
          entry.subscriptions.push(d);
        }
      }

      // Call plugin's activate function
      await entry.activate(entry.context);

      entry.state = "active";
      this.notifyListeners(id, "active");
    } catch (err) {
      entry.state = "error";
      entry.error = err instanceof Error ? err : new Error(String(err));
      this.notifyListeners(id, "error");
      console.error(`[PluginHost] Activation error for "${id}":`, err);
    }
  }

  /**
   * Deactivate a plugin by ID.
   */
  async deactivatePlugin(id: string): Promise<void> {
    const entry = this.plugins.get(id);
    if (!entry || entry.state !== "active") return;

    entry.state = "deactivating";
    this.notifyListeners(id, "deactivating");

    try {
      // Run dispose callbacks
      for (const cb of entry.disposeCallbacks) {
        try {
          cb();
        } catch (err) {
          console.error(`[PluginHost] Dispose callback error for "${id}":`, err);
        }
      }

      // Dispose all subscriptions
      for (const sub of entry.subscriptions) {
        try {
          sub.dispose();
        } catch (err) {
          console.error(`[PluginHost] Subscription dispose error for "${id}":`, err);
        }
      }

      entry.subscriptions = [];
      entry.disposeCallbacks = [];
      entry.context = null;
      entry.state = "inactive";
      this.notifyListeners(id, "inactive");
    } catch (err) {
      entry.state = "error";
      entry.error = err instanceof Error ? err : new Error(String(err));
      this.notifyListeners(id, "error");
    }
  }

  /**
   * Uninstall a plugin completely.
   */
  async uninstall(id: string): Promise<void> {
    await this.deactivatePlugin(id);
    this.plugins.delete(id);
  }

  /**
   * Fire an activation event. Plugins matching this event will be activated.
   * Each event is only processed once — subsequent calls with the same event are no-ops.
   */
  async fireActivationEvent(event: ActivationEvent): Promise<void> {
    if (this.firedEvents.has(event)) return;
    this.firedEvents.add(event);

    for (const [id, entry] of this.plugins) {
      if (entry.state !== "installed" && entry.state !== "inactive") continue;
      if (entry.manifest.activationEvents.includes(event)) {
        await this.activatePlugin(id);
      }
    }
  }

  /**
   * Get the state of a specific plugin.
   */
  getPluginState(id: string): PluginState | undefined {
    return this.plugins.get(id)?.state;
  }

  /**
   * Get all installed plugin IDs with their states.
   */
  getAllPlugins(): Array<{ id: string; name: string; state: PluginState }> {
    return Array.from(this.plugins.values()).map((e) => ({
      id: e.manifest.id,
      name: e.manifest.name,
      state: e.state,
    }));
  }

  /**
   * Get a plugin's manifest.
   */
  getManifest(id: string): PluginManifest | undefined {
    return this.plugins.get(id)?.manifest;
  }

  /**
   * Listen for plugin state changes.
   */
  onDidChangeState(listener: PluginHostListener): Disposable {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  /**
   * Deactivate all plugins and clean up.
   */
  async disposeAll(): Promise<void> {
    // Tear down event watchers
    for (const d of this.watcherDisposables) d.dispose();
    this.watcherDisposables = [];
    this.firedEvents.clear();

    for (const id of this.plugins.keys()) {
      await this.deactivatePlugin(id);
    }
    this.plugins.clear();
    this.listeners.clear();
  }

  // ── Lazy Activation Event Watchers ──────────────────────────────────────────

  /**
   * Start watching Zustand stores for lazy activation events.
   * Should be called once at IDE startup (after bootstrap).
   *
   * Watches for:
   *   - `onWorkspaceOpen`  — when activeWorkspace transitions from null to a workspace
   *   - `onView:${id}`     — when a tool window first becomes visible
   *   - `onLanguage:${lang}` — when a file with a new language is opened
   *
   * `onCommand:${id}` is handled inline by wrapping command execution in
   * the `commands.register` context method above.
   */
  startEventWatchers(): Disposable {
    const disposables: Disposable[] = [];

    // ── onWorkspaceOpen ─────────────────────────────────────────────────────
    let prevWorkspaceId: string | null =
      useWorkspaceStore.getState().activeWorkspace?.id ?? null;

    const unsubWorkspace = useWorkspaceStore.subscribe((state) => {
      const currentId = state.activeWorkspace?.id ?? null;
      if (currentId && currentId !== prevWorkspaceId) {
        prevWorkspaceId = currentId;
        this.fireActivationEvent("onWorkspaceOpen").catch((err) => {
          console.error("[PluginHost] onWorkspaceOpen event error:", err);
        });
      } else {
        prevWorkspaceId = currentId;
      }
    });
    disposables.push({ dispose: unsubWorkspace });

    // ── onView:${id} ────────────────────────────────────────────────────────
    // Track which tool windows have been seen as visible so far.
    const seenViews = new Set<string>();

    const unsubLayout = useLayoutStore.subscribe((state) => {
      for (const [id, tw] of Object.entries(state.toolWindows)) {
        if (tw.isVisible && !seenViews.has(id)) {
          seenViews.add(id);
          const event = `onView:${id}` as ActivationEvent;
          this.fireActivationEvent(event).catch((err) => {
            console.error(`[PluginHost] onView:${id} event error:`, err);
          });
        }
      }
    });
    disposables.push({ dispose: unsubLayout });

    // ── onLanguage:${lang} ──────────────────────────────────────────────────
    const seenLanguages = new Set<string>();

    const unsubEditor = useEditorStore.subscribe((state) => {
      if (!state.activeTabId) return;
      const tab = state.tabs.find((t) => t.id === state.activeTabId);
      if (!tab || !tab.language) return;

      if (!seenLanguages.has(tab.language)) {
        seenLanguages.add(tab.language);
        const event = `onLanguage:${tab.language}` as ActivationEvent;
        this.fireActivationEvent(event).catch((err) => {
          console.error(`[PluginHost] onLanguage:${tab.language} event error:`, err);
        });
      }
    });
    disposables.push({ dispose: unsubEditor });

    // ── onCommand:${id} ─────────────────────────────────────────────────────
    // Hook into commandRegistry execution to fire onCommand events before
    // the command handler runs. We wrap the execute method.
    const originalExecute = commandRegistry.execute.bind(commandRegistry);
    const self = this;

    commandRegistry.execute = async function (
      id: string,
      ...args: unknown[]
    ): Promise<void> {
      const event = `onCommand:${id}` as ActivationEvent;
      await self.fireActivationEvent(event);
      await originalExecute(id, ...args);
    };

    disposables.push({
      dispose: () => {
        commandRegistry.execute = originalExecute;
      },
    });

    this.watcherDisposables = disposables;

    return {
      dispose: () => {
        for (const d of disposables) d.dispose();
        this.watcherDisposables = [];
      },
    };
  }

  private notifyListeners(pluginId: string, state: PluginState) {
    this.listeners.forEach((l) => l(pluginId, state));
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const pluginHost = new PluginHostImpl();
