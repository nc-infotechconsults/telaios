import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { notify } from "@/stores/notificationStore";
import { api } from "@/lib/api";
import type { GitStatus, GitBranch, GitCommit, GitStash } from "@/types";

// ── State interface ───────────────────────────────────────────────────────────

type ActiveTab = "changes" | "history" | "stash";

interface GitState {
  // ── Data
  status: GitStatus | null;
  log: GitCommit[];
  branches: GitBranch[];
  stashList: GitStash[];

  // ── Loading flags
  loadingStatus: boolean;
  loadingLog: boolean;
  loadingBranches: boolean;
  loadingStash: boolean;

  // ── UI state
  activeTab: ActiveTab;
  pendingDiscardPaths: string[] | null; // non-null = confirm dialog open

  // ── Fetch actions
  fetchStatus: (workspaceId: string) => Promise<void>;
  fetchLog: (workspaceId: string) => Promise<void>;
  fetchBranches: (workspaceId: string) => Promise<void>;
  fetchStash: (workspaceId: string) => Promise<void>;

  // ── Stage / unstage
  stage: (workspaceId: string, paths: string[]) => Promise<void>;
  unstage: (workspaceId: string, paths: string[]) => Promise<void>;
  stageAll: (workspaceId: string) => Promise<void>;
  unstageAll: (workspaceId: string) => Promise<void>;

  // ── Commit
  commit: (workspaceId: string, message: string, amend?: boolean) => Promise<void>;

  // ── Push / pull
  push: (workspaceId: string) => Promise<void>;
  pull: (workspaceId: string) => Promise<void>;

  // ── Checkout
  checkout: (workspaceId: string, branch: string, create?: boolean) => Promise<void>;

  // ── Discard
  requestDiscard: (paths: string[]) => void;
  cancelDiscard: () => void;
  confirmDiscard: (workspaceId: string) => Promise<void>;

  // ── Stash
  stashPush: (workspaceId: string, message?: string) => Promise<void>;
  stashPop: (workspaceId: string, index?: string) => Promise<void>;
  stashDrop: (workspaceId: string, index: string) => Promise<void>;

  // ── UI
  setActiveTab: (tab: ActiveTab) => void;
}

// ── Helper ────────────────────────────────────────────────────────────────────

function toastError(title: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  notify({ title, description: message, type: "error" });
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useGitStore = create<GitState>()(
  devtools(
    (set, get) => ({
      status: null,
      log: [],
      branches: [],
      stashList: [],

      loadingStatus: false,
      loadingLog: false,
      loadingBranches: false,
      loadingStash: false,

      activeTab: "changes",
      pendingDiscardPaths: null,

      // ── Fetch ─────────────────────────────────────────────────────────────────

      async fetchStatus(workspaceId) {
        set({ loadingStatus: true });
        try {
          const status = await api.git.status(workspaceId);
          set({ status });
        } catch (err) {
          toastError("Git status failed", err);
        } finally {
          set({ loadingStatus: false });
        }
      },

      async fetchLog(workspaceId) {
        set({ loadingLog: true });
        try {
          const log = await api.git.log(workspaceId);
          set({ log });
        } catch (err) {
          toastError("Git log failed", err);
        } finally {
          set({ loadingLog: false });
        }
      },

      async fetchBranches(workspaceId) {
        set({ loadingBranches: true });
        try {
          const branches = await api.git.branches(workspaceId);
          set({ branches });
        } catch (err) {
          toastError("Git branches failed", err);
        } finally {
          set({ loadingBranches: false });
        }
      },

      async fetchStash(workspaceId) {
        set({ loadingStash: true });
        try {
          const stashList = await api.git.stashList(workspaceId);
          set({ stashList });
        } catch (err) {
          toastError("Git stash list failed", err);
        } finally {
          set({ loadingStash: false });
        }
      },

      // ── Stage / unstage ───────────────────────────────────────────────────────

      async stage(workspaceId, paths) {
        try {
          await api.git.stage(workspaceId, paths);
          await get().fetchStatus(workspaceId);
        } catch (err) {
          toastError("Stage failed", err);
        }
      },

      async unstage(workspaceId, paths) {
        try {
          await api.git.unstage(workspaceId, paths);
          await get().fetchStatus(workspaceId);
        } catch (err) {
          toastError("Unstage failed", err);
        }
      },

      async stageAll(workspaceId) {
        try {
          await api.git.stageAll(workspaceId);
          await get().fetchStatus(workspaceId);
          notify({ title: "Staged all changes", type: "success" });
        } catch (err) {
          toastError("Stage all failed", err);
        }
      },

      async unstageAll(workspaceId) {
        const { status } = get();
        const staged = status?.files.filter((f) => f.staged).map((f) => f.path) ?? [];
        if (!staged.length) return;
        try {
          await api.git.unstage(workspaceId, staged);
          await get().fetchStatus(workspaceId);
        } catch (err) {
          toastError("Unstage all failed", err);
        }
      },

      // ── Commit ────────────────────────────────────────────────────────────────

      async commit(workspaceId, message, amend = false) {
        try {
          await api.git.commit(workspaceId, message, { amend });
          await Promise.all([
            get().fetchStatus(workspaceId),
            get().fetchLog(workspaceId),
          ]);
          notify({ title: "Committed", type: "success" });
        } catch (err) {
          toastError("Commit failed", err);
        }
      },

      // ── Push / pull ───────────────────────────────────────────────────────────

      async push(workspaceId) {
        try {
          await api.git.push(workspaceId);
          await get().fetchStatus(workspaceId);
          notify({ title: "Pushed", type: "success" });
        } catch (err) {
          toastError("Push failed", err);
        }
      },

      async pull(workspaceId) {
        try {
          await api.git.pull(workspaceId);
          await Promise.all([
            get().fetchStatus(workspaceId),
            get().fetchLog(workspaceId),
          ]);
          notify({ title: "Pulled", type: "success" });
        } catch (err) {
          toastError("Pull failed", err);
        }
      },

      // ── Checkout ──────────────────────────────────────────────────────────────

      async checkout(workspaceId, branch, create = false) {
        try {
          await api.git.checkout(workspaceId, branch, create);
          await Promise.all([
            get().fetchStatus(workspaceId),
            get().fetchBranches(workspaceId),
          ]);
          notify({ title: `Switched to ${branch}`, type: "success" });
        } catch (err) {
          toastError("Checkout failed", err);
        }
      },

      // ── Discard ───────────────────────────────────────────────────────────────

      requestDiscard(paths) {
        set({ pendingDiscardPaths: paths });
      },

      cancelDiscard() {
        set({ pendingDiscardPaths: null });
      },

      async confirmDiscard(workspaceId) {
        const { pendingDiscardPaths } = get();
        if (!pendingDiscardPaths) return;
        set({ pendingDiscardPaths: null });
        try {
          await api.git.discard(workspaceId, pendingDiscardPaths);
          await get().fetchStatus(workspaceId);
          notify({ title: "Changes discarded", type: "success" });
        } catch (err) {
          toastError("Discard failed", err);
        }
      },

      // ── Stash ─────────────────────────────────────────────────────────────────

      async stashPush(workspaceId, message) {
        try {
          await api.git.stashPush(workspaceId, message);
          await Promise.all([
            get().fetchStatus(workspaceId),
            get().fetchStash(workspaceId),
          ]);
          notify({ title: "Stashed changes", type: "success" });
        } catch (err) {
          toastError("Stash failed", err);
        }
      },

      async stashPop(workspaceId, index) {
        try {
          await api.git.stashPop(workspaceId, index);
          await Promise.all([
            get().fetchStatus(workspaceId),
            get().fetchStash(workspaceId),
          ]);
          notify({ title: "Stash applied", type: "success" });
        } catch (err) {
          toastError("Stash pop failed", err);
        }
      },

      async stashDrop(workspaceId, index) {
        try {
          await api.git.stashDrop(workspaceId, index);
          await get().fetchStash(workspaceId);
          notify({ title: "Stash dropped", type: "success" });
        } catch (err) {
          toastError("Stash drop failed", err);
        }
      },

      // ── UI ────────────────────────────────────────────────────────────────────

      setActiveTab(tab) {
        set({ activeTab: tab });
      },
    }),
    { name: "git-store" },
  ),
);
