import { useEffect, useMemo, useState } from "react";
import { Button, Spinner } from "@heroui/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  GitCommit as GitCommitIcon,
  Package,
  Plus,
  Minus,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Network,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { useGitStore } from "@/stores/gitStore";
import { useEditorStore } from "@/stores/editorStore";
import { ChangedFileRow } from "@/components/git/ChangedFileRow";
import { BranchSwitcher } from "@/components/git/BranchSwitcher";
import { StashSection } from "@/components/git/StashSection";
import { CommitList } from "@/components/git/CommitList";

interface Props {
  workspaceId: string;
}

export function GitPanel({ workspaceId }: Props) {
  const {
    status,
    log,
    branches,
    stashList,
    loadingStatus,
    loadingLog,
    activeTab,
    pendingDiscardPaths,
    fetchStatus,
    fetchLog,
    fetchBranches,
    fetchStash,
    stage,
    unstage,
    stageAll,
    unstageAll,
    commit,
    push,
    pull,
    checkout,
    requestDiscard,
    cancelDiscard,
    confirmDiscard,
    stashPush,
    stashPop,
    stashDrop,
    setActiveTab,
  } = useGitStore();

  const openDiff = useEditorStore((s) => s.openDiff);
  const openCommitDetail = useEditorStore((s) => s.openCommitDetail);
  const openGitGraph = useEditorStore((s) => s.openGitGraph);

  const [commitMsg, setCommitMsg] = useState("");
  const [amend, setAmend] = useState(false);
  const [logFilter, setLogFilter] = useState("");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    staged: true,
    modified: true,
    deleted: true,
    untracked: true,
    conflicted: true,
  });

  // Initial data load
  useEffect(() => {
    fetchStatus(workspaceId);
    fetchBranches(workspaceId);
  }, [workspaceId]);

  // Load log/stash when those tabs become active
  useEffect(() => {
    if (activeTab === "history") fetchLog(workspaceId);
    if (activeTab === "stash") fetchStash(workspaceId);
  }, [activeTab, workspaceId]);

  const filteredLog = useMemo(() => {
    if (!logFilter.trim()) return log;
    const q = logFilter.toLowerCase();
    return log.filter(
      (c) =>
        c.message.toLowerCase().includes(q) ||
        c.author.toLowerCase().includes(q) ||
        c.shortHash.toLowerCase().includes(q),
    );
  }, [log, logFilter]);

  function toggleSection(key: string) {
    setExpandedSections((s) => ({ ...s, [key]: !s[key] }));
  }

  async function handleCommit() {
    if (!commitMsg.trim()) return;
    await commit(workspaceId, commitMsg, amend);
    setCommitMsg("");
    setAmend(false);
  }

  if (loadingStatus && !status) {
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
  const deletedFiles = status.files.filter((f) => !f.staged && f.status === "deleted");
  const untrackedFiles = status.files.filter((f) => !f.staged && f.status === "untracked");
  const conflictedFiles = status.files.filter((f) => f.status === "conflicted");

  const hasChanges =
    stagedFiles.length > 0 ||
    modifiedFiles.length > 0 ||
    deletedFiles.length > 0 ||
    untrackedFiles.length > 0 ||
    conflictedFiles.length > 0;

  return (
    <div className="relative flex flex-col h-full text-sm">
      {/* ── Header ── */}
      <div className="shrink-0 p-2 border-b border-white/5 space-y-1.5">
        {/* Branch row */}
        <div className="flex items-center justify-between gap-2">
          <BranchSwitcher
            branches={branches}
            currentBranch={status.branch}
            onCheckout={(branch, create) => checkout(workspaceId, branch, create)}
          />
          <div className="flex items-center gap-0.5">
            {status.ahead > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-zinc-500">
                <ArrowUp size={10} />{status.ahead}
              </span>
            )}
            {status.behind > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-zinc-500">
                <ArrowDown size={10} />{status.behind}
              </span>
            )}
          </div>
        </div>

        {/* Compact icon toolbar */}
        <div className="flex items-center gap-0.5">
          <ToolbarBtn icon={ArrowDown} title="Pull" onClick={() => pull(workspaceId)} />
          <ToolbarBtn icon={ArrowUp} title="Push" onClick={() => push(workspaceId)} />
          <ToolbarBtn
            icon={RefreshCw}
            title="Refresh"
            spinning={loadingStatus}
            onClick={() => { fetchStatus(workspaceId); fetchBranches(workspaceId); }}
          />
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="shrink-0 flex border-b border-white/5">
        <PanelTab
          label="Commit"
          active={activeTab === "changes"}
          badge={stagedFiles.length > 0 ? stagedFiles.length : undefined}
          onClick={() => setActiveTab("changes")}
        />
        <PanelTab
          label="Log"
          active={activeTab === "history"}
          onClick={() => setActiveTab("history")}
        />
        <PanelTab
          label="Stash"
          active={activeTab === "stash"}
          onClick={() => setActiveTab("stash")}
        />
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Commit tab */}
        {activeTab === "changes" && (
          <div className="flex flex-col h-full">
            {/* Scrollable file sections */}
            <div className="flex-1 overflow-y-auto p-1">
              {!hasChanges && (
                <div className="flex flex-col items-center justify-center py-10 text-zinc-600">
                  <GitBranch size={20} className="mb-2 text-emerald-600" />
                  <p className="text-xs">Working tree clean</p>
                </div>
              )}

              {/* Conflicted */}
              {conflictedFiles.length > 0 && (
                <FileSection
                  title="Conflicts"
                  count={conflictedFiles.length}
                  expanded={expandedSections.conflicted}
                  onToggle={() => toggleSection("conflicted")}
                  actionLabel="—"
                  titleColor="text-orange-400"
                >
                  <AnimatePresence initial={false}>
                    {conflictedFiles.map((f) => (
                      <ChangedFileRow
                        key={f.path}
                        file={f}
                        onOpenDiff={() => openDiff(workspaceId, f.path, false)}
                      />
                    ))}
                  </AnimatePresence>
                </FileSection>
              )}

              {/* Staged */}
              {stagedFiles.length > 0 && (
                <FileSection
                  title="Staged"
                  count={stagedFiles.length}
                  expanded={expandedSections.staged}
                  onToggle={() => toggleSection("staged")}
                  actionLabel="Unstage all"
                  actionIcon={<Minus size={10} />}
                  onAction={() => unstageAll(workspaceId)}
                >
                  <AnimatePresence initial={false}>
                    {stagedFiles.map((f) => (
                      <ChangedFileRow
                        key={f.path}
                        file={f}
                        onUnstage={() => unstage(workspaceId, [f.path])}
                        onOpenDiff={() => openDiff(workspaceId, f.path, true)}
                      />
                    ))}
                  </AnimatePresence>
                </FileSection>
              )}

              {/* Modified */}
              {modifiedFiles.length > 0 && (
                <FileSection
                  title="Modified"
                  count={modifiedFiles.length}
                  expanded={expandedSections.modified}
                  onToggle={() => toggleSection("modified")}
                  actionLabel="Stage all"
                  actionIcon={<Plus size={10} />}
                  onAction={() => stageAll(workspaceId)}
                >
                  <AnimatePresence initial={false}>
                    {modifiedFiles.map((f) => (
                      <ChangedFileRow
                        key={f.path}
                        file={f}
                        onStage={() => stage(workspaceId, [f.path])}
                        onDiscard={() => requestDiscard([f.path])}
                        onOpenDiff={() => openDiff(workspaceId, f.path, false)}
                      />
                    ))}
                  </AnimatePresence>
                </FileSection>
              )}

              {/* Deleted */}
              {deletedFiles.length > 0 && (
                <FileSection
                  title="Deleted"
                  count={deletedFiles.length}
                  expanded={expandedSections.deleted}
                  onToggle={() => toggleSection("deleted")}
                  actionLabel="Stage all"
                  actionIcon={<Plus size={10} />}
                  onAction={() => stage(workspaceId, deletedFiles.map((f) => f.path))}
                >
                  <AnimatePresence initial={false}>
                    {deletedFiles.map((f) => (
                      <ChangedFileRow
                        key={f.path}
                        file={f}
                        onStage={() => stage(workspaceId, [f.path])}
                        onOpenDiff={() => openDiff(workspaceId, f.path, false)}
                      />
                    ))}
                  </AnimatePresence>
                </FileSection>
              )}

              {/* Untracked */}
              {untrackedFiles.length > 0 && (
                <FileSection
                  title="Untracked"
                  count={untrackedFiles.length}
                  expanded={expandedSections.untracked}
                  onToggle={() => toggleSection("untracked")}
                  actionLabel="Stage all"
                  actionIcon={<Plus size={10} />}
                  onAction={() => stage(workspaceId, untrackedFiles.map((f) => f.path))}
                >
                  <AnimatePresence initial={false}>
                    {untrackedFiles.map((f) => (
                      <ChangedFileRow
                        key={f.path}
                        file={f}
                        onStage={() => stage(workspaceId, [f.path])}
                        onOpenDiff={() => openDiff(workspaceId, f.path, false)}
                      />
                    ))}
                  </AnimatePresence>
                </FileSection>
              )}
            </div>

            {/* Commit form — fixed at bottom of tab */}
            <div className="shrink-0 p-2 border-t border-white/5 space-y-1.5">
              <textarea
                placeholder="Commit message…"
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                rows={2}
                className="w-full bg-white/[0.02] border border-white/10 rounded-lg px-2.5 py-1.5 text-zinc-200 text-xs placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50 resize-none"
              />
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={amend}
                    onChange={(e) => setAmend(e.target.checked)}
                    className="accent-violet-500 w-3 h-3"
                  />
                  Amend
                </label>
                <Button
                  size="sm"
                  color="primary"
                  className="bg-gradient-to-r from-violet-600 to-cyan-600 text-xs h-7 px-4"
                  isDisabled={!commitMsg.trim() || (stagedFiles.length === 0 && !amend)}
                  onPress={handleCommit}
                >
                  <GitCommitIcon size={11} className="mr-1" />
                  {amend ? "Amend" : "Commit"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Log tab */}
        {activeTab === "history" && (
          <div className="flex flex-col h-full">
            {/* Filter bar */}
            <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-white/5">
              <Search size={11} className="text-zinc-600 shrink-0" />
              <input
                type="text"
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
                placeholder="Filter commits…"
                className="flex-1 bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none min-w-0"
              />
              {logFilter && (
                <button
                  onClick={() => setLogFilter("")}
                  className="text-zinc-600 hover:text-zinc-300 transition-colors shrink-0"
                >
                  <X size={10} />
                </button>
              )}
              <button
                onClick={() => openGitGraph(workspaceId)}
                className="ml-1 text-zinc-600 hover:text-violet-400 transition-colors shrink-0"
                title="Open graph in editor"
              >
                <Network size={11} />
              </button>
            </div>

            {/* Commit list */}
            <div className="flex-1 overflow-y-auto">
              {loadingLog && log.length === 0 ? (
                <div className="flex justify-center py-8">
                  <Spinner size="sm" color="secondary" />
                </div>
              ) : (
                <CommitList commits={filteredLog} onSelect={(c) => openCommitDetail(workspaceId, c.hash)} />
              )}
            </div>
          </div>
        )}

        {/* Stash tab */}
        {activeTab === "stash" && (
          <div className="flex flex-col h-full">
            <div className="shrink-0 p-2 border-b border-white/5">
              <Button
                size="sm"
                variant="flat"
                className="w-full bg-white/5 text-zinc-300 hover:bg-white/10 text-xs h-7"
                onPress={() => stashPush(workspaceId)}
              >
                <Package size={11} className="mr-1" /> Stash changes
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <StashSection
                stashes={stashList}
                onPop={(index) => stashPop(workspaceId, index)}
                onDrop={(index) => stashDrop(workspaceId, index)}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Discard confirm dialog ── */}
      <AnimatePresence>
        {pendingDiscardPaths && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="w-full bg-zinc-900 border-t border-white/10 p-4 space-y-3"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-zinc-200">Discard changes?</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {pendingDiscardPaths.length === 1
                      ? pendingDiscardPaths[0]
                      : `${pendingDiscardPaths.length} files`}
                    {" "}will be permanently reverted.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="flat"
                  className="flex-1 bg-white/5 text-zinc-300 text-xs h-7"
                  onPress={cancelDiscard}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  color="danger"
                  className="flex-1 text-xs h-7"
                  onPress={() => confirmDiscard(workspaceId)}
                >
                  Discard
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────

function ToolbarBtn({
  icon: Icon,
  title,
  onClick,
  spinning,
}: {
  icon: LucideIcon;
  title: string;
  onClick: () => void;
  spinning?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 text-zinc-500 hover:text-zinc-200 rounded hover:bg-white/5 transition-colors"
    >
      <Icon size={13} className={spinning ? "animate-spin" : undefined} />
    </button>
  );
}

function PanelTab({
  label,
  active,
  badge,
  onClick,
}: {
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium transition-colors ${
        active ? "text-violet-400" : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {label}
      {badge !== undefined && (
        <span className="inline-flex items-center justify-center min-w-[14px] h-[14px] px-1 rounded-full bg-violet-500/30 text-violet-300 text-[9px] font-bold">
          {badge}
        </span>
      )}
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-violet-500 rounded-t-full" />
      )}
    </button>
  );
}

// ── Section header helper ─────────────────────────────────────────────────────

function FileSection({
  title,
  count,
  expanded,
  onToggle,
  onAction,
  actionLabel,
  actionIcon,
  children,
  titleColor,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onAction?: () => void;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  children: React.ReactNode;
  titleColor?: string;
}) {
  return (
    <div className="mb-1">
      <div className="flex items-center justify-between px-1 py-1">
        <button
          onClick={onToggle}
          className="flex items-center gap-1 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span className={`text-[11px] font-medium ${titleColor ?? "text-zinc-400"}`}>{title}</span>
          <span className="text-[10px] text-zinc-600 ml-0.5">({count})</span>
        </button>
        {onAction && count > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onAction(); }}
            className="flex items-center gap-0.5 text-[10px] text-zinc-600 hover:text-zinc-300 px-1.5 py-0.5 rounded hover:bg-white/5 transition-colors"
          >
            {actionIcon}
            {actionLabel}
          </button>
        )}
      </div>
      {expanded && <div className="space-y-px">{children}</div>}
    </div>
  );
}
