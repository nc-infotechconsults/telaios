// ─── Menu Store ────────────────────────────────────────────────────────────────
//
// Registry for plugin-contributed menu items.
// Plugins declare `menus` in their manifest; plugin-host registers them here.
//
// Consumers (ContextMenu, CommandPalette, CodeEditor) query items by location
// and the store applies `when` clause filtering via contextKeyService.
// ──────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import type { MenuContribution, MenuLocation, Disposable } from "@/types/plugin";
import { contextKeyService } from "@/core/context-keys";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RegisteredMenuContribution extends MenuContribution {
  /** Plugin that registered this item */
  source: string;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface MenuState {
  contributions: RegisteredMenuContribution[];
  addContribution: (c: RegisteredMenuContribution) => void;
  removeBySource: (source: string) => void;
}

export const useMenuStore = create<MenuState>()((set) => ({
  contributions: [],

  addContribution(c) {
    set((s) => ({ contributions: [...s.contributions, c] }));
  },

  removeBySource(source) {
    set((s) => ({
      contributions: s.contributions.filter((c) => c.source !== source),
    }));
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Register a menu contribution. Returns a Disposable.
 */
export function registerMenuContribution(
  contribution: MenuContribution,
  source: string,
): Disposable {
  const registered: RegisteredMenuContribution = { ...contribution, source };
  useMenuStore.getState().addContribution(registered);

  return {
    dispose: () => {
      useMenuStore.setState((s) => ({
        contributions: s.contributions.filter((c) => c !== registered),
      }));
    },
  };
}

/**
 * Get menu items for a given location, filtered by `when` clause
 * and sorted by group + order.
 */
export function getMenuItems(location: MenuLocation): RegisteredMenuContribution[] {
  const all = useMenuStore.getState().contributions;

  return all
    .filter(
      (c) =>
        c.location === location && contextKeyService.evaluate(c.when),
    )
    .sort((a, b) => {
      // Sort by group first (alphabetical), then by order
      const groupCmp = (a.group ?? "").localeCompare(b.group ?? "");
      if (groupCmp !== 0) return groupCmp;
      return (a.order ?? 0) - (b.order ?? 0);
    });
}
