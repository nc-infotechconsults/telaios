// ─── Database Plugin ──────────────────────────────────────────────────────────
//
// Bundled plugin that migrates the Database panel into the plugin system.
// Registers the tool window at the right gutter with Alt+4.
// ──────────────────────────────────────────────────────────────────────────────

import { Database } from "lucide-react";
import type { PluginManifest, PluginActivateFunction } from "@/types/plugin";
import { DatabasePanel } from "./DatabasePanel";

export const manifest: PluginManifest = {
  id: "agentscope.database",
  name: "Database",
  version: "1.0.0",
  description: "Database connection explorer and query runner",
  author: "AgentScope",
  activationEvents: ["onStartup"],
  categories: ["database"],
};

export const activate: PluginActivateFunction = (context) => {
  // Register the Database tool window in the right gutter.
  // plugin-host automatically registers:
  //   - toolWindow.toggle.agentscope.database command
  //   - Alt+4 keybinding
  context.toolWindows.register({
    id: "agentscope.database",
    label: "Database",
    icon: Database,
    defaultPlacement: "right-top",
    shortcut: "Alt+4",
    order: 3,
    component: DatabasePanel,
  });
};
