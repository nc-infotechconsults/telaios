import { useState, useRef, useCallback, useEffect } from "react";
import MonacoEditor, { type OnMount, type Monaco } from "@monaco-editor/react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import {
  Play, Trash2, AlertTriangle, ChevronDown,
  Loader2, Clock, Table2, AlertCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useDbStore } from "@/stores/dbStore";
import { useEditorStore } from "@/stores/editorStore";
import type { DbQueryResult } from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DESTRUCTIVE_RE =
  /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|REPLACE|MERGE|CREATE\s+OR\s+REPLACE)\b/i;

function isDestructive(sql: string) {
  return DESTRUCTIVE_RE.test(sql.trim());
}

// ─── Results Grid ─────────────────────────────────────────────────────────────

function ResultsGrid({ result }: { result: DbQueryResult }) {
  if (result.error) {
    return (
      <div className="flex items-start gap-2 p-4 text-red-400 text-xs">
        <AlertCircle size={14} className="shrink-0 mt-0.5" />
        <pre className="whitespace-pre-wrap break-all font-mono">{result.error}</pre>
      </div>
    );
  }

  // Non-SELECT (INSERT/UPDATE/DELETE etc.)
  if (result.columns.length === 0) {
    return (
      <div className="flex items-center gap-2 p-4 text-zinc-400 text-xs">
        <Table2 size={14} className="text-emerald-500" />
        <span>
          {result.rowCount} row{result.rowCount !== 1 ? "s" : ""} affected
          &nbsp;·&nbsp;{result.executionTimeMs}ms
        </span>
      </div>
    );
  }

  return (
    <div className="overflow-auto h-full">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-[#0f0f12] z-10">
          <tr>
            {result.columns.map((col) => (
              <th
                key={col.name}
                className="text-left px-3 py-1.5 text-zinc-400 font-medium border-b border-white/[0.06] border-r border-r-white/[0.03] whitespace-nowrap"
              >
                {col.name}
                <span className="ml-1.5 text-[10px] text-zinc-600 font-normal">{col.type}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, ri) => (
            <tr
              key={ri}
              className="hover:bg-white/[0.02] border-b border-white/[0.03]"
            >
              {result.columns.map((col) => {
                const val = row[col.name];
                const display =
                  val === null ? (
                    <span className="text-zinc-600 italic">NULL</span>
                  ) : typeof val === "object" ? (
                    JSON.stringify(val)
                  ) : (
                    String(val)
                  );
                return (
                  <td
                    key={col.name}
                    className="px-3 py-1 text-zinc-300 border-r border-white/[0.03] whitespace-nowrap max-w-[300px] truncate"
                  >
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {result.rows.length === 0 && (
        <div className="py-6 text-center text-zinc-600 text-xs">
          No rows returned
        </div>
      )}
    </div>
  );
}

// ─── Destructive Guard Modal ──────────────────────────────────────────────────

function DestructiveModal({
  sql,
  onConfirm,
  onCancel,
}: {
  sql: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-[400px] bg-[#18181b] border border-white/[0.08] rounded-2xl shadow-2xl p-5 flex flex-col gap-4"
      >
        <div className="flex items-center gap-2 text-amber-400">
          <AlertTriangle size={16} />
          <h3 className="text-sm font-semibold">Destructive Query</h3>
        </div>
        <p className="text-xs text-zinc-400">
          This query modifies or deletes data. Are you sure you want to run it?
        </p>
        <pre className="text-[11px] text-zinc-300 bg-black/30 rounded-lg p-3 border border-white/[0.06] max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono">
          {sql.slice(0, 400)}{sql.length > 400 ? "…" : ""}
        </pre>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors"
          >
            Run Anyway
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── QueryConsole ─────────────────────────────────────────────────────────────

interface Props {
  tabId: string;
  connectionId: string;
  workspaceId: string;
}

export function QueryConsole({ tabId, connectionId, workspaceId }: Props) {
  const connections = useDbStore((s) => s.connections);
  const queryResults = useDbStore((s) => s.queryResults);
  const queryLoading = useDbStore((s) => s.queryLoading);
  const executeQuery = useDbStore((s) => s.executeQuery);
  const clearResults = useDbStore((s) => s.clearResults);

  const tabs = useEditorStore((s) => s.tabs);
  const updateTabContent = useEditorStore((s) => s.updateTabContent);

  const tab = tabs.find((t) => t.id === tabId);
  const [selectedConnectionId, setSelectedConnectionId] = useState(connectionId);
  const [pendingSql, setPendingSql] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  const sqlRef = useRef(tab?.content ?? "");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  // Keep sqlRef in sync with tab content
  useEffect(() => {
    sqlRef.current = tab?.content ?? "";
  }, [tab?.content]);

  const result: DbQueryResult | null = queryResults[tabId] ?? null;
  const loading = queryLoading[tabId] ?? false;

  // Timer while query is running
  useEffect(() => {
    if (loading) {
      startTimeRef.current = Date.now();
      setElapsedMs(0);
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 50);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (result) setElapsedMs(result.executionTimeMs);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading]);

  function handleRun() {
    const sql = sqlRef.current;
    if (!sql.trim()) return;

    if (isDestructive(sql)) {
      setPendingSql(sql);
    } else {
      runSql(sql);
    }
  }

  async function runSql(sql: string) {
    await executeQuery(workspaceId, selectedConnectionId, sql, tabId);
  }

  // Stable ref to handleRun for use inside Monaco command
  const handleRunRef = useRef(handleRun);
  useEffect(() => {
    handleRunRef.current = handleRun;
  });

  const handleMount: OnMount = useCallback((editor, monaco: Monaco) => {
    monaco.editor.defineTheme("glassmorphism-dark-sql", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "", foreground: "e4e4e7", background: "0a0a0c" },
        { token: "comment", foreground: "71717a", fontStyle: "italic" },
        { token: "keyword", foreground: "c084fc" },
        { token: "string", foreground: "22d3ee" },
        { token: "number", foreground: "fbbf24" },
        { token: "operator", foreground: "a1a1aa" },
        { token: "function", foreground: "a78bfa" },
      ],
      colors: {
        "editor.background": "#0a0a0c",
        "editor.foreground": "#e4e4e7",
        "editor.lineHighlightBackground": "#1f1f23",
        "editor.selectionBackground": "#3b3b5c66",
        "editorLineNumber.foreground": "#52525b",
        "editorLineNumber.activeForeground": "#a1a1aa",
        "editorCursor.foreground": "#22d3ee",
        "editorIndentGuide.background": "#27272a",
        "scrollbarSlider.background": "#3f3f4680",
        "scrollbarSlider.hoverBackground": "#52525b80",
        "editorGutter.background": "#0a0a0c",
      },
    });
    monaco.editor.setTheme("glassmorphism-dark-sql");

    // Ctrl/Cmd + Enter → run query
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      handleRunRef.current();
    });
  }, []);

  const displayMs =
    elapsedMs !== null
      ? elapsedMs < 1000
        ? `${elapsedMs}ms`
        : `${(elapsedMs / 1000).toFixed(2)}s`
      : null;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0c]">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.05] shrink-0 bg-[#111113]/60">
        {/* Connection selector */}
        <div className="relative">
          <select
            value={selectedConnectionId}
            onChange={(e) => setSelectedConnectionId(e.target.value)}
            className="appearance-none pl-2.5 pr-7 py-1 text-xs bg-white/[0.04] border border-white/[0.08] rounded-lg text-zinc-300 focus:outline-none focus:border-violet-500/50 cursor-pointer"
          >
            {connections.map((c) => (
              <option key={c.id} value={c.id} className="bg-[#18181b]">
                {c.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={10}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
          />
        </div>

        {/* Run */}
        <button
          onClick={handleRun}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1 text-xs bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white rounded-lg transition-colors"
          title="Run (Ctrl+Enter / Cmd+Enter)"
        >
          {loading
            ? <Loader2 size={12} className="animate-spin" />
            : <Play size={12} />
          }
          Run
        </button>

        {/* Timer */}
        {displayMs && (
          <div className="flex items-center gap-1 text-xs text-zinc-500">
            <Clock size={11} />
            <span>{displayMs}</span>
          </div>
        )}

        <div className="flex-1" />

        {/* Row count */}
        {result && !result.error && result.columns.length > 0 && (
          <span className="text-xs text-zinc-500">
            {result.rowCount} row{result.rowCount !== 1 ? "s" : ""}
          </span>
        )}

        {/* Clear results */}
        {result && (
          <button
            onClick={() => clearResults(tabId)}
            className="p-1 text-zinc-500 hover:text-zinc-300 rounded transition-colors"
            title="Clear results"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* ── Editor + Results (always two panels) ── */}
      <div className="flex-1 min-h-0">
        <PanelGroup direction="vertical">
          {/* SQL Editor */}
          <Panel defaultSize={60} minSize={20} className="min-h-0">
            <MonacoEditor
              key={tabId}
              language="sql"
              value={tab?.content ?? ""}
              theme="glassmorphism-dark-sql"
              onMount={handleMount}
              onChange={(value) => {
                if (value !== undefined) {
                  updateTabContent(tabId, value);
                }
              }}
              options={{
                fontSize: 13,
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                fontLigatures: true,
                lineHeight: 20,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: "off",
                tabSize: 2,
                insertSpaces: true,
                smoothScrolling: true,
                cursorBlinking: "phase",
                automaticLayout: true,
                padding: { top: 8 },
              }}
            />
          </Panel>

          <PanelResizeHandle className="h-[3px] bg-transparent hover:bg-gradient-to-r hover:from-violet-500/50 hover:to-cyan-500/50 active:from-violet-500/80 active:to-cyan-500/80 transition-all duration-300 cursor-row-resize group flex justify-center items-center">
            <div className="h-[1px] w-8 bg-white/10 group-hover:bg-white/50 rounded-full" />
          </PanelResizeHandle>

          {/* Results panel */}
          <Panel defaultSize={40} minSize={10} className="min-h-0 bg-[#0d0d10] border-t border-white/[0.05]">
            {loading ? (
              <div className="flex items-center justify-center h-full gap-2 text-zinc-500 text-xs">
                <Loader2 size={14} className="animate-spin" />
                Running query…
              </div>
            ) : result ? (
              <ResultsGrid result={result} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-1 text-zinc-700 text-xs select-none">
                <Table2 size={20} className="mb-1" />
                <span>Results will appear here</span>
                <span className="text-[10px]">Ctrl+Enter to run</span>
              </div>
            )}
          </Panel>
        </PanelGroup>
      </div>

      {/* Destructive guard */}
      <AnimatePresence>
        {pendingSql && (
          <DestructiveModal
            sql={pendingSql}
            onConfirm={() => {
              runSql(pendingSql);
              setPendingSql(null);
            }}
            onCancel={() => setPendingSql(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
