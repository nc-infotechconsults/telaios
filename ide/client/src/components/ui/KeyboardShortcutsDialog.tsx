// ─── KeyboardShortcutsDialog ──────────────────────────────────────────────────
//
// Displays all registered keyboard shortcuts grouped by category.
// Opened via Help > Keyboard Shortcuts (Ctrl+K Ctrl+S).
// ──────────────────────────────────────────────────────────────────────────────

import { useMemo, useEffect, useState } from "react";
import { create } from "zustand";
import { motion, AnimatePresence } from "framer-motion";
import { Keyboard, X } from "lucide-react";
import { keybindingService } from "@/core/keybindings";
import { commandRegistry } from "@/core/commands";

// ─── Store ────────────────────────────────────────────────────────────────────

interface ShortcutsDialogStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useShortcutsDialogStore = create<ShortcutsDialogStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));

export const openShortcutsDialog = () =>
  useShortcutsDialogStore.getState().open();

// ─── Grouped Binding ──────────────────────────────────────────────────────────

interface DisplayBinding {
  commandId: string;
  label: string;
  category: string;
  shortcut: string;
}

function useGroupedBindings(filter: string): Record<string, DisplayBinding[]> {
  return useMemo(() => {
    const allBindings = keybindingService.getAll();
    const grouped: Record<string, DisplayBinding[]> = {};

    for (const binding of allBindings) {
      const command = commandRegistry.get(binding.commandId);
      const label = command?.label ?? binding.commandId;
      const category = command?.category ?? "Other";
      const shortcut = binding.displayLabel;

      if (
        filter &&
        !label.toLowerCase().includes(filter.toLowerCase()) &&
        !category.toLowerCase().includes(filter.toLowerCase()) &&
        !shortcut.toLowerCase().includes(filter.toLowerCase())
      ) {
        continue;
      }

      if (!grouped[category]) grouped[category] = [];
      grouped[category].push({
        commandId: binding.commandId,
        label,
        category,
        shortcut,
      });
    }

    return grouped;
  }, [filter]);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function KeyboardShortcutsDialog() {
  const isOpen = useShortcutsDialogStore((s) => s.isOpen);
  const close = useShortcutsDialogStore((s) => s.close);
  const [filter, setFilter] = useState("");
  const grouped = useGroupedBindings(filter);

  // Reset filter on open
  useEffect(() => {
    if (isOpen) setFilter("");
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, close]);

  const categories = Object.keys(grouped).sort();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            onClick={close}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed top-[10%] left-1/2 -translate-x-1/2 w-[min(560px,calc(100vw-32px))] max-h-[80vh] z-[101]"
          >
            <div className="bg-[#18181b]/95 backdrop-blur-xl border border-white/[0.1] rounded-xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col max-h-[80vh]">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] shrink-0">
                <div className="flex items-center gap-2">
                  <Keyboard size={16} className="text-violet-400" />
                  <h2 className="text-sm font-medium text-white">
                    Keyboard Shortcuts
                  </h2>
                </div>
                <button
                  onClick={close}
                  className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Search */}
              <div className="px-5 py-3 border-b border-white/[0.06] shrink-0">
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Search shortcuts..."
                  className="w-full px-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-md text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-violet-500/50 transition-colors"
                  spellCheck={false}
                  autoFocus
                />
              </div>

              {/* Shortcuts list */}
              <div className="overflow-y-auto flex-1 py-2">
                {categories.length === 0 && (
                  <div className="px-5 py-8 text-center text-zinc-600 text-xs">
                    No shortcuts match "{filter}"
                  </div>
                )}

                {categories.map((category) => (
                  <div key={category} className="mb-3">
                    {/* Category header */}
                    <div className="px-5 py-1 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">
                      {category}
                    </div>

                    {/* Bindings */}
                    {grouped[category].map((binding) => (
                      <div
                        key={binding.commandId}
                        className="flex items-center justify-between px-5 py-1.5 hover:bg-white/[0.03] transition-colors"
                      >
                        <span className="text-xs text-zinc-300">
                          {binding.label}
                        </span>
                        <kbd className="text-[10px] text-zinc-500 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06] font-mono shrink-0 ml-4">
                          {binding.shortcut}
                        </kbd>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="px-5 py-2 border-t border-white/[0.06] text-[10px] text-zinc-600 shrink-0">
                {keybindingService.getAll().length} shortcuts registered
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
