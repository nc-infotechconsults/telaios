// ─── Agent Panel ──────────────────────────────────────────────────────────────
//
// Main panel layout:
//   AgentMetrics → AgentSessionList → AgentConversation → AgentInput
//
// Shows AgentOnboarding when disconnected.
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { useAgentStore } from "./agentStore";
import { AgentOnboarding } from "./AgentOnboarding";
import { AgentMetrics } from "./AgentMetrics";
import { AgentSessionList } from "./AgentSessionList";
import { AgentConversation } from "./AgentConversation";
import { AgentInput } from "./AgentInput";

export function AgentPanel() {
  const connectionStatus = useAgentStore((s) => s.connectionStatus);
  const hasSessions = useAgentStore((s) => s.sessions.length > 0);
  const connect = useAgentStore((s) => s.connect);

  // Connect on mount
  useEffect(() => {
    if (connectionStatus === "disconnected") {
      connect();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showOnboarding = connectionStatus !== "connected" && connectionStatus !== "connecting";
  const isConnecting = connectionStatus === "connecting";

  // Show onboarding for error/disconnected states
  if (showOnboarding && !isConnecting) {
    return (
      <div className="flex flex-col h-full bg-[#111113]">
        <AgentOnboarding status={connectionStatus} onRetry={connect} />
      </div>
    );
  }

  // Connecting splash — show a minimal loading state
  if (isConnecting && !hasSessions) {
    return (
      <div className="flex flex-col h-full bg-[#111113] items-center justify-center gap-3">
        <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse" />
        <p className="text-xs text-zinc-600">Connecting to agent…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#111113] overflow-hidden">
      <AgentMetrics />
      <AgentSessionList />
      <AgentConversation />
      <AgentInput />
    </div>
  );
}
