// ─── Agent Onboarding ─────────────────────────────────────────────────────────
//
// Shown when OpenCode agent is not connected.
// Explains setup and provides a retry button.
// ──────────────────────────────────────────────────────────────────────────────

import { Bot, RefreshCw, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import type { AgentConnectionStatus } from "./agentStore";

interface Props {
  status: AgentConnectionStatus;
  onRetry: () => void;
}

function StatusBadge({ status }: { status: AgentConnectionStatus }) {
  if (status === "connecting") {
    return (
      <span className="flex items-center gap-1.5 text-amber-400 text-xs">
        <span className="animate-pulse h-1.5 w-1.5 rounded-full bg-amber-400" />
        Connecting…
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-1.5 text-red-400 text-xs">
        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
        Connection error
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-zinc-500 text-xs">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
      Disconnected
    </span>
  );
}

export function AgentOnboarding({ status, onRetry }: Props) {
  const isConnecting = status === "connecting";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center h-full px-6 py-8 gap-6 text-center"
    >
      {/* Icon */}
      <div className="relative">
        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-600/20 to-indigo-600/20 border border-violet-500/20 flex items-center justify-center">
          <Bot size={28} className="text-violet-400" />
        </div>
        {isConnecting && (
          <span className="absolute -top-1 -right-1 h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-400" />
          </span>
        )}
      </div>

      {/* Heading */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-zinc-100">
          AI Agent not connected
        </h3>
        <StatusBadge status={status} />
      </div>

      {/* Setup instructions */}
      <div className="w-full max-w-xs bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 text-left flex flex-col gap-3">
        <p className="text-xs text-zinc-400 font-medium">Setup</p>
        <div className="flex flex-col gap-2">
          <p className="text-xs text-zinc-500">
            Set one of these env vars on the IDE server:
          </p>
          <code className="block text-[11px] bg-black/40 text-violet-300 rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap">
            {"# Connect to existing OpenCode server\nOPENCODE_SERVER_URL=http://localhost:3000\n\n# Or specify model (embedded mode)\nOPENCODE_MODEL=anthropic/claude-sonnet-4"}
          </code>
        </div>
      </div>

      {/* Retry button */}
      <button
        onClick={onRetry}
        disabled={isConnecting}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium
          bg-violet-600/20 border border-violet-500/30 text-violet-300
          hover:bg-violet-600/30 hover:text-violet-200 transition-colors
          disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <RefreshCw
          size={13}
          className={isConnecting ? "animate-spin" : ""}
        />
        {isConnecting ? "Connecting…" : "Retry connection"}
      </button>

      {/* Docs link */}
      <a
        href="https://opencode.ai/docs"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        <ExternalLink size={10} />
        OpenCode docs
      </a>
    </motion.div>
  );
}
