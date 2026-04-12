import { useEditorStore } from "@/stores/editorStore";
import type { PanelId } from "@/types";
import { Folder, GitBranch, Terminal } from "lucide-react";
import { motion } from "framer-motion";

const TABS: { id: PanelId; label: string; icon: React.ElementType }[] = [
  { id: "explorer", label: "Files", icon: Folder },
  { id: "git", label: "Git", icon: GitBranch },
  { id: "terminal", label: "Term", icon: Terminal },
];

/** Bottom tab bar shown on mobile (hidden on md+) */
export function MobileTabBar() {
  const activePanel = useEditorStore((s) => s.activePanel);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const togglePanel = useEditorStore((s) => s.togglePanel);

  function handleTab(id: PanelId) {
    togglePanel(id);
    setActivePanel(id);
  }

  return (
    <div className="md:hidden flex border-t border-white/[0.05] bg-white/[0.02] backdrop-blur-xl relative z-20">
      {TABS.map((tab) => {
        const isActive = activePanel === tab.id;
        const Icon = tab.icon;
        
        return (
          <button
            key={tab.id}
            onClick={() => handleTab(tab.id)}
            className={[
              "relative flex-1 flex flex-col items-center py-3 text-xs gap-1 transition-all duration-300",
              isActive
                ? "text-white bg-white/[0.04]"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]",
            ].join(" ")}
          >
            {isActive && (
              <motion.div
                layoutId="activeMobileTab"
                className="absolute bottom-0 inset-x-0 h-[2px] bg-gradient-to-r from-violet-500 to-cyan-500"
                initial={false}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
            <Icon size={18} className={isActive ? "text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" : ""} />
            <span className={isActive ? "font-medium" : ""}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}