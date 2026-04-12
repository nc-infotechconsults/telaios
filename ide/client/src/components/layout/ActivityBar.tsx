import { useState } from "react";
import { useEditorStore } from "@/stores/editorStore";
import type { PanelId, PanelArea, PanelState, DragState } from "@/types";
import { Files, Search, GitBranch, Terminal, Database } from "lucide-react";
import { motion } from "framer-motion";

// ── Static config ─────────────────────────────────────────────────────────────

interface NavItem {
  id: PanelId;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { id: "explorer", label: "Explorer",       icon: Files     },
  { id: "search",   label: "Search",         icon: Search    },
  { id: "git",      label: "Source Control", icon: GitBranch },
  { id: "terminal", label: "Terminal",       icon: Terminal  },
  { id: "db",       label: "Database",       icon: Database  },
];

// ── Area helpers ──────────────────────────────────────────────────────────────

/**
 * Returns which sidebar and section an area maps to for icon display purposes.
 * "bottom" area panels appear in the LEFT bar's bottom section.
 */
function areaToBarSection(area: PanelArea): { sidebar: "left" | "right"; section: "top" | "bottom" } {
  switch (area) {
    case "left-top":    return { sidebar: "left",  section: "top"    };
    case "left-bottom": return { sidebar: "left",  section: "bottom" };
    case "right-top":   return { sidebar: "right", section: "top"    };
    case "right-bottom":return { sidebar: "right", section: "bottom" };
    case "bottom":      return { sidebar: "left",  section: "bottom" };
  }
}

/**
 * Returns the PanelArea that a drop on a specific bar section should target.
 * Note: drops on the left bar bottom section always target "left-bottom"
 * (even though "bottom" area icons appear there too).
 */
function barSectionToDropArea(sidebar: "left" | "right", section: "top" | "bottom"): PanelArea {
  if (sidebar === "left")  return section === "top" ? "left-top"  : "left-bottom";
  return section === "top" ? "right-top" : "right-bottom";
}

// ── DropLine ──────────────────────────────────────────────────────────────────

/**
 * A thin horizontal hit-zone rendered between (and around) ActivityBar icons.
 * Becomes visible as a violet→cyan line when the user drags over it.
 * Calls movePanel(panelId, targetArea, insertBefore) on drop.
 */
function DropLine({
  targetArea,
  insertBefore,
  dragState,
}: {
  targetArea: PanelArea;
  insertBefore?: PanelId;
  dragState: DragState;
}) {
  const movePanel = useEditorStore((s) => s.movePanel);
  const endDrag   = useEditorStore((s) => s.endDrag);
  const [isOver, setIsOver] = useState(false);

  if (!dragState.panelId) return null;

  return (
    <div
      className="relative h-3 w-full flex items-center px-1"
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsOver(true); }}
      onDragLeave={(e) => { e.stopPropagation(); setIsOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsOver(false);
        if (!dragState.panelId) return;
        movePanel(dragState.panelId, targetArea, insertBefore);
        endDrag();
      }}
    >
      <div
        className={[
          "h-[2px] w-full rounded-full transition-all duration-150",
          isOver
            ? "bg-gradient-to-r from-violet-500 to-cyan-500 opacity-100"
            : "bg-transparent opacity-0",
        ].join(" ")}
      />
    </div>
  );
}

// ── ActivityBar ───────────────────────────────────────────────────────────────

interface ActivityBarProps {
  side: "left" | "right";
}

export function ActivityBar({ side }: ActivityBarProps) {
  const panels         = useEditorStore((s) => s.panels);
  const activePanel    = useEditorStore((s) => s.activePanel);
  const dragState      = useEditorStore((s) => s.dragState);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const togglePanel    = useEditorStore((s) => s.togglePanel);
  const movePanel      = useEditorStore((s) => s.movePanel);
  const startDrag      = useEditorStore((s) => s.startDrag);
  const endDrag        = useEditorStore((s) => s.endDrag);

  // ── Derived icon lists per section ─────────────────────────────────────────

  const topItems: PanelState[] = NAV_ITEMS
    .map((n) => panels[n.id])
    .filter((ps) => {
      const loc = areaToBarSection(ps.area);
      return loc.sidebar === side && loc.section === "top";
    })
    .sort((a, b) => a.order - b.order);

  const bottomItems: PanelState[] = NAV_ITEMS
    .map((n) => panels[n.id])
    .filter((ps) => {
      const loc = areaToBarSection(ps.area);
      return loc.sidebar === side && loc.section === "bottom";
    })
    .sort((a, b) => a.order - b.order);

  // ── Highlight this bar when the user is dragging from the OTHER bar ─────────
  const isDraggingToThisSide =
    dragState.panelId !== null &&
    dragState.sourceArea !== null &&
    dragState.sourceArea !== "bottom" &&
    !dragState.sourceArea.startsWith(side); // e.g. side="left", source="right-*"

  const borderClass = side === "left" ? "border-r" : "border-l";

  // ── Fallback section-level drag handlers (when not hitting a DropLine) ──────

  function makeSectionDrop(section: "top" | "bottom") {
    const targetArea = barSectionToDropArea(side, section);
    return {
      onDragOver(e: React.DragEvent) {
        if (!dragState.panelId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      },
      onDrop(e: React.DragEvent) {
        e.preventDefault();
        if (!dragState.panelId) return;
        movePanel(dragState.panelId, targetArea);
        setActivePanel(dragState.panelId);
        endDrag();
      },
    };
  }

  // ── Render one icon button ──────────────────────────────────────────────────

  function renderIcon(ps: PanelState) {
    const navItem   = NAV_ITEMS.find((n) => n.id === ps.id)!;
    const isOpen    = ps.isOpen;
    const isActive  = activePanel === ps.id && isOpen;
    const isDragging = dragState.panelId === ps.id;
    // Only sidebar-section panels (not "bottom" area) can be dragged via icon
    const draggable = ps.area !== "bottom";

    // Color of the small dot that shows which area the panel is in
    const dotColor =
      ps.area === "bottom"
        ? "bg-emerald-500"
        : ps.area.startsWith("left")
          ? "bg-violet-500"
          : "bg-cyan-500";

    return (
      <button
        key={ps.id}
        title={`${navItem.label}${isOpen ? "" : " (closed)"}`}
        onClick={() => {
          togglePanel(ps.id);
          setActivePanel(ps.id);
        }}
        draggable={draggable}
        onDragStart={(e) => {
          if (!draggable) return;
          e.dataTransfer.setData("panelId", ps.id);
          e.dataTransfer.effectAllowed = "move";
          startDrag(ps.id);
        }}
        onDragEnd={() => endDrag()}
        className={[
          "relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300",
          isActive
            ? "bg-white/[0.08] text-white shadow-[0_0_15px_rgba(139,92,246,0.15)]"
            : isOpen
              ? "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
              : "text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.04]",
          isDragging ? "opacity-50" : "",
        ].join(" ")}
      >
        {/* Active indicator pill */}
        {isActive && (
          <motion.div
            layoutId="activeNavIndicator"
            className={[
              "absolute top-1/2 -translate-y-1/2 w-[3px] h-6",
              "bg-gradient-to-b from-violet-500 to-cyan-500 rounded-full",
              side === "left" ? "left-0" : "right-0",
            ].join(" ")}
            initial={false}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        )}

        <navItem.icon size={20} strokeWidth={isActive ? 2.5 : 2} />

        {/* Small dot: area indicator */}
        {isOpen && (
          <div className={`absolute top-0.5 ${side === "left" ? "right-0.5" : "left-0.5"}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
          </div>
        )}
      </button>
    );
  }

  // ── Render a section with DropLines interspersed ────────────────────────────

  function renderSection(items: PanelState[], section: "top" | "bottom") {
    const targetArea = barSectionToDropArea(side, section);
    const sectionProps = makeSectionDrop(section);

    return (
      <div className="flex flex-col items-center gap-0" {...sectionProps}>
        {/* Leading DropLine */}
        <DropLine
          targetArea={targetArea}
          insertBefore={items[0]?.id}
          dragState={dragState}
        />
        {items.map((ps, idx) => (
          <div key={ps.id} className="flex flex-col items-center">
            {renderIcon(ps)}
            {/* Trailing DropLine (before next icon, or at end) */}
            <DropLine
              targetArea={targetArea}
              insertBefore={items[idx + 1]?.id}
              dragState={dragState}
            />
          </div>
        ))}
      </div>
    );
  }

  // ── Top-level render ───────────────────────────────────────────────────────

  return (
    <div
      className={[
        "flex flex-col w-12 bg-[#111113]/80 backdrop-blur-md py-2 gap-1 items-center shrink-0 z-10 transition-all duration-200",
        borderClass, "border-white/[0.05]",
        isDraggingToThisSide ? "bg-violet-500/10" : "",
      ].join(" ")}
    >
      {/* Top section */}
      {renderSection(topItems, "top")}

      {/* Spacer — pushes bottom section to the very bottom */}
      <div className="flex-1" />

      {/* Bottom section (left bar: left-bottom + bottom area; right bar: right-bottom) */}
      {renderSection(bottomItems, "bottom")}
    </div>
  );
}
