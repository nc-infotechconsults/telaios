// ─── Project Context Plugin ────────────────────────────────────────────────────
//
// Bundled plugin that provides the Project Context panel.
// Shows all linked repositories, documents, and platform project metadata
// for workspace sessions started from the platform "From Project" flow.
//
// Registers:
//   - Tool window at right gutter (Alt+9, order 8)
//   - Commands: projectContext.open, projectContext.syncRepos
// ──────────────────────────────────────────────────────────────────────────────

import { FolderOpen, RefreshCw } from "lucide-react";
import type { PluginManifest, PluginActivateFunction } from "@/types/plugin";
import { ProjectContextPanel } from "./ProjectContextPanel";
import { useWorkspaceStore } from "@/stores/workspaceStore";

export const manifest: PluginManifest = {
  id: "agentscope.project-context",
  name: "Project Context",
  version: "1.0.0",
  description: "View and manage the platform project linked to this workspace",
  author: "AgentScope",
  activationEvents: ["onStartup"],
  categories: ["project"],
};

export const activate: PluginActivateFunction = (context) => {
  // ── Tool window ─────────────────────────────────────────────────────────────
  context.toolWindows.register({
    id: "agentscope.project-context",
    label: "Project",
    icon: FolderOpen,
    defaultPlacement: "right-top",
    shortcut: "Alt+9",
    order: 8,
    component: ProjectContextPanel,
  });

  // ── Commands ────────────────────────────────────────────────────────────────

  context.commands.register("projectContext.open", () => {
    context.toolWindows.show("agentscope.project-context");
  });

  context.commands.register("projectContext.syncRepos", async () => {
    const ws = useWorkspaceStore.getState().activeWorkspace;
    if (!ws) return;
    context.toolWindows.show("agentscope.project-context");
    await useWorkspaceStore.getState().syncRepos(ws.id);
  });

  // ── StatusBar item ──────────────────────────────────────────────────────────
  const statusItem = context.statusBar.addItem({
    id: "agentscope.project-context.status",
    content: "Project",
    alignment: "right",
    priority: 40,
    commandId: "toolWindow.toggle.agentscope.project-context",
    tooltip: "Project Context (Alt+9)",
  });

  const unsubscribe = useWorkspaceStore.subscribe((state) => {
    const proj = state.platformProject;
    const text = proj ? `☰ ${proj.project_name}` : "Project";
    context.statusBar.updateItem("agentscope.project-context.status", { content: text });
  });

  context.onDispose(() => {
    unsubscribe();
    statusItem.dispose();
  });
};
