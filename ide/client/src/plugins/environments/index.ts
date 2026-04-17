// ─── Environments Plugin ───────────────────────────────────────────────────────
//
// Bundled plugin that shows environments (K8s/Docker) linked to the current
// platform project. Provides a quick resource browser and deep-links to the
// full environment detail page in the platform frontend.
//
// Registers:
//   - Tool window at right gutter (Alt+0, order 9)
//   - Command: environments.open
// ──────────────────────────────────────────────────────────────────────────────

import { Server } from "lucide-react";
import type { PluginManifest, PluginActivateFunction } from "@/types/plugin";
import { EnvironmentsPanel } from "./EnvironmentsPanel";

export const manifest: PluginManifest = {
  id: "agentscope.environments",
  name: "Environments",
  version: "1.0.0",
  description: "View K8s/Docker environments linked to the current platform project",
  author: "AgentScope",
  activationEvents: ["onStartup"],
  categories: ["infra"],
};

export const activate: PluginActivateFunction = (context) => {
  // ── Tool window ─────────────────────────────────────────────────────────────
  context.toolWindows.register({
    id: "agentscope.environments",
    label: "Environments",
    icon: Server,
    defaultPlacement: "right-top",
    shortcut: "Alt+0",
    order: 9,
    component: EnvironmentsPanel,
  });

  // ── Commands ────────────────────────────────────────────────────────────────

  context.commands.register("environments.open", () => {
    context.toolWindows.show("agentscope.environments");
  });

  // ── StatusBar item ──────────────────────────────────────────────────────────
  const statusItem = context.statusBar.addItem({
    id: "agentscope.environments.status",
    content: "Envs",
    alignment: "right",
    priority: 35,
    commandId: "toolWindow.toggle.agentscope.environments",
    tooltip: "Environments (Alt+0)",
  });

  context.onDispose(() => {
    statusItem.dispose();
  });
};
