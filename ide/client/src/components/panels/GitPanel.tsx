import { useState, useEffect } from "react";
import { Button, Spinner } from "@heroui/react";
import { addToast } from "@heroui/toast";
import { api } from "@/lib/api";
import { useEditorStore } from "@/stores/editorStore";
import { motion } from "framer-motion";
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  Plus,
  Minus,
  Check,
  ArrowUp,
  ArrowDown,
  FileEdit,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
  Diff,
} from "lucide-react";

interface GitStatusFile {
  path: string;
  status: string;
  staged: boolean;
}

interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  files: GitStatusFile[];
  isClean: boolean;
}

interface Props {
  workspaceId: string;
}

export function GitPanel({ workspaceId }: Props) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [showStageAll, setShowStageAll] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    staged: true,
    modified: true,
    untracked: true,
  });
  const openTab = useEditorStore((s) => s.openTab);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const data = await api.git.status(workspaceId);
      setStatus(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load git status";
      addToast({ title: "Git error", description: msg, color: "danger" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [workspaceId]);

  async function handleStage(paths: string[]) {
    try {
      await api.git.stage(workspaceId, paths);
      await fetchStatus();
      addToast({ title: "Staged", description: `${paths.length} file(s) staged`, color: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to stage";
      addToast({ title: "Staging failed", description: msg, color: "danger" });
    }
  }

  async function handleUnstage(paths: string[]) {
    try {
      await api.git.unstage(workspaceId, paths);
      await fetchStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to unstage";
      addToast({ title: "Unstage failed", description: msg, color: "danger" });
    }
  }

  async function handleStageAll() {
    try {
      await api.git.stageAll(workspaceId);
      await fetchStatus();
      addToast({ title: "Staged", description: "All changes staged", color: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to stage all";
      addToast({ title: "Staging failed", description: msg, color: "danger" });
    }
  }

  async function handleCommit() {
    if (!commitMsg.trim()) return;
    setCommitting(true);
    try {
      await api.git.commit(workspaceId, commitMsg);
      setCommitMsg("");
      await fetchStatus();
      addToast({ title: "Committed", description: "Changes committed successfully", color: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to commit";
      addToast({ title: "Commit failed", description: msg, color: "danger" });
    } finally {
      setCommitting(false);
    }
  }

  async function handlePush() {
    try {
      await api.git.push(workspaceId);
      await fetchStatus();
      addToast({ title: "Pushed", description: "Changes pushed", color: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to push";
      addToast({ title: "Push failed", description: msg, color: "danger" });
    }
  }

  async function handlePull() {
    try {
      await api.git.pull(workspaceId);
      await fetchStatus();
      addToast({ title: "Pulled", description: "Changes pulled", color: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to pull";
      addToast({ title: "Pull failed", description: msg, color: "danger" });
    }
  }

  function toggleSection(section: string) {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="sm" color="secondary" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <GitBranch size={32} className="text-zinc-600 mb-3" />
        <p className="text-zinc-400 text-sm">Not a git repository</p>
      </div>
    );
  }

  const stagedFiles = status.files.filter((f) => f.staged);
  const modifiedFiles = status.files.filter((f) => !f.staged && f.status === "modified");
  const untrackedFiles = status.files.filter((f) => !f.staged && f.status === "untracked");
  const totalChanges = stagedFiles.length + modifiedFiles.length + untrackedFiles.length;

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="p-3 border-b border-white/5">
        <div className="flex items-center gap-2 mb-2">
          <GitBranch size={14} className="text-violet-400" />
          <span className="text-zinc-200 font-medium">{status.branch}</span>
          {(status.ahead > 0 || status.behind > 0) && (
            <div className="flex items-center gap-1 text-xs text-zinc-500">
              {status.ahead > 0 && (
                <span className="flex items-center gap-0.5">
                  <ArrowUp size={12} />{status.ahead}
                </span>
              )}
              {status.behind > 0 && (
                <span className="flex items-center gap-0.5">
                  <ArrowDown size={12} />{status.behind}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="flat"
            onPress={handlePull}
            className="bg-white/5 text-zinc-300 hover:bg-white/10 text-xs h-7"
          >
            <ArrowDown size={12} className="mr-1" /> Pull
          </Button>
          <Button
            size="sm"
            variant="flat"
            onPress={handlePush}
            className="bg-white/5 text-zinc-300 hover:bg-white/10 text-xs h-7"
          >
            <ArrowUp size={12} className="mr-1" /> Push
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {totalChanges > 0 && (
          <>
            <SectionHeader
              title="Staged Changes"
              count={stagedFiles.length}
              expanded={expandedSections.staged}
              onToggle={() => toggleSection("staged")}
              onAction={stagedFiles.length > 0 ? () => handleUnstage(stagedFiles.map(f => f.path)) : undefined}
              actionIcon={<Minus size={12} />}
            />
            {expandedSections.staged && (
              <div className="space-y-0.5 mb-2">
                {stagedFiles.map((f) => (
                  <FileRow key={f.path} path={f.path} status="staged" onAction={() => handleUnstage([f.path])} actionIcon={<Minus size={12} />} onClick={() => openTab(workspaceId, f.path)} />
                ))}
              </div>
            )}

            <SectionHeader
              title="Modified"
              count={modifiedFiles.length}
              expanded={expandedSections.modified}
              onToggle={() => toggleSection("modified")}
              onAction={modifiedFiles.length > 0 ? () => handleStage(modifiedFiles.map(f => f.path)) : undefined}
              actionIcon={<Plus size={12} />}
            />
            {expandedSections.modified && (
              <div className="space-y-0.5 mb-2">
                {modifiedFiles.map((f) => (
                  <FileRow key={f.path} path={f.path} status="modified" onAction={() => handleStage([f.path])} actionIcon={<Plus size={12} />} onClick={() => openTab(workspaceId, f.path)} />
                ))}
              </div>
            )}

            <SectionHeader
              title="Untracked"
              count={untrackedFiles.length}
              expanded={expandedSections.untracked}
              onToggle={() => toggleSection("untracked")}
              onAction={untrackedFiles.length > 0 ? () => handleStage(untrackedFiles.map(f => f.path)) : undefined}
              actionIcon={<Plus size={12} />}
            />
            {expandedSections.untracked && (
              <div className="space-y-0.5 mb-2">
                {untrackedFiles.map((f) => (
                  <FileRow key={f.path} path={f.path} status="untracked" onAction={() => handleStage([f.path])} actionIcon={<Plus size={12} />} onClick={() => openTab(workspaceId, f.path)} />
                ))}
              </div>
            )}
          </>
        )}

        {totalChanges === 0 && !status.isClean && (
          <div className="text-center py-8 text-zinc-500">
            <Check size={24} className="mx-auto mb-2 text-emerald-500" />
            <p className="text-sm">Working tree clean</p>
          </div>
        )}

        {status.isClean && (
          <div className="text-center py-8 text-zinc-500">
            <Check size={24} className="mx-auto mb-2 text-emerald-500" />
            <p className="text-sm">Working tree clean</p>
          </div>
        )}
      </div>

      {totalChanges > 0 && (
        <div className="p-3 border-t border-white/5 space-y-2">
          <input
            type="text"
            placeholder="Commit message..."
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            className="w-full bg-white/[0.02] border border-white/10 rounded-lg px-3 py-2 text-zinc-200 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
          />
          <Button
            size="sm"
            color="primary"
            className="w-full bg-gradient-to-r from-violet-600 to-cyan-600 text-xs h-8"
            isLoading={committing}
            isDisabled={!commitMsg.trim() || stagedFiles.length === 0}
            onPress={handleCommit}
          >
            <GitCommit size={12} className="mr-1" /> Commit
          </Button>
        </div>
      )}
    </div>
  );
}

function SectionHeader({
  title,
  count,
  expanded,
  onToggle,
  onAction,
  actionIcon,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onAction?: () => void;
  actionIcon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 px-1">
      <button onClick={onToggle} className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200">
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="text-xs font-medium">{title}</span>
        <span className="text-xs text-zinc-600">({count})</span>
      </button>
      {onAction && (
        <button
          onClick={(e) => { e.stopPropagation(); onAction(); }}
          className="text-zinc-600 hover:text-zinc-300 p-1 rounded hover:bg-white/5"
        >
          {actionIcon}
        </button>
      )}
    </div>
  );
}

function FileRow({
  path,
  status,
  onAction,
  actionIcon,
  onClick,
}: {
  path: string;
  status: string;
  onAction: () => void;
  actionIcon: React.ReactNode;
  onClick: () => void;
}) {
  const statusColors: Record<string, string> = {
    staged: "text-emerald-400",
    modified: "text-yellow-400",
    untracked: "text-zinc-400",
    conflicted: "text-red-400",
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -5 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-2 py-1 px-2 rounded hover:bg-white/[0.03] group"
    >
      <span className={`${statusColors[status]} shrink-0`}>
        {status === "staged" ? <Check size={12} /> : status === "modified" ? <FileEdit size={12} /> : <Plus size={12} />}
      </span>
      <button onClick={onClick} className="flex-1 text-left text-zinc-300 text-xs truncate hover:text-white">
        {path}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onAction(); }}
        className="text-zinc-600 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
      >
        {actionIcon}
      </button>
    </motion.div>
  );
}