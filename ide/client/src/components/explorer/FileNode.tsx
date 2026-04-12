import { useState } from "react";
import { FileTree } from "./FileTree";
import { useEditorStore } from "@/stores/editorStore";
import { api } from "@/lib/api";
import { ContextMenu, type MenuItem } from "@/components/ui/ContextMenu";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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
  Folder
} from "lucide-react";

interface DirEntry {
  name: string;
  path: string;
  type: "file" | "directory";
}

interface Props {
  workspaceId: string;
  entry: DirEntry;
  depth: number;
}

const FILE_ICONS: Record<string, React.ElementType> = {
  ts: FileCode,
  tsx: FileCode,
  js: FileCode,
  jsx: FileCode,
  json: FileJson,
  md: FileText,
  css: Palette,
  scss: Palette,
  html: Globe,
  py: FileCode2,
  rs: FileCode2,
  go: FileCode2,
  sh: Settings,
  yaml: Settings,
  yml: Settings,
  toml: Settings,
  sql: Database,
  env: Key,
};

const ICON_COLORS: Record<string, string> = {
  ts: "text-blue-400",
  tsx: "text-blue-400",
  js: "text-yellow-400",
  jsx: "text-cyan-400",
  json: "text-green-400",
  md: "text-zinc-300",
  css: "text-pink-400",
  scss: "text-pink-400",
  html: "text-orange-400",
  py: "text-blue-500",
  rs: "text-orange-500",
  go: "text-cyan-500",
  sh: "text-zinc-400",
  yaml: "text-red-400",
  yml: "text-red-400",
  toml: "text-zinc-400",
  sql: "text-indigo-400",
  env: "text-emerald-400",
};

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (name.startsWith(".")) return { icon: Settings, color: "text-zinc-400" };
  return { 
    icon: FILE_ICONS[ext] ?? File, 
    color: ICON_COLORS[ext] ?? "text-zinc-400" 
  };
}

export function FileNode({ workspaceId, entry, depth }: Props) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  
  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const openFile = useEditorStore((s) => s.openFile);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const tabs = useEditorStore((s) => s.tabs);
  
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isActive = activeTab?.path === entry.path;

  async function handleClick() {
    if (entry.type === "directory") {
      if (!open) {
        setLoading(true);
        try {
          const items = await api.workspaces.listDir(workspaceId, entry.path);
          setChildren(items);
        } finally {
          setLoading(false);
        }
      }
      setOpen((v) => !v);
    } else {
      openFile(workspaceId, entry.path);
    }
  }

  // Right-click context menu
  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }

  // Build context menu items based on entry type
  const menuItems: MenuItem[] = entry.type === "directory"
    ? [
        { id: "new-file", label: "New File", icon: FileCode, onClick: () => {} },
        { id: "new-folder", label: "New Folder", icon: Folder, onClick: () => {} },
        { id: "divider-1", label: "", divider: true, onClick: () => {} },
        { id: "rename", label: "Rename", icon: Settings, onClick: () => {} },
        { id: "delete", label: "Delete", icon: Database, danger: true, onClick: () => setDeleteConfirm(true) },
        { id: "divider-2", label: "", divider: true, onClick: () => {} },
        { id: "copy-path", label: "Copy Path", icon: Key, onClick: () => navigator.clipboard.writeText(entry.path) },
      ]
    : [
        { id: "open", label: "Open", icon: FileCode, onClick: () => openFile(workspaceId, entry.path) },
        { id: "divider-1", label: "", divider: true, onClick: () => {} },
        { id: "rename", label: "Rename", icon: Settings, onClick: () => {} },
        { id: "delete", label: "Delete", icon: Database, danger: true, onClick: () => setDeleteConfirm(true) },
        { id: "divider-2", label: "", divider: true, onClick: () => {} },
        { id: "copy-path", label: "Copy Path", icon: Key, onClick: () => navigator.clipboard.writeText(entry.path) },
        { id: "copy-rel-path", label: "Copy Relative Path", icon: Key, onClick: () => navigator.clipboard.writeText(entry.path) },
      ];

  // Delete handler
  async function handleDelete() {
    await api.workspaces.deleteEntry(workspaceId, entry.path);
    setDeleteConfirm(false);
    setContextMenu(null);
  }

  const indent = depth * 12;
  const { icon: FileIconComponent, color: iconColor } = getFileIcon(entry.name);

  return (
    <>
      <div>
        <button
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          className={[
            "w-full flex items-center gap-1.5 text-xs py-1 px-2 text-left transition-all duration-200 cursor-pointer group relative",
            isActive 
              ? "bg-white/[0.08] text-white shadow-[inset_2px_0_0_rgba(34,211,238,0.8)]" 
              : "hover:bg-white/[0.04] text-zinc-400 hover:text-zinc-200",
          ].join(" ")}
          style={{ paddingLeft: `${indent + 8}px` }}
        >
          {entry.type === "directory" ? (
            <>
              <span className="text-zinc-500 w-3 flex justify-center shrink-0 transition-transform duration-200 group-hover:text-zinc-300">
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              <span className="text-violet-400 opacity-80 group-hover:opacity-100 transition-opacity">
                {open ? <FolderOpen size={14} fill="currentColor" className="opacity-30" /> : <Folder size={14} fill="currentColor" className="opacity-30" />}
              </span>
            </>
          ) : (
            <>
              <span className="w-3 shrink-0" />
              <span className={`${iconColor} opacity-80 group-hover:opacity-100 transition-opacity drop-shadow-sm`}>
                <FileIconComponent size={14} strokeWidth={2} />
              </span>
            </>
          )}
          <span className={`truncate ${isActive ? "font-medium" : ""}`}>{entry.name}</span>
          {loading && (
            <span className="ml-auto text-zinc-600 text-[10px]">…</span>
          )}
        </button>

        {open && entry.type === "directory" && (
          <FileTree
            workspaceId={workspaceId}
            entries={children}
            depth={depth + 1}
          />
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirm}
        title="Delete"
        message={`Are you sure you want to delete "${entry.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(false)}
      />
    </>
  );
}