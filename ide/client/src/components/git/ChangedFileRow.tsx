import { motion } from "framer-motion";
import { Plus, Minus, Trash2, FileEdit, FilePlus, FileMinus, FileWarning, GitMerge, Diff } from "lucide-react";
import type { GitFile } from "@/types";

interface Props {
  file: GitFile;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
  onOpenDiff?: () => void;
}

const STATUS_BADGE: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  modified:   { label: "M", color: "text-yellow-400",  icon: <FileEdit size={11} /> },
  added:      { label: "A", color: "text-emerald-400", icon: <FilePlus size={11} /> },
  deleted:    { label: "D", color: "text-red-400",     icon: <FileMinus size={11} /> },
  renamed:    { label: "R", color: "text-blue-400",    icon: <FileEdit size={11} /> },
  untracked:  { label: "U", color: "text-zinc-400",    icon: <FilePlus size={11} /> },
  conflicted: { label: "C", color: "text-orange-400",  icon: <FileWarning size={11} /> },
};

export function ChangedFileRow({ file, onStage, onUnstage, onDiscard, onOpenDiff }: Props) {
  const badge = STATUS_BADGE[file.status] ?? STATUS_BADGE.modified;
  const filename = file.path.split("/").pop() ?? file.path;
  const dir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";

  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -4 }}
      className="flex items-center gap-1.5 py-0.5 px-2 rounded hover:bg-white/[0.04] group"
    >
      {/* Status badge */}
      <span className={`${badge.color} shrink-0 w-4 flex justify-center`} title={file.status}>
        {badge.icon}
      </span>

      {/* File path — click opens diff */}
      <button
        onClick={onOpenDiff}
        className="flex-1 text-left min-w-0 flex items-baseline gap-1.5 overflow-hidden"
        title={file.path}
      >
        <span className="text-zinc-200 text-xs truncate shrink-0">{filename}</span>
        {dir && <span className="text-zinc-600 text-[10px] truncate">{dir}</span>}
      </button>

      {/* Action buttons — visible on hover */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {onOpenDiff && (
          <ActionBtn onClick={onOpenDiff} title="View diff">
            <Diff size={11} />
          </ActionBtn>
        )}
        {onStage && (
          <ActionBtn onClick={onStage} title="Stage">
            <Plus size={11} />
          </ActionBtn>
        )}
        {onUnstage && (
          <ActionBtn onClick={onUnstage} title="Unstage">
            <Minus size={11} />
          </ActionBtn>
        )}
        {onDiscard && (
          <ActionBtn onClick={onDiscard} title="Discard changes" danger>
            <Trash2 size={11} />
          </ActionBtn>
        )}
      </div>
    </motion.div>
  );
}

function ActionBtn({
  onClick,
  title,
  danger,
  children,
}: {
  onClick: () => void;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      className={`p-0.5 rounded ${
        danger
          ? "text-zinc-600 hover:text-red-400 hover:bg-red-500/10"
          : "text-zinc-600 hover:text-zinc-300 hover:bg-white/5"
      } transition-colors`}
    >
      {children}
    </button>
  );
}
