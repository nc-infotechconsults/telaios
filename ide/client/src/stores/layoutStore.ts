// ─── Layout Store ──────────────────────────────────────────────────────────────
//
// Manages tool window layout state for the AgentScope IDE.
// Replaces the panel management logic from editorStore.
//
// This store owns:
//   - Tool window visibility, placement, view mode, sizing
//   - Gutter ordering
//   - Active tool window focus
//   - Sidebar collapse state
//
// editorStore retains only tab/editor state.
// ──────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import type {
  ToolWindowPlacement,
  ToolWindowViewMode,
  ToolWindowState,
} from "@/types/plugin";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Which regions are collapsed (hides content but keeps gutter icons). */
export type CollapsibleRegion = "left" | "right" | "bottom";

export interface LayoutState {
  /** All tool window states, keyed by tool window ID. */
  toolWindows: Record<string, ToolWindowState>;

  /** Currently focused tool window ID (highlighted in gutter, shows content). */
  activeToolWindowId: string | null;

  /** Which layout regions are collapsed. */
  collapsedRegions: Partial<Record<CollapsibleRegion, boolean>>;

  /** Left sidebar width in pixels. */
  leftSidebarWidth: number;

  /** Right sidebar width in pixels. */
  rightSidebarWidth: number;

  /** Bottom panel height in pixels. */
  bottomPanelHeight: number;

  // ── Actions ────────────────────────────────────────────────────────────────

  /** Register a tool window with default state. Idempotent. */
  registerToolWindow: (config: {
    id: string;
    placement: ToolWindowPlacement;
    order?: number;
    visible?: boolean;
  }) => void;

  /** Unregister a tool window. */
  unregisterToolWindow: (id: string) => void;

  /** Toggle a tool window's visibility. If opening, sets as active. */
  toggleToolWindow: (id: string) => void;

  /** Show a tool window (open + focus). */
  showToolWindow: (id: string) => void;

  /** Hide a tool window. */
  hideToolWindow: (id: string) => void;

  /** Set the active (focused) tool window. */
  setActiveToolWindow: (id: string | null) => void;

  /** Move a tool window to a different placement. */
  moveToolWindow: (id: string, placement: ToolWindowPlacement) => void;

  /** Change a tool window's view mode. */
  setViewMode: (id: string, mode: ToolWindowViewMode) => void;

  /** Unpin a dock-pinned tool window so it becomes an overlay (dock-unpinned). */
  unpinToolWindow: (id: string) => void;

  /** Pin a dock-unpinned tool window back to dock-pinned. */
  pinToolWindow: (id: string) => void;

  /** Detach a tool window into a floating overlay. */
  floatToolWindow: (id: string) => void;

  /** Return a floating tool window to its last docked placement. */
  dockToolWindow: (id: string) => void;

  /** Update a floating tool window's position. */
  setFloatPosition: (id: string, x: number, y: number) => void;

  /** Update a floating tool window's size. */
  setFloatSize: (id: string, width: number, height: number) => void;

  /** Reorder a tool window within its gutter section. */
  reorderToolWindow: (id: string, newOrder: number) => void;

  /** Toggle collapse of a layout region (left, right, bottom). */
  toggleRegionCollapse: (region: CollapsibleRegion) => void;

  /** Set sidebar/panel sizes. */
  setLeftSidebarWidth: (width: number) => void;
  setRightSidebarWidth: (width: number) => void;
  setBottomPanelHeight: (height: number) => void;

  // ── Selectors (computed helpers) ────────────────────────────────────────────

  /** Get tool windows for a specific placement, sorted by order. */
  getToolWindowsAt: (placement: ToolWindowPlacement) => ToolWindowState[];

  /** Get visible tool windows for a placement. */
  getVisibleAt: (placement: ToolWindowPlacement) => ToolWindowState[];

  /** Get tool window IDs for the left gutter (left-top + left-bottom). */
  getLeftGutterIds: () => { top: string[]; bottom: string[] };

  /** Get tool window IDs for the right gutter (right-top + right-bottom). */
  getRightGutterIds: () => { top: string[]; bottom: string[] };

  /** Get tool window IDs for the bottom bar. */
  getBottomIds: () => string[];

  /** Check if any tool window is visible in a region. */
  hasVisibleIn: (region: CollapsibleRegion) => boolean;

  /** Get all floating tool windows (viewMode === "float" && isVisible). */
  getFloatingWindows: () => ToolWindowState[];

  /** Get all visible dock-unpinned tool windows. */
  getUnpinnedWindows: () => ToolWindowState[];

  /** Hide all dock-unpinned tool windows (used when editor gains focus). */
  hideAllUnpinned: () => void;
}

// ─── Default Sizes ────────────────────────────────────────────────────────────

const DEFAULT_LEFT_WIDTH = 280;
const DEFAULT_RIGHT_WIDTH = 320;
const DEFAULT_BOTTOM_HEIGHT = 250;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function placementToRegion(placement: ToolWindowPlacement): CollapsibleRegion {
  if (placement === "left-top" || placement === "left-bottom") return "left";
  if (placement === "right-top" || placement === "right-bottom") return "right";
  return "bottom";
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useLayoutStore = create<LayoutState>()(
  devtools(
    persist(
      (set, get) => ({
        toolWindows: {},
        activeToolWindowId: null,
        collapsedRegions: {},
        leftSidebarWidth: DEFAULT_LEFT_WIDTH,
        rightSidebarWidth: DEFAULT_RIGHT_WIDTH,
        bottomPanelHeight: DEFAULT_BOTTOM_HEIGHT,

        // ── Registration ────────────────────────────────────────────────────

        registerToolWindow(config) {
          set((s) => {
            // Don't overwrite existing state (preserves user's layout preferences)
            if (s.toolWindows[config.id]) return s;

            const tw: ToolWindowState = {
              id: config.id,
              placement: config.placement,
              viewMode: "dock-pinned",
              isVisible: config.visible ?? false,
              order: config.order ?? Object.keys(s.toolWindows).length,
            };

            return {
              toolWindows: { ...s.toolWindows, [config.id]: tw },
              // If this is the first visible tool window, make it active
              activeToolWindowId:
                tw.isVisible && !s.activeToolWindowId
                  ? config.id
                  : s.activeToolWindowId,
            };
          });
        },

        unregisterToolWindow(id) {
          set((s) => {
            const { [id]: _, ...rest } = s.toolWindows;
            return {
              toolWindows: rest,
              activeToolWindowId:
                s.activeToolWindowId === id ? null : s.activeToolWindowId,
            };
          });
        },

        // ── Visibility ──────────────────────────────────────────────────────

        toggleToolWindow(id) {
          const tw = get().toolWindows[id];
          if (!tw) return;

          if (tw.isVisible) {
            // If it's the active window and we're hiding it, clear active
            get().hideToolWindow(id);
          } else {
            get().showToolWindow(id);
          }
        },

        showToolWindow(id) {
          set((s) => {
            const tw = s.toolWindows[id];
            if (!tw) return s;

            // Also un-collapse the region if it was collapsed
            const region = placementToRegion(tw.placement);

            return {
              toolWindows: {
                ...s.toolWindows,
                [id]: {
                  ...tw,
                  isVisible: true,
                  lastOpenedAt: Date.now(),
                },
              },
              activeToolWindowId: id,
              collapsedRegions: {
                ...s.collapsedRegions,
                [region]: false,
              },
            };
          });
        },

        hideToolWindow(id) {
          set((s) => {
            const tw = s.toolWindows[id];
            if (!tw) return s;

            const updated = {
              ...s.toolWindows,
              [id]: { ...tw, isVisible: false },
            };

            // If we're hiding the active tool window, find the next one
            let nextActive = s.activeToolWindowId;
            if (s.activeToolWindowId === id) {
              const samePlacement = Object.values(updated)
                .filter(
                  (t) =>
                    t.isVisible &&
                    t.id !== id &&
                    placementToRegion(t.placement) ===
                      placementToRegion(tw.placement)
                )
                .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0));
              nextActive = samePlacement[0]?.id ?? null;
            }

            return {
              toolWindows: updated,
              activeToolWindowId: nextActive,
            };
          });
        },

        setActiveToolWindow(id) {
          set({ activeToolWindowId: id });
        },

        // ── Layout Manipulation ─────────────────────────────────────────────

        moveToolWindow(id, placement) {
          set((s) => {
            const tw = s.toolWindows[id];
            if (!tw) return s;

            // Get the max order in the target placement
            const maxOrder = Object.values(s.toolWindows)
              .filter((t) => t.placement === placement && t.id !== id)
              .reduce((max, t) => Math.max(max, t.order), -1);

            return {
              toolWindows: {
                ...s.toolWindows,
                [id]: {
                  ...tw,
                  placement,
                  order: maxOrder + 1,
                },
              },
            };
          });
        },

        setViewMode(id, mode) {
          set((s) => {
            const tw = s.toolWindows[id];
            if (!tw) return s;
            return {
              toolWindows: {
                ...s.toolWindows,
                [id]: { ...tw, viewMode: mode },
              },
            };
          });
        },

        floatToolWindow(id) {
          set((s) => {
            const tw = s.toolWindows[id];
            if (!tw) return s;
            return {
              toolWindows: {
                ...s.toolWindows,
                [id]: {
                  ...tw,
                  viewMode: "float",
                  isVisible: true,
                  lastOpenedAt: Date.now(),
                  floatPosition: tw.floatPosition ?? { x: 120, y: 80 },
                  floatSize: tw.floatSize ?? { width: 400, height: 350 },
                },
              },
              activeToolWindowId: id,
            };
          });
        },

        dockToolWindow(id) {
          set((s) => {
            const tw = s.toolWindows[id];
            if (!tw) return s;

            // Restore to dock-pinned at its last placement
            const region = placementToRegion(tw.placement);
            return {
              toolWindows: {
                ...s.toolWindows,
                [id]: {
                  ...tw,
                  viewMode: "dock-pinned",
                  isVisible: true,
                  lastOpenedAt: Date.now(),
                },
              },
              activeToolWindowId: id,
              collapsedRegions: {
                ...s.collapsedRegions,
                [region]: false,
              },
            };
          });
        },

        unpinToolWindow(id) {
          set((s) => {
            const tw = s.toolWindows[id];
            if (!tw || tw.viewMode === "float") return s;
            return {
              toolWindows: {
                ...s.toolWindows,
                [id]: {
                  ...tw,
                  viewMode: "dock-unpinned",
                },
              },
            };
          });
        },

        pinToolWindow(id) {
          set((s) => {
            const tw = s.toolWindows[id];
            if (!tw || tw.viewMode !== "dock-unpinned") return s;

            const region = placementToRegion(tw.placement);
            return {
              toolWindows: {
                ...s.toolWindows,
                [id]: {
                  ...tw,
                  viewMode: "dock-pinned",
                  isVisible: true,
                  lastOpenedAt: Date.now(),
                },
              },
              activeToolWindowId: id,
              collapsedRegions: {
                ...s.collapsedRegions,
                [region]: false,
              },
            };
          });
        },

        setFloatPosition(id, x, y) {
          set((s) => {
            const tw = s.toolWindows[id];
            if (!tw) return s;
            return {
              toolWindows: {
                ...s.toolWindows,
                [id]: { ...tw, floatPosition: { x, y } },
              },
            };
          });
        },

        setFloatSize(id, width, height) {
          set((s) => {
            const tw = s.toolWindows[id];
            if (!tw) return s;
            return {
              toolWindows: {
                ...s.toolWindows,
                [id]: { ...tw, floatSize: { width, height } },
              },
            };
          });
        },

        reorderToolWindow(id, newOrder) {
          set((s) => {
            const tw = s.toolWindows[id];
            if (!tw) return s;
            return {
              toolWindows: {
                ...s.toolWindows,
                [id]: { ...tw, order: newOrder },
              },
            };
          });
        },

        // ── Region Collapse ─────────────────────────────────────────────────

        toggleRegionCollapse(region) {
          set((s) => ({
            collapsedRegions: {
              ...s.collapsedRegions,
              [region]: !s.collapsedRegions[region],
            },
          }));
        },

        // ── Sizing ──────────────────────────────────────────────────────────

        setLeftSidebarWidth(width) {
          set({ leftSidebarWidth: Math.max(200, Math.min(600, width)) });
        },

        setRightSidebarWidth(width) {
          set({ rightSidebarWidth: Math.max(200, Math.min(600, width)) });
        },

        setBottomPanelHeight(height) {
          set({ bottomPanelHeight: Math.max(100, Math.min(500, height)) });
        },

        // ── Selectors ───────────────────────────────────────────────────────

        getToolWindowsAt(placement) {
          return Object.values(get().toolWindows)
            .filter((tw) => tw.placement === placement)
            .sort((a, b) => a.order - b.order);
        },

        getVisibleAt(placement) {
          return get()
            .getToolWindowsAt(placement)
            .filter((tw) => tw.isVisible);
        },

        getLeftGutterIds() {
          const all = Object.values(get().toolWindows);
          return {
            top: all
              .filter((tw) => tw.placement === "left-top")
              .sort((a, b) => a.order - b.order)
              .map((tw) => tw.id),
            bottom: all
              .filter((tw) => tw.placement === "left-bottom")
              .sort((a, b) => a.order - b.order)
              .map((tw) => tw.id),
          };
        },

        getRightGutterIds() {
          const all = Object.values(get().toolWindows);
          return {
            top: all
              .filter((tw) => tw.placement === "right-top")
              .sort((a, b) => a.order - b.order)
              .map((tw) => tw.id),
            bottom: all
              .filter((tw) => tw.placement === "right-bottom")
              .sort((a, b) => a.order - b.order)
              .map((tw) => tw.id),
          };
        },

        getBottomIds() {
          return Object.values(get().toolWindows)
            .filter((tw) => tw.placement === "bottom")
            .sort((a, b) => a.order - b.order)
            .map((tw) => tw.id);
        },

        hasVisibleIn(region) {
          return Object.values(get().toolWindows).some(
            (tw) =>
              tw.isVisible &&
              tw.viewMode === "dock-pinned" &&
              placementToRegion(tw.placement) === region
          );
        },

        getFloatingWindows() {
          return Object.values(get().toolWindows)
            .filter((tw) => tw.viewMode === "float" && tw.isVisible)
            .sort((a, b) => (a.lastOpenedAt ?? 0) - (b.lastOpenedAt ?? 0));
        },

        getUnpinnedWindows() {
          return Object.values(get().toolWindows)
            .filter((tw) => tw.viewMode === "dock-unpinned" && tw.isVisible)
            .sort((a, b) => a.order - b.order);
        },

        hideAllUnpinned() {
          set((s) => {
            const updated = { ...s.toolWindows };
            let changed = false;
            for (const tw of Object.values(updated)) {
              if (tw.viewMode === "dock-unpinned" && tw.isVisible) {
                updated[tw.id] = { ...tw, isVisible: false };
                changed = true;
              }
            }
            if (!changed) return s;

            // If the active window was unpinned, clear it
            const activeWasUnpinned =
              s.activeToolWindowId &&
              updated[s.activeToolWindowId] &&
              !updated[s.activeToolWindowId].isVisible;

            return {
              toolWindows: updated,
              activeToolWindowId: activeWasUnpinned
                ? null
                : s.activeToolWindowId,
            };
          });
        },
      }),
      {
        name: "ide-layout",
        // Only persist layout preferences, not transient state
        partialize: (state) => ({
          toolWindows: state.toolWindows,
          collapsedRegions: state.collapsedRegions,
          leftSidebarWidth: state.leftSidebarWidth,
          rightSidebarWidth: state.rightSidebarWidth,
          bottomPanelHeight: state.bottomPanelHeight,
        }) as unknown as LayoutState,
      }
    ),
    { name: "layout-store" }
  )
);
