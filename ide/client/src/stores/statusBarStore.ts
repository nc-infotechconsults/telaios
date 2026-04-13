// ─── StatusBar Store ───────────────────────────────────────────────────────────
//
// Holds plugin-contributed status bar items.
// Plugins call context.statusBar.addItem() which writes here.
// StatusBar.tsx reads from this store to render contributed items.
// ──────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import type { ComponentType } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StatusBarAlignment = "left" | "right";

export interface StatusBarItem {
  /** Unique item ID (scoped to plugin by plugin-host) */
  id: string;
  /**
   * Content to render. Either a plain string or a React component.
   * Components receive no props — use closures or stores to pass data.
   */
  content: string | ComponentType;
  /** Which side of the status bar this item appears on */
  alignment: StatusBarAlignment;
  /** Lower number = closer to the edge. Higher = closer to center. */
  priority: number;
  /** Command to execute when clicked */
  commandId?: string;
  /** Tooltip text */
  tooltip?: string;
  /** Whether the item is currently visible */
  visible?: boolean;
  /** `when` clause — evaluated by contextKeyService to show/hide dynamically */
  when?: string;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface StatusBarState {
  items: Record<string, StatusBarItem>;

  addItem(item: StatusBarItem): void;
  updateItem(id: string, updates: Partial<Omit<StatusBarItem, "id">>): void;
  removeItem(id: string): void;
}

export const useStatusBarStore = create<StatusBarState>()((set) => ({
  items: {},

  addItem(item) {
    set((s) => ({ items: { ...s.items, [item.id]: item } }));
  },

  updateItem(id, updates) {
    set((s) => {
      const existing = s.items[id];
      if (!existing) return s;
      return { items: { ...s.items, [id]: { ...existing, ...updates } } };
    });
  },

  removeItem(id) {
    set((s) => {
      const { [id]: _, ...rest } = s.items;
      return { items: rest };
    });
  },
}));
