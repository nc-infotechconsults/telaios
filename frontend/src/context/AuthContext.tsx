import React, { createContext, useContext, useEffect, useReducer, useCallback } from "react";
import type { User } from "../types";
import * as api from "../lib/api";

const DEMO = import.meta.env.VITE_DEMO_MODE === "true";
const TOKEN_KEY = "swe_auth_token";

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
  const [state, dispatch] = useReducer(reducer, {
    user: DEMO ? DEMO_USER : null,
    token: DEMO ? "demo-token" : null,
    loading: !DEMO,
  });

  // On mount: validate stored token
  useEffect(() => {
    if (DEMO) return;
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      dispatch({ type: "CLEAR" });
      return;
    }
    api.authMe()
      .then((user) => dispatch({ type: "SET_USER", user, token: stored }))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        dispatch({ type: "CLEAR" });
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user } = await api.authLogin({ email, password });
    localStorage.setItem(TOKEN_KEY, token);
    dispatch({ type: "SET_USER", user, token });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    dispatch({ type: "CLEAR" });
  }, []);

  const refreshUser = useCallback(async () => {
    if (DEMO) return;
    const user = await api.authMe();
    const token = localStorage.getItem(TOKEN_KEY) ?? "";
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
