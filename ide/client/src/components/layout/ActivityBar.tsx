import { useEditorStore } from "@/stores/editorStore";
import type { PanelId, PanelPosition, PanelConfig, SidebarPosition } from "@/types";
import { 
  Files, Search, GitBranch, Terminal, Database, 
} from "lucide-react";
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

function getPanelPosition(panels: Record<PanelPosition, PanelConfig | null>, panelId: PanelId): PanelPosition | null {
  for (const [pos, config] of Object.entries(panels)) {
    if (config?.id === panelId && config.isOpen) {
      return pos as PanelPosition;
    }
  }
  return null;
}

function getSidebarOf(position: PanelPosition): SidebarPosition {
  return position.includes("left") ? "left" : "right";
}

interface ActivityBarProps {
  side: SidebarPosition;
}

export function ActivityBar({ side }: ActivityBarProps) {
  const panels = useEditorStore((s) => s.panels);
  const activePanel = useEditorStore((s) => s.activePanel);
  const dragState = useEditorStore((s) => s.dragState);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const togglePanel = useEditorStore((s) => s.togglePanel);
  const movePanel = useEditorStore((s) => s.movePanel);
  const terminalOpen = useEditorStore((s) => s.terminalOpen);
  const setTerminalOpen = useEditorStore((s) => s.setTerminalOpen);
  const startDrag = useEditorStore((s) => s.startDrag);
  const endDrag = useEditorStore((s) => s.endDrag);

  function handlePanelClick(item: NavItem) {
    if (item.id === "terminal") {
      setTerminalOpen(!terminalOpen);
      return;
    }
    togglePanel(item.id);
    setActivePanel(item.id);
  }

  function handleDragStart(item: NavItem, e: React.DragEvent) {
    const pos = getPanelPosition(panels, item.id);
    if (!pos) return; // can only drag open panels
    e.dataTransfer.setData("panelId", item.id);
    e.dataTransfer.effectAllowed = "move";
    startDrag(item.id, pos);
  }

  // onDrop fires when an icon is dropped onto THIS activity bar
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const panelId = e.dataTransfer.getData("panelId") as PanelId;
    if (!panelId) { endDrag(); return; }

    const currentPos = getPanelPosition(panels, panelId);
    if (!currentPos) { endDrag(); return; }

    const currentSide = getSidebarOf(currentPos);
    if (currentSide === side) {
      // Dropped on the same side — nothing to do
      endDrag();
      return;
    }

    // Move to the equivalent position on the other sidebar
    // (top → top, bottom → bottom)
    const isTop = currentPos.includes("top");
    const targetPos: PanelPosition = side === "left"
      ? (isTop ? "left-top" : "left-bottom")
      : (isTop ? "right-top" : "right-bottom");

    movePanel(panelId, targetPos);
    setActivePanel(panelId);
    endDrag();
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  // onDragEnd fires on the source button when a drag ends (drop or cancel)
  function handleDragEnd() {
    endDrag();
  }

  const isDraggingToThisSide =
    dragState.panelId !== null &&
    dragState.sourcePosition !== null &&
    getSidebarOf(dragState.sourcePosition) !== side;

  const borderClass = side === "left" ? "border-r" : "border-l";

  return (
    <div 
      className={`flex flex-col w-12 bg-[#111113]/80 backdrop-blur-md ${borderClass} border-white/[0.05] py-2 gap-1 items-center shrink-0 z-10 transition-all duration-200 ${
        isDraggingToThisSide ? "bg-violet-500/10" : ""
      }`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {NAV_ITEMS.map((item) => {
        if (item.id === "terminal") return null;
        
        const pos = getPanelPosition(panels, item.id);
        const isOpen = pos !== null;
        const isActive = activePanel === item.id && isOpen;
        const isInThisSidebar = pos ? getSidebarOf(pos) === side : false;
        const isDragging = dragState.panelId === item.id;
        
        return (
          <button
            key={item.id}
            title={`${item.label}${isOpen ? ` (${pos ? getSidebarOf(pos) : ""})` : " (closed)"}`}
            onClick={() => handlePanelClick(item)}
            draggable={isOpen}
            onDragStart={(e) => handleDragStart(item, e)}
            onDragEnd={handleDragEnd}
            className={[
              "relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 group",
              isActive && isInThisSidebar
                ? "bg-white/[0.08] text-white shadow-[0_0_15px_rgba(139,92,246,0.15)]"
                : isOpen
                  ? "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                  : "text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.04]",
              isDragging ? "opacity-50" : "",
            ].join(" ")}
          >
            {/* Active indicator — shared layoutId so framer-motion animates it across sidebars */}
            {isActive && (
              <motion.div
                layoutId="activeNavIndicator"
                className={`absolute top-1/2 -translate-y-1/2 w-[3px] h-6 bg-gradient-to-b from-violet-500 to-cyan-500 rounded-full ${
                  side === "left" ? "left-0" : "right-0"
                }`}
                initial={false}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
            
            <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
            
            {/* Dot indicating which sidebar the panel is currently in */}
            {isOpen && pos && (
              <div className={`absolute top-0.5 ${side === "left" ? "right-0.5" : "left-0.5"}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${
                  getSidebarOf(pos) === "left" 
                    ? "bg-violet-500" 
                    : "bg-cyan-500"
                }`} />
              </div>
            )}
          </button>
        );
      })}

      <div className="flex-1" />
    </div>
  );
}
