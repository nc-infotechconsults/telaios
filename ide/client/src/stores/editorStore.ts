import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { EditorTab, PanelId } from "@/types";
import { api } from "@/lib/api";

interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  activePanel: PanelId;
  sidebarOpen: boolean;
  terminalOpen: boolean;

  // Actions
  openFile: (workspaceId: string, path: string) => Promise<void>;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  markTabSaved: (id: string) => void;
  saveTab: (workspaceId: string, id: string) => Promise<void>;
  setActivePanel: (panel: PanelId) => void;
  setSidebarOpen: (open: boolean) => void;
  setTerminalOpen: (open: boolean) => void;
  setCursor: (id: string, line: number, column: number) => void;
}

function languageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    md: "markdown",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    css: "css",
    scss: "scss",
    html: "html",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    sh: "shell",
    bash: "shell",
    sql: "sql",
    graphql: "graphql",
    gql: "graphql",
  };
  return map[ext] ?? "plaintext";
}

export const useEditorStore = create<EditorState>()(
  devtools(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      activePanel: "explorer",
      sidebarOpen: true,
      terminalOpen: false,

      async openFile(workspaceId, path) {
        const existing = get().tabs.find((t) => t.path === path);
        if (existing) {
          set({ activeTabId: existing.id });
          return;
        }

        const { content, encoding } = await api.workspaces.readFile(
          workspaceId,
          path,
        );

        const tab: EditorTab = {
          id: path,
          path,
          name: path.split("/").pop() ?? path,
          language: languageFromPath(path),
          content: encoding === "base64" ? "(binary file)" : content,
          isDirty: false,
        };

        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
      },

      closeTab(id) {
        set((s) => {
          const idx = s.tabs.findIndex((t) => t.id === id);
          const newTabs = s.tabs.filter((t) => t.id !== id);
          let activeTabId = s.activeTabId;
          if (activeTabId === id) {
            activeTabId =
              newTabs[Math.min(idx, newTabs.length - 1)]?.id ?? null;
          }
          return { tabs: newTabs, activeTabId };
        });
      },

      setActiveTab(id) {
        set({ activeTabId: id });
      },

      updateTabContent(id, content) {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id ? { ...t, content, isDirty: true } : t,
          ),
        }));
      },

      markTabSaved(id) {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id ? { ...t, isDirty: false } : t,
          ),
        }));
      },

      async saveTab(workspaceId, id) {
        const tab = get().tabs.find((t) => t.id === id);
        if (!tab || !tab.isDirty) return;
        await api.workspaces.writeFile(workspaceId, tab.path, tab.content);
        get().markTabSaved(id);
      },

      setActivePanel(panel) {
        set({ activePanel: panel });
      },

      setSidebarOpen(open) {
        set({ sidebarOpen: open });
      },

      setTerminalOpen(open) {
        set({ terminalOpen: open });
      },

      setCursor(id, line, column) {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id
              ? { ...t, cursorLine: line, cursorColumn: column }
              : t,
          ),
        }));
      },
    }),
    { name: "editor-store" },
  ),
);
