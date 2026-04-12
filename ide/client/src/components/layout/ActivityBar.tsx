import { useEditorStore } from "@/stores/editorStore";
import type { PanelId } from "@/types";
import { Files, Search, GitBranch, Terminal, Database } from "lucide-react";
import { motion } from "framer-motion";

interface NavItem {
  id: PanelId;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { id: "explorer", label: "Explorer", icon: Files },
  { id: "search", label: "Search", icon: Search },
  { id: "git", label: "Source Control", icon: GitBranch },
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "db", label: "Database", icon: Database },
];

export function ActivityBar() {
  const activePanel = useEditorStore((s) => s.activePanel);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const setSidebarOpen = useEditorStore((s) => s.setSidebarOpen);
  const setTerminalOpen = useEditorStore((s) => s.setTerminalOpen);
  const sidebarOpen = useEditorStore((s) => s.sidebarOpen);

  function handleClick(item: NavItem) {
    if (item.id === "terminal") {
      setTerminalOpen(true);
      return;
    }
    if (activePanel === item.id) {
      setSidebarOpen(!sidebarOpen);
    } else {
      setActivePanel(item.id);
      setSidebarOpen(true);
    }
  }

  return (
    <div className="flex flex-col w-12 bg-[#111113]/80 backdrop-blur-md border-r border-white/[0.05] py-2 gap-1 items-center shrink-0 z-10">
      {NAV_ITEMS.map((item) => {
        const isActive = activePanel === item.id && sidebarOpen;
        const Icon = item.icon;
        
        return (
          <button
            key={item.id}
            title={item.label}
            onClick={() => handleClick(item)}
            className={[
              "relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 group",
              isActive
                ? "bg-white/[0.08] text-white shadow-[0_0_15px_rgba(139,92,246,0.15)]"
                : "text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]",
            ].join(" ")}
          >
            {isActive && (
              <motion.div
                layoutId="activeNavBorder"
                className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-gradient-to-b from-violet-500 to-cyan-500 rounded-r-full"
                initial={false}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
            <Icon size={20} className={isActive ? "drop-shadow-md" : ""} strokeWidth={isActive ? 2.5 : 2} />
          </button>
        );
      })}
    </div>
  );
}