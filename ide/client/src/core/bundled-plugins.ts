// ─── Bundled Plugin Loader ────────────────────────────────────────────────────
//
// Installs all bundled plugins into the plugin host.
// Called from IDEShell.tsx after bootstrapCoreToolWindows().
//
// Plugins with "onStartup" in their activationEvents are automatically
// activated when installed.
// ──────────────────────────────────────────────────────────────────────────────

import { pluginHost } from "@/core/plugin-host";
import {
  manifest as dbManifest,
  activate as dbActivate,
} from "@/plugins/database";
import {
  manifest as agentManifest,
  activate as agentActivate,
} from "@/plugins/agent";
import {
  manifest as projectContextManifest,
  activate as projectContextActivate,
} from "@/plugins/projectContext";
import {
  manifest as environmentsManifest,
  activate as environmentsActivate,
} from "@/plugins/environments";

export function loadBundledPlugins(): void {
  pluginHost.install(dbManifest, dbActivate);
  pluginHost.install(agentManifest, agentActivate);
  pluginHost.install(projectContextManifest, projectContextActivate);
  pluginHost.install(environmentsManifest, environmentsActivate);
}
