import React, { createContext, useContext, useEffect, useReducer, useCallback } from "react";
import type { User } from "../types";
import * as api from "../lib/api";

const DEMO = import.meta.env.VITE_DEMO_MODE === "true";
const TOKEN_KEY = "swe_auth_token";
const USER_KEY = "swe_auth_user";

const DEMO_USER: User = {
  id: "demo",
  email: "demo@example.com",
  display_name: "Demo User",
  system_role: "admin",
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
}

type AuthAction =
  | { type: "SET_USER"; user: User; token: string }
  | { type: "CLEAR" }
  | { type: "SET_LOADING"; loading: boolean };

function reducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "SET_USER":
      return { user: action.user, token: action.token, loading: false };
    case "CLEAR":
      return { user: null, token: null, loading: false };
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    default:
      return state;
  }
}

/** Restore session from localStorage synchronously — avoids loading flash on refresh. */
function getInitialState(): AuthState {
  if (DEMO) return { user: DEMO_USER, token: "demo-token", loading: false };
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return { user: null, token: null, loading: false };
  try {
    const raw = localStorage.getItem(USER_KEY);
    const user = raw ? (JSON.parse(raw) as User) : null;
    if (user) return { user, token, loading: false };
  } catch {
    // Corrupted user cache — fall through to network validation
    localStorage.removeItem(USER_KEY);
  }
  // Token exists but no cached user — validate via network
  return { user: null, token, loading: true };
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  loading: true,
  login: async () => {},
  logout: () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, getInitialState);

  // Background token validation on mount.
  // If we already have a cached user: silently refresh in background.
  // If we have a token but no user: must validate before showing the app.
  useEffect(() => {
    if (DEMO) return;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    api.authMe()
      .then((user) => {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        dispatch({ type: "SET_USER", user, token });
      })
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 401 || status === 403) {
          // Token is invalid or expired — force re-login
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          dispatch({ type: "CLEAR" });
        }
        // Network or server errors: keep the cached session so a temporary
        // outage doesn't log the user out.
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user } = await api.authLogin({ email, password });
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    dispatch({ type: "SET_USER", user, token });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    dispatch({ type: "CLEAR" });
  }, []);

  const refreshUser = useCallback(async () => {
    if (DEMO) return;
    const user = await api.authMe();
    const token = localStorage.getItem(TOKEN_KEY) ?? "";
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    dispatch({ type: "SET_USER", user, token });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
