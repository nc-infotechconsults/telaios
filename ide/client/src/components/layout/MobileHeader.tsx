// ─── MobileHeader ──────────────────────────────────────────────────────────────
//
// Compact header for the phone layout. Sits at the top of MobileShell.
//
// Layout:
//  ┌──────────────────────────────────────────────────────────┐
//  │ [≡ Menu]  Workspace Name  [Search] [▶ Run]              │
//  └──────────────────────────────────────────────────────────┘
//
// - Hamburger button opens the full menu (same dropdown as HeaderToolbar mobile)
// - Center shows the active file name or workspace name
// - Right side has quick-action buttons
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { commandRegistry } from "@/core/commands";
import {
  Menu,
  Search,
  Save,
  X,
  Undo,
  Redo,
  MoreHorizontal,
} from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";

// ─── Quick Actions ────────────────────────────────────────────────────────────

interface QuickAction {
  id: string;
  icon: React.ElementType;
  label: string;
  commandId: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: "save", icon: Save, label: "Save", commandId: "file.save" },
  { id: "undo", icon: Undo, label: "Undo", commandId: "edit.undo" },
  { id: "redo", icon: Redo, label: "Redo", commandId: "edit.redo" },
];

// ─── Menu Items ───────────────────────────────────────────────────────────────

interface MobileMenuItem {
  id: string;
  label: string;
  commandId: string;
  icon?: React.ElementType;
  danger?: boolean;
}

const MOBILE_MENU_SECTIONS: { label: string; items: MobileMenuItem[] }[] = [
  {
    label: "File",
    items: [
      { id: "new-file", label: "New File", commandId: "file.newFile" },
      { id: "save", label: "Save", commandId: "file.save" },
      { id: "save-all", label: "Save All", commandId: "file.saveAll" },
      { id: "close-tab", label: "Close Tab", commandId: "file.closeTab" },
    ],
  },
  {
    label: "View",
    items: [
      {
        id: "command-palette",
        label: "Command Palette",
        commandId: "commandPalette.open",
      },
      { id: "zoom-in", label: "Zoom In", commandId: "view.zoomIn" },
      { id: "zoom-out", label: "Zoom Out", commandId: "view.zoomOut" },
      { id: "reset-zoom", label: "Reset Zoom", commandId: "view.resetZoom" },
    ],
  },
  {
    label: "Help",
    items: [
      { id: "docs", label: "Documentation", commandId: "help.docs" },
      { id: "about", label: "About", commandId: "help.about" },
    ],
  },
];

// ─── MobileHeader ─────────────────────────────────────────────────────────────

interface MobileHeaderProps {
  /** Currently active view in the mobile shell */
  activeView: string;
}

export function MobileHeader({ activeView }: MobileHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeTabId = useEditorStore((s) => s.activeTabId);
  const tabs = useEditorStore((s) => s.tabs);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const workspace = useWorkspaceStore((s) => s.activeWorkspace);

  // Determine the title to show
  const title =
    activeView === "editor"
      ? activeTab?.name ?? workspace?.name ?? "IDE"
      : activeView.charAt(0).toUpperCase() + activeView.slice(1);

  // Close overlays on outside click
  useEffect(() => {
    if (!menuOpen && !actionsOpen) return;
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setActionsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen, actionsOpen]);

  const handleMenuAction = useCallback(
    (commandId: string) => {
      commandRegistry.execute(commandId);
      setMenuOpen(false);
    },
    []
  );

  return (
    <div ref={menuRef} className="relative shrink-0 z-50">
      {/* ── Main Bar ── */}
      <div className="flex items-center h-11 bg-[#111113]/90 backdrop-blur-md border-b border-white/[0.05] px-2">
        {/* Left: Hamburger */}
        <button
          onClick={() => {
            setMenuOpen(!menuOpen);
            setActionsOpen(false);
          }}
          className={[
            "flex items-center justify-center w-9 h-9 rounded-lg transition-colors",
            menuOpen
              ? "bg-white/[0.08] text-white"
              : "text-zinc-400 active:bg-white/[0.06]",
          ].join(" ")}
          aria-label="Menu"
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>

        {/* Center: Title */}
        <div className="flex-1 min-w-0 px-2">
          <div className="text-sm font-medium text-zinc-200 truncate text-center">
            {title}
          </div>
          {activeView === "editor" && activeTab?.isDirty && (
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mx-auto mt-0.5" />
          )}
        </div>

        {/* Right: Quick actions */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => commandRegistry.execute("commandPalette.open")}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-zinc-400 active:bg-white/[0.06] transition-colors"
            aria-label="Search"
          >
            <Search size={16} />
          </button>

          <button
            onClick={() => {
              setActionsOpen(!actionsOpen);
              setMenuOpen(false);
            }}
            className={[
              "flex items-center justify-center w-9 h-9 rounded-lg transition-colors",
              actionsOpen
                ? "bg-white/[0.08] text-white"
                : "text-zinc-400 active:bg-white/[0.06]",
            ].join(" ")}
            aria-label="More actions"
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      {/* ── Full Menu Dropdown ── */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 bg-[#141416]/98 backdrop-blur-xl border-b border-white/[0.08] shadow-2xl z-50 max-h-[60vh] overflow-y-auto"
          >
            {MOBILE_MENU_SECTIONS.map((section, sIdx) => (
              <div key={section.label}>
                <div className="px-4 pt-3 pb-1 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">
                  {section.label}
                </div>
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleMenuAction(item.commandId)}
                    className={[
                      "w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors",
                      item.danger
                        ? "text-red-400 active:bg-red-500/10"
                        : "text-zinc-300 active:bg-white/[0.04]",
                    ].join(" ")}
                  >
                    {item.icon && (
                      <item.icon size={16} className="text-zinc-500 shrink-0" />
                    )}
                    <span>{item.label}</span>
                  </button>
                ))}
                {sIdx < MOBILE_MENU_SECTIONS.length - 1 && (
                  <div className="mx-4 my-1 h-px bg-white/[0.06]" />
                )}
              </div>
            ))}
            <div className="h-2" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Quick Actions Panel ── */}
      <AnimatePresence>
        {actionsOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-1 mr-2 min-w-[160px] py-1 bg-[#1a1a1d]/95 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl z-50"
          >
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.id}
                onClick={() => {
                  commandRegistry.execute(action.commandId);
                  setActionsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left text-zinc-300 active:bg-white/[0.04] transition-colors"
              >
                <action.icon size={16} className="text-zinc-500 shrink-0" />
                <span>{action.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
