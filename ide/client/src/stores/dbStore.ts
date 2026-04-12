import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { api } from "@/lib/api";
import type { DbConnection, DbConnectionSchema, DbQueryResult } from "@/types";

interface DbState {
  // ── Data ─────────────────────────────────────────────────────────────────
  connections: DbConnection[];
  /** Schema cache — keyed by connectionId */
  schemaCache: Record<string, DbConnectionSchema>;
  /** Query results — keyed by tabId */
  queryResults: Record<string, DbQueryResult | null>;
  /** Query loading state — keyed by tabId */
  queryLoading: Record<string, boolean>;
  /** Schema loading state — keyed by connectionId */
  schemaLoading: Record<string, boolean>;

  // ── Actions ───────────────────────────────────────────────────────────────
  loadConnections: (workspaceId: string) => Promise<void>;
  addConnection: (
    workspaceId: string,
    payload: Omit<DbConnection, "id"> & { password?: string },
  ) => Promise<DbConnection>;
  updateConnection: (
    workspaceId: string,
    connectionId: string,
    payload: Partial<Omit<DbConnection, "id"> & { password?: string }>,
  ) => Promise<void>;
  deleteConnection: (
    workspaceId: string,
    connectionId: string,
  ) => Promise<void>;
  testConnection: (
    workspaceId: string,
    payload: Omit<DbConnection, "id"> & { password?: string },
  ) => Promise<{ ok: boolean; error?: string }>;
  loadSchema: (workspaceId: string, connectionId: string) => Promise<void>;
  executeQuery: (
    workspaceId: string,
    connectionId: string,
    sql: string,
    tabId: string,
  ) => Promise<void>;
  clearResults: (tabId: string) => void;
  invalidateSchema: (connectionId: string) => void;
}

export const useDbStore = create<DbState>()(
  devtools(
    (set, get) => ({
      connections: [],
      schemaCache: {},
      queryResults: {},
      queryLoading: {},
      schemaLoading: {},

      async loadConnections(workspaceId) {
        const connections = await api.db.listConnections(workspaceId);
        set({ connections });
      },

      async addConnection(workspaceId, payload) {
        const conn = await api.db.addConnection(workspaceId, payload);
        set((s) => ({ connections: [...s.connections, conn] }));
        return conn;
      },

      async updateConnection(workspaceId, connectionId, payload) {
        const updated = await api.db.updateConnection(
          workspaceId,
          connectionId,
          payload,
        );
        set((s) => ({
          connections: s.connections.map((c) =>
            c.id === connectionId ? updated : c,
          ),
          // Invalidate cached schema
          schemaCache: Object.fromEntries(
            Object.entries(s.schemaCache).filter(([k]) => k !== connectionId),
          ),
        }));
      },

      async deleteConnection(workspaceId, connectionId) {
        await api.db.deleteConnection(workspaceId, connectionId);
        set((s) => ({
          connections: s.connections.filter((c) => c.id !== connectionId),
          schemaCache: Object.fromEntries(
            Object.entries(s.schemaCache).filter(([k]) => k !== connectionId),
          ),
        }));
      },

      async testConnection(workspaceId, payload) {
        return api.db.testConnection(workspaceId, payload);
      },

      async loadSchema(workspaceId, connectionId) {
        // Return cached version if available
        if (get().schemaCache[connectionId]) return;

        set((s) => ({
          schemaLoading: { ...s.schemaLoading, [connectionId]: true },
        }));
        try {
          const schema = await api.db.getSchema(workspaceId, connectionId);
          set((s) => ({
            schemaCache: { ...s.schemaCache, [connectionId]: schema },
          }));
        } finally {
          set((s) => ({
            schemaLoading: { ...s.schemaLoading, [connectionId]: false },
          }));
        }
      },

      async executeQuery(workspaceId, connectionId, sql, tabId) {
        set((s) => ({
          queryLoading: { ...s.queryLoading, [tabId]: true },
          queryResults: { ...s.queryResults, [tabId]: null },
        }));
        try {
          const result = await api.db.query(workspaceId, connectionId, sql);
          set((s) => ({
            queryResults: { ...s.queryResults, [tabId]: result },
          }));
        } finally {
          set((s) => ({
            queryLoading: { ...s.queryLoading, [tabId]: false },
          }));
        }
      },

      clearResults(tabId) {
        set((s) => ({
          queryResults: Object.fromEntries(
            Object.entries(s.queryResults).filter(([k]) => k !== tabId),
          ),
        }));
      },

      invalidateSchema(connectionId) {
        set((s) => ({
          schemaCache: Object.fromEntries(
            Object.entries(s.schemaCache).filter(([k]) => k !== connectionId),
          ),
        }));
      },
    }),
    { name: "db-store" },
  ),
);
