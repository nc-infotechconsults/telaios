// ─── MobileNav ─────────────────────────────────────────────────────────────────
//
// Bottom navigation bar for the phone layout. iOS/Android-style tab bar.
//
// Layout (5 fixed slots):
//  ┌──────┬──────┬──────┬──────┬──────┐
//  │ Edit │ Files│  Git │ Term │ More │
//  └──────┴──────┴──────┴──────┴──────┘
//
// - "Editor" always shows the code editor
// - Other tabs show tool windows full-screen
// - "More" opens an overflow sheet for additional tool windows (DB, Search, etc.)
// - Active tab gets a violet indicator + highlighted icon
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Code2,
  Files,
  GitBranch,
  Terminal,
  Bot,
  MoreHorizontal,
  Search,
  Database,
  X,
} from "lucide-react";
import {
  toolWindowRegistry,
  type ToolWindowRegistration,
} from "@/core/tool-window-registry";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MobileNavProps {
  /** Currently active view — "editor" or a tool window ID */
  activeView: string;
  /** Callback to switch the active view */
  onViewChange: (view: string) => void;
}

interface NavTab {
  id: string;
  label: string;
  icon: React.ElementType;
}

// ─── Primary Tabs ─────────────────────────────────────────────────────────────
// Fixed 4 tabs + overflow. These are the most-used views on mobile.

const PRIMARY_TABS: NavTab[] = [
  { id: "editor", label: "Editor", icon: Code2 },
  { id: "explorer", label: "Files", icon: Files },
  { id: "git", label: "Git", icon: GitBranch },
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "agentscope.agent", label: "Agent", icon: Bot },
];

// Overflow tool windows — anything not in primary tabs
const OVERFLOW_IDS = ["search", "agentscope.database"];

// ─── OverflowSheet ────────────────────────────────────────────────────────────

interface OverflowSheetProps {
  onSelect: (id: string) => void;
  onClose: () => void;
  activeView: string;
}

function OverflowSheet({ onSelect, onClose, activeView }: OverflowSheetProps) {
  // Build overflow items from the registry
  const overflowItems: { id: string; label: string; icon: React.ElementType }[] =
    OVERFLOW_IDS.map((id) => {
      const reg = toolWindowRegistry.get(id);
      return reg
        ? { id: reg.id, label: reg.label, icon: reg.icon }
        : null;
    }).filter(Boolean) as { id: string; label: string; icon: React.ElementType }[];

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 bg-[#141416]/98 backdrop-blur-xl border-t border-white/[0.08] rounded-t-2xl z-50 pb-safe"
      >
        {/* Handle + close */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <span className="text-sm font-medium text-zinc-300">More Panels</span>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-500 active:bg-white/[0.06]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Drag handle indicator */}
        <div className="flex justify-center -mt-1 mb-2">
          <div className="w-10 h-1 rounded-full bg-white/[0.1]" />
        </div>

        {/* Items grid */}
        <div className="grid grid-cols-3 gap-2 px-4 pb-6">
          {overflowItems.map((item) => {
            const isActive = activeView === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelect(item.id);
                  onClose();
                }}
                className={[
                  "flex flex-col items-center gap-2 py-4 px-2 rounded-xl transition-colors",
                  isActive
                    ? "bg-violet-500/10 border border-violet-500/20"
                    : "bg-white/[0.03] border border-white/[0.04] active:bg-white/[0.06]",
                ].join(" ")}
              >
                <Icon
                  size={22}
                  className={isActive ? "text-violet-400" : "text-zinc-400"}
                  strokeWidth={isActive ? 2 : 1.5}
                />
                <span
                  className={[
                    "text-xs",
                    isActive ? "text-violet-300 font-medium" : "text-zinc-500",
                  ].join(" ")}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </motion.div>
    </>
  );
}

// ─── MobileNav ────────────────────────────────────────────────────────────────

export function MobileNav({ activeView, onViewChange }: MobileNavProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);

  const handleTabPress = useCallback(
    (id: string) => {
      if (id === "__overflow") {
        setOverflowOpen(true);
      } else {
        onViewChange(id);
      }
    },
    [onViewChange]
  );

  // Check if active view is in the overflow — if so, highlight "More"
  const isOverflowActive = OVERFLOW_IDS.includes(activeView);

  return (
    <>
      {/* Overflow bottom sheet */}
      <AnimatePresence>
        {overflowOpen && (
          <OverflowSheet
            activeView={activeView}
            onSelect={onViewChange}
            onClose={() => setOverflowOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Nav Bar ── */}
      <nav className="flex items-end border-t border-white/[0.05] bg-[#0f0f11]/95 backdrop-blur-md shrink-0 z-30 pb-safe">
        {PRIMARY_TABS.map((tab) => {
          const isActive = activeView === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => handleTabPress(tab.id)}
              className={[
                "relative flex-1 flex flex-col items-center pt-2 pb-1.5 gap-0.5 transition-colors",
                isActive ? "text-white" : "text-zinc-500 active:text-zinc-300",
              ].join(" ")}
            >
              {/* Active indicator */}
              {isActive && (
                <motion.div
                  layoutId="mobileNavIndicator"
                  className="absolute top-0 inset-x-2 h-[2px] bg-gradient-to-r from-violet-500 to-cyan-500 rounded-full"
                  initial={false}
                  transition={{ type: "spring", stiffness: 400, damping: 35 }}
                />
              )}

              <Icon
                size={20}
                strokeWidth={isActive ? 2 : 1.5}
                className={
                  isActive
                    ? "text-violet-400 drop-shadow-[0_0_6px_rgba(139,92,246,0.5)]"
                    : ""
                }
              />
              <span
                className={[
                  "text-[10px]",
                  isActive ? "font-semibold" : "font-normal",
                ].join(" ")}
              >
                {tab.label}
              </span>
            </button>
          );
        })}

        {/* More / Overflow button */}
        <button
          onClick={() => handleTabPress("__overflow")}
          className={[
            "relative flex-1 flex flex-col items-center pt-2 pb-1.5 gap-0.5 transition-colors",
            isOverflowActive
              ? "text-white"
              : "text-zinc-500 active:text-zinc-300",
          ].join(" ")}
        >
          {isOverflowActive && (
            <motion.div
              layoutId="mobileNavIndicator"
              className="absolute top-0 inset-x-2 h-[2px] bg-gradient-to-r from-violet-500 to-cyan-500 rounded-full"
              initial={false}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
            />
          )}
          <MoreHorizontal
            size={20}
            strokeWidth={isOverflowActive ? 2 : 1.5}
            className={
              isOverflowActive
                ? "text-violet-400 drop-shadow-[0_0_6px_rgba(139,92,246,0.5)]"
                : ""
            }
          />
          <span
            className={[
              "text-[10px]",
              isOverflowActive ? "font-semibold" : "font-normal",
            ].join(" ")}
          >
            More
          </span>
        </button>
      </nav>
    </>
  );
}
