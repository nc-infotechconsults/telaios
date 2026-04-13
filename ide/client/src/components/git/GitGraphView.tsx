import { useEffect } from "react";
import { Spinner } from "@heroui/react";
import { GitGraph } from "@/components/git/GitGraph";
import { useGitStore } from "@/stores/gitStore";
import { useEditorStore } from "@/stores/editorStore";

interface Props {
  workspaceId: string;
}

export function GitGraphView({ workspaceId }: Props) {
  const log = useGitStore((s) => s.log);
  const loadingLog = useGitStore((s) => s.loadingLog);
  const fetchLog = useGitStore((s) => s.fetchLog);
  const openCommitDetail = useEditorStore((s) => s.openCommitDetail);

  useEffect(() => {
    if (log.length === 0) fetchLog(workspaceId);
  }, [workspaceId]);

  if (loadingLog && log.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="sm" color="secondary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0c]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 shrink-0">
        <span className="text-xs font-medium text-zinc-300">Git Graph</span>
        <span className="text-[10px] text-zinc-600">{log.length} commits</span>
      </div>

      {/* Graph */}
      <div className="flex-1 overflow-auto">
        <GitGraph
          commits={log}
          onSelect={(c) => openCommitDetail(workspaceId, c.hash)}
        />
      </div>
    </div>
  );
}
