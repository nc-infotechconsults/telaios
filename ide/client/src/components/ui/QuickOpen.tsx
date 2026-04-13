// ─── QuickOpen ───────────────────────────────────────────────────────────────
//
// VS Code "Quick Open" / JetBrains "Go to File" style file finder.
// Fuzzy-searches all files in the workspace file tree.
//
// Features:
//   - Fuzzy file search with match highlighting
//   - Keyboard navigation (Up/Down, Enter, Escape)
//   - Shows relative file path + directory context
//   - Recently-opened files appear first when query is empty
//   - Opens via Ctrl+P / Cmd+P (registered as `quickOpen.show`)
// ──────────────────────────────────────────────────────────────────────────────

import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { create } from "zustand";
import { motion, AnimatePresence } from "framer-motion";
import { useFileTreeStore, type DirEntry } from "@/stores/fileTreeStore";
import { useEditorStore } from "@/stores/editorStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { FileCode, FileJson, FileText, File as FileIcon, Search } from "lucide-react";

// ─── QuickOpen Store ──────────────────────────────────────────────────────────

interface QuickOpenStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useQuickOpenStore = create<QuickOpenStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));

export const openQuickOpen = () => useQuickOpenStore.getState().open();
export const closeQuickOpen = () => useQuickOpenStore.getState().close();
export const toggleQuickOpen = () => useQuickOpenStore.getState().toggle();

// ─── File Icon Mapping ────────────────────────────────────────────────────────

function fileIconForPath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "py":
    case "rs":
    case "go":
    case "java":
    case "rb":
    case "cpp":
    case "c":
    case "cs":
    case "swift":
    case "kt":
    case "sh":
    case "bash":
      return FileCode;
    case "json":
    case "yaml":
    case "yml":
    case "toml":
      return FileJson;
    case "md":
    case "txt":
    case "rst":
      return FileText;
    default:
      return FileIcon;
  }
}

// ─── Fuzzy Scoring ────────────────────────────────────────────────────────────

interface FuzzyResult {
  score: number;
  indices: number[];
}

function fuzzyMatch(query: string, text: string): FuzzyResult | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  if (q.length === 0) return { score: 0, indices: [] };

  let qi = 0;
  let score = 0;
  const indices: number[] = [];
  let prevMatchIdx = -2;

  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      indices.push(i);

      // Consecutive match bonus
      if (i === prevMatchIdx + 1) score += 10;

      // Word boundary bonus (after /, ., -, _)
      if (i === 0 || "/.-_".includes(t[i - 1])) score += 5;

      // Filename (last segment) match bonus
      const lastSlash = t.lastIndexOf("/");
      if (i > lastSlash) score += 3;

      // Early match bonus
      score += Math.max(0, 10 - i);

      prevMatchIdx = i;
      qi++;
    }
  }

  if (qi < q.length) return null;
  return { score, indices };
}

// ─── Highlighted Text ─────────────────────────────────────────────────────────

function HighlightedText({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <span>{text}</span>;

  const parts: { text: string; highlight: boolean }[] = [];
  let lastIdx = 0;

  for (const idx of indices) {
    if (idx > lastIdx) {
      parts.push({ text: text.slice(lastIdx, idx), highlight: false });
    }
    parts.push({ text: text[idx], highlight: true });
    lastIdx = idx + 1;
  }

  if (lastIdx < text.length) {
    parts.push({ text: text.slice(lastIdx), highlight: false });
  }

  return (
    <span>
      {parts.map((part, i) =>
        part.highlight ? (
          <span key={i} className="text-violet-400 font-semibold">
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </span>
  );
}

// ─── Flatten file tree to paths ───────────────────────────────────────────────

function flattenFilePaths(dirCache: Record<string, DirEntry[]>): string[] {
  const paths: string[] = [];

  function traverse(dirPath: string) {
    const entries = dirCache[dirPath] ?? [];
    for (const entry of entries) {
      if (entry.type === "file") {
        paths.push(entry.path);
      } else if (entry.type === "directory") {
        traverse(entry.path);
      }
    }
  }

  traverse(".");
  return paths;
}

// ─── Scored File Result ───────────────────────────────────────────────────────

interface ScoredFile {
  path: string;
  match: FuzzyResult;
}

// ─── QuickOpen Component ──────────────────────────────────────────────────────

export function QuickOpen() {
  const isOpen = useQuickOpenStore((s) => s.isOpen);
  const close = useQuickOpenStore((s) => s.close);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && <QuickOpenInner onClose={close} />}
    </AnimatePresence>
  );
}

function QuickOpenInner({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const dirCache = useFileTreeStore((s) => s.dirCache);
  const openTabPaths = useEditorStore((s) => s.tabs.map((t) => t.path));

  // Flatten all file paths from the tree
  const allFiles = useMemo(() => flattenFilePaths(dirCache), [dirCache]);

  // Filter + score files
  const results: ScoredFile[] = useMemo(() => {
    if (!query.trim()) {
      // When empty, show recently opened files first, then all files
      const openSet = new Set(openTabPaths);
      const recent: ScoredFile[] = [];
      const rest: ScoredFile[] = [];

      for (const path of allFiles) {
        const item: ScoredFile = { path, match: { score: 0, indices: [] } };
        if (openSet.has(path)) {
          recent.push(item);
        } else {
          rest.push(item);
        }
      }

      return [...recent, ...rest].slice(0, 50);
    }

    const scored: ScoredFile[] = [];

    for (const path of allFiles) {
      const match = fuzzyMatch(query, path);
      if (match) {
        scored.push({ path, match });
      }
    }

    scored.sort((a, b) => b.match.score - a.match.score);
    return scored.slice(0, 50);
  }, [query, allFiles, openTabPaths]);

  // Focus input on mount
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const openSelected = useCallback(() => {
    const selected = results[selectedIndex];
    if (selected) {
      onClose();
      const ws = useWorkspaceStore.getState().activeWorkspace;
      if (ws) {
        requestAnimationFrame(() => {
          useEditorStore.getState().openTab(ws.id, selected.path);
        });
      }
    }
  }, [results, selectedIndex, onClose]);

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          openSelected();
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [results.length, openSelected, onClose],
  );

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]"
        onClick={onClose}
      />

      {/* Dialog */}
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.98 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="fixed top-[15%] left-1/2 -translate-x-1/2 w-[min(540px,calc(100vw-32px))] z-[101]"
      >
        <div className="bg-[#18181b]/95 backdrop-blur-xl border border-white/[0.1] rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.06]">
            <Search size={16} className="text-zinc-500 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Go to file..."
              className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
            />
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-zinc-500 bg-white/[0.04] border border-white/[0.08] rounded">
              esc
            </kbd>
          </div>

          {/* File list */}
          <div
            ref={listRef}
            className="max-h-[min(400px,50vh)] overflow-y-auto py-1"
          >
            {results.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-zinc-600">
                {query ? "No files found" : "No files in workspace"}
              </div>
            ) : (
              results.map((result, index) => {
                const Icon = fileIconForPath(result.path);
                const fileName = result.path.split("/").pop() ?? result.path;
                const dirPath = result.path.includes("/")
                  ? result.path.slice(0, result.path.lastIndexOf("/"))
                  : "";
                const isSelected = index === selectedIndex;

                return (
                  <button
                    key={result.path}
                    className={[
                      "w-full flex items-center gap-2.5 px-4 py-1.5 text-left transition-colors",
                      isSelected
                        ? "bg-violet-500/10 text-zinc-100"
                        : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200",
                    ].join(" ")}
                    onClick={() => {
                      setSelectedIndex(index);
                      openSelected();
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <Icon size={14} className="shrink-0 text-zinc-500" />
                    <span className="flex-1 min-w-0 flex items-baseline gap-2 overflow-hidden">
                      <span className="text-xs font-medium truncate">
                        <HighlightedText text={fileName} indices={
                          // Adjust indices to be relative to the filename portion
                          result.match.indices
                            .filter((i) => i >= result.path.length - fileName.length)
                            .map((i) => i - (result.path.length - fileName.length))
                        } />
                      </span>
                      {dirPath && (
                        <span className="text-[10px] text-zinc-600 truncate">
                          {dirPath}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-white/[0.06] text-[10px] text-zinc-600">
            <span>{results.length} file{results.length !== 1 ? "s" : ""}</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 bg-white/[0.04] border border-white/[0.08] rounded">
                  ↑↓
                </kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 bg-white/[0.04] border border-white/[0.08] rounded">
                  ↵
                </kbd>
                open
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}
