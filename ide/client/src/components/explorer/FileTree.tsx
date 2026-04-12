import { FileNode } from "./FileNode";

interface DirEntry {
  name: string;
  path: string;
  type: "file" | "directory";
}

interface Props {
  workspaceId: string;
  entries: DirEntry[];
  depth: number;
}

export function FileTree({ workspaceId, entries, depth }: Props) {
  if (entries.length === 0) {
    return depth === 0 ? (
      <div className="px-3 py-4 text-xs text-zinc-600">
        No files found
      </div>
    ) : null;
  }

  return (
    <div>
      {entries.map((entry) => (
        <FileNode
          key={entry.path}
          workspaceId={workspaceId}
          entry={entry}
          depth={depth}
        />
      ))}
    </div>
  );
}
