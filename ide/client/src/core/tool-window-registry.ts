// ─── Tool Window Registry ──────────────────────────────────────────────────────
//
// Central registry for all tool windows in the IDE.
// Core tool windows are registered at startup. Plugin tool windows register
// through the PluginContext API which delegates here.
//
// This is a static component registry — it maps tool window IDs to their
// React components, icons, labels, and configuration. The runtime state
// (visibility, placement, etc.) is managed by layoutStore.
// ──────────────────────────────────────────────────────────────────────────────

import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { ToolWindowPlacement, Disposable } from "@/types/plugin";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolWindowRegistration {
  /** Unique tool window ID (e.g., "explorer", "agentscope.database") */
  id: string;
  /** Display label */
  label: string;
  /** Icon component */
  icon: LucideIcon;
  /** React component to render as the tool window content */
  component: ComponentType;
  /** Default placement in the layout (controls where the panel content renders) */
  defaultPlacement: ToolWindowPlacement;
  /**
   * Where the icon appears in the gutter. Defaults to `defaultPlacement` when omitted.
   * Use this when the panel renders in one region (e.g., "bottom") but the icon
   * should appear in a different gutter section (e.g., "left-bottom").
   */
  gutterSection?: ToolWindowPlacement;
  /** Keyboard shortcut to toggle (e.g., "Alt+1") */
  shortcut?: string;
  /** Sort order within the gutter (lower = higher position) */
  order: number;
  /** Whether this tool window should be visible by default */
  defaultVisible?: boolean;
  /** Source: "core" for built-in, or plugin ID */
  source: string;
}

type RegistryListener = (id: string, registration: ToolWindowRegistration | null) => void;

// ─── Registry ─────────────────────────────────────────────────────────────────

class ToolWindowRegistryImpl {
  private windows = new Map<string, ToolWindowRegistration>();
  private listeners = new Set<RegistryListener>();

  /**
   * Register a tool window. Returns a Disposable that removes it.
   */
  register(registration: ToolWindowRegistration): Disposable {
    this.windows.set(registration.id, registration);
    this.listeners.forEach((l) => l(registration.id, registration));

    return {
      dispose: () => {
        this.windows.delete(registration.id);
        this.listeners.forEach((l) => l(registration.id, null));
      },
    };
  }

  /**
   * Get a tool window registration by ID.
   */
  get(id: string): ToolWindowRegistration | undefined {
    return this.windows.get(id);
  }

  /**
   * Get all registered tool windows.
   */
  getAll(): ToolWindowRegistration[] {
    return Array.from(this.windows.values()).sort((a, b) => a.order - b.order);
  }

  /**
   * Check if a tool window is registered.
   */
  has(id: string): boolean {
    return this.windows.has(id);
  }

  /**
   * Listen for registration changes.
   * Callback receives (id, registration) where registration is null on unregister.
   */
  onDidChange(listener: RegistryListener): Disposable {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const toolWindowRegistry = new ToolWindowRegistryImpl();
