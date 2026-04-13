// ─── Run Configuration Store ──────────────────────────────────────────────────
//
// Manages run/task configurations (build, test, lint, etc.) per workspace.
// Configs are persisted to localStorage.  Running a config creates a terminal
// session and sends the command string to the PTY.
// ──────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import { useTerminalStore } from "@/stores/terminalStore";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RunConfig {
  id: string;
  name: string;          // "Build", "Test", "Lint"
  command: string;        // "bun run build", "bun test"
  cwd?: string;           // relative to workspace root
  env?: Record<string, string>;
  color?: string;         // terminal tab color accent
}

interface RunConfigState {
  /** Configs keyed by workspaceId are lazily loaded from localStorage */
  configs: RunConfig[];
  /** IDs of configs currently executing */
  runningConfigs: string[];
  /** The workspace these configs belong to (set by loadConfigs) */
  workspaceId: string | null;

  /** Load configs from localStorage for a workspace */
  loadConfigs(workspaceId: string): void;

  addConfig(config: Omit<RunConfig, "id">): void;
  updateConfig(id: string, updates: Partial<Omit<RunConfig, "id">>): void;
  removeConfig(id: string): void;

  /** Execute a config — creates a terminal session and sends command */
  runConfig(workspaceId: string, configId: string): void;
  /** Mark a config as stopped (called when terminal session closes) */
  stopConfig(configId: string): void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function storageKey(workspaceId: string): string {
  return `ide:runConfigs:${workspaceId}`;
}

function persist(workspaceId: string | null, configs: RunConfig[]): void {
  if (!workspaceId) return;
  try {
    localStorage.setItem(storageKey(workspaceId), JSON.stringify(configs));
  } catch {
    // localStorage might be full or unavailable
  }
}

function loadFromStorage(workspaceId: string): RunConfig[] {
  try {
    const raw = localStorage.getItem(storageKey(workspaceId));
    if (raw) return JSON.parse(raw) as RunConfig[];
  } catch {
    // Corrupted data — ignore
  }
  return [];
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useRunConfigStore = create<RunConfigState>()((set, get) => ({
  configs: [],
  runningConfigs: [],
  workspaceId: null,

  loadConfigs(workspaceId: string): void {
    const configs = loadFromStorage(workspaceId);
    set({ configs, workspaceId, runningConfigs: [] });
  },

  addConfig(config: Omit<RunConfig, "id">): void {
    const id = `rc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((s) => {
      const next = [...s.configs, { ...config, id }];
      persist(s.workspaceId, next);
      return { configs: next };
    });
  },

  updateConfig(id: string, updates: Partial<Omit<RunConfig, "id">>): void {
    set((s) => {
      const next = s.configs.map((c) => (c.id === id ? { ...c, ...updates } : c));
      persist(s.workspaceId, next);
      return { configs: next };
    });
  },

  removeConfig(id: string): void {
    set((s) => {
      const next = s.configs.filter((c) => c.id !== id);
      persist(s.workspaceId, next);
      return { configs: next, runningConfigs: s.runningConfigs.filter((r) => r !== id) };
    });
  },

  runConfig(workspaceId: string, configId: string): void {
    const config = get().configs.find((c) => c.id === configId);
    if (!config) return;

    // Create a terminal session for this run
    const termStore = useTerminalStore.getState();
    const sessionId = termStore.createSession(workspaceId, `Run: ${config.name}`);

    // Mark as running
    set((s) => ({
      runningConfigs: [...s.runningConfigs.filter((r) => r !== configId), configId],
    }));

    // The terminal's WebSocket is created by the Terminal component.
    // We need to wait for it to connect and then send the command.
    // Use a short delay to let the WebSocket open, then send the command
    // by writing to the terminal session.
    //
    // The approach: open the terminal tool window, then after a brief delay
    // send the command string via a synthetic "type into terminal" mechanism.
    // Since the Terminal component opens a WebSocket per session, we need to
    // reach into that WebSocket.  The simplest approach is to use a module-level
    // command queue that the Terminal component drains when a session connects.
    //
    // We store the pending command in this store and the Terminal component
    // checks for it when a new session's WebSocket opens.
    _pendingCommands.set(sessionId, buildCommandString(config));
  },

  stopConfig(configId: string): void {
    set((s) => ({
      runningConfigs: s.runningConfigs.filter((r) => r !== configId),
    }));
  },
}));

// ─── Pending command queue ────────────────────────────────────────────────────
// When a run config creates a terminal session, it queues the command here.
// Terminal.tsx checks this map when a session's WebSocket opens and sends the
// command to the PTY.

export const _pendingCommands = new Map<string, string>();

/** Check and consume a pending command for a session. */
export function consumePendingCommand(sessionId: string): string | undefined {
  const cmd = _pendingCommands.get(sessionId);
  if (cmd !== undefined) _pendingCommands.delete(sessionId);
  return cmd;
}

function buildCommandString(config: RunConfig): string {
  let cmd = "";
  // Set env vars if provided
  if (config.env) {
    for (const [k, v] of Object.entries(config.env)) {
      cmd += `export ${k}=${JSON.stringify(v)} && `;
    }
  }
  // cd to cwd if provided
  if (config.cwd) {
    cmd += `cd ${config.cwd} && `;
  }
  cmd += config.command;
  return cmd + "\n"; // \n to execute
}
