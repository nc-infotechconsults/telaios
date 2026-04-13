import { GitCommit as GitCommitIcon } from "lucide-react";
import type { GitCommit } from "@/types";

interface Props {
  commits: GitCommit[];
  onSelect?: (commit: GitCommit) => void;
}

export function CommitList({ commits, onSelect }: Props) {
  if (commits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-zinc-600">
        <GitCommitIcon size={24} className="mb-2" />
        <p className="text-xs">No commits</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-white/[0.03]">
      {commits.map((commit) => (
        <CommitRow key={commit.hash} commit={commit} onSelect={onSelect} />
      ))}
    </div>
  );
}

function CommitRow({ commit, onSelect }: { commit: GitCommit; onSelect?: (commit: GitCommit) => void }) {
  const refs = commit.refs.filter(Boolean);

  return (
    <div className="px-3 py-2 hover:bg-white/[0.03] group cursor-pointer" onClick={() => onSelect?.(commit)}>
      {/* Ref badges */}
      {refs.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {refs.map((ref) => (
            <RefBadge key={ref} ref_={ref} />
          ))}
        </div>
      )}

      {/* Commit message */}
      <p className="text-xs text-zinc-200 truncate leading-snug">{commit.message}</p>

      {/* Meta row */}
      <div className="flex items-center gap-2 mt-0.5">
        <span className="font-mono text-[10px] text-zinc-500 group-hover:text-violet-400 transition-colors">
          {commit.shortHash}
        </span>
        <span className="text-[10px] text-zinc-600 truncate">{commit.author}</span>
        <span className="text-[10px] text-zinc-600 ml-auto shrink-0">{commit.date}</span>
      </div>
    </div>
  );
}

function RefBadge({ ref_ }: { ref_: string }) {
  const isHead = ref_.startsWith("HEAD");
  const isTag = ref_.startsWith("tag:");
  const isRemote = ref_.includes("origin/") || ref_.includes("upstream/");

  const colors = isHead
    ? "bg-violet-500/20 text-violet-300 border-violet-500/30"
    : isTag
      ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
      : isRemote
        ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
        : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";

  const label = isTag ? ref_.replace("tag: ", "") : ref_.replace("HEAD -> ", "");

  return (
    <span className={`inline-flex items-center px-1 py-px text-[9px] font-medium rounded border ${colors}`}>
      {label}
    </span>
  );
}
