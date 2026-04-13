// ─── Database Plugin — Panel Wrapper ──────────────────────────────────────────
//
// Thin wrapper that gets workspaceId from context and passes it to the
// underlying DatabasePanel component.
// ──────────────────────────────────────────────────────────────────────────────

import { useWorkspaceId } from "@/core/bootstrap";
import { DatabasePanel as DatabasePanelInner } from "@/components/panels/DatabasePanel";

export function DatabasePanel() {
  const workspaceId = useWorkspaceId();
  return <DatabasePanelInner workspaceId={workspaceId} />;
}
