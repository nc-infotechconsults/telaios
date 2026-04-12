import { useEditorStore } from "@/stores/editorStore";
import { useRef, useEffect } from "react";
import { X, Circle } from "lucide-react";
import { motion } from "framer-motion";

interface Props {
  workspaceId: string;
}

export function EditorTabBar({ workspaceId }: Props) {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const saveTab = useEditorStore((s) => s.saveTab);

  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId]);

  if (tabs.length === 0) return null;

  return (
    <div className="flex overflow-x-auto scrollbar-hide bg-white/[0.01] backdrop-blur-md border-b border-white/[0.05] shrink-0 z-10">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={[
              "relative flex items-center gap-1.5 px-4 py-2.5 text-xs cursor-pointer select-none shrink-0 border-r border-white/[0.05] group transition-all duration-200",
              "max-w-[200px] whitespace-nowrap overflow-hidden",
              isActive
                ? "bg-white/[0.04] text-white"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]",
            ].join(" ")}
            onClick={() => setActiveTab(tab.id)}
          >
            {isActive && (
              <motion.div
                layoutId="activeTabTopBorder"
                className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-violet-500 to-cyan-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]"
                initial={false}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
            <button
              ref={isActive ? (el) => { activeRef.current = el; } : undefined}
              className="truncate font-medium flex items-center gap-2"
              onClick={() => setActiveTab(tab.id)}
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
                    closeTab(tab.id);
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
                      saveTab(workspaceId, tab.id).then(() => closeTab(tab.id));
                      return;
                    }
                    closeTab(tab.id);
                  }}
                  title="Close"
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}