// ─── Settings Store ────────────────────────────────────────────────────────────
//
// Registry for plugin-contributed settings + persisted values.
//
// - Plugins declare `SettingContribution`s in their manifest.
// - `plugin-host.ts` registers them here during `processContributions`.
// - Values are persisted to `localStorage` under the key `ide:settings:${key}`.
// - `SettingsPanel.tsx` renders all contributions grouped by category.
// ──────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import type { SettingContribution, Disposable } from "@/types/plugin";

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_PREFIX = "ide:settings:";

// ─── Change Listeners ────────────────────────────────────────────────────────
// Module-level so we can notify plugin `settings.onChange` callbacks
// when a value changes (within the same tab — StorageEvent only fires cross-tab).

type ChangeHandler = (value: unknown) => void;
const _changeListeners = new Map<string, Set<ChangeHandler>>();

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RegisteredSetting extends SettingContribution {
  /** Plugin that registered this setting */
  source: string;
}

interface SettingsState {
  /** All registered setting contributions */
  contributions: RegisteredSetting[];
  /** Persisted setting values (mirrors localStorage, for reactivity) */
  values: Record<string, unknown>;

  addContribution: (c: RegisteredSetting) => void;
  removeBySource: (source: string) => void;
  setValue: (key: string, value: unknown) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadValue(key: string): unknown | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw != null ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function persistValue(key: string, value: unknown): void {
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsState>()((set) => ({
  contributions: [],
  values: {},

  addContribution(c) {
    set((s) => {
      // Load persisted value or use default
      const persisted = loadValue(c.key);
      const value = persisted !== undefined ? persisted : c.default;
      return {
        contributions: [...s.contributions, c],
        values: { ...s.values, [c.key]: value },
      };
    });
  },

  removeBySource(source) {
    set((s) => ({
      contributions: s.contributions.filter((c) => c.source !== source),
    }));
  },

  setValue(key, value) {
    persistValue(key, value);
    set((s) => ({ values: { ...s.values, [key]: value } }));

    // Notify same-tab change listeners
    const listeners = _changeListeners.get(key);
    if (listeners) {
      for (const handler of listeners) {
        try {
          handler(value);
        } catch (err) {
          console.error(`[SettingsStore] onChange handler error for "${key}":`, err);
        }
      }
    }
  },
}));

// ─── Public Helpers ──────────────────────────────────────────────────────────

/**
 * Register a setting contribution. Returns a Disposable.
 */
export function registerSetting(
  contribution: SettingContribution,
  source: string,
): Disposable {
  const registered: RegisteredSetting = { ...contribution, source };
  useSettingsStore.getState().addContribution(registered);

  return {
    dispose: () => {
      useSettingsStore.setState((s) => ({
        contributions: s.contributions.filter((c) => c !== registered),
      }));
    },
  };
}

/**
 * Get a setting value. Falls back to the contribution's default.
 */
export function getSettingValue<T = unknown>(key: string): T | undefined {
  const state = useSettingsStore.getState();
  const value = state.values[key];
  if (value !== undefined) return value as T;

  // Fallback to contribution default
  const contrib = state.contributions.find((c) => c.key === key);
  return contrib?.default as T | undefined;
}

/**
 * Set a setting value (persisted to localStorage, notifies listeners).
 */
export function setSettingValue(key: string, value: unknown): void {
  useSettingsStore.getState().setValue(key, value);
}

/**
 * Listen for changes to a specific setting key. Returns a Disposable.
 */
export function onSettingChange(key: string, handler: ChangeHandler): Disposable {
  let listeners = _changeListeners.get(key);
  if (!listeners) {
    listeners = new Set();
    _changeListeners.set(key, listeners);
  }
  listeners.add(handler);

  return {
    dispose: () => {
      listeners!.delete(handler);
      if (listeners!.size === 0) {
        _changeListeners.delete(key);
      }
    },
  };
}
