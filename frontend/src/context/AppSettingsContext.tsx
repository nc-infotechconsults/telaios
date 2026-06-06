import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getSettings, patchSettings } from "../lib/api";
import {
  DEFAULT_APP_SETTINGS,
  applyAppSettingsToDocument,
  loadCachedAppSettings,
  persistAndApplyAppSettings,
  subscribeToAppSettingsUpdates,
} from "../lib/appSettings";
import type { AppSettings, PatchSettingsPayload } from "../types";
import { useAuth } from "./AuthContext";

interface AppSettingsContextValue {
  settings: AppSettings;
  isAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  save: (patch: PatchSettingsPayload) => Promise<void>;
}

const AppSettingsContext = createContext<AppSettingsContextValue>({
  settings: DEFAULT_APP_SETTINGS,
  isAdmin: false,
  loading: true,
  refresh: async () => {},
  save: async () => {},
});

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isAdmin = user?.system_role === "admin";
  const [settings, setSettings] = useState<AppSettings>(loadCachedAppSettings);
  const [loading, setLoading] = useState(true);
  const lastGood = useRef<AppSettings>(settings);

  const apply = useCallback((next: AppSettings) => {
    lastGood.current = next;
    setSettings(next);
    persistAndApplyAppSettings(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const fresh = await getSettings();
      apply(fresh);
    } catch {
      // keep cached/default; non-blocking
    } finally {
      setLoading(false);
    }
  }, [apply]);

  const save = useCallback(
    async (patch: PatchSettingsPayload) => {
      const optimistic = { ...settings, ...patch } as AppSettings;
      setSettings(optimistic);
      applyAppSettingsToDocument(optimistic);
      try {
        const updated = await patchSettings(patch);
        apply(updated);
      } catch (err) {
        // revert to last-known-good
        setSettings(lastGood.current);
        applyAppSettingsToDocument(lastGood.current);
        throw err;
      }
    },
    [apply, settings],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Cross-tab + cross-component sync.
  useEffect(() => subscribeToAppSettingsUpdates((s) => setSettings(s)), []);

  return (
    <AppSettingsContext.Provider value={{ settings, isAdmin, loading, refresh, save }}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  return useContext(AppSettingsContext);
}
