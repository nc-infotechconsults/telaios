// ─── Agent Metrics Bar ────────────────────────────────────────────────────────
//
// Compact metrics bar showing real-time token/cost/duration/tool stats.
// Collapsible on click. Updates on every store change.
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { Zap, DollarSign, Clock, MessageSquare, Wrench, FileEdit, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAgentStore } from "./agentStore";

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatCost(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.001) return "<$0.001";
  return `$${n.toFixed(3)}`;
}

function formatDuration(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem.toString().padStart(2, "0")}s`;
}

interface PillProps {
  icon: React.ReactNode;
  value: string;
  label: string;
  accent?: string;
}

function Pill({ icon, value, label, accent = "text-zinc-300" }: PillProps) {
  return (
    <span
      title={label}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-[10px]"
    >
      <span className="text-zinc-500">{icon}</span>
      <span className={accent}>{value}</span>
    </span>
  );
}

export function AgentMetrics() {
  const metrics = useAgentStore((s) => s.metrics);
  const isStreaming = useAgentStore((s) => s.isStreaming);
  const streamingStartTime = useAgentStore((s) => s.streamingStartTime);
  const [expanded, setExpanded] = useState(false);
  const [liveDuration, setLiveDuration] = useState(metrics.sessionDuration);

  useEffect(() => {
    if (!streamingStartTime) {
      setLiveDuration(metrics.sessionDuration);
      return;
    }
    const interval = setInterval(() => {
      setLiveDuration(Math.floor((Date.now() - streamingStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [streamingStartTime, metrics.sessionDuration]);

  const hasData =
    metrics.tokensIn > 0 ||
    metrics.tokensOut > 0 ||
    metrics.messagesCount > 0;

  if (!hasData && !isStreaming) return null;

  return (
    <div className="border-b border-white/[0.05]">
      {/* Primary row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-1.5 gap-2 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          {isStreaming && (
            <span className="flex items-center gap-1 text-[10px] text-violet-400">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
              Thinking…
            </span>
          )}
          <Pill
            icon={<Zap size={9} />}
            value={`${formatTokens(metrics.tokensIn + metrics.tokensOut)} tokens`}
            label="Total tokens"
            accent="text-amber-300"
          />
          <Pill
            icon={<DollarSign size={9} />}
            value={formatCost(metrics.estimatedCost)}
            label="Estimated cost"
            accent="text-emerald-300"
          />
          <Pill
            icon={<Clock size={9} />}
            value={formatDuration(liveDuration)}
            label="Session duration"
            accent="text-cyan-300"
          />
        </div>
        <span className="text-zinc-600 shrink-0">
          {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </span>
      </button>

      {/* Expanded detail row */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-1.5 flex-wrap px-3 pb-2">
              <Pill
                icon={<MessageSquare size={9} />}
                value={`${metrics.messagesCount} msgs`}
                label="Messages"
                accent="text-zinc-300"
              />
              <Pill
                icon={<Wrench size={9} />}
                value={`${metrics.toolCallsCount} tools`}
                label="Tool calls"
                accent="text-zinc-300"
              />
              {metrics.filesEdited.length > 0 && (
                <Pill
                  icon={<FileEdit size={9} />}
                  value={`${metrics.filesEdited.length} files`}
                  label={`Edited: ${metrics.filesEdited.join(", ")}`}
                  accent="text-zinc-300"
                />
              )}
              {metrics.tokensIn > 0 && (
                <Pill
                  icon={<Zap size={9} />}
                  value={`↑${formatTokens(metrics.tokensIn)} ↓${formatTokens(metrics.tokensOut)}`}
                  label="Input / Output tokens"
                  accent="text-zinc-400"
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
