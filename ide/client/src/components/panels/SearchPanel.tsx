// ─── Search & Replace Panel ───────────────────────────────────────────────────
//
// Full-featured search with replace, regex, case sensitivity, whole word,
// file include/exclude filters, and grouped results.
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useMemo, useEffect } from "react";
import { notify } from "@/stores/notificationStore";
import { api } from "@/lib/api";
import { useEditorStore } from "@/stores/editorStore";
import {
  Search as SearchIcon,
  FileText,
  Loader2,
  Replace,
  ChevronDown,
  ChevronRight,
  CaseSensitive,
  Regex,
  WholeWord,
  Filter,
  ReplaceAll,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  path: string;
  line: number;
  preview: string;
}

interface GroupedResult {
  path: string;
  matches: SearchResult[];
}

interface Props {
  workspaceId: string;
  /** When true, the replace input starts open (used by Ctrl+Shift+H) */
  initialReplaceOpen?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupByFile(results: SearchResult[]): GroupedResult[] {
  const map = new Map<string, SearchResult[]>();
  for (const r of results) {
    const existing = map.get(r.path);
    if (existing) {
      existing.push(r);
    } else {
      map.set(r.path, [r]);
    }
  }
  return Array.from(map.entries()).map(([path, matches]) => ({ path, matches }));
}

function highlightMatch(preview: string, query: string, isRegex: boolean, caseSensitive: boolean): React.ReactNode {
  if (!query) return preview;
  try {
    const pattern = isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const flags = caseSensitive ? "g" : "gi";
    const re = new RegExp(`(${pattern})`, flags);
    const parts = preview.split(re);
    if (parts.length <= 1) return preview;
    return parts.map((part, i) =>
      re.test(part) ? (
        <span key={i} className="bg-amber-500/30 text-amber-200 rounded-sm px-0.5">
          {part}
        </span>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  } catch {
    return preview;
  }
}

// ─── Toggle Button ────────────────────────────────────────────────────────────

function ToggleBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1 rounded transition-colors ${
        active
          ? "bg-violet-500/25 text-violet-300 ring-1 ring-violet-500/40"
          : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06]"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Search Signals ───────────────────────────────────────────────────────────
// Module-level signal so external commands (Ctrl+Shift+H) can tell the panel
// to open its replace input after mount.

type SearchSignalListener = (signal: "showReplace") => void;
const listeners = new Set<SearchSignalListener>();

/** Call from commands to tell the mounted SearchPanel to open replace. */
export function signalSearchShowReplace(): void {
  for (const fn of listeners) fn("showReplace");
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SearchPanel({ workspaceId, initialReplaceOpen }: Props) {
  // Search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Toggle flags
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);

  // Replace state
  const [replaceOpen, setReplaceOpen] = useState(initialReplaceOpen ?? false);
  const [replacement, setReplacement] = useState("");
  const [replacing, setReplacing] = useState(false);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [includePattern, setIncludePattern] = useState("");
  const [excludePattern, setExcludePattern] = useState("");

  // Collapsed file groups
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());

  const openTab = useEditorStore((s) => s.openTab);

  // Listen for external signals (e.g. Ctrl+Shift+H → open replace)
  useEffect(() => {
    const handler: SearchSignalListener = (signal) => {
      if (signal === "showReplace") setReplaceOpen(true);
    };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  // ── Search ─────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const data = await api.workspaces.search(workspaceId, query, {
        caseSensitive,
        regex: useRegex,
        wholeWord,
        include: includePattern || undefined,
        exclude: excludePattern || undefined,
      });
      setResults(data);
      setCollapsedPaths(new Set());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Search failed";
      notify({ title: "Search failed", description: msg, type: "error" });
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, query, caseSensitive, useRegex, wholeWord, includePattern, excludePattern]);

  // ── Replace ────────────────────────────────────────────────────────────────

  const handleReplaceAll = useCallback(async () => {
    if (!query.trim()) return;
    setReplacing(true);
    try {
      const result = await api.workspaces.searchReplace(workspaceId, query, replacement, {
        caseSensitive,
        regex: useRegex,
        wholeWord,
        include: includePattern || undefined,
        exclude: excludePattern || undefined,
      });
      notify({
        title: "Replace complete",
        description: `Replaced ${result.totalReplacements} occurrence${result.totalReplacements !== 1 ? "s" : ""} in ${result.filesChanged} file${result.filesChanged !== 1 ? "s" : ""}`,
        type: "success",
      });
      // Re-run search to update results
      await handleSearch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Replace failed";
      notify({ title: "Replace failed", description: msg, type: "error" });
    } finally {
      setReplacing(false);
    }
  }, [workspaceId, query, replacement, caseSensitive, useRegex, wholeWord, includePattern, excludePattern, handleSearch]);

  const handleReplaceInFile = useCallback(
    async (filePath: string) => {
      if (!query.trim()) return;
      setReplacing(true);
      try {
        const result = await api.workspaces.searchReplace(workspaceId, query, replacement, {
          caseSensitive,
          regex: useRegex,
          wholeWord,
          filePaths: [filePath],
        });
        notify({
          title: "Replaced in file",
          description: `${result.totalReplacements} occurrence${result.totalReplacements !== 1 ? "s" : ""} in ${filePath}`,
          type: "success",
        });
        await handleSearch();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Replace failed";
        notify({ title: "Replace failed", description: msg, type: "error" });
      } finally {
        setReplacing(false);
      }
    },
    [workspaceId, query, replacement, caseSensitive, useRegex, wholeWord, handleSearch],
  );

  // ── Grouped results ────────────────────────────────────────────────────────

  const grouped = useMemo(() => groupByFile(results), [results]);

  function toggleCollapsed(path: string) {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function handleResultClick(result: SearchResult) {
    openTab(workspaceId, result.path);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Search inputs */}
      <div className="p-3 border-b border-white/5 space-y-2">
        {/* Search row */}
        <div className="flex items-center gap-1.5">
          <div className="flex-1 flex items-center bg-white/[0.02] border border-white/10 hover:border-white/20 focus-within:!border-violet-500/50 transition-all rounded-lg h-8 px-2 gap-1.5">
            {loading ? (
              <Loader2 size={13} className="animate-spin text-zinc-500 shrink-0" />
            ) : (
              <SearchIcon size={13} className="text-zinc-500 shrink-0" />
            )}
            <input
              type="text"
              placeholder="Search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1 bg-transparent text-zinc-100 text-sm outline-none placeholder-zinc-600"
            />
          </div>
          <ToggleBtn active={caseSensitive} onClick={() => setCaseSensitive((v) => !v)} title="Case Sensitive">
            <CaseSensitive size={14} />
          </ToggleBtn>
          <ToggleBtn active={wholeWord} onClick={() => setWholeWord((v) => !v)} title="Whole Word">
            <WholeWord size={14} />
          </ToggleBtn>
          <ToggleBtn active={useRegex} onClick={() => setUseRegex((v) => !v)} title="Regex">
            <Regex size={14} />
          </ToggleBtn>
        </div>

        {/* Replace row (collapsible) */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setReplaceOpen((v) => !v)}
            className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors"
            title={replaceOpen ? "Hide Replace" : "Show Replace"}
          >
            {replaceOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          {replaceOpen && (
            <>
              <div className="flex-1 flex items-center bg-white/[0.02] border border-white/10 hover:border-white/20 focus-within:!border-violet-500/50 transition-all rounded-lg h-8 px-2 gap-1.5">
                <Replace size={13} className="text-zinc-500 shrink-0" />
                <input
                  type="text"
                  placeholder="Replace..."
                  value={replacement}
                  onChange={(e) => setReplacement(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.ctrlKey) handleReplaceAll();
                  }}
                  className="flex-1 bg-transparent text-zinc-100 text-sm outline-none placeholder-zinc-600"
                />
              </div>
              <button
                type="button"
                onClick={handleReplaceAll}
                disabled={replacing || !query.trim()}
                className="p-1 rounded text-zinc-500 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors disabled:opacity-30"
                title="Replace All (Ctrl+Enter)"
              >
                <ReplaceAll size={14} />
              </button>
            </>
          )}
        </div>

        {/* Filter toggles */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] transition-colors ${
              showFilters ? "text-violet-300 bg-violet-500/15" : "text-zinc-500 hover:text-zinc-300"
            }`}
            title="Toggle file filters"
          >
            <Filter size={11} />
            Filters
          </button>
          {results.length > 0 && (
            <span className="text-[11px] text-zinc-500 ml-auto">
              {results.length} result{results.length !== 1 ? "s" : ""} in {grouped.length} file{grouped.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* File include/exclude inputs */}
        {showFilters && (
          <div className="space-y-1.5 pl-1">
            <input
              type="text"
              placeholder="Files to include (e.g. *.ts, src/**)"
              value={includePattern}
              onChange={(e) => setIncludePattern(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full bg-white/[0.02] border border-white/10 hover:border-white/20 focus:!border-violet-500/50 transition-all rounded-md h-7 px-2 text-xs text-zinc-100 outline-none placeholder-zinc-600"
            />
            <input
              type="text"
              placeholder="Files to exclude (e.g. node_modules/**, *.min.js)"
              value={excludePattern}
              onChange={(e) => setExcludePattern(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full bg-white/[0.02] border border-white/10 hover:border-white/20 focus:!border-violet-500/50 transition-all rounded-md h-7 px-2 text-xs text-zinc-100 outline-none placeholder-zinc-600"
            />
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {results.length === 0 && query && !loading && (
          <p className="text-zinc-500 text-xs text-center py-8">
            No results found
          </p>
        )}

        {grouped.map((group) => {
          const collapsed = collapsedPaths.has(group.path);
          return (
            <div key={group.path}>
              {/* File header */}
              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-white/[0.02] border-b border-white/[0.04] sticky top-0 z-10">
                <button
                  type="button"
                  onClick={() => toggleCollapsed(group.path)}
                  className="p-0.5 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                </button>
                <FileText size={13} className="text-violet-400 shrink-0" />
                <span className="text-xs text-zinc-200 font-medium truncate flex-1">
                  {group.path}
                </span>
                <span className="text-[10px] text-zinc-500 shrink-0">
                  {group.matches.length}
                </span>
                {replaceOpen && (
                  <button
                    type="button"
                    onClick={() => handleReplaceInFile(group.path)}
                    disabled={replacing}
                    className="p-0.5 rounded text-zinc-500 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors disabled:opacity-30"
                    title="Replace all in this file"
                  >
                    <ReplaceAll size={12} />
                  </button>
                )}
              </div>

              {/* Matches */}
              {!collapsed &&
                group.matches.map((result, idx) => (
                  <button
                    key={`${result.path}:${result.line}:${idx}`}
                    type="button"
                    onClick={() => handleResultClick(result)}
                    className="w-full text-left px-3 py-1.5 pl-8 hover:bg-white/[0.04] transition-colors group flex items-start gap-2"
                  >
                    <span className="text-zinc-600 text-[11px] shrink-0 font-mono w-8 text-right">
                      {result.line}
                    </span>
                    <span className="text-xs font-mono truncate text-zinc-400 group-hover:text-zinc-300 flex-1">
                      {highlightMatch(result.preview, query, useRegex, caseSensitive)}
                    </span>
                  </button>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
