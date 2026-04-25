import type { DocumentFolder } from "../../types";

interface Props {
  folders: DocumentFolder[];
  currentFolderId: string | null;
  onNavigate: (folderId: string | null) => void;
  activeSection: "all" | "favorites" | "recent" | "trash";
  onSectionChange: (section: "all" | "favorites" | "recent" | "trash") => void;
}

interface TreeNode {
  folder: DocumentFolder;
  children: TreeNode[];
}

const SECTIONS = [
  { key: "all" as const, label: "All Documents", icon: SectionIconAll },
  { key: "favorites" as const, label: "Favorites", icon: SectionIconStar },
  { key: "recent" as const, label: "Recent", icon: SectionIconClock },
  { key: "trash" as const, label: "Trash", icon: SectionIconTrash },
];

function buildTree(folders: DocumentFolder[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const f of folders) {
    map.set(f.id, { folder: f, children: [] });
  }
  for (const f of folders) {
    const node = map.get(f.id)!;
    if (f.parent_folder_id && map.has(f.parent_folder_id)) {
      map.get(f.parent_folder_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots.sort((a, b) => a.folder.name.localeCompare(b.folder.name));
}

import { useState } from "react";

export default function FolderTree({
  folders,
  currentFolderId,
  onNavigate,
  activeSection,
  onSectionChange,
}: Props) {
  const tree = buildTree(folders);

  return (
    <div className="flex flex-col h-full py-2">
      {/* Virtual sections */}
      <div className="flex flex-col gap-0.5 px-2 mb-2">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => {
              onSectionChange(s.key);
              if (s.key !== "all") onNavigate(null);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors text-left w-full ${
              activeSection === s.key
                ? "bg-primary/10 text-primary font-medium"
                : "text-default-600 hover:bg-default-100"
            }`}
          >
            <s.icon active={activeSection === s.key} />
            {s.label}
          </button>
        ))}
      </div>

      <div className="border-t border-divider mx-3 my-1" />

      {/* Folder label */}
      <div className="px-4 py-1.5">
        <span className="text-xs font-semibold text-default-400 uppercase tracking-wider">
          Folders
        </span>
      </div>

      {/* Folder tree */}
      <div className="flex-1 overflow-y-auto px-2">
        {tree.length === 0 ? (
          <p className="text-xs text-default-400 px-3 py-2">No folders yet</p>
        ) : (
          tree.map((node) => (
            <FolderNode
              key={node.folder.id}
              node={node}
              depth={0}
              currentFolderId={currentFolderId}
              onNavigate={onNavigate}
              activeSection={activeSection}
            />
          ))
        )}
      </div>
    </div>
  );
}

function FolderNode({
  node,
  depth,
  currentFolderId,
  onNavigate,
  activeSection,
}: {
  node: TreeNode;
  depth: number;
  currentFolderId: string | null;
  onNavigate: (folderId: string | null) => void;
  activeSection: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children.length > 0;
  const isActive = activeSection === "all" && currentFolderId === node.folder.id;

  return (
    <div>
      <button
        onClick={() => {
          onNavigate(node.folder.id);
        }}
        className={`flex items-center gap-1.5 w-full rounded-lg text-sm py-1.5 pr-2 transition-colors ${
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : "text-default-600 hover:bg-default-100"
        }`}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
      >
        {/* Expand/collapse chevron */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-0.5 rounded hover:bg-default-200 transition-colors flex-shrink-0"
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        {/* Folder icon */}
        <svg className="w-4 h-4 flex-shrink-0 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
        </svg>

        <span className="truncate">{node.folder.name}</span>
      </button>

      {expanded &&
        node.children
          .sort((a, b) => a.folder.name.localeCompare(b.folder.name))
          .map((child) => (
            <FolderNode
              key={child.folder.id}
              node={child}
              depth={depth + 1}
              currentFolderId={currentFolderId}
              onNavigate={onNavigate}
              activeSection={activeSection}
            />
          ))}
    </div>
  );
}

/* ---------- Section icons ---------- */

function SectionIconAll({ active }: { active: boolean }) {
  return (
    <svg className={`w-4 h-4 ${active ? "text-primary" : "text-default-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  );
}

function SectionIconStar({ active }: { active: boolean }) {
  return (
    <svg className={`w-4 h-4 ${active ? "text-primary" : "text-default-400"}`} fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}

function SectionIconClock({ active }: { active: boolean }) {
  return (
    <svg className={`w-4 h-4 ${active ? "text-primary" : "text-default-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function SectionIconTrash({ active }: { active: boolean }) {
  return (
    <svg className={`w-4 h-4 ${active ? "text-primary" : "text-default-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
