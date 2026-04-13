import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { EditorTab, PanelId, PanelArea, PanelState, DragState, CollapsedSections, SectionKey, GitCommitFile, GitCommitDetail } from "@/types";
import { api } from "@/lib/api";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum number of panels that can be open simultaneously in a single area. */
const MAX_OPEN_PER_AREA = 2;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDefaultPanels(): Record<PanelId, PanelState> {
  const now = Date.now();
  return {
    explorer: { id: "explorer", area: "left-top",    order: 0, isOpen: true,  isCollapsed: false, size: 50, openedAt: now  },
    search:   { id: "search",   area: "left-top",    order: 1, isOpen: false, isCollapsed: false, size: 50, openedAt: null },
    git:      { id: "git",      area: "left-bottom", order: 0, isOpen: false, isCollapsed: false, size: 50, openedAt: null },
    terminal: { id: "terminal", area: "bottom",      order: 0, isOpen: false, isCollapsed: false, size: 50, openedAt: null },
    db:       { id: "db",       area: "right-top",   order: 0, isOpen: false, isCollapsed: false, size: 50, openedAt: null },
  };
}

function languageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",  tsx: "typescript",
    js: "javascript",  jsx: "javascript",
    json: "json",      md: "markdown",
    py: "python",      rs: "rust",
    go: "go",          java: "java",
    css: "css",        scss: "scss",
    html: "html",      yaml: "yaml",
    yml: "yaml",       toml: "toml",
    sh: "shell",       bash: "shell",
    sql: "sql",        graphql: "graphql",
    gql: "graphql",
  };
  return map[ext] ?? "plaintext";
}

// ── State interface ───────────────────────────────────────────────────────────

interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;

  /** All panel states, keyed by panel id. Every panel always exists in this map. */
  panels: Record<PanelId, PanelState>;

  /** Which panel is currently focused (shows content in the sidebar header). */
  activePanel: PanelId;

  /** Drag state — set while the user is dragging a panel. */
  dragState: DragState;

  /** Which sidebar sections are collapsed (section hidden, panel isOpen unchanged). */
  collapsedSections: CollapsedSections;

  // ── Tab actions ──────────────────────────────────────────────────────────────
  openFile: (workspaceId: string, path: string) => Promise<void>;
  openTab: (workspaceId: string, path: string) => Promise<void>;
  openQueryConsole: (connectionId: string, connectionName: string, initialSql?: string) => void;
  openDiff: (workspaceId: string, filePath: string, staged: boolean) => Promise<void>;
  /** Open a commit detail tab for the given commit hash. Fetches detail from server. */
  openCommitDetail: (workspaceId: string, hash: string) => Promise<void>;
  /** Open a side-by-side diff tab comparing a file at parent vs commit. */
  openCommitFileDiff: (
    workspaceId: string,
    file: GitCommitFile,
    commitHash: string,
    parentHash?: string,
  ) => Promise<void>;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  markTabSaved: (id: string) => void;
  saveTab: (workspaceId: string, id: string) => Promise<void>;
  setCursor: (id: string, line: number, column: number) => void;
  /** Update tab path/name/id after a file rename. No-op if the path is not open. */
  renameTab: (oldPath: string, newPath: string) => void;

  // ── Panel actions ────────────────────────────────────────────────────────────
  setActivePanel: (panel: PanelId) => void;

  /**
   * Toggle a panel open/closed.
   * When opening, enforces the FIFO queue: if MAX_OPEN_PER_AREA panels are
   * already open in the same area, the oldest one is closed first.
   */
  togglePanel: (panelId: PanelId) => void;

  /**
   * Move a panel to a different area (or reorder within the same area).
   * `insertBefore` is the id of the panel to insert before; omit to append.
   * Applies the FIFO queue when moving an open panel into a new area.
   */
  movePanel: (panelId: PanelId, targetArea: PanelArea, insertBefore?: PanelId) => void;

  /** Update the stored size percentage for a panel (clamped 20-80). */
  setPanelSize: (panelId: PanelId, size: number) => void;

  /** Toggle a panel's collapse-to-header state within its section. */
  togglePanelCollapse: (panelId: PanelId) => void;

  /** Toggle collapse for an entire sidebar section (top or bottom half of a sidebar). */
  toggleSectionCollapse: (section: SectionKey) => void;

  // ── Drag actions ─────────────────────────────────────────────────────────────
  /** Start dragging a panel. sourceArea is derived from the current panel state. */
  startDrag: (panelId: PanelId) => void;
  endDrag: () => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useEditorStore = create<EditorState>()(
  devtools(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      panels: makeDefaultPanels(),
      activePanel: "explorer",
      dragState: { panelId: null, sourceArea: null },
      collapsedSections: {},

      // ── Tab actions ───────────────────────────────────────────────────────────

      async openFile(workspaceId, path) {
        const existing = get().tabs.find((t) => t.path === path);
        if (existing) {
          set({ activeTabId: existing.id });
          return;
        }
        const { content, encoding } = await api.workspaces.readFile(workspaceId, path);
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

      openTab: async (workspaceId, path) => {
        await get().openFile(workspaceId, path);
      },

      openQueryConsole(connectionId, connectionName, initialSql) {
        const existing = get().tabs.find(
          (t) => t.isVirtual && t.connectionId === connectionId,
        );
        if (existing) {
          set({ activeTabId: existing.id });
          return;
        }
        const id = `db://${connectionId}/console-${Date.now()}`;
        const tab: EditorTab = {
          id,
          path: id,
          name: connectionName,
          language: "sql",
          content: initialSql ?? "",
          isDirty: false,
          isVirtual: true,
          virtualType: "query-console",
          connectionId,
        };
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
      },

      async openDiff(workspaceId, filePath, staged) {
        const tabId = `diff://${staged ? "staged" : "working"}/${filePath}`;
        const existing = get().tabs.find((t) => t.id === tabId);
        if (existing) {
          set({ activeTabId: tabId });
          return;
        }

        // Fetch original (HEAD) content and current content in parallel
        const [originalContent, currentContent] = await Promise.all([
          api.git.fileAtRef(workspaceId, filePath, "HEAD").catch(() => ""),
          api.workspaces.readFile(workspaceId, filePath).then((r) => r.content).catch(() => ""),
        ]);

        const name = filePath.split("/").pop() ?? filePath;
        const tab: EditorTab = {
          id: tabId,
          path: tabId,
          name: `${name} (diff)`,
          language: languageFromPath(filePath),
          content: currentContent,
          isDirty: false,
          isVirtual: true,
          virtualType: "diff",
          diffOriginalContent: originalContent,
          diffModifiedContent: currentContent,
          diffFilePath: filePath,
          diffStaged: staged,
        };
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
      },

      async openCommitDetail(workspaceId, hash) {
        const tabId = `commit://${hash}`;
        const existing = get().tabs.find((t) => t.id === tabId);
        if (existing) {
          set({ activeTabId: tabId });
          return;
        }
        const detail: GitCommitDetail = await api.git.commitDetail(workspaceId, hash);
        const tab: EditorTab = {
          id: tabId,
          path: tabId,
          name: `${detail.shortHash} — ${detail.message.slice(0, 40)}`,
          language: "plaintext",
          content: "",
          isDirty: false,
          isVirtual: true,
          virtualType: "commit-detail",
          commitDetail: detail,
        };
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
      },

      async openCommitFileDiff(workspaceId, file, commitHash, parentHash) {
        const displayPath = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path;
        const tabId = `commit-diff://${commitHash}/${file.path}`;
        const existing = get().tabs.find((t) => t.id === tabId);
        if (existing) {
          set({ activeTabId: tabId });
          return;
        }

        // For added files original is empty; for deleted files modified is empty
        const parentRef = parentHash ?? `${commitHash}^`;
        const [originalContent, modifiedContent] = await Promise.all([
          file.status === "A"
            ? Promise.resolve("")
            : api.git.fileAtRef(workspaceId, file.oldPath ?? file.path, parentRef).catch(() => ""),
          file.status === "D"
            ? Promise.resolve("")
            : api.git.fileAtRef(workspaceId, file.path, commitHash).catch(() => ""),
        ]);

        const name = file.path.split("/").pop() ?? file.path;
        const tab: EditorTab = {
          id: tabId,
          path: tabId,
          name: `${name} (${commitHash.slice(0, 7)})`,
          language: languageFromPath(file.path),
          content: modifiedContent,
          isDirty: false,
          isVirtual: true,
          virtualType: "diff",
          diffOriginalContent: originalContent,
          diffModifiedContent: modifiedContent,
          diffFilePath: displayPath,
          diffStaged: false,
        };
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
      },

      closeTab(id) {
        set((s) => {
          const idx = s.tabs.findIndex((t) => t.id === id);
          const newTabs = s.tabs.filter((t) => t.id !== id);
          let activeTabId = s.activeTabId;
          if (activeTabId === id) {
            activeTabId = newTabs[Math.min(idx, newTabs.length - 1)]?.id ?? null;
          }
          return { tabs: newTabs, activeTabId };
        });
      },

      setActiveTab(id) {
        set({ activeTabId: id });
      },

      updateTabContent(id, content) {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, content, isDirty: true } : t)),
        }));
      },

      markTabSaved(id) {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, isDirty: false } : t)),
        }));
      },

      async saveTab(workspaceId, id) {
        const tab = get().tabs.find((t) => t.id === id);
        if (!tab || !tab.isDirty) return;
        await api.workspaces.writeFile(workspaceId, tab.path, tab.content);
        get().markTabSaved(id);
      },

      setCursor(id, line, column) {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id ? { ...t, cursorLine: line, cursorColumn: column } : t,
          ),
        }));
      },

      renameTab(oldPath, newPath) {
        set((s) => {
          const hasTab = s.tabs.some((t) => t.path === oldPath);
          if (!hasTab) return s;
          return {
            tabs: s.tabs.map((t) =>
              t.path === oldPath
                ? {
                    ...t,
                    id: newPath,
                    path: newPath,
                    name: newPath.split("/").pop() ?? newPath,
                    language: languageFromPath(newPath),
                  }
                : t,
            ),
            activeTabId: s.activeTabId === oldPath ? newPath : s.activeTabId,
          };
        });
      },

      // ── Panel actions ─────────────────────────────────────────────────────────

      setActivePanel(panel) {
        set({ activePanel: panel });
      },

      togglePanel(panelId) {
        set((s) => {
          const panels = { ...s.panels };
          const panel = panels[panelId];

          if (panel.isOpen) {
            // Close it — also un-collapse so it opens fresh next time
            panels[panelId] = { ...panel, isOpen: false, isCollapsed: false, openedAt: null };
            return { panels };
          }

          // Opening — enforce FIFO queue for the panel's area
          const openInArea = Object.values(panels).filter(
            (p) => p.area === panel.area && p.isOpen && p.id !== panelId,
          );
          // Sort oldest-first
          openInArea.sort((a, b) => (a.openedAt ?? 0) - (b.openedAt ?? 0));

          if (openInArea.length >= MAX_OPEN_PER_AREA) {
            const oldest = openInArea[0];
            panels[oldest.id] = { ...panels[oldest.id], isOpen: false, openedAt: null };
          }

          panels[panelId] = { ...panel, isOpen: true, openedAt: Date.now() };
          return { panels };
        });
      },

      movePanel(panelId, targetArea, insertBefore) {
        set((s) => {
          const panels = { ...s.panels };
          const panel = panels[panelId];
          const oldArea = panel.area;

          // ① FIFO: if moving an open panel into a different area, may need to
          //    close the oldest open panel there.
          if (panel.isOpen && oldArea !== targetArea) {
            const openInTarget = Object.values(panels).filter(
              (p) => p.area === targetArea && p.isOpen && p.id !== panelId,
            );
            openInTarget.sort((a, b) => (a.openedAt ?? 0) - (b.openedAt ?? 0));
            if (openInTarget.length >= MAX_OPEN_PER_AREA) {
              const oldest = openInTarget[0];
              panels[oldest.id] = { ...panels[oldest.id], isOpen: false, openedAt: null };
            }
          }

          // ② Re-normalise old area (remove the panel from its current slot)
          if (oldArea !== targetArea) {
            // Temporarily mark it as belonging to targetArea so filters exclude it
            panels[panelId] = { ...panel, area: targetArea };
            const remaining = Object.values(panels)
              .filter((p) => p.area === oldArea)
              .sort((a, b) => a.order - b.order);
            remaining.forEach((p, i) => {
              panels[p.id] = { ...panels[p.id], order: i };
            });
          }

          // ③ Compute final ordering in target area (insert at the right position)
          const targetOthers = Object.values(panels)
            .filter((p) => p.area === targetArea && p.id !== panelId)
            .sort((a, b) => a.order - b.order);

          let insertIdx = targetOthers.length; // default: append
          if (insertBefore !== undefined) {
            const idx = targetOthers.findIndex((p) => p.id === insertBefore);
            if (idx !== -1) insertIdx = idx;
          }

          // Build the full ordered list for the target area
          const finalIds = targetOthers.map((p) => p.id);
          finalIds.splice(insertIdx, 0, panelId);

          finalIds.forEach((id, i) => {
            panels[id] = { ...panels[id], area: targetArea, order: i };
          });

          return { panels };
        });
      },

      setPanelSize(panelId, size) {
        set((s) => ({
          panels: {
            ...s.panels,
            [panelId]: {
              ...s.panels[panelId],
              size: Math.max(20, Math.min(80, size)),
            },
          },
        }));
      },

      togglePanelCollapse(panelId) {
        set((s) => ({
          panels: {
            ...s.panels,
            [panelId]: {
              ...s.panels[panelId],
              isCollapsed: !s.panels[panelId].isCollapsed,
            },
          },
        }));
      },

      toggleSectionCollapse(section) {
        set((s) => ({
          collapsedSections: {
            ...s.collapsedSections,
            [section]: !s.collapsedSections[section],
          },
        }));
      },

      // ── Drag actions ──────────────────────────────────────────────────────────

      startDrag(panelId) {
        set((s) => ({
          dragState: { panelId, sourceArea: s.panels[panelId].area },
        }));
      },

      endDrag() {
        set({ dragState: { panelId: null, sourceArea: null } });
      },
    }),
    { name: "editor-store" },
  ),
);
