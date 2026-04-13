import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useStatusBarStore } from "@/stores/statusBarStore";
import { contextKeyService } from "@/core/context-keys";
import { api } from "@/lib/api";
import { ws } from "@/lib/ws";
import { commandRegistry } from "@/core/commands";
import { GitBranch } from "lucide-react";

interface Props {
  workspaceId: string;
}

export function StatusBar({ workspaceId }: Props) {
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const tabs = useEditorStore((s) => s.tabs);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);

  const [branch, setBranch] = useState<string>("");
  const [wsConnected, setWsConnected] = useState(false);

  // Plugin-contributed status bar items
  const storeItems = useStatusBarStore((s) => s.items);

  // Re-evaluate `when` clauses when context keys change
  const [, setCtxTick] = useState(0);
  useEffect(() => {
    const d = contextKeyService.onChange(() => setCtxTick((n) => n + 1));
    return () => d.dispose();
  }, []);

  const leftItems = useMemo(
    () =>
      Object.values(storeItems)
        .filter(
          (i) =>
            i.alignment === "left" &&
            i.visible !== false &&
            contextKeyService.evaluate(i.when),
        )
        .sort((a, b) => a.priority - b.priority),
    [storeItems],
  );

  const rightItems = useMemo(
    () =>
      Object.values(storeItems)
        .filter(
          (i) =>
            i.alignment === "right" &&
            i.visible !== false &&
            contextKeyService.evaluate(i.when),
        )
        .sort((a, b) => a.priority - b.priority),
    [storeItems],
  );

  useEffect(() => {
    api.git.status(workspaceId).then((s) => setBranch(s.branch)).catch(() => {});
  }, [workspaceId]);

  useEffect(() => {
    const unsub = ws.onStatus(setWsConnected);
    return unsub;
  }, []);

  function handleItemClick(commandId?: string) {
    if (commandId) commandRegistry.execute(commandId).catch(() => {});
  }

  function renderContent(content: string | ComponentType) {
    if (typeof content === "string") return content;
    const Content = content;
    return <Content />;
  }

  return (
    <div className="flex items-center justify-between px-3 h-7 bg-white/[0.03] backdrop-blur-md border-t border-white/[0.05] text-xs text-zinc-400 shrink-0 select-none z-10">
      {/* Left */}
      <div className="flex items-center gap-4">
        {/* WS indicator */}
        <span className="relative flex h-2 w-2">
          {wsConnected && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          )}
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${wsConnected ? "bg-gradient-to-r from-emerald-400 to-cyan-400" : "bg-red-500"}`}
            title={wsConnected ? "Connected" : "Disconnected"}
          />
        </span>
        {branch && (
          <span className="flex items-center gap-1.5 text-zinc-300 font-medium">
            <GitBranch size={12} className="text-violet-400" />
            {branch}
          </span>
        )}
        {activeWorkspace && (
          <span className="text-zinc-500">{activeWorkspace.name}</span>
        )}
        {/* Plugin-contributed left items */}
        {leftItems.map((item) => (
          <span
            key={item.id}
            title={item.tooltip}
            onClick={() => handleItemClick(item.commandId)}
            className={
              item.commandId
                ? "cursor-pointer hover:text-zinc-200 transition-colors"
                : ""
            }
          >
            {renderContent(item.content)}
          </span>
        ))}
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">
        {/* Plugin-contributed right items */}
        {rightItems.map((item) => (
          <span
            key={item.id}
            title={item.tooltip}
            onClick={() => handleItemClick(item.commandId)}
            className={
              item.commandId
                ? "cursor-pointer hover:text-zinc-200 transition-colors"
                : ""
            }
          >
            {renderContent(item.content)}
          </span>
        ))}
        {activeTab && (
          <>
            {activeTab.cursorLine != null && (
              <span>
                Ln {activeTab.cursorLine}, Col {activeTab.cursorColumn}
              </span>
            )}
            <span>{activeTab.language}</span>
          </>
        )}
      </div>
    </div>
  );
}
