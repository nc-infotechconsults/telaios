// ─── AboutDialog ──────────────────────────────────────────────────────────────
//
// Simple "About AgentScope IDE" dialog showing version and credits.
// Opened via Help > About.
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { create } from "zustand";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

// ─── Store ────────────────────────────────────────────────────────────────────

interface AboutDialogStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useAboutDialogStore = create<AboutDialogStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));

export const openAboutDialog = () => useAboutDialogStore.getState().open();

// ─── Component ────────────────────────────────────────────────────────────────

export function AboutDialog() {
  const isOpen = useAboutDialogStore((s) => s.isOpen);
  const close = useAboutDialogStore((s) => s.close);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, close]);

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
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xs z-[101]"
          >
            <div className="mx-4 bg-[#18181b]/95 backdrop-blur-xl border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
                <span className="text-sm font-medium text-white">About</span>
                <button
                  onClick={close}
                  className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Content */}
              <div className="px-5 py-5 flex flex-col items-center gap-3 text-center">
                {/* Logo */}
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
                  <span className="text-lg font-bold text-white">AI</span>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-white">
                    AgentScope IDE
                  </h3>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Version 0.2.0
                  </p>
                </div>

                <p className="text-[11px] text-zinc-500 leading-relaxed max-w-[220px]">
                  A container-native, AI-powered web IDE with plugin
                  architecture and collaborative editing.
                </p>

                <div className="text-[10px] text-zinc-600 pt-1">
                  Built with React, Monaco, Hono, and Bun
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-center px-5 py-3 bg-white/[0.02] border-t border-white/[0.05]">
                <button
                  onClick={close}
                  className="px-4 py-1.5 text-xs font-medium rounded bg-violet-500 hover:bg-violet-600 text-white transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
