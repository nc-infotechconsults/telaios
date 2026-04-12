import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { Workspace, WorkspaceStatus } from "@/types";
import { api } from "@/lib/api";

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setActiveWorkspace: (workspace: Workspace | null) => void;
  fetchWorkspaces: () => Promise<void>;
  openWorkspace: (id: string) => Promise<void>;
  createWorkspace: (payload: {
    name: string;
    source: Workspace["source"];
  }) => Promise<Workspace>;
  deleteWorkspace: (id: string) => Promise<void>;
  updateWorkspaceStatus: (id: string, status: WorkspaceStatus) => void;
  heartbeat: (id: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  devtools(
    (set, get) => ({
      workspaces: [],
      activeWorkspace: null,
      isLoading: false,
      error: null,

      setActiveWorkspace(workspace) {
        set({ activeWorkspace: workspace });
      },

      async fetchWorkspaces() {
        set({ isLoading: true, error: null });
        try {
          const data = await api.workspaces.list();
          set({ workspaces: data, isLoading: false });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Failed to load workspaces";
          set({ error: msg, isLoading: false });
        }
      },

      async openWorkspace(id) {
        set({ isLoading: true, error: null });
        try {
          // Start the container, then load workspace meta
          await api.containers.start(id);
          const ws = get().workspaces.find((w) => w.id === id) ?? null;
          set({ activeWorkspace: ws, isLoading: false });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Failed to open workspace";
          set({ error: msg, isLoading: false });
          throw err; // let callers (WorkspaceOpen, IDEPage) surface the error
        }
      },

      async createWorkspace(payload) {
        const ws = await api.workspaces.create(payload);
        set((s) => ({ workspaces: [ws, ...s.workspaces] }));
        return ws;
      },

      async deleteWorkspace(id) {
        await api.workspaces.delete(id);
        set((s) => ({
          workspaces: s.workspaces.filter((w) => w.id !== id),
          activeWorkspace: s.activeWorkspace?.id === id ? null : s.activeWorkspace,
        }));
      },

      updateWorkspaceStatus(id, status) {
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === id ? { ...w, status } : w,
          ),
          activeWorkspace:
            s.activeWorkspace?.id === id
              ? { ...s.activeWorkspace, status }
              : s.activeWorkspace,
        }));
      },

      heartbeat(id) {
        api.containers.heartbeat(id).catch(() => {});
      },
    }),
    { name: "workspace-store" },
  ),
);
