import { forwardRef, useMemo, useRef, useImperativeHandle } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { useFileTreeStore, computeFlatRows, parentPath } from "@/stores/fileTreeStore";
import { useEditorStore } from "@/stores/editorStore";
import { FileNode } from "./FileNode";
import { NewEntryInput } from "./NewEntryInput";

// ── Public handle exposed to FileExplorer ─────────────────────────────────────

export interface FileTreeHandle {
  scrollToPath: (path: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  workspaceId: string;
}

export const FileTree = forwardRef<FileTreeHandle, Props>(
  function FileTree({ workspaceId }, ref) {
    const virtuosoRef = useRef<VirtuosoHandle>(null);

    // Selective subscriptions — each triggers re-render only on its own change
    const dirCache  = useFileTreeStore((s) => s.dirCache);
    const expanded  = useFileTreeStore((s) => s.expanded);
    const creating  = useFileTreeStore((s) => s.creating);
    const selected  = useFileTreeStore((s) => s.selected);
    const isLoading = useFileTreeStore((s) => s.loading["."]) ?? false;

    // Memoised flat row list — recomputed only when the tree structure changes
    const flatRows = useMemo(
      () => computeFlatRows(dirCache, expanded, creating),
      [dirCache, expanded, creating],
    );

    // ── Scroll helpers ──────────────────────────────────────────────────────────

    function scrollToEntry(path: string) {
      const idx = flatRows.findIndex(
        (r) => r.kind === "entry" && r.entry.path === path,
      );
      if (idx >= 0) {
        virtuosoRef.current?.scrollToIndex({ index: idx, behavior: "smooth" });
      }
    }

    // Expose scroll-to-path to parent (FileExplorer)
    useImperativeHandle(
      ref,
      () => ({ scrollToPath: scrollToEntry }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [flatRows],
    );

    // ── Keyboard navigation ─────────────────────────────────────────────────────

    function handleKeyDown(e: React.KeyboardEvent) {
      // Let text inputs handle their own keys (rename / create inputs)
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      // Snapshot imperative store access — actions are stable references
      const store = useFileTreeStore.getState();

      // Navigable rows are entry rows only (skip inline-create rows)
      const navRows = flatRows.filter((r) => r.kind === "entry");
      const currentIdx = navRows.findIndex(
        (r) => r.kind === "entry" && r.entry.path === selected,
      );

      switch (e.key) {
        // ── Vertical movement ───────────────────────────────────────────────────
        case "ArrowDown": {
          e.preventDefault();
          const next = navRows[currentIdx + 1];
          if (next?.kind === "entry") {
            store.setSelected(next.entry.path);
            scrollToEntry(next.entry.path);
          } else if (currentIdx === -1 && navRows.length > 0) {
            // Nothing selected yet — jump to first item
            const first = navRows[0];
            if (first?.kind === "entry") {
              store.setSelected(first.entry.path);
              scrollToEntry(first.entry.path);
            }
          }
          break;
        }

        case "ArrowUp": {
          e.preventDefault();
          const prev = navRows[currentIdx - 1];
          if (prev?.kind === "entry") {
            store.setSelected(prev.entry.path);
            scrollToEntry(prev.entry.path);
          } else if (currentIdx === -1 && navRows.length > 0) {
            // Nothing selected yet — jump to last item
            const last = navRows[navRows.length - 1];
            if (last?.kind === "entry") {
              store.setSelected(last.entry.path);
              scrollToEntry(last.entry.path);
            }
          }
          break;
        }

        // ── Horizontal movement (expand / collapse) ─────────────────────────────
        case "ArrowRight": {
          e.preventDefault();
          const cur = navRows[currentIdx];
          if (cur?.kind === "entry" && cur.entry.type === "directory") {
            if (!expanded[cur.entry.path]) {
              store.expandFolder(workspaceId, cur.entry.path);
            } else {
              // Already expanded — move to first visible child
              const flatCurIdx = flatRows.findIndex(
                (r) => r.kind === "entry" && r.entry.path === cur.entry.path,
              );
              const child = flatRows.slice(flatCurIdx + 1).find((r) => r.kind === "entry");
              if (child?.kind === "entry") {
                store.setSelected(child.entry.path);
                scrollToEntry(child.entry.path);
              }
            }
          }
          break;
        }

        case "ArrowLeft": {
          e.preventDefault();
          const cur = navRows[currentIdx];
          if (cur?.kind === "entry") {
            if (cur.entry.type === "directory" && expanded[cur.entry.path]) {
              // Collapse the currently selected folder
              store.collapseFolder(cur.entry.path);
            } else {
              // Jump to the parent folder
              const parent = parentPath(cur.entry.path);
              if (parent !== ".") {
                store.setSelected(parent);
                scrollToEntry(parent);
              }
            }
          }
          break;
        }

        // ── Activate ────────────────────────────────────────────────────────────
        case "Enter": {
          e.preventDefault();
          const cur = navRows[currentIdx];
          if (cur?.kind === "entry") {
            if (cur.entry.type === "directory") {
              if (expanded[cur.entry.path]) {
                store.collapseFolder(cur.entry.path);
              } else {
                store.expandFolder(workspaceId, cur.entry.path);
              }
            } else {
              useEditorStore.getState().openFile(workspaceId, cur.entry.path);
            }
          }
          break;
        }

        // ── Rename ───────────────────────────────────────────────────────────────
        case "F2": {
          if (selected) {
            e.preventDefault();
            store.startRename(selected);
          }
          break;
        }

        // ── Delete ───────────────────────────────────────────────────────────────
        case "Delete": {
          if (selected) {
            e.preventDefault();
            store.requestDelete(selected);
          }
          break;
        }

        // ── Cancel overlays ──────────────────────────────────────────────────────
        case "Escape": {
          store.cancelCreate();
          store.cancelRename();
          store.cancelDelete();
          break;
        }
      }
    }

    // ── Empty state ─────────────────────────────────────────────────────────────

    if (flatRows.length === 0 && !isLoading) {
      return (
        <div className="px-3 py-4 text-xs text-zinc-600">No files found</div>
      );
    }

    // ── Render ──────────────────────────────────────────────────────────────────

    return (
      <div
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="h-full outline-none focus-visible:outline-none"
      >
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: "100%" }}
          data={flatRows}
          itemContent={(_, row) => {
            if (row.kind === "create") {
              return (
                <NewEntryInput
                  type={row.entryType}
                  indent={row.depth * 12 + 8}
                  onSubmit={(name) =>
                    useFileTreeStore
                      .getState()
                      .createEntry(workspaceId, row.dirPath, name, row.entryType)
                  }
                  onCancel={() => useFileTreeStore.getState().cancelCreate()}
                />
              );
            }
            return (
              <FileNode
                workspaceId={workspaceId}
                entry={row.entry}
                depth={row.depth}
              />
            );
          }}
        />
      </div>
    );
  },
);
