import { useState } from "react";
import { useFileTreeStore } from "@/stores/fileTreeStore";
import { useEditorStore } from "@/stores/editorStore";
import { NewEntryInput } from "./NewEntryInput";
import { ContextMenu, type MenuItem } from "@/components/ui/ContextMenu";
import {
  FileCode,
  FileJson,
  FileText,
  Palette,
  Globe,
  FileCode2,
  Settings,
  Database,
  Key,
  File,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Folder,
  FilePlus,
  FolderPlus,
  Edit3,
  Trash2,
  Copy,
} from "lucide-react";
import type { DirEntry } from "@/stores/fileTreeStore";

// ── Icon maps ─────────────────────────────────────────────────────────────────

const FILE_ICONS: Record<string, React.ElementType> = {
  ts: FileCode,   tsx: FileCode,
  js: FileCode,   jsx: FileCode,
  json: FileJson,
  md: FileText,
  css: Palette,   scss: Palette,
  html: Globe,
  py: FileCode2,  rs: FileCode2,  go: FileCode2,
  sh: Settings,
  yaml: Settings, yml: Settings,  toml: Settings,
  sql: Database,
  env: Key,
};

const ICON_COLORS: Record<string, string> = {
  ts:   "text-blue-400",
  tsx:  "text-blue-400",
  js:   "text-yellow-400",
  jsx:  "text-cyan-400",
  json: "text-green-400",
  md:   "text-zinc-300",
  css:  "text-pink-400",
  scss: "text-pink-400",
  html: "text-orange-400",
  py:   "text-blue-500",
  rs:   "text-orange-500",
  go:   "text-cyan-500",
  sh:   "text-zinc-400",
  yaml: "text-red-400",
  yml:  "text-red-400",
  toml: "text-zinc-400",
  sql:  "text-indigo-400",
  env:  "text-emerald-400",
};

function getFileIcon(name: string) {
  if (name.startsWith(".")) return { icon: Settings, color: "text-zinc-400" };
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return {
    icon: FILE_ICONS[ext] ?? File,
    color: ICON_COLORS[ext] ?? "text-zinc-400",
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  workspaceId: string;
  entry: DirEntry;
  depth: number;
}

export function FileNode({ workspaceId, entry, depth }: Props) {
  // ── Store subscriptions ──────────────────────────────────────────────────────
  const store = useFileTreeStore();

  const isExpanded  = store.expanded[entry.path] ?? false;
  const isLoading   = store.loading[entry.path] ?? false;
  const isSelected  = store.selected === entry.path;
  const isRenaming  = store.renaming === entry.path;
  const isDragSource = store.dragSource === entry.path;
  const isDropTarget = store.dropTarget === entry.path;

  const openFile = useEditorStore((s) => s.openFile);
  const isActive = useEditorStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.path === entry.path;
  });

  // ── Local UI state ───────────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // ── Inline rename mode ───────────────────────────────────────────────────────
  if (isRenaming) {
    return (
      <NewEntryInput
        type={entry.type === "directory" ? "folder" : "file"}
        initialValue={entry.name}
        indent={depth * 12 + 8}
        onSubmit={(newName) => store.submitRename(workspaceId, entry.path, newName)}
        onCancel={() => store.cancelRename()}
      />
    );
  }

  // ── Interaction handlers ─────────────────────────────────────────────────────

  function handleClick() {
    store.setSelected(entry.path);
    if (entry.type === "directory") {
      if (isExpanded) {
        store.collapseFolder(entry.path);
      } else {
        store.expandFolder(workspaceId, entry.path);
      }
    } else {
      openFile(workspaceId, entry.path);
    }
  }

  function handleDoubleClick() {
    if (entry.type !== "directory") {
      store.startRename(entry.path);
    }
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    store.setSelected(entry.path);
    setContextMenu({ x: e.clientX, y: e.clientY });
  }

  // ── Drag-and-drop ────────────────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("text/plain", entry.path);
    e.dataTransfer.effectAllowed = "move";
    store.setDragSource(entry.path);
  }

  function handleDragEnd() {
    store.setDragSource(null);
    store.setDropTarget(null);
  }

  function handleDragOver(e: React.DragEvent) {
    if (entry.type !== "directory") return;
    const source = store.dragSource;
    if (!source) return;
    // Prevent dropping into self or a descendant
    if (source === entry.path || entry.path.startsWith(source + "/")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (store.dropTarget !== entry.path) {
      store.setDropTarget(entry.path);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    // Only clear if leaving the folder row itself (not entering a child element)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      store.setDropTarget(null);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const sourcePath = e.dataTransfer.getData("text/plain");
    if (entry.type === "directory" && sourcePath) {
      store.moveEntry(workspaceId, sourcePath, entry.path);
    }
    store.setDropTarget(null);
  }

  // ── Context menu items ───────────────────────────────────────────────────────

  const menuItems: MenuItem[] =
    entry.type === "directory"
      ? [
          {
            id: "new-file",
            label: "New File",
            icon: FilePlus,
            onClick: () => {
              store.expandFolder(workspaceId, entry.path);
              store.startCreate(entry.path, "file");
            },
          },
          {
            id: "new-folder",
            label: "New Folder",
            icon: FolderPlus,
            onClick: () => {
              store.expandFolder(workspaceId, entry.path);
              store.startCreate(entry.path, "folder");
            },
          },
          { id: "d1", label: "", divider: true, onClick: () => {} },
          {
            id: "rename",
            label: "Rename",
            icon: Edit3,
            shortcut: "F2",
            onClick: () => store.startRename(entry.path),
          },
          {
            id: "delete",
            label: "Delete",
            icon: Trash2,
            danger: true,
            onClick: () => store.requestDelete(entry.path),
          },
          { id: "d2", label: "", divider: true, onClick: () => {} },
          {
            id: "copy-path",
            label: "Copy Path",
            icon: Copy,
            onClick: () => navigator.clipboard.writeText(entry.path),
          },
        ]
      : [
          {
            id: "open",
            label: "Open",
            icon: FileCode,
            onClick: () => openFile(workspaceId, entry.path),
          },
          { id: "d1", label: "", divider: true, onClick: () => {} },
          {
            id: "rename",
            label: "Rename",
            icon: Edit3,
            shortcut: "F2",
            onClick: () => store.startRename(entry.path),
          },
          {
            id: "delete",
            label: "Delete",
            icon: Trash2,
            danger: true,
            onClick: () => store.requestDelete(entry.path),
          },
          { id: "d2", label: "", divider: true, onClick: () => {} },
          {
            id: "copy-path",
            label: "Copy Path",
            icon: Copy,
            onClick: () => navigator.clipboard.writeText(entry.path),
          },
          {
            id: "copy-rel-path",
            label: "Copy Relative Path",
            icon: Copy,
            onClick: () => navigator.clipboard.writeText(entry.path),
          },
        ];

  // ── Render ───────────────────────────────────────────────────────────────────

  const indent = depth * 12;
  const { icon: FileIconComponent, color: iconColor } = getFileIcon(entry.name);

  const rowClassName = [
    "w-full flex items-center gap-1.5 text-xs py-[3px] px-2 text-left transition-all duration-150 cursor-pointer group relative select-none",
    isDragSource  ? "opacity-40" : "",
    isDropTarget  ? "bg-cyan-500/10 ring-1 ring-inset ring-cyan-500/30" : "",
    isActive
      ? "bg-white/[0.08] text-white shadow-[inset_2px_0_0_rgba(34,211,238,0.8)]"
      : isSelected
        ? "bg-white/[0.05] text-zinc-200"
        : "hover:bg-white/[0.04] text-zinc-400 hover:text-zinc-200",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <button
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={rowClassName}
        style={{ paddingLeft: `${indent + 8}px` }}
        data-path={entry.path}
      >
        {entry.type === "directory" ? (
          <>
            <span className="text-zinc-500 w-3 flex justify-center shrink-0 transition-transform duration-200 group-hover:text-zinc-300">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
            <span
              className={[
                "opacity-80 group-hover:opacity-100 transition-opacity",
                isDropTarget ? "text-cyan-400" : "text-violet-400",
              ].join(" ")}
            >
              {isExpanded ? (
                <FolderOpen size={14} fill="currentColor" className="opacity-30" />
              ) : (
                <Folder size={14} fill="currentColor" className="opacity-30" />
              )}
            </span>
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <span
              className={`${iconColor} opacity-80 group-hover:opacity-100 transition-opacity drop-shadow-sm`}
            >
              <FileIconComponent size={14} strokeWidth={2} />
            </span>
          </>
        )}

        <span className={`truncate ${isActive ? "font-medium" : ""}`}>
          {entry.name}
        </span>

        {isLoading && (
          <span className="ml-auto text-zinc-600 text-[10px] shrink-0">…</span>
        )}
      </button>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
