import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus confirm button for keyboard nav
  useEffect(() => {
    if (open) {
      confirmRef.current?.focus();
    }
  }, [open]);

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (open && e.key === "Escape") {
        onCancel();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={onCancel}
          />
          
          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm z-50"
          >
            <div className="mx-4 bg-[#1a1a1d]/95 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.05]">
                {danger && (
                  <div className="p-2 rounded-full bg-red-500/20">
                    <AlertTriangle size={18} className="text-red-400" />
                  </div>
                )}
                <h3 className="text-sm font-medium text-white">{title}</h3>
              </div>

              {/* Content */}
              <div className="px-5 py-4">
                <p className="text-xs text-zinc-400">{message}</p>
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
                  ref={confirmRef}
                  onClick={onConfirm}
                  className={[
                    "px-3 py-1.5 text-xs font-medium rounded transition-colors",
                    danger
                      ? "bg-red-500 hover:bg-red-600 text-white"
                      : "bg-violet-500 hover:bg-violet-600 text-white"
                  ].join(" ")}
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