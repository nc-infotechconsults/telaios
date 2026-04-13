import { useState, useRef, useEffect } from "react";
import { ChevronDown, GitBranch, Plus, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { GitBranch as GitBranchType } from "@/types";

interface Props {
  branches: GitBranchType[];
  currentBranch: string;
  onCheckout: (branch: string, create?: boolean) => void;
}

export function BranchSwitcher({ branches, currentBranch, onCheckout }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const localBranches = branches.filter((b) => !b.name.startsWith("remotes/"));
  const remoteBranches = branches.filter((b) => b.name.startsWith("remotes/"));

  const filtered = (list: GitBranchType[]) =>
    query ? list.filter((b) => b.name.toLowerCase().includes(query.toLowerCase())) : list;

  const noResults =
    query &&
    filtered(localBranches).length === 0 &&
    filtered(remoteBranches).length === 0;

  function handleSelect(branch: GitBranchType) {
    if (branch.current) { setOpen(false); return; }
    onCheckout(branch.name);
    setOpen(false);
    setQuery("");
  }

  function handleCreate() {
    if (!query.trim()) return;
    onCheckout(query.trim(), true);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white px-2 py-1 rounded hover:bg-white/5 transition-colors max-w-[160px] truncate"
      >
        <GitBranch size={12} className="text-violet-400 shrink-0" />
        <span className="truncate">{currentBranch || "no branch"}</span>
        <ChevronDown size={10} className="shrink-0 text-zinc-500" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full left-0 mt-1 w-64 z-50 bg-zinc-900/95 backdrop-blur-md border border-white/10 rounded-lg shadow-2xl overflow-hidden"
          >
            {/* Search / new branch input */}
            <div className="p-2 border-b border-white/5">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search or create branch…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && noResults) handleCreate();
                  if (e.key === "Escape") { setOpen(false); setQuery(""); }
                }}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
              />
            </div>

            <div className="max-h-56 overflow-y-auto">
              {/* Create new branch suggestion */}
              {noResults && (
                <button
                  onClick={handleCreate}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-emerald-400 hover:bg-white/5 transition-colors"
                >
                  <Plus size={12} />
                  Create branch "{query}"
                </button>
              )}

              {/* Local branches */}
              {filtered(localBranches).length > 0 && (
                <>
                  <p className="px-3 py-1 text-[10px] font-medium text-zinc-600 uppercase tracking-wide">
                    Local
                  </p>
                  {filtered(localBranches).map((b) => (
                    <BranchItem key={b.name} branch={b} onSelect={handleSelect} />
                  ))}
                </>
              )}

              {/* Remote branches */}
              {filtered(remoteBranches).length > 0 && (
                <>
                  <p className="px-3 py-1 text-[10px] font-medium text-zinc-600 uppercase tracking-wide">
                    Remote
                  </p>
                  {filtered(remoteBranches).map((b) => (
                    <BranchItem key={b.name} branch={b} onSelect={handleSelect} />
                  ))}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BranchItem({
  branch,
  onSelect,
}: {
  branch: GitBranchType;
  onSelect: (b: GitBranchType) => void;
}) {
  const name = branch.name.replace(/^remotes\/[^/]+\//, "");
  return (
    <button
      onClick={() => onSelect(branch)}
      className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors ${
        branch.current
          ? "text-violet-300 bg-violet-500/10"
          : "text-zinc-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      {branch.current ? (
        <Check size={11} className="text-violet-400 shrink-0" />
      ) : (
        <GitBranch size={11} className="text-zinc-600 shrink-0" />
      )}
      <span className="truncate">{name}</span>
      {(branch.ahead > 0 || branch.behind > 0) && (
        <span className="ml-auto text-[10px] text-zinc-500 shrink-0">
          {branch.ahead > 0 && `↑${branch.ahead}`}
          {branch.behind > 0 && `↓${branch.behind}`}
        </span>
      )}
    </button>
  );
}
