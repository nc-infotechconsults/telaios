// ─── Agent Plugin ─────────────────────────────────────────────────────────────
//
// Bundled plugin that provides the AI Agent panel.
// Registers:
//   - Tool window at right gutter (Alt+6, order 5)
//   - Commands: agent.open, agent.newSession, agent.explainSelection,
//               agent.refactorSelection, agent.generateTests
//   - StatusBar item: agent status
//   - Editor actions: Explain, Refactor, Generate Tests
// ──────────────────────────────────────────────────────────────────────────────

import { Bot, Sparkles, TestTube, RefreshCw, MessageSquare } from "lucide-react";
import type { PluginManifest, PluginActivateFunction } from "@/types/plugin";
import { AgentPanel } from "./AgentPanel";
import { useAgentStore } from "./agentStore";

export const manifest: PluginManifest = {
  id: "agentscope.agent",
  name: "AI Agent",
  version: "1.0.0",
  description: "Autonomous AI coding agent powered by OpenCode",
  author: "AgentScope",
  activationEvents: ["onStartup"],
  categories: ["ai"],
};

export const activate: PluginActivateFunction = (context) => {
  // ── Tool window ─────────────────────────────────────────────────────────────
  // plugin-host auto-registers:
  //   toolWindow.toggle.agentscope.agent command
  //   Alt+6 keybinding
  context.toolWindows.register({
    id: "agentscope.agent",
    label: "Agent",
    icon: Bot,
    defaultPlacement: "right-top",
    shortcut: "Alt+6",
    order: 5,
    component: AgentPanel,
  });

  // ── Commands ────────────────────────────────────────────────────────────────

  context.commands.register("agent.open", () => {
    context.toolWindows.show("agentscope.agent");
  });

  context.commands.register("agent.newSession", async () => {
    context.toolWindows.show("agentscope.agent");
    await useAgentStore.getState().createSession();
  });

  context.commands.register("agent.explainSelection", () => {
    const { activeFilePath, activeLanguage } = context.editor;
    context.toolWindows.show("agentscope.agent");
    useAgentStore.getState().sendPrompt("Explain this code", {
      filePath: activeFilePath ?? undefined,
      language: activeLanguage ?? undefined,
      instruction: "explain",
    });
  });

  context.commands.register("agent.refactorSelection", () => {
    const { activeFilePath, activeLanguage } = context.editor;
    context.toolWindows.show("agentscope.agent");
    useAgentStore.getState().sendPrompt("Refactor this code to be cleaner and more maintainable", {
      filePath: activeFilePath ?? undefined,
      language: activeLanguage ?? undefined,
      instruction: "refactor",
    });
  });

  context.commands.register("agent.generateTests", () => {
    const { activeFilePath, activeLanguage } = context.editor;
    context.toolWindows.show("agentscope.agent");
    useAgentStore.getState().sendPrompt("Generate comprehensive tests for this code", {
      filePath: activeFilePath ?? undefined,
      language: activeLanguage ?? undefined,
      instruction: "generate-tests",
    });
  });

  // ── Editor actions ──────────────────────────────────────────────────────────

  context.editor.registerAction({
    id: "agent.explainSelection",
    label: "Agent: Explain",
    icon: Sparkles,
    handler: ({ filePath, language, selectedText }) => {
      context.toolWindows.show("agentscope.agent");
      useAgentStore.getState().sendPrompt("Explain this code", {
        filePath,
        language,
        selectedText,
        instruction: "explain",
      });
    },
  });

  context.editor.registerAction({
    id: "agent.refactorSelection",
    label: "Agent: Refactor",
    icon: RefreshCw,
    handler: ({ filePath, language, selectedText }) => {
      context.toolWindows.show("agentscope.agent");
      useAgentStore.getState().sendPrompt("Refactor this code to be cleaner and more maintainable", {
        filePath,
        language,
        selectedText,
        instruction: "refactor",
      });
    },
  });

  context.editor.registerAction({
    id: "agent.generateTests",
    label: "Agent: Generate Tests",
    icon: TestTube,
    handler: ({ filePath, language, selectedText }) => {
      context.toolWindows.show("agentscope.agent");
      useAgentStore.getState().sendPrompt("Generate comprehensive tests for this code", {
        filePath,
        language,
        selectedText,
        instruction: "generate-tests",
      });
    },
  });

  // ── StatusBar item ──────────────────────────────────────────────────────────

  const statusItem = context.statusBar.addItem({
    id: "agentscope.agent.status",
    content: "Agent",
    alignment: "right",
    priority: 50,
    commandId: "toolWindow.toggle.agentscope.agent",
    tooltip: "AI Agent (Alt+6)",
  });

  // Keep status bar text updated based on store state
  let lastStatusText = "";
  const unsubscribe = useAgentStore.subscribe((state) => {
    const { connectionStatus, isStreaming, metrics } = state;
    let text = "Agent";

    if (connectionStatus === "connected") {
      if (isStreaming) {
        text = "Agent ●";
      } else if (metrics.tokensIn + metrics.tokensOut > 0) {
        const total = metrics.tokensIn + metrics.tokensOut;
        const k = total >= 1000 ? `${(total / 1000).toFixed(1)}k` : String(total);
        text = `Agent ${k}t`;
      }
    } else if (connectionStatus === "connecting") {
      text = "Agent ···";
    } else if (connectionStatus === "error") {
      text = "Agent ✕";
    }

    if (text !== lastStatusText) {
      lastStatusText = text;
      context.statusBar.updateItem("agentscope.agent.status", { content: text });
    }
  });

  context.onDispose(() => {
    unsubscribe();
    statusItem.dispose();
  });
};
