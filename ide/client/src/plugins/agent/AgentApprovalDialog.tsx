// ─── Agent Approval Dialog ─────────────────────────────────────────────────────
//
// Inline approval card for shell commands executed by the agent.
// Shows the command in a monospace block with Approve / Deny buttons.
//
// When the OpenCode SDK supports a "pending approval" state in SSE events,
// this component can be wired to send approval/denial back.  For now it
// provides a client-side UX that lets the user review the command.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback } from "react";
import { ShieldCheck, ShieldX, TerminalSquare, CheckCircle2, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export type ApprovalStatus = "pending" | "approved" | "denied";

interface AgentApprovalDialogProps {
  /** The shell command to be executed */
  command: string;
  /** Whether auto-approve is active for this session */
  autoApproved?: boolean;
  /** Called when the user clicks Approve */
  onApprove?: () => void;
  /** Called when the user clicks Deny */
  onDeny?: () => void;
}

const fadeIn = { opacity: 0, y: 4 };
const fadeAnimate = { opacity: 1, y: 0 };

export const AgentApprovalDialog = React.memo(function AgentApprovalDialog({
  command,
  autoApproved,
  onApprove,
  onDeny,
}: AgentApprovalDialogProps) {
  const [status, setStatus] = useState<ApprovalStatus>(
    autoApproved ? "approved" : "pending"
  );

  const handleApprove = useCallback(() => {
    setStatus("approved");
    onApprove?.();
  }, [onApprove]);

  const handleDeny = useCallback(() => {
    setStatus("denied");
    onDeny?.();
  }, [onDeny]);

  const borderColor =
    status === "approved"
      ? "border-emerald-500/40"
      : status === "denied"
        ? "border-red-500/30"
        : "border-amber-500/40";

  const bgColor =
    status === "approved"
      ? "bg-emerald-500/5"
      : status === "denied"
        ? "bg-red-500/5"
        : "bg-amber-500/5";

  const statusIcon =
    status === "approved" ? (
      <CheckCircle2 size={12} className="text-emerald-400" />
    ) : status === "denied" ? (
      <XCircle size={12} className="text-red-400" />
    ) : (
      <TerminalSquare size={12} className="text-amber-400" />
    );

  const statusLabel =
    status === "approved"
      ? "Approved"
      : status === "denied"
        ? "Denied"
        : "Awaiting Approval";

  return (
    <motion.div
      initial={fadeIn}
      animate={fadeAnimate}
      className={`rounded-lg border ${borderColor} ${bgColor} overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        {statusIcon}
        <span className="text-[11px] font-medium text-zinc-300">{statusLabel}</span>
        {autoApproved && status === "approved" && (
          <span className="text-[10px] text-zinc-500 ml-auto">auto-approved</span>
        )}
      </div>

      {/* Command block */}
      <div className="px-3 pb-2">
        <pre className="text-[11px] font-mono leading-relaxed bg-black/40 border border-white/[0.06] rounded-md px-3 py-2 text-amber-200/90 whitespace-pre-wrap break-all overflow-x-auto max-h-32 scrollbar-thin scrollbar-thumb-white/10">
          {command}
        </pre>
      </div>

      {/* Action buttons — only shown when pending */}
      <AnimatePresence>
        {status === "pending" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 pb-2">
              <button
                onClick={handleApprove}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium
                  bg-emerald-600/20 text-emerald-300 border border-emerald-500/30
                  hover:bg-emerald-600/30 hover:border-emerald-500/50
                  transition-colors"
              >
                <ShieldCheck size={12} />
                Approve
              </button>
              <button
                onClick={handleDeny}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium
                  bg-red-600/10 text-red-300 border border-red-500/20
                  hover:bg-red-600/20 hover:border-red-500/40
                  transition-colors"
              >
                <ShieldX size={12} />
                Deny
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
