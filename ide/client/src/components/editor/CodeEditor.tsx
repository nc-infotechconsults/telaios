import MonacoEditor, { DiffEditor, type OnMount, type Monaco } from "@monaco-editor/react";
import { useEditorStore } from "@/stores/editorStore";
import { EditorTabBar } from "./EditorTabBar";
import { EditorBreadcrumb } from "./EditorBreadcrumb";
import { QueryConsole } from "./QueryConsole";
import { CommitDetailView } from "@/components/git/CommitDetailView";
import { GitGraphView } from "@/components/git/GitGraphView";
import { useCallback, useRef } from "react";
import { FileCode, Keyboard } from "lucide-react";

interface Props {
  workspaceId: string;
}

export function CodeEditor({ workspaceId }: Props) {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const updateTabContent = useEditorStore((s) => s.updateTabContent);
  const saveTab = useEditorStore((s) => s.saveTab);
  const setCursor = useEditorStore((s) => s.setCursor);

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  const handleMount: OnMount = useCallback(
    (editor, monaco: Monaco) => {
      editorRef.current = editor;

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
    },
    [activeTabId, workspaceId, saveTab, setCursor],
  );

  if (!activeTab) {
    return (
      <div className="flex flex-col h-full bg-transparent">
        <EditorTabBar workspaceId={workspaceId} />
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

  // Virtual tab: Query Console
  if (activeTab.isVirtual && activeTab.virtualType === "query-console" && activeTab.connectionId) {
    return (
      <div className="flex flex-col h-full bg-transparent">
        <EditorTabBar workspaceId={workspaceId} />
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

  // Virtual tab: Diff view
  if (activeTab.isVirtual && activeTab.virtualType === "diff") {
    return (
      <div className="flex flex-col h-full bg-transparent">
        <EditorTabBar workspaceId={workspaceId} />
        <EditorBreadcrumb path={activeTab.diffFilePath ?? activeTab.path} />
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

  // Virtual tab: Git Graph
  if (activeTab.isVirtual && activeTab.virtualType === "git-graph") {
    return (
      <div className="flex flex-col h-full bg-transparent">
        <EditorTabBar workspaceId={workspaceId} />
        <div className="flex-1 min-h-0 overflow-hidden">
          <GitGraphView workspaceId={workspaceId} />
        </div>
      </div>
    );
  }

  // Virtual tab: Commit detail
  if (activeTab.isVirtual && activeTab.virtualType === "commit-detail" && activeTab.commitDetail) {
    return (
      <div className="flex flex-col h-full bg-transparent">
        <EditorTabBar workspaceId={workspaceId} />
        <div className="flex-1 min-h-0 overflow-hidden">
          <CommitDetailView workspaceId={workspaceId} detail={activeTab.commitDetail} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-transparent">
      <EditorTabBar workspaceId={workspaceId} />
      <EditorBreadcrumb path={activeTab.path} />
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
            fontSize: 13,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontLigatures: true,
            lineHeight: 20,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            wordWrap: "off",
            tabSize: 2,
            insertSpaces: true,
            smoothScrolling: true,
            cursorBlinking: "phase",
            automaticLayout: true,
            padding: { top: 12 },
          }}
        />
      </div>
    </div>
  );
}