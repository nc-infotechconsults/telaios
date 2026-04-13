import MonacoEditor, { DiffEditor, type OnMount, type Monaco } from "@monaco-editor/react";
import { useEditorStore } from "@/stores/editorStore";
import { useEditorActionStore } from "@/stores/editorActionStore";
import { EditorTabBar } from "./EditorTabBar";
import { EditorBreadcrumb } from "./EditorBreadcrumb";
import { pathToSegments } from "@/hooks/useBreadcrumbSymbols";
import { QueryConsole } from "./QueryConsole";
import { CommitDetailView } from "@/components/git/CommitDetailView";
import { GitGraphView } from "@/components/git/GitGraphView";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { FileCode, Keyboard } from "lucide-react";
import {
  setMonacoInstance,
  clearMonacoInstance,
} from "@/stores/monacoInstanceStore";
import { contextKeyService } from "@/core/context-keys";
import { getMenuItems } from "@/stores/menuStore";
import { commandRegistry } from "@/core/commands";
import { getSettingValue, onSettingChange } from "@/stores/settingsStore";

interface Props {
  workspaceId: string;
  /** When provided, this editor is scoped to a specific editor group. */
  groupId?: string;
}

// ── Editor settings helpers ──────────────────────────────────────────────────

/** Read current editor settings from the settings store and build Monaco options. */
function readEditorSettings(): Record<string, unknown> {
  return {
    fontSize: getSettingValue<number>("editor.fontSize") ?? 14,
    tabSize: getSettingValue<number>("editor.tabSize") ?? 2,
    wordWrap: getSettingValue<string>("editor.wordWrap") ?? "off",
    renderWhitespace: getSettingValue<string>("editor.renderWhitespace") ?? "selection",
    lineNumbers: getSettingValue<string>("editor.lineNumbers") ?? "on",
    cursorBlinking: getSettingValue<string>("editor.cursorBlinking") ?? "blink",
    minimap: { enabled: getSettingValue<boolean>("editor.minimap.enabled") ?? true },
    "bracketPairColorization.enabled": getSettingValue<boolean>("editor.bracketPairColorization") ?? true,
  };
}

export function CodeEditor({ workspaceId, groupId }: Props) {
  // ── Group-aware selectors ───────────────────────────────────────────────────
  const groups = useEditorStore((s) => s.groups);
  const mirrorTabs = useEditorStore((s) => s.tabs);
  const mirrorActiveTabId = useEditorStore((s) => s.activeTabId);

  const tabs = useMemo(() => {
    if (!groupId) return mirrorTabs;
    return groups[groupId]?.tabs ?? [];
  }, [groupId, groups, mirrorTabs]);

  const activeTabId = useMemo(() => {
    if (!groupId) return mirrorActiveTabId;
    return groups[groupId]?.activeTabId ?? null;
  }, [groupId, groups, mirrorActiveTabId]);

  const updateTabContent = useEditorStore((s) => s.updateTabContent);
  const saveTab = useEditorStore((s) => s.saveTab);
  const setCursor = useEditorStore((s) => s.setCursor);
  const setActiveGroup = useEditorStore((s) => s.setActiveGroup);

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? null,
    [tabs, activeTabId],
  );

  // ── Focus group on click ────────────────────────────────────────────────────
  const handleGroupFocus = useCallback(() => {
    if (groupId) setActiveGroup(groupId);
  }, [groupId, setActiveGroup]);

  const handleMount: OnMount = useCallback(
    (editor, monaco: Monaco) => {
      editorRef.current = editor;

      // Share the editor instance with other components (e.g. Outline panel)
      // The last-mounted/focused editor wins the shared instance
      setMonacoInstance(editor, monaco);

      monaco.editor.defineTheme("glassmorphism-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [
          { token: "", foreground: "e4e4e7", background: "0a0a0c" },
          { token: "comment", foreground: "71717a", fontStyle: "italic" },
          { token: "keyword", foreground: "c084fc" },
          { token: "string", foreground: "22d3ee" },
          { token: "number", foreground: "fbbf24" },
          { token: "type", foreground: "38bdf8" },
          { token: "function", foreground: "a78bfa" },
          { token: "variable", foreground: "e4e4e7" },
          { token: "constant", foreground: "f472b6" },
          { token: "operator", foreground: "a1a1aa" },
          { token: "delimiter", foreground: "a1a1aa" },
          { token: "tag", foreground: "f472b6" },
          { token: "attribute.name", foreground: "c084fc" },
          { token: "attribute.value", foreground: "22d3ee" },
        ],
        colors: {
          "editor.background": "#0a0a0c",
          "editor.foreground": "#e4e4e7",
          "editor.lineHighlightBackground": "#1f1f23",
          "editor.selectionBackground": "#3b3b5c66",
          "editor.inactiveSelectionBackground": "#3b3b5c33",
          "editorLineNumber.foreground": "#52525b",
          "editorLineNumber.activeForeground": "#a1a1aa",
          "editorIndentGuide.background": "#27272a",
          "editorIndentGuide.activeBackground": "#3f3f46",
          "editorCursor.foreground": "#22d3ee",
          "editorWhitespace.foreground": "#27272a",
          "editor.findMatchBackground": "#8b5cf633",
          "editor.findMatchHighlightBackground": "#8b5cf622",
          "editorBracketMatch.background": "#8b5cf644",
          "editorBracketMatch.border": "#8b5cf6",
          "scrollbar.shadow": "#00000000",
          "scrollbarSlider.background": "#3f3f4680",
          "scrollbarSlider.hoverBackground": "#52525b80",
          "scrollbarSlider.activeBackground": "#71717a80",
          "editorGutter.background": "#0a0a0c",
          "minimap.background": "#09090b",
        },
      });
      monaco.editor.setTheme("glassmorphism-dark");

      // Save on Ctrl/Cmd+S
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        if (activeTabId) saveTab(workspaceId, activeTabId);
      });

      editor.onDidChangeCursorPosition((e) => {
        if (activeTabId) {
          setCursor(
            activeTabId,
            e.position.lineNumber,
            e.position.column,
          );
        }
      });

      // Update context keys for `when` clause evaluation
      editor.onDidFocusEditorWidget(() => {
        contextKeyService.set("editorFocused", true);
        // When this editor gains focus, make it the active group and shared instance
        if (groupId) {
          setActiveGroup(groupId);
          setMonacoInstance(editor, monaco);
        }
      });
      editor.onDidBlurEditorWidget(() => {
        contextKeyService.set("editorFocused", false);
      });
      editor.onDidChangeCursorSelection((e) => {
        const sel = e.selection;
        const hasSelection =
          sel.startLineNumber !== sel.endLineNumber ||
          sel.startColumn !== sel.endColumn;
        contextKeyService.set("editorHasSelection", hasSelection);
      });

      // Register plugin-contributed editor actions in Monaco's context menu.
      // All plugins activate on startup, so actions are available by mount time.
      const { actions } = useEditorActionStore.getState();
      for (const action of actions) {
        const handler = action.handler;
        editor.addAction({
          id: action.id,
          label: `AI: ${action.label}`,
          contextMenuGroupId: "9_ai",
          run: (ed) => {
            const model = ed.getModel();
            const sel = ed.getSelection();
            const selectedText =
              sel && model ? model.getValueInRange(sel) || undefined : undefined;
            const { activeTabId: tid, tabs: ts } = useEditorStore.getState();
            const t = ts.find((tab) => tab.id === tid);
            if (!t?.path) return;
            handler({ filePath: t.path, language: t.language, selectedText });
          },
        });
      }

      // Register plugin-contributed editor context menu items
      const editorMenuItems = getMenuItems("editor.context");
      for (const item of editorMenuItems) {
        const cmd = commandRegistry.get(item.commandId);
        if (!cmd) continue;
        editor.addAction({
          id: `plugin.menu.${item.commandId}`,
          label: cmd.label,
          contextMenuGroupId: item.group ?? "z_plugin",
          contextMenuOrder: item.order ?? 100,
          run: () => {
            commandRegistry.execute(item.commandId);
          },
        });
      }
    },
    [activeTabId, workspaceId, saveTab, setCursor, groupId, setActiveGroup],
  );

  // Clean up shared Monaco instance on unmount
  useEffect(() => {
    return () => {
      clearMonacoInstance();
    };
  }, []);

  // ── Sync editor settings from settingsStore to Monaco ────────────────────────
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // Apply current settings immediately
    editor.updateOptions(readEditorSettings());

    // Subscribe to individual setting changes
    const settingKeys = [
      "editor.fontSize",
      "editor.tabSize",
      "editor.wordWrap",
      "editor.renderWhitespace",
      "editor.lineNumbers",
      "editor.cursorBlinking",
      "editor.minimap.enabled",
      "editor.bracketPairColorization",
    ];

    const disposables = settingKeys.map((key) =>
      onSettingChange(key, () => {
        const ed = editorRef.current;
        if (ed) ed.updateOptions(readEditorSettings());
      }),
    );

    return () => disposables.forEach((d) => d.dispose());
  }, [activeTabId]); // re-wire when tab changes (editor may remount)

  // ── No active tab — empty state ─────────────────────────────────────────────

  if (!activeTab) {
    return (
      <div className="flex flex-col h-full bg-transparent" onMouseDown={handleGroupFocus}>
        {/* Only render tab bar when not inside an EditorGroup (EditorGroup renders its own) */}
        {!groupId && <EditorTabBar workspaceId={workspaceId} />}
        <div className="flex-1 flex items-center justify-center select-none p-6">
          <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.05] rounded-2xl p-10 max-w-sm w-full text-center shadow-2xl flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-violet-500/20 to-cyan-500/20 flex items-center justify-center mb-6 shadow-inner border border-white/5">
              <FileCode className="text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]" size={32} strokeWidth={1.5} />
            </div>
            <h3 className="text-xl font-medium text-white mb-2">Editor</h3>
            <p className="text-zinc-400 text-sm mb-8">
              Open a file from the explorer to start coding.
            </p>
            <div className="flex items-center gap-2 text-xs text-zinc-500 bg-black/20 px-3 py-1.5 rounded-full border border-white/[0.05]">
              <Keyboard size={14} className="text-zinc-400" />
              <span>Cmd+S or Ctrl+S to save</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Virtual tab: Query Console ──────────────────────────────────────────────

  if (activeTab.isVirtual && activeTab.virtualType === "query-console" && activeTab.connectionId) {
    return (
      <div className="flex flex-col h-full bg-transparent" onMouseDown={handleGroupFocus}>
        {!groupId && <EditorTabBar workspaceId={workspaceId} />}
        <div className="flex-1 min-h-0">
          <QueryConsole
            tabId={activeTab.id}
            connectionId={activeTab.connectionId}
            workspaceId={workspaceId}
          />
        </div>
      </div>
    );
  }

  // ── Virtual tab: Diff view ──────────────────────────────────────────────────

  if (activeTab.isVirtual && activeTab.virtualType === "diff") {
    return (
      <div className="flex flex-col h-full bg-transparent" onMouseDown={handleGroupFocus}>
        {!groupId && <EditorTabBar workspaceId={workspaceId} />}
        {!groupId && <EditorBreadcrumb segments={pathToSegments(activeTab.diffFilePath ?? activeTab.path)} />}
        <div className="flex-1 monaco-host bg-[#0a0a0c]">
          <DiffEditor
            key={activeTab.id}
            language={activeTab.language}
            original={activeTab.diffOriginalContent ?? ""}
            modified={activeTab.diffModifiedContent ?? ""}
            theme="glassmorphism-dark"
            options={{
              fontSize: 13,
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              fontLigatures: true,
              lineHeight: 20,
              readOnly: true,
              renderSideBySide: true,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 12 },
            }}
          />
        </div>
      </div>
    );
  }

  // ── Virtual tab: Git Graph ──────────────────────────────────────────────────

  if (activeTab.isVirtual && activeTab.virtualType === "git-graph") {
    return (
      <div className="flex flex-col h-full bg-transparent" onMouseDown={handleGroupFocus}>
        {!groupId && <EditorTabBar workspaceId={workspaceId} />}
        <div className="flex-1 min-h-0 overflow-hidden">
          <GitGraphView workspaceId={workspaceId} />
        </div>
      </div>
    );
  }

  // ── Virtual tab: Commit detail ──────────────────────────────────────────────

  if (activeTab.isVirtual && activeTab.virtualType === "commit-detail" && activeTab.commitDetail) {
    return (
      <div className="flex flex-col h-full bg-transparent" onMouseDown={handleGroupFocus}>
        {!groupId && <EditorTabBar workspaceId={workspaceId} />}
        <div className="flex-1 min-h-0 overflow-hidden">
          <CommitDetailView workspaceId={workspaceId} detail={activeTab.commitDetail} />
        </div>
      </div>
    );
  }

  // ── Regular file editor ─────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-transparent" onMouseDown={handleGroupFocus}>
      {!groupId && <EditorTabBar workspaceId={workspaceId} />}
      {!groupId && <EditorBreadcrumb segments={pathToSegments(activeTab.path)} />}
      <div className="flex-1 monaco-host bg-[#0a0a0c]">
        <MonacoEditor
          key={activeTab.id}
          language={activeTab.language}
          value={activeTab.content}
          theme="glassmorphism-dark"
          onMount={handleMount}
          onChange={(value) => {
            if (activeTabId && value !== undefined) {
              updateTabContent(activeTabId, value);
            }
          }}
          options={{
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontLigatures: true,
            lineHeight: 20,
            insertSpaces: true,
            smoothScrolling: true,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            padding: { top: 12 },
            ...readEditorSettings(),
          }}
        />
      </div>
    </div>
  );
}
