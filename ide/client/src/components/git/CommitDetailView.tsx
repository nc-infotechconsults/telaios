import { useState } from "react";
import {
  GitCommit as GitCommitIcon,
  Copy,
  Check,
  FileCode,
  FilePlus,
  FileMinus,
  FileSymlink,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import type { GitCommitDetail, GitCommitFile } from "@/types";
import { useEditorStore } from "@/stores/editorStore";

interface Props {
  workspaceId: string;
  detail: GitCommitDetail;
}

// ── File status helpers ───────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; Icon: LucideIcon }> = {
  M: { label: "M", color: "text-amber-400",   Icon: FileCode    },
  A: { label: "A", color: "text-emerald-400", Icon: FilePlus    },
  D: { label: "D", color: "text-red-400",     Icon: FileMinus   },
  R: { label: "R", color: "text-sky-400",     Icon: FileSymlink },
  C: { label: "C", color: "text-sky-400",     Icon: FileSymlink },
  T: { label: "T", color: "text-zinc-400",    Icon: FileCode    },
};

function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, color: "text-zinc-400", Icon: FileCode };
}

// ── Ref badge ─────────────────────────────────────────────────────────────────

function RefBadge({ ref_ }: { ref_: string }) {
  const isHead   = ref_.startsWith("HEAD");
  const isTag    = ref_.startsWith("tag:");
  const isRemote = ref_.includes("origin/") || ref_.includes("upstream/");
  const colors   = isHead
    ? "bg-violet-500/20 text-violet-300 border-violet-500/30"
    : isTag
      ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
      : isRemote
        ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
        : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  const label = isTag ? ref_.replace("tag: ", "") : ref_.replace("HEAD -> ", "");
  return (
    <span className={`inline-flex items-center px-1.5 py-px text-[10px] font-medium rounded border ${colors}`}>
      {label}
    </span>
  );
}

// ── File row ──────────────────────────────────────────────────────────────────

function FileRow({
  file,
  onOpenDiff,
}: {
  file: GitCommitFile;
  onOpenDiff: () => void;
}) {
  const meta = statusMeta(file.status);
  const { Icon } = meta;
  const isRename = file.status === "R" || file.status === "C";

  return (
    <button
      type="button"
      onClick={onOpenDiff}
      className="w-full flex items-center gap-2 px-4 py-1.5 hover:bg-white/[0.04] text-left group transition-colors"
    >
      <span className={`text-[11px] font-bold font-mono w-3 shrink-0 ${meta.color}`}>
        {meta.label}
      </span>
      <Icon size={12} className={`shrink-0 ${meta.color}`} />
      <span className="flex-1 min-w-0">
        {isRename && file.oldPath ? (
          <span className="flex items-center gap-1 text-[12px]">
            <span className="text-zinc-500 truncate">{file.oldPath.split("/").pop()}</span>
            <ArrowRight size={10} className="text-zinc-600 shrink-0" />
            <span className="text-zinc-200 truncate">{file.path.split("/").pop()}</span>
          </span>
        ) : (
          <>
            <span className="text-zinc-200 text-[12px] truncate">{file.path.split("/").pop()}</span>
            <span className="text-zinc-600 text-[10px] truncate block">
              {file.path.split("/").slice(0, -1).join("/")}
            </span>
          </>
        )}
      </span>
      <span className="text-[10px] text-zinc-600 group-hover:text-violet-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100">
        Open diff →
      </span>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CommitDetailView({ workspaceId, detail }: Props) {
  const [copied, setCopied] = useState(false);
  const openCommitFileDiff = useEditorStore((s) => s.openCommitFileDiff);

  function copyHash() {
    navigator.clipboard.writeText(detail.hash).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const parentHash = detail.parentHashes[0];
  const refs = detail.refs.filter(Boolean);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0a0a0c] text-zinc-200">

      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-4 border-b border-white/[0.06] shrink-0 space-y-3">
        {/* Hash + copy + ref badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <GitCommitIcon size={14} className="text-violet-400 shrink-0" />
          <span className="font-mono text-[13px] text-violet-300">{detail.shortHash}</span>
          <button
            type="button"
            onClick={copyHash}
            className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Copy full hash"
          >
            {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
            {copied ? "Copied" : detail.hash.slice(0, 16) + "…"}
          </button>
          {refs.length > 0 && (
            <div className="flex flex-wrap gap-1 ml-1">
              {refs.map((ref) => <RefBadge key={ref} ref_={ref} />)}
            </div>
          )}
        </div>

        {/* Author + date */}
        <div className="text-[12px] text-zinc-500">
          <span className="text-zinc-400">{detail.author}</span>
          <span className="mx-1">·</span>
          <span>{detail.date}</span>
        </div>
      </div>

      {/* ── Commit message ── */}
      <div className="px-6 py-4 border-b border-white/[0.06] shrink-0">
        <p className="text-[15px] font-medium text-zinc-100 leading-snug">{detail.message}</p>
        {detail.body && (
          <p className="mt-2 text-[12px] text-zinc-400 whitespace-pre-wrap leading-relaxed">
            {detail.body}
          </p>
        )}
      </div>

      {/* ── Changed files ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-4 py-2 flex items-center gap-2 border-b border-white/[0.04]">
          <span className="text-[11px] text-zinc-500 uppercase tracking-wide font-medium">
            Changed files
          </span>
          <span className="text-[10px] bg-white/5 text-zinc-400 px-1.5 py-px rounded-full">
            {detail.files.length}
          </span>
        </div>

        {detail.files.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-zinc-600 text-sm">
            No file changes
          </div>
        ) : (
          <div className="py-1">
            {detail.files.map((file) => (
              <FileRow
                key={`${file.status}:${file.path}`}
                file={file}
                onOpenDiff={() =>
                  openCommitFileDiff(workspaceId, file, detail.hash, parentHash)
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
