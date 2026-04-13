// ─── InputDialog ───────────────────────────────────────────────────────────────
//
// Reusable modal input dialog. Replaces window.prompt() with a styled overlay
// matching the IDE's visual language (same pattern as ConfirmDialog).
//
// Usage:
//   <InputDialog
//     open={showDialog}
//     title="New File"
//     placeholder="filename.ts"
//     onConfirm={(value) => { /* create file */ }}
//     onCancel={() => setShowDialog(false)}
//   />
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  open: boolean;
  title: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function InputDialog({
  open,
  title,
  placeholder = "",
  defaultValue = "",
  confirmLabel = "Create",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);

  // Reset value and focus input when dialog opens
  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open, defaultValue]);

  // Handle escape key
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancel();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  function handleSubmit() {
    const trimmed = value.trim();
    if (trimmed) {
      onConfirm(trimmed);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            onClick={onCancel}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm z-[101]"
          >
            <div className="mx-4 bg-[#1a1a1d]/95 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="px-5 py-4 border-b border-white/[0.05]">
                <h3 className="text-sm font-medium text-white">{title}</h3>
              </div>

              {/* Input */}
              <div className="px-5 py-4">
                <input
                  ref={inputRef}
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-md text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-colors"
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 px-5 py-3 bg-white/[0.02] border-t border-white/[0.05]">
                <button
                  onClick={onCancel}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors rounded hover:bg-white/[0.04]"
                >
                  {cancelLabel}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!value.trim()}
                  className="px-3 py-1.5 text-xs font-medium rounded transition-colors bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
