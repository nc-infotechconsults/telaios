import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { api } from "@/lib/api";
import type { WsMessage, FileChangePayload } from "@/types";
import { useEditorStore } from "./editorStore";

// ── Public types ──────────────────────────────────────────────────────────────

export interface DirEntry {
  name: string;
  path: string;
  type: "file" | "directory";
}

/**
 * A flattened row for the Virtuoso-based list renderer.
 * - "entry"  → a normal file or directory row
 * - "create" → the inline new-file/folder input row
 */
export type FlatRow =
  | { kind: "entry";  entry: DirEntry; depth: number }
  | { kind: "create"; dirPath: string; entryType: "file" | "folder"; depth: number };

// ── Private helpers ───────────────────────────────────────────────────────────

/** Returns the parent path of a given path; root-level paths return ".". */
export function parentPath(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx > 0 ? path.slice(0, idx) : ".";
}

/** Sort: directories first, then alphabetical (case-insensitive). */
function sortEntries(entries: DirEntry[]): DirEntry[] {
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

/**
 * Computes the flat, ordered list of visible rows from the tree state.
 * Exported so components can memoize it outside the store.
 */
export function computeFlatRows(
  dirCache: Record<string, DirEntry[]>,
  expanded: Record<string, boolean>,
  creating: FileTreeState["creating"],
): FlatRow[] {
  const rows: FlatRow[] = [];

  // Root-level create input goes at the very top
  if (creating && creating.dirPath === ".") {
    rows.push({ kind: "create", dirPath: ".", entryType: creating.type, depth: 0 });
  }

  function traverse(dirPath: string, depth: number) {
    const entries = dirCache[dirPath] ?? [];
    for (const entry of entries) {
      rows.push({ kind: "entry", entry, depth });

      if (entry.type === "directory" && expanded[entry.path]) {
        // Inline create input appears as the first child of the target folder
        if (creating && creating.dirPath === entry.path) {
          rows.push({
            kind: "create",
            dirPath: entry.path,
            entryType: creating.type,
            depth: depth + 1,
          });
        }
        traverse(entry.path, depth + 1);
      }
    }
  }

  traverse(".", 0);
  return rows;
}

// ── State interface ───────────────────────────────────────────────────────────

export interface FileTreeState {
  // ── Data ──────────────────────────────────────────────────────────────────
  /** Cached directory listings keyed by path. Root is keyed as ".". */
  dirCache: Record<string, DirEntry[]>;
  /** Expanded folder paths (path → true). */
  expanded: Record<string, boolean>;
  /** Currently keyboard-selected / highlighted path. */
  selected: string | null;
  /** Paths currently being fetched from the server. */
  loading: Record<string, boolean>;
  /** Last fetch error message per path. */
  errors: Record<string, string>;

  // ── UI overlay state ──────────────────────────────────────────────────────
  /** Active inline-create input. null = hidden. */
  creating: { dirPath: string; type: "file" | "folder" } | null;
  /** Path whose row is replaced by a rename input. null = no rename in progress. */
  renaming: string | null;
  /** Path awaiting delete confirmation. null = no confirmation pending. */
  pendingDelete: string | null;
  /** Path being dragged (for DnD visual feedback). */
  dragSource: string | null;
  /** Folder path currently hovered as a drop target. */
  dropTarget: string | null;

  // ── Directory actions ─────────────────────────────────────────────────────
  /** Fetch a directory if not already cached. No-op on cache hit. */
  loadDir: (workspaceId: string, path: string) => Promise<void>;
  /** Force re-fetch a directory, updating the cache. */
  refreshDir: (workspaceId: string, path: string) => Promise<void>;
  /** Mark a folder as expanded and fetch its children if needed. */
  expandFolder: (workspaceId: string, path: string) => Promise<void>;
  /** Collapse a folder (children remain cached). */
  collapseFolder: (path: string) => void;
  /** Set the keyboard-selected path. */
  setSelected: (path: string | null) => void;

  // ── Create ────────────────────────────────────────────────────────────────
  startCreate: (dirPath: string, type: "file" | "folder") => void;
  cancelCreate: () => void;
  createEntry: (
    workspaceId: string,
    dirPath: string,
    name: string,
    type: "file" | "folder",
  ) => Promise<void>;

  // ── Rename ────────────────────────────────────────────────────────────────
  startRename: (path: string) => void;
  cancelRename: () => void;
  submitRename: (workspaceId: string, oldPath: string, newName: string) => Promise<void>;

  // ── Delete ────────────────────────────────────────────────────────────────
  requestDelete: (path: string) => void;
  cancelDelete: () => void;
  confirmDelete: (workspaceId: string) => Promise<void>;

  // ── Move (drag-and-drop) ─────────────────────────────────────────────────
  setDragSource: (path: string | null) => void;
  setDropTarget: (path: string | null) => void;
  moveEntry: (workspaceId: string, sourcePath: string, targetDirPath: string) => Promise<void>;

  // ── WebSocket events ──────────────────────────────────────────────────────
  /** Routes a WS file-change event to surgical cache updates. */
  handleWsEvent: (workspaceId: string, msg: WsMessage) => void;

  // ── Reveal in explorer ────────────────────────────────────────────────────
  /** Expand all ancestor folders of a path and select it. */
  expandToPath: (workspaceId: string, fullPath: string) => Promise<void>;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  /** Clear all state. Call when the active workspace changes. */
  reset: () => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useFileTreeStore = create<FileTreeState>()(
  devtools(
    (set, get) => ({
      dirCache: {},
      expanded: {},
      selected: null,
      loading: {},
      errors: {},
      creating: null,
      renaming: null,
      pendingDelete: null,
      dragSource: null,
      dropTarget: null,

      // ── Directory loading ───────────────────────────────────────────────────

      async loadDir(workspaceId, path) {
        if (get().dirCache[path] !== undefined) return; // already cached
        return get().refreshDir(workspaceId, path);
      },

      async refreshDir(workspaceId, path) {
        set((s) => ({ loading: { ...s.loading, [path]: true } }));
        try {
          const raw = await api.workspaces.listDir(workspaceId, path);
          set((s) => ({
            dirCache: { ...s.dirCache, [path]: sortEntries(raw) },
            loading: { ...s.loading, [path]: false },
            errors: { ...s.errors, [path]: "" },
          }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to load directory";
          set((s) => ({
            loading: { ...s.loading, [path]: false },
            errors: { ...s.errors, [path]: msg },
          }));
        }
      },

      async expandFolder(workspaceId, path) {
        set((s) => ({ expanded: { ...s.expanded, [path]: true } }));
        return get().loadDir(workspaceId, path);
      },

      collapseFolder(path) {
        set((s) => ({ expanded: { ...s.expanded, [path]: false } }));
      },

      setSelected(path) {
        set({ selected: path });
      },

      // ── Create ──────────────────────────────────────────────────────────────

      startCreate(dirPath, type) {
        // Auto-expand the target folder so the input row appears inside it
        if (dirPath !== ".") {
          set((s) => ({ expanded: { ...s.expanded, [dirPath]: true } }));
        }
        set({ creating: { dirPath, type }, renaming: null, pendingDelete: null });
      },

      cancelCreate() {
        set({ creating: null });
      },

      async createEntry(workspaceId, dirPath, name, type) {
        if (type === "file") {
          await api.workspaces.createFile(workspaceId, dirPath, name);
        } else {
          await api.workspaces.createFolder(workspaceId, dirPath, name);
        }
        set({ creating: null });
        await get().refreshDir(workspaceId, dirPath);
      },

      // ── Rename ──────────────────────────────────────────────────────────────

      startRename(path) {
        set({ renaming: path, creating: null, pendingDelete: null });
      },

      cancelRename() {
        set({ renaming: null });
      },

      async submitRename(workspaceId, oldPath, newName) {
        const parent = parentPath(oldPath);
        const newPath = parent === "." ? newName : `${parent}/${newName}`;
        await api.workspaces.renameEntry(workspaceId, oldPath, newPath);

        set((s) => {
          const parentEntries = s.dirCache[parent] ?? [];
          const updatedParent = sortEntries(
            parentEntries.map((e) =>
              e.path === oldPath ? { name: newName, path: newPath, type: e.type } : e,
            ),
          );

          const newDirCache: Record<string, DirEntry[]> = {
            ...s.dirCache,
            [parent]: updatedParent,
          };
          const newExpanded: Record<string, boolean> = { ...s.expanded };

          // If the renamed entry was a directory, migrate its cache and expanded state
          const wasDir = parentEntries.find((e) => e.path === oldPath)?.type === "directory";
          if (wasDir) {
            if (s.dirCache[oldPath] !== undefined) {
              newDirCache[newPath] = s.dirCache[oldPath];
              delete newDirCache[oldPath];
            }
            if (s.expanded[oldPath]) {
              newExpanded[newPath] = true;
              delete newExpanded[oldPath];
            }
          }

          return {
            dirCache: newDirCache,
            expanded: newExpanded,
            renaming: null,
            selected: s.selected === oldPath ? newPath : s.selected,
          };
        });

        // Sync any open editor tabs that reference the old path
        useEditorStore.getState().renameTab?.(oldPath, newPath);
      },

      // ── Delete ──────────────────────────────────────────────────────────────

      requestDelete(path) {
        set({ pendingDelete: path, creating: null, renaming: null });
      },

      cancelDelete() {
        set({ pendingDelete: null });
      },

      async confirmDelete(workspaceId) {
        const path = get().pendingDelete;
        if (!path) return;

        await api.workspaces.deleteEntry(workspaceId, path);

        set((s) => {
          const parent = parentPath(path);
          const newDirCache: Record<string, DirEntry[]> = {
            ...s.dirCache,
            [parent]: (s.dirCache[parent] ?? []).filter((e) => e.path !== path),
          };
          const newExpanded: Record<string, boolean> = { ...s.expanded };

          // Clean up any cached children of the deleted path (if it was a directory)
          for (const key of Object.keys(newDirCache)) {
            if (key === path || key.startsWith(path + "/")) delete newDirCache[key];
          }
          for (const key of Object.keys(newExpanded)) {
            if (key === path || key.startsWith(path + "/")) delete newExpanded[key];
          }

          return {
            dirCache: newDirCache,
            expanded: newExpanded,
            pendingDelete: null,
            selected:
              s.selected === path || s.selected?.startsWith(path + "/")
                ? null
                : s.selected,
          };
        });
      },

      // ── Drag-and-drop ────────────────────────────────────────────────────────

      setDragSource(path) {
        set({ dragSource: path });
      },

      setDropTarget(path) {
        set({ dropTarget: path });
      },

      async moveEntry(workspaceId, sourcePath, targetDirPath) {
        // Guard: cannot move into self or a descendant
        if (
          targetDirPath === sourcePath ||
          targetDirPath.startsWith(sourcePath + "/")
        )
          return;

        const name = sourcePath.split("/").pop()!;
        const newPath =
          targetDirPath === "." ? name : `${targetDirPath}/${name}`;
        if (newPath === sourcePath) return;

        await api.workspaces.renameEntry(workspaceId, sourcePath, newPath);

        const oldParent = parentPath(sourcePath);
        await Promise.all([
          get().refreshDir(workspaceId, oldParent),
          get().refreshDir(workspaceId, targetDirPath),
        ]);

        set({ dragSource: null, dropTarget: null });
      },

      // ── WebSocket events ─────────────────────────────────────────────────────

      handleWsEvent(workspaceId, msg) {
        const payload = msg.payload as FileChangePayload | undefined;
        if (!payload?.path) return;

        const { path, oldPath } = payload;
        const parent = parentPath(path);

        switch (msg.type) {
          case "file:deleted": {
            set((s) => {
              if (!s.dirCache[parent]) return s; // parent not in cache, nothing to do
              const newDirCache: Record<string, DirEntry[]> = {
                ...s.dirCache,
                [parent]: s.dirCache[parent].filter((e) => e.path !== path),
              };
              const newExpanded: Record<string, boolean> = { ...s.expanded };
              for (const key of Object.keys(newDirCache)) {
                if (key === path || key.startsWith(path + "/"))
                  delete newDirCache[key];
              }
              for (const key of Object.keys(newExpanded)) {
                if (key === path || key.startsWith(path + "/"))
                  delete newExpanded[key];
              }
              return { dirCache: newDirCache, expanded: newExpanded };
            });
            break;
          }

          case "file:created": {
            // Refresh the parent directory if we have it cached
            if (get().dirCache[parent] !== undefined) {
              get().refreshDir(workspaceId, parent);
            }
            break;
          }

          case "file:renamed": {
            if (!oldPath) break;
            const oldParent = parentPath(oldPath);
            if (get().dirCache[oldParent] !== undefined) {
              get().refreshDir(workspaceId, oldParent);
            }
            if (parent !== oldParent && get().dirCache[parent] !== undefined) {
              get().refreshDir(workspaceId, parent);
            }
            break;
          }
        }
      },

      // ── Reveal in explorer ───────────────────────────────────────────────────

      async expandToPath(workspaceId, fullPath) {
        const parts = fullPath.split("/");
        parts.pop(); // strip the filename — we only expand ancestor folders

        let current = "";
        for (const part of parts) {
          current = current ? `${current}/${part}` : part;
          await get().expandFolder(workspaceId, current);
        }

        get().setSelected(fullPath);
      },

      // ── Lifecycle ────────────────────────────────────────────────────────────

      reset() {
        set({
          dirCache: {},
          expanded: {},
          selected: null,
          loading: {},
          errors: {},
          creating: null,
          renaming: null,
          pendingDelete: null,
          dragSource: null,
          dropTarget: null,
        });
      },
    }),
    { name: "file-tree-store" },
  ),
);
