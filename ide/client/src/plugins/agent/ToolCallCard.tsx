// ─── Tool Call Card ───────────────────────────────────────────────────────────
//
// Collapsible card for each tool invocation.
// Styles vary by tool type: read (blue), write/edit (green), shell (amber), error (red).
//
// File-edit tool calls show an inline diff preview with Accept/Reject controls.
// Shell tool calls show an approval dialog with Approve/Deny buttons.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo, useEffect } from "react";
import { ChevronDown, ChevronRight, FileSearch, FilePenLine, Terminal, AlertCircle, Wrench } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { AgentPart } from "./agentStore";
import { InlineDiffPreview } from "@/components/editor/InlineDiffPreview";
import { AgentApprovalDialog } from "./AgentApprovalDialog";
import { useEditorStore } from "@/stores/editorStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { api } from "@/lib/api";

interface Props {
  part: AgentPart;
  resultPart?: AgentPart;
}

type ToolStyle = {
  border: string;
  bg: string;
  icon: React.ReactNode;
  label: string;
};

function getToolStyle(toolName: string | undefined, type: AgentPart["type"]): ToolStyle {
  if (type === "error") {
    return {
      border: "border-red-500/30",
      bg: "bg-red-500/5",
      icon: <AlertCircle size={12} className="text-red-400" />,
      label: "Error",
    };
  }

  const name = (toolName ?? "").toLowerCase();

  if (name.includes("read") || name.includes("cat") || name.includes("list")) {
    return {
      border: "border-blue-500/25",
      bg: "bg-blue-500/5",
      icon: <FileSearch size={12} className="text-blue-400" />,
      label: toolName ?? "Read",
    };
  }
  if (name.includes("write") || name.includes("edit") || name.includes("create")) {
    return {
      border: "border-emerald-500/25",
      bg: "bg-emerald-500/5",
      icon: <FilePenLine size={12} className="text-emerald-400" />,
      label: toolName ?? "Edit",
    };
  }
  if (name.includes("bash") || name.includes("shell") || name.includes("run") || name.includes("exec")) {
    return {
      border: "border-amber-500/25",
      bg: "bg-amber-500/5",
      icon: <Terminal size={12} className="text-amber-400" />,
      label: toolName ?? "Shell",
    };
  }

  return {
    border: "border-white/10",
    bg: "bg-white/[0.02]",
    icon: <Wrench size={12} className="text-zinc-400" />,
    label: toolName ?? "Tool",
  };
}

function formatArgs(args: unknown): string {
  if (!args) return "";
  if (typeof args === "string") return args;
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

// ── File-edit detection ──────────────────────────────────────────────────────

const FILE_EDIT_TOOLS = new Set([
  "write_file", "edit_file", "create_file",
  "write", "file_write", "file_edit",
  "patch_file", "patch", "replace",
  "overwrite_file",
]);

interface FileEditInfo {
  filePath: string;
  newContent: string;
  language: string;
}

function extractFileEditInfo(part: AgentPart): FileEditInfo | null {
  const name = (part.toolName ?? "").toLowerCase();
  const isFileEdit = FILE_EDIT_TOOLS.has(name) ||
    name.includes("write") ||
    name.includes("edit") ||
    name.includes("patch");

  if (!isFileEdit || !part.toolArgs) return null;

  const args = part.toolArgs as Record<string, unknown>;
  const filePath = (args.path ?? args.file ?? args.filePath ?? args.file_path ?? "") as string;
  const newContent = (args.content ?? args.new_content ?? args.text ?? "") as string;

  if (!filePath || !newContent) return null;

  // Derive language from file extension
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const langMap: Record<string, string> = {
    ts: "typescript", tsx: "typescript",
    js: "javascript", jsx: "javascript",
    json: "json", md: "markdown",
    py: "python", rs: "rust",
    go: "go", java: "java",
    css: "css", scss: "scss",
    html: "html", yaml: "yaml",
    yml: "yaml", toml: "toml",
    sh: "shell", bash: "shell",
    sql: "sql",
  };
  const language = langMap[ext] ?? "plaintext";

  return { filePath, newContent, language };
}

/**
 * Hook that fetches the original file content for diff comparison.
 * Returns "" if the file doesn't exist (new file) or on error.
 */
function useOriginalContent(filePath: string | null): string {
  const [content, setContent] = useState("");

  useEffect(() => {
    if (!filePath) return;

    const workspaceId = useWorkspaceStore.getState().activeWorkspace?.id;
    if (!workspaceId) return;

    // First check if the file is already open in the editor
    const { tabs } = useEditorStore.getState();
    const tab = tabs.find((t) => t.path === filePath);
    if (tab) {
      setContent(tab.content);
      return;
    }

    // Otherwise fetch from server
    let cancelled = false;
    api.workspaces
      .readFile(workspaceId, filePath)
      .then((r) => {
        if (!cancelled) setContent(r.content);
      })
      .catch(() => {
        // File may not exist yet (create_file) — show empty original
        if (!cancelled) setContent("");
      });

    return () => {
      cancelled = true;
    };
  }, [filePath]);

  return content;
}

// ── Shell command detection ──────────────────────────────────────────────────

const SHELL_TOOLS = new Set([
  "bash", "shell", "run", "exec",
  "run_command", "execute", "terminal",
  "run_shell", "shell_exec",
]);

function extractShellCommand(part: AgentPart): string | null {
  const name = (part.toolName ?? "").toLowerCase();
  const isShell = SHELL_TOOLS.has(name) ||
    name.includes("bash") ||
    name.includes("shell") ||
    name.includes("exec");

  if (!isShell || !part.toolArgs) return null;

  const args = part.toolArgs as Record<string, unknown>;
  const command = (args.command ?? args.cmd ?? args.script ?? args.input ?? "") as string;
  return command || null;
}

const motionInitial = { opacity: 0, y: 4 };
const motionAnimate = { opacity: 1, y: 0 };
const bodyInitial = { height: 0 };
const bodyAnimate = { height: "auto" };
const bodyExit = { height: 0 };
const bodyTransition = { duration: 0.15 };

export const ToolCallCard = React.memo(function ToolCallCard({ part, resultPart }: Props) {
  const [collapsed, setCollapsed] = useState(part.isCollapsed !== false);
  const style = getToolStyle(part.toolName, part.type);

  // Detect if this is a file-edit tool call
  const fileEditInfo = useMemo(() => extractFileEditInfo(part), [part]);
  const originalContent = useOriginalContent(fileEditInfo?.filePath ?? null);

  // Detect if this is a shell command tool call
  const shellCommand = useMemo(() => extractShellCommand(part), [part]);
  // Shell commands that already have a result are considered executed (not pending)
  const shellHasResult = !!resultPart;

  // Get a short summary from args
  const argsSummary = useMemo(() => {
    if (!part.toolArgs) return "";
    const a = part.toolArgs as Record<string, unknown>;
    const val = a.path ?? a.file ?? a.command ?? a.query ?? "";
    return typeof val === "string" ? val : String(val);
  }, [part.toolArgs]);

  return (
    <motion.div
      initial={motionInitial}
      animate={motionAnimate}
      className={`rounded-lg border ${style.border} ${style.bg} backdrop-blur-sm overflow-hidden text-[11px]`}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.02] transition-colors text-left"
      >
        <span className="shrink-0">{style.icon}</span>
        <span className="text-zinc-300 font-medium truncate">{style.label}</span>
        {argsSummary && (
          <span className="text-zinc-500 truncate min-w-0">
            {String(argsSummary)}
          </span>
        )}
        {part.duration !== undefined && (
          <span className="ml-auto shrink-0 text-zinc-600">
            {part.duration < 1000
              ? `${part.duration}ms`
              : `${(part.duration / 1000).toFixed(1)}s`}
          </span>
        )}
        <span className="shrink-0 text-zinc-600 ml-1">
          {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
        </span>
      </button>

      {/* Expanded body */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={bodyInitial}
            animate={bodyAnimate}
            exit={bodyExit}
            transition={bodyTransition}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.05] px-3 py-2 flex flex-col gap-2">
              {/* Inline diff preview for file edits */}
              {fileEditInfo ? (
                <InlineDiffPreview
                  filePath={fileEditInfo.filePath}
                  before={originalContent}
                  after={fileEditInfo.newContent}
                  language={fileEditInfo.language}
                />
              ) : shellCommand ? (
                <>
                  {/* Shell command approval dialog */}
                  <AgentApprovalDialog
                    command={shellCommand}
                    autoApproved={shellHasResult}
                  />

                  {/* Show stdout/stderr output below the approval card if available */}
                  {resultPart && (
                    <div>
                      <p className="text-zinc-600 mb-1 text-[10px] uppercase tracking-wide">Output</p>
                      <pre className="text-zinc-400 bg-black/30 rounded p-2 overflow-x-auto text-[10px] leading-relaxed whitespace-pre-wrap break-all max-h-40">
                        {resultPart.content || "(empty)"}
                      </pre>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Input args */}
                  {part.toolArgs != null && (
                    <div>
                      <p className="text-zinc-600 mb-1 text-[10px] uppercase tracking-wide">Input</p>
                      <pre className="text-zinc-400 bg-black/30 rounded p-2 overflow-x-auto text-[10px] leading-relaxed whitespace-pre-wrap break-all">
                        {formatArgs(part.toolArgs)}
                      </pre>
                    </div>
                  )}

                  {/* Result */}
                  {resultPart && (
                    <div>
                      <p className="text-zinc-600 mb-1 text-[10px] uppercase tracking-wide">Output</p>
                      <pre className="text-zinc-400 bg-black/30 rounded p-2 overflow-x-auto text-[10px] leading-relaxed whitespace-pre-wrap break-all max-h-40">
                        {resultPart.content || "(empty)"}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
