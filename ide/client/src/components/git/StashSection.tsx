import { Package, ArchiveRestore, Trash2 } from "lucide-react";
import type { GitStash } from "@/types";

interface Props {
  stashes: GitStash[];
  onPop: (index: string) => void;
  onDrop: (index: string) => void;
}

export function StashSection({ stashes, onPop, onDrop }: Props) {
  if (stashes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-zinc-600">
        <Package size={24} className="mb-2" />
        <p className="text-xs">No stashes</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {stashes.map((stash) => (
        <div
          key={stash.index}
          className="flex items-center gap-2 px-2 py-2 rounded hover:bg-white/[0.03] group"
        >
          <Package size={12} className="text-zinc-500 shrink-0" />

          <div className="flex-1 min-w-0">
            <p className="text-xs text-zinc-300 truncate">{stash.message}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-zinc-600 font-mono">{stash.index}</span>
              {stash.date && (
                <span className="text-[10px] text-zinc-600">{stash.date}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={() => onPop(stash.index)}
              title="Apply stash"
              className="p-1 text-zinc-600 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
            >
              <ArchiveRestore size={12} />
            </button>
            <button
              onClick={() => onDrop(stash.index)}
              title="Drop stash"
              className="p-1 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
