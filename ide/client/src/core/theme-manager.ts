// ─── Theme Manager ────────────────────────────────────────────────────────────
//
// Applies theme contributions to the IDE.
//
// - Sets CSS custom properties on `document.documentElement.style`
// - Switches the Monaco editor theme via the shared instance
// - Provides built-in dark and light themes
// ──────────────────────────────────────────────────────────────────────────────

import type { ThemeContribution } from "@/types/plugin";
import { getMonacoNamespace } from "@/stores/monacoInstanceStore";

// ─── Built-in Themes ─────────────────────────────────────────────────────────

export const BUILTIN_DARK_THEME: ThemeContribution = {
  id: "agentscope-dark",
  label: "AgentScope Dark",
  type: "dark",
  colors: {
    "--ide-bg": "#0a0a0c",
    "--ide-fg": "#e4e4e7",
    "--ide-border": "rgba(255,255,255,0.06)",
    "--ide-sidebar-bg": "rgba(10,10,12,0.85)",
    "--ide-header-bg": "rgba(10,10,12,0.9)",
    "--ide-statusbar-bg": "rgba(10,10,12,0.9)",
    "--ide-panel-bg": "rgba(15,15,18,0.95)",
    "--ide-accent": "#8b5cf6",
    "--ide-accent-secondary": "#22d3ee",
    "--ide-muted": "#71717a",
    "--ide-hover": "rgba(255,255,255,0.04)",
    "--ide-active": "rgba(255,255,255,0.08)",
    "--ide-selection": "rgba(59,59,92,0.4)",
    "--ide-error": "#ef4444",
    "--ide-warning": "#f59e0b",
    "--ide-success": "#22c55e",
    "--ide-info": "#3b82f6",
  },
  editorTheme: "glassmorphism-dark",
};

export const BUILTIN_LIGHT_THEME: ThemeContribution = {
  id: "agentscope-light",
  label: "AgentScope Light",
  type: "light",
  colors: {
    "--ide-bg": "#f8f8fa",
    "--ide-fg": "#1a1a2e",
    "--ide-border": "rgba(0,0,0,0.1)",
    "--ide-sidebar-bg": "rgba(245,245,248,0.95)",
    "--ide-header-bg": "rgba(245,245,248,0.95)",
    "--ide-statusbar-bg": "rgba(245,245,248,0.95)",
    "--ide-panel-bg": "rgba(250,250,252,0.98)",
    "--ide-accent": "#7c3aed",
    "--ide-accent-secondary": "#0891b2",
    "--ide-muted": "#71717a",
    "--ide-hover": "rgba(0,0,0,0.04)",
    "--ide-active": "rgba(0,0,0,0.08)",
    "--ide-selection": "rgba(124,58,237,0.15)",
    "--ide-error": "#dc2626",
    "--ide-warning": "#d97706",
    "--ide-success": "#16a34a",
    "--ide-info": "#2563eb",
  },
  editorTheme: "vs",
};

export const BUILTIN_HIGH_CONTRAST_THEME: ThemeContribution = {
  id: "agentscope-high-contrast",
  label: "AgentScope High Contrast",
  type: "high-contrast",
  colors: {
    "--ide-bg": "#000000",
    "--ide-fg": "#ffffff",
    "--ide-border": "rgba(255,255,255,0.25)",
    "--ide-sidebar-bg": "#000000",
    "--ide-header-bg": "#000000",
    "--ide-statusbar-bg": "#000000",
    "--ide-panel-bg": "#0a0a0a",
    "--ide-accent": "#b794f6",
    "--ide-accent-secondary": "#67e8f9",
    "--ide-muted": "#a1a1aa",
    "--ide-hover": "rgba(255,255,255,0.1)",
    "--ide-active": "rgba(255,255,255,0.15)",
    "--ide-selection": "rgba(183,148,246,0.35)",
    "--ide-error": "#f87171",
    "--ide-warning": "#fbbf24",
    "--ide-success": "#4ade80",
    "--ide-info": "#60a5fa",
  },
  editorTheme: "hc-black",
};

// ─── Theme Application ───────────────────────────────────────────────────────

/**
 * Apply a theme to the IDE. Sets CSS custom properties and switches Monaco theme.
 */
export function applyTheme(theme: ThemeContribution): void {
  const root = document.documentElement;

  // Set CSS custom properties
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(key, value);
  }

  // Set a data attribute for theme type (useful for conditional CSS)
  root.dataset.theme = theme.type;

  // Switch Monaco editor theme
  if (theme.editorTheme) {
    const monaco = getMonacoNamespace();
    if (monaco) {
      monaco.editor.setTheme(theme.editorTheme);
    }
  }
}

/**
 * Remove all CSS custom properties set by a theme.
 */
export function clearThemeProperties(theme: ThemeContribution): void {
  const root = document.documentElement;
  for (const key of Object.keys(theme.colors)) {
    root.style.removeProperty(key);
  }
}
