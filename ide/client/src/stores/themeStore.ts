// ─── Theme Store ──────────────────────────────────────────────────────────────
//
// Registry for theme contributions + active theme state.
// Themes are registered by plugins or the core bootstrap.
// The active theme ID is persisted to localStorage.
// ──────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import type { ThemeContribution, Disposable } from "@/types/plugin";

// ─── Constants ───────────────────────────────────────────────────────────────

const ACTIVE_THEME_KEY = "ide:activeThemeId";
const DEFAULT_THEME_ID = "agentscope-dark";

// ─── Store ───────────────────────────────────────────────────────────────────

interface ThemeState {
  /** All registered themes */
  themes: ThemeContribution[];
  /** Currently active theme ID */
  activeThemeId: string;

  addTheme: (theme: ThemeContribution) => void;
  removeTheme: (id: string) => void;
  setActiveTheme: (id: string) => void;
}

function loadActiveThemeId(): string {
  try {
    return localStorage.getItem(ACTIVE_THEME_KEY) ?? DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export const useThemeStore = create<ThemeState>()((set) => ({
  themes: [],
  activeThemeId: loadActiveThemeId(),

  addTheme(theme) {
    set((s) => ({ themes: [...s.themes, theme] }));
  },

  removeTheme(id) {
    set((s) => ({
      themes: s.themes.filter((t) => t.id !== id),
    }));
  },

  setActiveTheme(id) {
    localStorage.setItem(ACTIVE_THEME_KEY, id);
    set({ activeThemeId: id });
  },
}));

// ─── Public Helpers ──────────────────────────────────────────────────────────

/**
 * Register a theme. Returns a Disposable.
 */
export function registerTheme(theme: ThemeContribution): Disposable {
  useThemeStore.getState().addTheme(theme);

  return {
    dispose: () => {
      useThemeStore.getState().removeTheme(theme.id);
    },
  };
}

/**
 * Get the currently active theme, or undefined if not found.
 */
export function getActiveTheme(): ThemeContribution | undefined {
  const { themes, activeThemeId } = useThemeStore.getState();
  return themes.find((t) => t.id === activeThemeId);
}
