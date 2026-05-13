import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { isThemeValue, loadCachedAppSettings } from "../lib/appSettings";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
  syncThemeWithDefault: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggle: () => {},
  setTheme: () => {},
  syncThemeWithDefault: () => {},
});

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem("theme");
    if (isThemeValue(stored)) return stored;
  } catch {
    // localStorage unavailable (SSR / privacy mode)
  }
  return loadCachedAppSettings().default_theme === "light" ? "light" : "dark";
}

function hasStoredThemeOverride(): boolean {
  try {
    const stored = localStorage.getItem("theme");
    return isThemeValue(stored);
  } catch {
    return false;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
    try {
      localStorage.setItem("theme", nextTheme);
    } catch {
      // ignore
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme((theme === "dark" ? "light" : "dark"));
  }, [setTheme, theme]);

  const syncThemeWithDefault = useCallback((nextTheme: Theme) => {
    if (hasStoredThemeOverride()) return;
    setThemeState(nextTheme);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme, syncThemeWithDefault }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
