// ─── MobileShell ───────────────────────────────────────────────────────────────
//
// Top-level layout for phone viewports (< 640px).
// Completely different from the desktop ToolWindowManager —
// shows ONE full-screen view at a time with bottom navigation.
//
// Layout:
//  ┌──────────────────────┐
//  │ MobileHeader         │  (compact: title, menu, quick actions)
//  ├──────────────────────┤
//  │                      │
//  │  Active View         │  (full-screen: editor, explorer, etc.)
//  │  (one at a time)     │
//  │                      │
//  ├──────────────────────┤
//  │ MobileNav            │  (bottom tabs: Editor, Files, Git, Terminal, More)
//  └──────────────────────┘
//
// Active view is either:
//   - "editor" → renders the CodeEditor
//   - A tool window ID → renders the tool window component full-screen
//
// The view state is local (useState) — not persisted to layoutStore.
// The mobile shell doesn't interact with the region/gutter/sidebar system.
// ──────────────────────────────────────────────────────────────────────────────

import { useState, type ReactNode } from "react";
import { toolWindowRegistry } from "@/core/tool-window-registry";
import { MobileHeader } from "./MobileHeader";
import { MobileNav } from "./MobileNav";
import { StatusBar } from "./StatusBar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MobileShellProps {
  workspaceId: string;
  /** The code editor component, rendered when activeView is "editor" */
  editorSlot: ReactNode;
}

// ─── MobileShell ──────────────────────────────────────────────────────────────

export function MobileShell({ workspaceId, editorSlot }: MobileShellProps) {
  const [activeView, setActiveView] = useState<string>("editor");

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#0a0a0c] text-zinc-300 selection:bg-cyan-500/30">
      {/* Header */}
      <MobileHeader activeView={activeView} />

      {/* ── Content Area ── */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {/* Ambient glow — decorative (same as desktop) */}
        <div className="absolute top-0 left-1/4 w-64 h-64 bg-violet-600/5 rounded-full blur-[100px] pointer-events-none z-0" />
        <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-cyan-600/5 rounded-full blur-[100px] pointer-events-none z-0" />

        {/* Editor view */}
        <div
          className={[
            "absolute inset-0 z-10 transition-opacity duration-150",
            activeView === "editor"
              ? "opacity-100 pointer-events-auto"
              : "opacity-0 pointer-events-none",
          ].join(" ")}
        >
          {editorSlot}
        </div>

        {/* Tool window views — render the active one */}
        {activeView !== "editor" && (
          <div className="absolute inset-0 z-10 overflow-auto">
            <ToolWindowView id={activeView} />
          </div>
        )}
      </div>

      {/* Status bar (shared with desktop) */}
      <StatusBar workspaceId={workspaceId} />

      {/* Bottom navigation */}
      <MobileNav activeView={activeView} onViewChange={setActiveView} />
    </div>
  );
}

// ─── ToolWindowView ───────────────────────────────────────────────────────────
// Renders a tool window component full-screen by looking it up in the registry.

function ToolWindowView({ id }: { id: string }) {
  const reg = toolWindowRegistry.get(id);
  if (!reg) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
        Panel not found: {id}
      </div>
    );
  }

  const Component = reg.component;
  return (
    <div className="h-full">
      <Component />
    </div>
  );
}
