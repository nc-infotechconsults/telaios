import { useEditorStore } from "@/stores/editorStore";
import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { X, Circle, Columns2, Rows2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/** MIME type for tab drag-and-drop data transfer. */
const TAB_DND_MIME = "application/x-ide-tab";

interface Props {
  workspaceId: string;
  /** When provided, reads tabs from this specific group instead of the active group mirror. */
  groupId?: string;
}

export function EditorTabBar({ workspaceId, groupId }: Props) {
  // If groupId is provided, read from that group; otherwise use the backward-compat mirror
  const groups = useEditorStore((s) => s.groups);
  const mirrorTabs = useEditorStore((s) => s.tabs);
  const mirrorActiveTabId = useEditorStore((s) => s.activeTabId);

  const tabs = useMemo(() => {
    if (!groupId) return mirrorTabs;
    return groups[groupId]?.tabs ?? [];
  }, [groupId, groups, mirrorTabs]);

  const activeTabId = useMemo(() => {
    if (!groupId) return mirrorActiveTabId;
    return groups[groupId]?.activeTabId ?? null;
  }, [groupId, groups, mirrorActiveTabId]);

  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const saveTab = useEditorStore((s) => s.saveTab);
  const splitGroup = useEditorStore((s) => s.splitGroup);
  const moveTab = useEditorStore((s) => s.moveTab);
  const activeGroupId = useEditorStore((s) => s.activeGroupId);

  // Determine the effective groupId for actions
  const effectiveGroupId = groupId ?? activeGroupId;

  // Check if there are multiple groups (to show/hide split controls contextually)
  const groupCount = useMemo(
    () => Object.keys(groups).length,
    [groups],
  );

  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId]);

  // ── Drag-and-drop state ─────────────────────────────────────────────────────
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent, tabId: string) => {
      e.dataTransfer.setData(
        TAB_DND_MIME,
        JSON.stringify({ tabId, fromGroupId: effectiveGroupId })
      );
      e.dataTransfer.effectAllowed = "move";
    },
    [effectiveGroupId]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(TAB_DND_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      // Calculate insertion index based on mouse position
      if (!tabBarRef.current) return;
      const tabElements = Array.from(
        tabBarRef.current.querySelectorAll("[data-tab-id]")
      ) as HTMLElement[];

      let idx = tabs.length;
      for (let i = 0; i < tabElements.length; i++) {
        const rect = tabElements[i].getBoundingClientRect();
        const mid = rect.left + rect.width / 2;
        if (e.clientX < mid) {
          idx = i;
          break;
        }
      }
      setDropIndex(idx);
    },
    [tabs.length]
  );

  const handleDragLeave = useCallback((_e: React.DragEvent) => {
    setDropIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDropIndex(null);

      const raw = e.dataTransfer.getData(TAB_DND_MIME);
      if (!raw) return;

      try {
        const { tabId, fromGroupId } = JSON.parse(raw) as {
          tabId: string;
          fromGroupId: string;
        };

        if (fromGroupId === effectiveGroupId) {
          // Same group — no-op (reorder within group not yet supported)
          return;
        }

        // Move tab from source group to this group
        moveTab(tabId, fromGroupId, effectiveGroupId);
      } catch {
        // Invalid data — ignore
      }
    },
    [effectiveGroupId, moveTab]
  );

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center bg-white/[0.01] backdrop-blur-md border-b border-white/[0.05] shrink-0 z-10">
      {/* Scrollable tab list — also serves as drop zone */}
      <div
        ref={tabBarRef}
        className="flex-1 flex overflow-x-auto scrollbar-hide relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <AnimatePresence initial={false}>
          {tabs.map((tab, i) => {
            const isActive = tab.id === activeTabId;
            return (
              <motion.div
                key={tab.id}
                layout
                data-tab-id={tab.id}
                draggable
                onDragStart={(e) => handleDragStart(e as unknown as React.DragEvent, tab.id)}
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className={[
                  "relative flex items-center gap-1.5 px-4 py-2.5 text-xs cursor-pointer select-none shrink-0 border-r border-white/[0.05] group transition-all duration-200",
                  "max-w-[200px] whitespace-nowrap overflow-hidden",
                  isActive
                    ? "bg-white/[0.04] text-white"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]",
                ].join(" ")}
                onClick={() => setActiveTab(tab.id, groupId)}
              >
                {/* Drop indicator — vertical line before this tab */}
                {dropIndex === i && (
                  <div className="absolute left-0 top-1 bottom-1 w-[2px] bg-violet-500 rounded-full z-20" />
                )}

                {isActive && (
                  <motion.div
                    layoutId={`activeTabTopBorder-${effectiveGroupId}`}
                    className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-violet-500 to-cyan-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]"
                    initial={false}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <button
                  ref={isActive ? (el) => { activeRef.current = el; } : undefined}
                  className="truncate font-medium flex items-center gap-2"
                  onClick={() => setActiveTab(tab.id, groupId)}
                >
                  {tab.name}
                </button>
                
                <div className="ml-auto flex items-center justify-center w-4 h-4 shrink-0">
                  {tab.isDirty ? (
                    <Circle 
                      size={8} 
                      fill="currentColor" 
                      className="text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]" 
                    />
                  ) : (
                    <button
                      className="opacity-0 group-hover:opacity-100 hover:text-white hover:bg-white/10 p-0.5 rounded-md transition-all shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.id, groupId);
                      }}
                      title="Close"
                    >
                      <X size={12} strokeWidth={2.5} />
                    </button>
                  )}
                  {tab.isDirty && (
                    <button
                      className="absolute right-3 opacity-0 group-hover:opacity-100 hover:text-white hover:bg-white/10 p-0.5 rounded-md transition-all shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Save "${tab.name}" before closing?`)) {
                          saveTab(workspaceId, tab.id).then(() => closeTab(tab.id, groupId));
                          return;
                        }
                        closeTab(tab.id, groupId);
                      }}
                      title="Close"
                    >
                      <X size={12} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Drop indicator at the end of the tab list */}
        {dropIndex === tabs.length && (
          <div className="w-[2px] self-stretch my-1 bg-violet-500 rounded-full shrink-0 z-20" />
        )}
      </div>

      {/* Split buttons — shown when tabs exist */}
      {tabs.length > 0 && (
        <div className="flex items-center gap-0.5 px-2 shrink-0 border-l border-white/[0.05]">
          <button
            className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05] rounded-md transition-colors"
            onClick={() => splitGroup(effectiveGroupId, "horizontal")}
            title="Split Right (Ctrl+\)"
          >
            <Columns2 size={14} strokeWidth={1.5} />
          </button>
          <button
            className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05] rounded-md transition-colors"
            onClick={() => splitGroup(effectiveGroupId, "vertical")}
            title="Split Down (Ctrl+Shift+\)"
          >
            <Rows2 size={14} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  );
}
