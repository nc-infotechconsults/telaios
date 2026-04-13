// ─── Command Registry ──────────────────────────────────────────────────────────
//
// Centralized command system for the AgentScope IDE.
// All actions (menu items, keyboard shortcuts, toolbar buttons, command palette)
// are registered as commands and executed by ID.
//
// Usage:
//   commandRegistry.register({ id: "file.save", label: "Save", ... });
//   commandRegistry.execute("file.save");
// ──────────────────────────────────────────────────────────────────────────────

import type { CommandContribution, Disposable } from "@/types/plugin";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RegisteredCommand extends CommandContribution {
  /** Source: "core" for built-in, or plugin ID for plugin-contributed */
  source: string;
}

type CommandListener = (command: RegisteredCommand) => void;

// ─── Command Registry ─────────────────────────────────────────────────────────

class CommandRegistryImpl {
  private commands = new Map<string, RegisteredCommand>();
  private listeners = new Set<CommandListener>();

  /**
   * Register a command. Returns a Disposable that removes it.
   */
  register(command: CommandContribution, source = "core"): Disposable {
    const registered: RegisteredCommand = { ...command, source };
    this.commands.set(command.id, registered);
    this.listeners.forEach((l) => l(registered));

    return {
      dispose: () => {
        this.commands.delete(command.id);
      },
    };
  }

  /**
   * Register multiple commands at once. Returns a single Disposable.
   */
  registerMany(commands: CommandContribution[], source = "core"): Disposable {
    const disposables = commands.map((c) => this.register(c, source));
    return {
      dispose: () => disposables.forEach((d) => d.dispose()),
    };
  }

  /**
   * Execute a command by ID.
   */
  async execute(id: string, ...args: unknown[]): Promise<void> {
    const command = this.commands.get(id);
    if (!command) {
      console.warn(`[CommandRegistry] Unknown command: ${id}`);
      return;
    }
    try {
      await command.handler(...args);
    } catch (err) {
      console.error(`[CommandRegistry] Error executing "${id}":`, err);
    }
  }

  /**
   * Get a command by ID.
   */
  get(id: string): RegisteredCommand | undefined {
    return this.commands.get(id);
  }

  /**
   * Get all registered commands.
   */
  getAll(): RegisteredCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * Get commands filtered by category.
   */
  getByCategory(category: string): RegisteredCommand[] {
    return this.getAll().filter((c) => c.category === category);
  }

  /**
   * Search commands by label (case-insensitive fuzzy match).
   */
  search(query: string): RegisteredCommand[] {
    if (!query) return this.getAll();
    const lower = query.toLowerCase();
    return this.getAll().filter((c) => {
      const label = c.label.toLowerCase();
      const category = (c.category ?? "").toLowerCase();
      // Simple fuzzy: every char in query appears in order in label
      let qi = 0;
      for (let i = 0; i < label.length && qi < lower.length; i++) {
        if (label[i] === lower[qi]) qi++;
      }
      return qi === lower.length || category.includes(lower);
    });
  }

  /**
   * Listen for new command registrations.
   */
  onDidRegister(listener: CommandListener): Disposable {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  /**
   * Check if a command exists.
   */
  has(id: string): boolean {
    return this.commands.has(id);
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const commandRegistry = new CommandRegistryImpl();
