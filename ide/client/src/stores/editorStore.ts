import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { EditorTab, PanelId, PanelPosition, PanelConfig, DragState, SidebarPosition } from "@/types";
import { api } from "@/lib/api";

interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  
  // Panel configurations for all 4 slots
  panels: Record<PanelPosition, PanelConfig | null>;
  
  // Which panel is currently focused (shows content)
  activePanel: PanelId;
  
  // Terminal state (can be moved to any sidebar)
  terminalOpen: boolean;

  // Drag state for panel reordering
  dragState: DragState;

  // Actions
  openFile: (workspaceId: string, path: string) => Promise<void>;
  openTab: (workspaceId: string, path: string) => Promise<void>;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  markTabSaved: (id: string) => void;
  saveTab: (workspaceId: string, id: string) => Promise<void>;
  
  setActivePanel: (panel: PanelId) => void;
  movePanel: (panelId: PanelId, position: PanelPosition) => void;
  togglePanel: (panelId: PanelId) => void;
  setPanelSize: (position: PanelPosition, size: number) => void;
  setTerminalOpen: (open: boolean) => void;
  setTerminalPosition: (position: PanelPosition) => void;
  setCursor: (id: string, line: number, column: number) => void;
  
  // Drag actions
  startDrag: (panelId: PanelId, sourcePosition: PanelPosition) => void;
  endDrag: () => void;
}

const DEFAULT_PANELS: Record<PanelPosition, PanelConfig | null> = {
  "left-top": { id: "explorer", position: "left-top", preferredSidebar: "left", size: 50, isOpen: true },
  "left-bottom": { id: "search", position: "left-bottom", preferredSidebar: "left", size: 50, isOpen: true },
  "right-top": null,
  "right-bottom": null,
};

const DEFAULT_DRAG_STATE: DragState = {
  panelId: null,
  sourcePosition: null,
};

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
      panels: { ...DEFAULT_PANELS },
      activePanel: "explorer",
      terminalOpen: false,
      dragState: { ...DEFAULT_DRAG_STATE },

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

      openTab: async (workspaceId, path) => {
        await get().openFile(workspaceId, path);
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

      movePanel(panelId, targetPosition) {
        set((s) => {
          const newPanels = { ...s.panels };
          
          // Find current position of this panel
          let sourcePosition: PanelPosition | null = null;
          let currentConfig: PanelConfig | null = null;
          for (const [pos, config] of Object.entries(newPanels)) {
            if (config?.id === panelId) {
              sourcePosition = pos as PanelPosition;
              currentConfig = config;
              break;
            }
          }

          // If moving to same position, do nothing
          if (sourcePosition === targetPosition) return s;

          // If target is occupied, swap them
          const targetConfig = newPanels[targetPosition];
          if (targetConfig && sourcePosition) {
            newPanels[sourcePosition] = { ...targetConfig, position: sourcePosition };
          }

          // Move panel to new position, updating preferredSidebar to match new side
          const newSide: SidebarPosition = targetPosition.includes("left") ? "left" : "right";
          newPanels[targetPosition] = { 
            id: panelId, 
            position: targetPosition, 
            preferredSidebar: newSide,
            size: targetConfig?.size ?? currentConfig?.size ?? 50, 
            isOpen: true 
          };

          return { panels: newPanels };
        });
      },

      togglePanel(panelId) {
        set((s) => {
          const newPanels = { ...s.panels };
          
          // Find current position of this panel (regardless of isOpen state)
          let currentPosition: PanelPosition | null = null;
          let currentConfig: PanelConfig | null = null;
          for (const [pos, config] of Object.entries(newPanels)) {
            if (config?.id === panelId) {
              currentPosition = pos as PanelPosition;
              currentConfig = config;
              break;
            }
          }

          if (currentPosition && currentConfig) {
            if (currentConfig.isOpen) {
              // Panel is open → close it in place
              newPanels[currentPosition] = { ...currentConfig, isOpen: false };
            } else {
              // Panel is in the map but closed → re-open it in place
              newPanels[currentPosition] = { ...currentConfig, isOpen: true };
            }
          } else {
            // Panel is not in the map at all — find a free slot
            const preferred: SidebarPosition = "left";
            const topPos: PanelPosition = preferred === "left" ? "left-top" : "right-top";
            const bottomPos: PanelPosition = preferred === "left" ? "left-bottom" : "right-bottom";
            
            // Try preferred sidebar first
            const positions: PanelPosition[] = [topPos, bottomPos];
            for (const pos of positions) {
              if (!newPanels[pos] || !newPanels[pos]?.isOpen) {
                newPanels[pos] = { 
                  id: panelId, 
                  position: pos, 
                  preferredSidebar: preferred,
                  size: 50, 
                  isOpen: true 
                };
                return { panels: newPanels };
              }
            }
            
            // If preferred sidebar is full, try the other sidebar
            const altSide: SidebarPosition = preferred === "left" ? "right" : "left";
            const altTopPos: PanelPosition = preferred === "left" ? "right-top" : "left-top";
            const altBottomPos: PanelPosition = preferred === "left" ? "right-bottom" : "left-bottom";
            const altPositions: PanelPosition[] = [altTopPos, altBottomPos];
            for (const pos of altPositions) {
              if (!newPanels[pos] || !newPanels[pos]?.isOpen) {
                newPanels[pos] = { 
                  id: panelId, 
                  position: pos, 
                  preferredSidebar: altSide,
                  size: 50, 
                  isOpen: true 
                };
                return { panels: newPanels };
              }
            }
          }

          return { panels: newPanels };
        });
      },

      setPanelSize(position, size) {
        set((s) => {
          const config = s.panels[position];
          if (!config) return s;
          return {
            panels: {
              ...s.panels,
              [position]: { ...config, size: Math.max(20, Math.min(80, size)) },
            },
          };
        });
      },

      setTerminalOpen(open) {
        set({ terminalOpen: open });
      },

      setTerminalPosition(position) {
        // Terminal is special - it uses its own state, not in panels config
        // This would be stored separately if needed
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

      startDrag(panelId, sourcePosition) {
        set({ dragState: { panelId, sourcePosition } });
      },

      endDrag() {
        set({ dragState: { panelId: null, sourcePosition: null } });
      },
    }),
    { name: "editor-store" },
  ),
);